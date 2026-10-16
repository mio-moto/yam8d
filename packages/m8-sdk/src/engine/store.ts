// Observable state that the engine derives from the M8 screen stream: view, cursor, text
// under the cursor, colours, device info and macro status. Framework-free; yam8d mirrors
// it into jotai atoms, the standalone client reads it directly.

import type { CursorPos, CursorRect, RGB } from '../types'

/** Model, font mode and the layout metrics derived from them (from the M8's system command). */
export interface M8SystemInfo {
  model: string
  fontMode: number
  spacingX: number
  spacingY: number
  offX: number
  offY: number
  screenWidth: number
  screenHeight: number
  rectOffset: number
}

export interface M8CellMetrics {
  cellW: number
  cellH: number
  offX: number
  offY: number
}

export interface M8MacroStatus {
  running: boolean
  currentStep?: number
  sequenceLength?: number
}

export interface M8StoreState {
  /** Current view name (lowercased, cleaned). */
  viewName: string | null
  /** Raw title row text. */
  viewTitle: string | null
  minimapKey: string | null
  /** Cursor position in character grid coordinates (0..39, 0..23). */
  cursorPos: CursorPos | null
  /** Cursor rectangle in M8 pixel space. */
  cursorRect: CursorRect | null
  /** Whether the cursor is drawn as a 1px selection rectangle. */
  selectionMode: boolean
  /** Foreground colour of the text under the cursor. */
  highlightColor: RGB | null
  /** Colour of the cursor rectangle corners as last drawn. */
  cursorColor: RGB | null
  textUnderCursor: string | null
  /** The whole screen row the cursor is on. */
  currentLine: string | null
  titleColor: RGB | null
  backgroundColor: RGB | null
  deviceModel: string | null
  fontMode: number | null
  /** Pixel size and offset of one character cell (model and font dependent). */
  cellMetrics: M8CellMetrics
  systemInfo: M8SystemInfo | null
  macroStatus: M8MacroStatus
}

export type M8StoreKey = keyof M8StoreState

export interface M8Store {
  get<K extends M8StoreKey>(key: K): M8StoreState[K]
  /** Sets a value; listeners run synchronously, and only when the value changed (by identity). */
  set<K extends M8StoreKey>(key: K, value: M8StoreState[K]): void
  /** Listens to one key. Returns the unsubscribe function. */
  sub(key: M8StoreKey, listener: () => void): () => void
  /** Listens to every key. Returns the unsubscribe function. */
  subAll(listener: (key: M8StoreKey) => void): () => void
  snapshot(): M8StoreState
}

export const initialStoreState = (): M8StoreState => ({
  viewName: null,
  viewTitle: null,
  minimapKey: null,
  cursorPos: null,
  cursorRect: null,
  selectionMode: false,
  highlightColor: null,
  cursorColor: null,
  textUnderCursor: null,
  currentLine: null,
  titleColor: null,
  backgroundColor: null,
  deviceModel: null,
  fontMode: null,
  cellMetrics: { cellW: 12, cellH: 14, offX: 0, offY: 0 },
  systemInfo: null,
  macroStatus: { running: false },
})

export const createM8Store = (initial: Partial<M8StoreState> = {}): M8Store => {
  const state: M8StoreState = { ...initialStoreState(), ...initial }
  const listeners = new Map<M8StoreKey, Set<() => void>>()
  const allListeners = new Set<(key: M8StoreKey) => void>()

  return {
    get: (key) => state[key],
    set: (key, value) => {
      if (Object.is(state[key], value)) return
      state[key] = value
      for (const listener of [...(listeners.get(key) ?? [])]) listener()
      for (const listener of [...allListeners]) listener(key)
    },
    sub: (key, listener) => {
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    subAll: (listener) => {
      allListeners.add(listener)
      return () => {
        allListeners.delete(listener)
      }
    },
    snapshot: () => ({ ...state }),
  }
}
