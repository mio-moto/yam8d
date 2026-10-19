// Everything that runs next to a connected M8, without a framework: screen state extraction,
// cursor and view navigation, value editors, file browsing, MIDI clock, and the SDK host
// methods and events built on them. yam8d runs one per bus and exposes it to iframes; the
// standalone client runs one in the app's own page.

import type { M8HostEvents, M8HostMethods, M8State } from '../types'
import type { EngineBus } from './bus'
import { type CursorNavigator, createCursorNavigator, type Point } from './cursorNavigator'
import { createFileBrowserSearch } from './host/fileBrowserSearch'
import { createFloatEditor } from './host/floatEditor'
import { createHostIO } from './host/hostIO'
import { createHostMethods } from './host/hostMethods'
import { getCurrentState, textGridToPixel } from './host/hostState'
import { createMidiTransport } from './host/midiTransport'
import { createValueEditors } from './host/valueEditors'
import { createMacroRunner, type MacroRunner } from './macroRunner'
import type { KeyCommand } from './protocol'
import { createM8Store, type M8Store, type M8StoreKey } from './store'
import { registerViewExtractor, type ScreenCellColors } from './viewExtractor'
import { createViewNavigation } from './viewNavigation'

export interface M8EngineOptions {
  debug?: boolean
  /** Cancel a running macro (view navigation) on any keydown in this window. Default false. */
  cancelMacroOnKeydown?: boolean
  /** Use this store instead of a new one (for tests, or to keep state across reconnects). */
  store?: M8Store
}

export interface M8Engine {
  readonly bus: EngineBus
  readonly store: M8Store
  /** The SDK methods, as an iframe client or the standalone client calls them. */
  readonly methods: M8HostMethods
  readonly macro: MacroRunner
  /** Moves the cursor towards a point in M8 pixel coordinates. */
  navigateTo(point: Point): Promise<void>
  /** Resolves true when the view is reached. */
  navigateToView(viewName: string): Promise<boolean>
  getState(): M8State
  getScreenLines(): string[]
  getScreenCellColors(): ScreenCellColors
  /** Listens to an SDK event. Returns the unsubscribe function. */
  on<K extends keyof M8HostEvents>(event: K, callback: (payload: M8HostEvents[K]) => void): () => void
  dispose(): void
}

// Store keys whose change is reported as a whole stateChanged event
const STATE_KEYS = new Set<M8StoreKey>(['macroStatus', 'deviceModel', 'fontMode', 'systemInfo', 'titleColor', 'backgroundColor', 'minimapKey'])

