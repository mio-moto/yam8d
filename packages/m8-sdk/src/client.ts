// @ts-expect-error - post-me types are incomplete for the generic handshake signatures used here.
import { ChildHandshake, DebugMessenger, WindowMessenger } from 'post-me'
// @ts-expect-error - post-me types are incomplete for the generic handshake signatures used here.
import type { Connection, Messenger } from 'post-me'
import { type ConnectedBus, connection } from './engine/connection'
import { connectWithRetry } from './engine/connectWithRetry'
import { createM8Audio, type M8Audio } from './engine/audio'
import { createM8Engine, type M8Engine } from './engine/engine'
import type {
  M8ClientEvents,
  M8ClientMethods,
  M8ClientMode,
  M8DeviceBus,
  M8DeviceConnectOptions,
  M8DeviceSupport,
  M8DeviceTransport,
  M8HostEvents,
  M8HostMethods,
  M8KeyName,
  M8Screen,
  M8ScreenCells,
  M8SdkConfig,
  M8State,
  M8TransportEvent,
} from './types'
import { getSemanticContext, describeContext, describeContextParts } from './viewContext'
import type { M8DescriptionPart, M8SemanticContext } from './viewContext'

export type { CursorPos, CursorRect, M8KeyName, M8Screen, M8ScreenCells, M8State, M8TransportEvent, RGB, SystemInfos } from './types'
export type { M8DescriptionPart, M8SemanticContext } from './viewContext'

/**
 * The iframe name yam8d gives its External Apps frames. A client that sees it waits for the
 * host handshake however long it takes, instead of falling back to standalone mode.
 */
export const YAM8D_FRAME_NAME = 'yam8d-external-app'

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 3000

/**
 * Everything the SDK knows about the moment: raw state, semantic context, its
 * human-readable description and the whole screen. Plain JSON, safe to persist.
 */
export interface M8Snapshot {
  capturedAt: number
  state: Pick<M8State, 'viewName' | 'viewTitle' | 'cursorPos' | 'selectionMode' | 'textUnderCursor' | 'currentLine' | 'deviceModel'>
  semantic: M8SemanticContext | null
  /** describeContext() output, e.g. "Note (N): Note C-4 — Phrase View row 00". */
  description: string | null
  /** The same description as tagged parts (describeContextParts()). */
  descriptionParts: M8DescriptionPart[] | null
  screen: M8Screen
}

export interface M8Client {
  readonly state: M8State
  /**
   * True when calls reach an M8: in host mode once the yam8d handshake is done, in
   * standalone mode while a device is connected.
   */
  readonly isConnected: boolean
  /** 'host' inside yam8d, 'standalone' otherwise; null until connect() has decided. */
  readonly mode: M8ClientMode | null
  /** Standalone: the API the device is connected through, null while disconnected (always null in host mode). */
  readonly deviceTransport: M8DeviceTransport | null
  navigateToView(viewName: string): Promise<boolean>
  navigateTo(x: number, y: number): Promise<void>
  setValueToHex(targetHex: number): Promise<boolean>
  setValueToInt(targetInt: number): Promise<boolean>
  setValueFloat(targetFloat: number): Promise<boolean>
  setNote(noteString: string): Promise<boolean>
  setValueToString(targetString: string, exact?: boolean, searchInCurrentLine?: boolean): Promise<boolean>
  browseFile(targetText: string, exact?: boolean): Promise<boolean>
  sendKeyPress(keys: M8KeyName[]): Promise<void>
  sendKeyDown(keys: M8KeyName[]): Promise<void>
  sendKeyUp(): Promise<void>
  getState(): M8State
  fetchState(): Promise<M8State>
  /**
   * Whole screen as text rows, read directly from the M8 character stream.
   * No cursor movement involved, so it is instant and side-effect free.
   */
  getScreen(): Promise<M8Screen>
  /**
   * The screen plus the foreground/background colour of every character cell ('#rrggbb').
   * Rejects when the host predates this method (yam8d before SDK 0.5).
   */
  getScreenCells(): Promise<M8ScreenCells>
  /** Fresh state + semantic context + description + whole screen in one call. */
  captureSnapshot(): Promise<M8Snapshot>
  onStateChange(callback: (state: M8State) => void): () => void
  onViewChange(callback: (viewName: string | null, viewTitle: string | null) => void): () => void
  onCursorMove(callback: (pos: M8State['cursorPos'], rect: M8State['cursorRect'], selectionMode: boolean) => void): () => void
  onTextUpdate(callback: (textUnderCursor: string | null, currentLine: string | null) => void): () => void
  onKeyPress(callback: (keys: number) => void): () => void
  /**
   * Starts forwarding the M8's MIDI clock and transport (needs SYNC OUT set in the M8's
   * MIDI Settings, and Web MIDI permission in the page that owns the device). Hosts before
   * SDK 0.5 reject the call.
   */
  enableMidiTransport(): Promise<{ ok: boolean; error?: string }>
  /** MIDI start / stop / continue, the clock once per sixteenth, and song positions. */
  onTransport(callback: (event: M8TransportEvent) => void): () => void
  /**
   * Standalone: connects to the M8 from this page. Without a previously granted device the
   * browser shows its device picker, which only opens from a user gesture (call this from a
   * click handler). Replaces the current device. In host mode yam8d owns the device: no-op.
   */
  connectDevice(options?: M8DeviceConnectOptions): Promise<void>
  /** Standalone: releases the device so another page (yam8d, another app) can open it. */
  disconnectDevice(): Promise<void>
  /** Fires when isConnected changes (handshake done, device connected, lost or released). */
  onConnectionChange(callback: (connected: boolean) => void): () => void
  /** Standalone: raw protocol events and device commands; null in host mode or while disconnected. */
  getDevice(): M8DeviceBus | null
  /** Standalone: whether the M8's USB audio is playing through this page. */
  readonly isAudioConnected: boolean
  /**
   * Standalone: plays the M8's USB audio input through this page (asks for audio permission;
   * rejects when no input named M8 is found). In host mode yam8d plays it: no-op.
   */
  connectAudio(): Promise<void>
  disconnectAudio(): Promise<void>
  disconnect(): void
  /**
   * Derives semantic context from the current state: view, row, and the typed
   * field under the cursor. Works for the five grid views (song, chain, phrase,
   * table, groove). Returns null when no view is active.
   */
  getSemanticContext(): M8SemanticContext | null
  /**
   * Returns a short human-readable description of what the cursor is on,
   * e.g. "Track 3: 0A — Track 3 — Song View row 01".
   *
   * It also reads the cursor against its surroundings when that changes the meaning:
   * an FX cell under a running REP says which command is repeating and where it has
   * got to, FX values are explained (ARP 37 → "+3 and +7 semitones"), and the Scale
   * View names the scale the enabled notes spell. The surroundings come from a copy of
   * the screen the client keeps fresh in the background; call getScreen() (or await
   * captureSnapshot()) first if you need it guaranteed current.
   */
  describeContext(): string | null
  /**
   * The description as ordered, tagged parts ({ kind: 'field' | 'meaning' | 'location' | …, text }),
   * for consumers that want to keep, drop, reorder or style some of them.
   */
  describeContextParts(): M8DescriptionPart[] | null
}

/** Where calls and events go: the yam8d host over post-me, or an engine in this page. */
interface Backend {
  call<K extends keyof M8HostMethods>(method: K, ...args: Parameters<M8HostMethods[K]>): ReturnType<M8HostMethods[K]>
  on<K extends keyof M8HostEvents>(event: K, callback: (payload: M8HostEvents[K]) => void): () => void
  close(): void
}

const hostBackend = (connection: Connection<M8ClientMethods, M8HostEvents, M8HostMethods, M8ClientEvents>): Backend => {
  const remote = connection.remoteHandle()
  return {
    call: (method, ...args) => remote.call(method, ...args),
    on: (event, callback) => {
      remote.addEventListener(event, callback)
      return () => remote.removeEventListener(event, callback)
    },
    close: () => connection.close(),
  }
}

const engineBackend = (engine: M8Engine): Backend => ({
  call: (method, ...args) => (engine.methods[method] as (...a: unknown[]) => ReturnType<M8HostMethods[typeof method]>)(...args),
  on: (event, callback) => engine.on(event, callback),
  close: () => engine.dispose(),
})