export const createM8Engine = (bus: EngineBus, options: M8EngineOptions = {}): M8Engine => {
  const store = options.store ?? createM8Store()
  const debugLog = (...args: unknown[]) => {
    if (options.debug) console.log(...args)
  }

  const listeners = new Map<keyof M8HostEvents, Set<(payload: never) => void>>()
  const emit = <K extends keyof M8HostEvents>(event: K, payload: M8HostEvents[K]) => {
    for (const cb of [...(listeners.get(event) ?? [])]) (cb as (p: M8HostEvents[K]) => void)(payload)
  }

  const extractor = registerViewExtractor(bus.protocol.eventBus, store)
  const macro = createMacroRunner({ bus, store, cancelOnKeydown: options.cancelMacroOnKeydown })
  const cursorNavigator: CursorNavigator = createCursorNavigator({ bus, store })
  const viewNavigation = createViewNavigation({
    store,
    runner: macro,
    getScreenLines: extractor.getScreenLines,
    moveCursor: (x, y) => cursorNavigator.navigateTo(textGridToPixel(store, x, y)),
  })
  const midiTransport = createMidiTransport((event) => emit('transport', event))

  const io = createHostIO({ getKeySink: () => bus.commands, store, debugLog, getScreenLines: extractor.getScreenLines })
  const methods = createHostMethods({
    io,
    editors: createValueEditors(io),
    setValueFloat: createFloatEditor(io),
    browseFile: createFileBrowserSearch(io),
    navigateToView: (viewName) => viewNavigation.navigateToView(viewName),
    navigateTo: (point) => cursorNavigator.navigateTo(point),
    enableMidiTransport: () => midiTransport.enable(),
    getScreenCellColors: extractor.getScreenCellColors,
  })

  // Store changes are collected and reported once per microtask, so the several values
  // the extractor sets for one cursor move become one cursorMoved event.
  const dirty = new Set<M8StoreKey>()
  let flushScheduled = false
  let lastView: M8HostEvents['viewChanged'] | null = null
  let lastCursor: M8HostEvents['cursorMoved'] | null = null
  let lastText: M8HostEvents['textUpdated'] | null = null

  const flush = () => {
    flushScheduled = false
    const keys = new Set(dirty)
    dirty.clear()

    if (keys.has('viewName') || keys.has('viewTitle')) {
      const view = { viewName: store.get('viewName'), viewTitle: store.get('viewTitle') }
      if (!lastView || lastView.viewName !== view.viewName || lastView.viewTitle !== view.viewTitle) {
        lastView = view
        debugLog('[M8SDK] View changed:', view.viewName, view.viewTitle)
        emit('viewChanged', view)
      }
    }

    if (keys.has('cursorPos') || keys.has('cursorRect') || keys.has('selectionMode')) {
      const cursor = { pos: store.get('cursorPos'), rect: store.get('cursorRect'), selectionMode: store.get('selectionMode') }
      const prev = lastCursor
      const same =
        prev &&
        prev.pos?.x === cursor.pos?.x &&
        prev.pos?.y === cursor.pos?.y &&
        prev.rect?.x === cursor.rect?.x &&
        prev.rect?.y === cursor.rect?.y &&
        prev.rect?.w === cursor.rect?.w &&
        prev.rect?.h === cursor.rect?.h &&
        prev.selectionMode === cursor.selectionMode
      if (!same) {
        lastCursor = cursor
        debugLog('[M8SDK] Cursor moved:', cursor.pos, cursor.rect, 'selection:', cursor.selectionMode)
        emit('cursorMoved', cursor)
      }
    }

    if (keys.has('textUnderCursor') || keys.has('currentLine')) {
      const text = { textUnderCursor: store.get('textUnderCursor'), currentLine: store.get('currentLine') }
      if (!lastText || lastText.textUnderCursor !== text.textUnderCursor || lastText.currentLine !== text.currentLine) {
        lastText = text
        debugLog('[M8SDK] Text updated:', text.textUnderCursor, text.currentLine)
        emit('textUpdated', text)
      }
    }

    if ([...keys].some((key) => STATE_KEYS.has(key))) {
      emit('stateChanged', getCurrentState(store))
    }
  }

  const unsubscribeStore = store.subAll((key) => {
    dirty.add(key)
    if (!flushScheduled) {
      flushScheduled = true
      queueMicrotask(flush)
    }
  })

  // Key echoes from the M8 (including releases, keys === 0)
  const onKey = (data: KeyCommand) => {
    debugLog('[M8SDK] Key event:', data.keys)
    emit('keyPressed', { keys: data.keys })
  }
  bus.protocol.eventBus.on('key', onKey)

  return {
    bus,
    store,
    methods,
    macro,
    navigateTo: (point) => cursorNavigator.navigateTo(point),
    navigateToView: (viewName) => viewNavigation.navigateToView(viewName),
    getState: () => getCurrentState(store),
    getScreenLines: extractor.getScreenLines,
    getScreenCellColors: extractor.getScreenCellColors,
    on: (event, callback) => {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(callback as (payload: never) => void)
      return () => {
        set.delete(callback as (payload: never) => void)
      }
    },
    dispose: () => {
      bus.protocol.eventBus.off('key', onKey)
      unsubscribeStore()
      viewNavigation.dispose()
      cursorNavigator.dispose()
      macro.dispose()
      midiTransport.disable()
      extractor.dispose()
      listeners.clear()
    },
  }
}