/** A messenger whose listeners can all be removed, to abandon a handshake that timed out. */
const disposableMessenger = (inner: Messenger) => {
  const removers: (() => void)[] = []
  const messenger: Messenger = {
    postMessage: (message: unknown, transfer?: Transferable[]) => inner.postMessage(message, transfer),
    addMessageListener: (listener: (event: MessageEvent) => void) => {
      const remove = inner.addMessageListener(listener)
      removers.push(remove)
      return remove
    },
  }
  const dispose = () => {
    for (const remove of removers.splice(0)) remove()
  }
  return { messenger, dispose }
}

const inIframe = () => {
  if (typeof window === 'undefined') return false
  try {
    return window.parent !== window
  } catch {
    return true
  }
}

const isUserCancel = (error: unknown) => error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'AbortError')

/** Which device APIs the browser offers for standalone mode. */
export const getDeviceSupport = (): M8DeviceSupport => {
  const nav = typeof navigator === 'undefined' ? null : navigator
  return {
    serial: !!nav && 'serial' in nav,
    usb: !!nav && 'usb' in nav,
    midi: !!nav && 'requestMIDIAccess' in nav,
  }
}

const getDefaultState = (): M8State => ({
  viewName: null,
  viewTitle: null,
  minimapKey: null,
  cursorPos: null,
  cursorRect: null,
  selectionMode: false,
  highlightColor: null,
  titleColor: null,
  backgroundColor: null,
  cursorColor: null,
  textUnderCursor: null,
  currentLine: null,
  deviceModel: null,
  fontMode: null,
  systemInfo: null,
  macroRunning: false,
})

class M8ClientImpl implements M8Client {
  private backend: Backend | null = null
  private backendUnsubscribers: (() => void)[] = []
  private device: ConnectedBus | null = null
  private _mode: M8ClientMode | null = null
  private audio: M8Audio | null = null
  private connecting: Promise<void> | null = null
  private readonly stateCallbacks = new Set<(state: M8State) => void>()
  private readonly viewCallbacks = new Set<(viewName: string | null, viewTitle: string | null) => void>()
  private readonly cursorCallbacks = new Set<(pos: M8State['cursorPos'], rect: M8State['cursorRect'], selectionMode: boolean) => void>()
  private readonly textCallbacks = new Set<(textUnderCursor: string | null, currentLine: string | null) => void>()
  private readonly keyCallbacks = new Set<(keys: number) => void>()
  private readonly transportCallbacks = new Set<(event: M8TransportEvent) => void>()
  private readonly connectionCallbacks = new Set<(connected: boolean) => void>()
  private _state: M8State = getDefaultState()
  private _screen: M8Screen | null = null
  private screenRefreshing = false
  private screenDirty = false
  private readonly config: M8SdkConfig

  constructor(config: M8SdkConfig = {}) {
    this.config = config
  }

  get state(): M8State {
    return this._state
  }

  get isConnected(): boolean {
    return this.backend !== null
  }

  get mode(): M8ClientMode | null {
    return this._mode
  }

  get isAudioConnected(): boolean {
    return this.audio?.connected ?? false
  }

  get deviceTransport(): M8DeviceTransport | null {
    return (this.device?.transport as M8DeviceTransport | undefined) ?? null
  }

  async connect(): Promise<void> {
    this.connecting ??= this.resolveMode()
    return this.connecting
  }

  /** Picks host or standalone mode (see M8SdkConfig.mode) and sets it up. */
  private async resolveMode(): Promise<void> {
    const mode = this.config.mode ?? 'auto'
    if (mode === 'standalone' || (mode === 'auto' && !inIframe())) {
      await this.startStandalone()
      return
    }

    // An unmarked iframe may be some other page embedding the app: give up after a while
    const markedByYam8d = typeof window !== 'undefined' && window.name === YAM8D_FRAME_NAME
    const timeoutMs = mode === 'host' || markedByYam8d ? null : (this.config.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS)
    const connected = await this.handshake(timeoutMs)
    if (!connected) {
      if (this.config.debug) console.log('[M8 SDK] No yam8d host answered, switching to standalone mode')
      await this.startStandalone()
    }
  }

  private async handshake(timeoutMs: number | null): Promise<boolean> {
    let messenger: Messenger = new WindowMessenger({
      localWindow: window,
      remoteWindow: window.parent,
      remoteOrigin: '*',
    })

    if (this.config.debug) {
      messenger = DebugMessenger(messenger, (msg: string, ...args: unknown[]) => {
        console.log('[M8 SDK]', msg, ...args)
      })
    }

    const disposable = disposableMessenger(messenger)
    const handshake = ChildHandshake<M8ClientMethods, M8HostEvents, M8HostMethods, M8ClientEvents>(disposable.messenger, {
      ping: async () => 'pong',
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<null>((resolve) => {
      if (timeoutMs !== null) timer = setTimeout(() => resolve(null), timeoutMs)
    })
    const connection = await Promise.race([handshake, timedOut])
    clearTimeout(timer)
    if (!connection) {
      disposable.dispose()
      return false
    }

    this._mode = 'host'
    await this.attach(hostBackend(connection))
    connection.localHandle().emit('ready', undefined)
    return true
  }

  private async startStandalone(): Promise<void> {
    this._mode = 'standalone'
    if (this.config.autoConnect === false) return
    try {
      await this.openDevice('auto', false)
    } catch (error) {
      // Nothing granted yet (or the device is busy, e.g. open in yam8d): wait for connectDevice()
      if (this.config.debug) console.log('[M8 SDK] No device reopened automatically:', error)
    }
  }

  /**
   * Opens the device and runs an engine on it. 'auto' without a prompt tries each granted
   * API in turn; with a prompt it picks the first API the browser supports.
   */
  private async openDevice(transport: 'auto' | M8DeviceTransport, prompt: boolean): Promise<void> {
    const conn = connection()
    if (!conn.browserSupport) throw new Error('This browser has no Web Serial, WebUSB or Web MIDI: the M8 cannot be reached from this page')

    const candidates: ('auto' | M8DeviceTransport)[] =
      transport === 'auto' && !prompt ? (['serial', 'usb', 'midi'] as const).filter((t) => conn.available[t]) : [transport]

    // The same port cannot be opened twice: release the current device first
    await this.closeDevice()

    let bus: ConnectedBus | undefined
    let lastError: unknown = new Error('No M8 device available')
    for (const candidate of candidates) {
      try {
        bus = await conn.connect({ transport: candidate, prompt })
        break
      } catch (error) {
        lastError = error
        // The M8 Headless can need a moment after being picked: retry on the granted device
        if (prompt && !isUserCancel(error)) {
          bus = await connectWithRetry(() => conn.connect({ transport: candidate, prompt: false }), { maxAttempts: 2 })
          if (bus) break
        }
      }
    }
    if (!bus) throw lastError

    const engine = createM8Engine(bus, { debug: this.config.debug })
    this.device = bus
    await this.attach(engineBackend(engine))
    // The extractor listens now: ask for a full redraw so the screen state is complete
    bus.commands.resetScreen()

    const opened = bus
    void bus.closed.then(() => {
      if (this.device !== opened) return
      if (this.config.debug) console.log('[M8 SDK] Device connection ended')
      this.device = null
      this.detach()
    })
  }

  private async closeDevice(): Promise<void> {
    const bus = this.device
    if (!bus) return
    this.device = null
    this.detach()
    await bus.close()
  }

  /** Routes calls and events through `backend`. */
  private async attach(backend: Backend): Promise<void> {
    this.detach()
    this.backend = backend
    const subs = this.backendUnsubscribers

    subs.push(
      backend.on('stateChanged', (state) => {
        this._state = state
        this.refreshScreen()
        this.stateCallbacks.forEach((cb) => {
          cb(state)
        })
      }),
    )

    subs.push(
      backend.on('viewChanged', ({ viewName, viewTitle }) => {
        this._state = { ...this._state, viewName, viewTitle }
        this.refreshScreen()
        this.viewCallbacks.forEach((cb) => {
          cb(viewName, viewTitle)
        })
      }),
    )

    subs.push(
      backend.on('cursorMoved', ({ pos, rect, selectionMode }) => {
        this._state = { ...this._state, cursorPos: pos, cursorRect: rect, selectionMode }
        this.refreshScreen()
        this.cursorCallbacks.forEach((cb) => {
          cb(pos, rect, selectionMode)
        })
      }),
    )

    subs.push(
      backend.on('textUpdated', ({ textUnderCursor, currentLine }) => {
        this._state = { ...this._state, textUnderCursor, currentLine }
        this.refreshScreen()
        this.textCallbacks.forEach((cb) => {
          cb(textUnderCursor, currentLine)
        })
      }),
    )

    subs.push(
      backend.on('transport', (event) => {
        this.transportCallbacks.forEach((cb) => {
          cb(event)
        })
      }),
    )

    subs.push(
      backend.on('keyPressed', ({ keys }) => {
        this.keyCallbacks.forEach((cb) => {
          cb(keys)
        })
      }),
    )

    this.connectionCallbacks.forEach((cb) => {
      cb(true)
    })
    await this.fetchState()
    this.refreshScreen()
  }

  private detach(): void {
    const backend = this.backend
    if (!backend) return
    this.backend = null
    this.backendUnsubscribers.splice(0).forEach((unsubscribe) => {
      unsubscribe()
    })
    backend.close()
    this._screen = null
    this.connectionCallbacks.forEach((cb) => {
      cb(false)
    })
  }

  private requireBackend(): Backend {
    if (this.backend) return this.backend
    if (this._mode === 'standalone') throw new Error('No M8 device connected: call connectDevice() first')
    throw new Error('M8 SDK client is not connected')
  }

  /**
   * Keeps the cached screen close to the state without a round-trip per event: at most
   * one request in flight, and one more queued if events arrived meanwhile.
   */
  private refreshScreen(): void {
    const backend = this.backend
    if (!backend) return
    if (this.screenRefreshing) {
      this.screenDirty = true
      return
    }
    this.screenRefreshing = true
    backend
      .call('getScreen')
      .then((screen: M8Screen) => {
        if (this.backend === backend) this._screen = screen
      })
      .catch(() => {
        // Descriptions simply fall back to the cursor row alone.
      })
      .finally(() => {
        this.screenRefreshing = false
        if (this.screenDirty) {
          this.screenDirty = false
          this.refreshScreen()
        }
      })
  }

  async connectDevice(options: M8DeviceConnectOptions = {}): Promise<void> {
    await this.connect()
    if (this._mode === 'host') return
    await this.openDevice(options.transport ?? 'auto', true)
    if (options.audio) {
      // The device is usable without sound: report and carry on
      await this.connectAudio().catch((error: unknown) => console.warn('[M8 SDK] M8 audio not started:', error))
    }
  }

  async disconnectDevice(): Promise<void> {
    await this.disconnectAudio()
    await this.closeDevice()
  }

  async connectAudio(): Promise<void> {
    await this.connect()
    if (this._mode === 'host') return
    this.audio ??= createM8Audio()
    // Never fall back to another input: playing a microphone through the speakers feeds back
    await this.audio.connect({ requireM8: true })
  }

  async disconnectAudio(): Promise<void> {
    await this.audio?.disconnect()
  }

  getDevice(): M8DeviceBus | null {
    const bus = this.device
    if (!bus) return null
    return {
      transport: bus.transport as M8DeviceTransport,
      events: bus.protocol.eventBus as unknown as M8DeviceBus['events'],
      commands: bus.commands,
    }
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.add(callback)
    return () => this.connectionCallbacks.delete(callback)
  }

  async navigateToView(viewName: string): Promise<boolean> {
    return this.requireBackend().call('navigateToView', viewName)
  }

  async navigateTo(x: number, y: number): Promise<void> {
    return this.requireBackend().call('navigateTo', x, y)
  }

  async setValueToHex(targetHex: number): Promise<boolean> {
    return this.requireBackend().call('setValueToHex', targetHex)
  }

  async setValueToInt(targetInt: number): Promise<boolean> {
    return this.requireBackend().call('setValueToInt', targetInt)
  }

  async setValueFloat(targetFloat: number): Promise<boolean> {
    return this.requireBackend().call('setValueFloat', targetFloat)
  }

  async setNote(noteString: string): Promise<boolean> {
    return this.requireBackend().call('setNote', noteString)
  }

  async setValueToString(targetString: string, exact = true, searchInCurrentLine = false): Promise<boolean> {
    return this.requireBackend().call('setValueToString', targetString, exact, searchInCurrentLine)
  }

  async browseFile(targetText: string, exact = true): Promise<boolean> {
    return this.requireBackend().call('browseFile', targetText, exact)
  }

  async sendKeyPress(keys: M8KeyName[]): Promise<void> {
    return this.requireBackend().call('sendKeyPress', keys)
  }

  async sendKeyDown(keys: M8KeyName[]): Promise<void> {
    return this.requireBackend().call('sendKeyDown', keys)
  }

  async sendKeyUp(): Promise<void> {
    return this.requireBackend().call('sendKeyUp')
  }

  getState(): M8State {
    return this._state
  }

  async fetchState(): Promise<M8State> {
    const state = await this.requireBackend().call('getState')
    this._state = state
    return state
  }

  async getScreen(): Promise<M8Screen> {
    const screen = await this.requireBackend().call('getScreen')
    this._screen = screen
    return screen
  }

  async getScreenCells(): Promise<M8ScreenCells> {
    const cells = await this.requireBackend().call('getScreenCells')
    this._screen = { width: cells.width, height: cells.height, lines: cells.lines }
    return cells
  }

  async captureSnapshot(): Promise<M8Snapshot> {
    const [state, screen] = await Promise.all([this.fetchState(), this.getScreen()])
    const semantic = getSemanticContext(state, screen)
    return {
      capturedAt: Date.now(),
      state: {
        viewName: state.viewName,
        viewTitle: state.viewTitle,
        cursorPos: state.cursorPos,
        selectionMode: state.selectionMode,
        textUnderCursor: state.textUnderCursor,
        currentLine: state.currentLine,
        deviceModel: state.deviceModel,
      },
      semantic,
      description: semantic ? describeContext(semantic) : null,
      descriptionParts: semantic ? describeContextParts(semantic) : null,
      screen,
    }
  }

  onStateChange(callback: (state: M8State) => void): () => void {
    this.stateCallbacks.add(callback)
    return () => this.stateCallbacks.delete(callback)
  }

  onViewChange(callback: (viewName: string | null, viewTitle: string | null) => void): () => void {
    this.viewCallbacks.add(callback)
    return () => this.viewCallbacks.delete(callback)
  }

  onCursorMove(callback: (pos: M8State['cursorPos'], rect: M8State['cursorRect'], selectionMode: boolean) => void): () => void {
    this.cursorCallbacks.add(callback)
    return () => this.cursorCallbacks.delete(callback)
  }

  onTextUpdate(callback: (textUnderCursor: string | null, currentLine: string | null) => void): () => void {
    this.textCallbacks.add(callback)
    return () => this.textCallbacks.delete(callback)
  }

  onKeyPress(callback: (keys: number) => void): () => void {
    this.keyCallbacks.add(callback)
    return () => this.keyCallbacks.delete(callback)
  }

  async enableMidiTransport(): Promise<{ ok: boolean; error?: string }> {
    return this.requireBackend().call('enableMidiTransport')
  }

  onTransport(callback: (event: M8TransportEvent) => void): () => void {
    this.transportCallbacks.add(callback)
    return () => this.transportCallbacks.delete(callback)
  }

  disconnect(): void {
    void this.audio?.disconnect()
    void this.closeDevice()
    this.detach()
    this.stateCallbacks.clear()
    this.viewCallbacks.clear()
    this.cursorCallbacks.clear()
    this.textCallbacks.clear()
    this.keyCallbacks.clear()
    this.transportCallbacks.clear()
    this.connectionCallbacks.clear()
  }

  getSemanticContext(): M8SemanticContext | null {
    return getSemanticContext(this._state, this._screen)
  }

  describeContext(): string | null {
    const ctx = getSemanticContext(this._state, this._screen)
    return ctx ? describeContext(ctx) : null
  }

  describeContextParts(): M8DescriptionPart[] | null {
    const ctx = getSemanticContext(this._state, this._screen)
    return ctx ? describeContextParts(ctx) : null
  }
}

/**
 * Creates a client and connects it. Inside a yam8d External Apps iframe it talks to yam8d;
 * anywhere else it runs standalone (see M8SdkConfig.mode) and reopens a device the page was
 * granted before. A first standalone connection needs connectDevice() from a click.
 */
export async function createM8Client(config: M8SdkConfig = {}): Promise<M8Client> {
  const client = new M8ClientImpl(config)
  await client.connect()
  return client
}

export function createM8ClientSync(config: M8SdkConfig = {}): { client: M8Client; connect: () => Promise<void> } {
  const client = new M8ClientImpl(config)
  return {
    client,
    connect: async () => {
      await client.connect()
    },
  }
}

export default {
  createM8Client,
  createM8ClientSync,
}
