// @ts-expect-error - post-me types are incomplete for the generic handshake signatures used here.
import { ChildHandshake, DebugMessenger, WindowMessenger } from 'post-me'
// @ts-expect-error - post-me types are incomplete for the generic handshake signatures used here.
import type { Connection, LocalHandle, RemoteHandle } from 'post-me'
import type { M8ClientEvents, M8ClientMethods, M8HostEvents, M8HostMethods, M8KeyName, M8SdkConfig, M8State } from './types'
import { getSemanticContext, describeContext } from './viewContext'
import type { M8SemanticContext } from './viewContext'

export type { CursorPos, CursorRect, M8KeyName, M8State, RGB, SystemInfos } from './types'
export type { M8SemanticContext } from './viewContext'

export interface M8Client {
  readonly state: M8State
  readonly isConnected: boolean
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
  onStateChange(callback: (state: M8State) => void): () => void
  onViewChange(callback: (viewName: string | null, viewTitle: string | null) => void): () => void
  onCursorMove(callback: (pos: M8State['cursorPos'], rect: M8State['cursorRect'], selectionMode: boolean) => void): () => void
  onTextUpdate(callback: (textUnderCursor: string | null, currentLine: string | null) => void): () => void
  onKeyPress(callback: (keys: number) => void): () => void
  disconnect(): void
  /**
   * Derives semantic context from the current state: view, row, and the typed
   * field under the cursor. Works for the five grid views (song, chain, phrase,
   * table, groove). Returns null when no view is active.
   */
  getSemanticContext(): M8SemanticContext | null
  /**
   * Returns a short human-readable description of what the cursor is on,
   * e.g. "Track 3 — Chain 0A — Song View row 02".
   */
  describeContext(): string | null
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
  textUnderCursor: null,
  currentLine: null,
  deviceModel: null,
  fontMode: null,
  systemInfo: null,
  macroRunning: false,
})

class M8ClientImpl implements M8Client {
  private connection: Connection<M8ClientMethods, M8HostEvents, M8HostMethods, M8ClientEvents> | null = null
  private remoteHandle: RemoteHandle<M8HostMethods, M8HostEvents> | null = null
  private localHandle: LocalHandle<M8ClientMethods, M8ClientEvents> | null = null
  private readonly stateCallbacks = new Set<(state: M8State) => void>()
  private readonly viewCallbacks = new Set<(viewName: string | null, viewTitle: string | null) => void>()
  private readonly cursorCallbacks = new Set<(pos: M8State['cursorPos'], rect: M8State['cursorRect'], selectionMode: boolean) => void>()
  private readonly textCallbacks = new Set<(textUnderCursor: string | null, currentLine: string | null) => void>()
  private readonly keyCallbacks = new Set<(keys: number) => void>()
  private _state: M8State = getDefaultState()
  private _isConnected = false
  private readonly config: M8SdkConfig

  constructor(config: M8SdkConfig = {}) {
    this.config = config
  }

  get state(): M8State {
    return this._state
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return
    }

    let messenger = new WindowMessenger({
      localWindow: window,
      remoteWindow: window.parent,
      remoteOrigin: '*',
    })

    if (this.config.debug) {
      messenger = DebugMessenger(messenger, (msg: string, ...args: unknown[]) => {
        console.log('[M8 SDK]', msg, ...args)
      })
    }

    const connection = await ChildHandshake<M8ClientMethods, M8HostEvents, M8HostMethods, M8ClientEvents>(messenger, {
      ping: async () => 'pong',
    })

    this.connection = connection
    this.remoteHandle = connection.remoteHandle()
    this.localHandle = connection.localHandle()
    this._isConnected = true

    this.remoteHandle.addEventListener('stateChanged', (state: M8State) => {
      this._state = state
      this.stateCallbacks.forEach((cb) => {
        cb(state)
      })
    })

    this.remoteHandle.addEventListener('viewChanged', ({ viewName, viewTitle }: { viewName: string | null; viewTitle: string | null }) => {
      this._state = { ...this._state, viewName, viewTitle }
      this.viewCallbacks.forEach((cb) => {
        cb(viewName, viewTitle)
      })
    })

    this.remoteHandle.addEventListener('cursorMoved', ({ pos, rect, selectionMode }: { pos: M8State['cursorPos']; rect: M8State['cursorRect']; selectionMode: boolean }) => {
      this._state = { ...this._state, cursorPos: pos, cursorRect: rect, selectionMode }
      this.cursorCallbacks.forEach((cb) => {
        cb(pos, rect, selectionMode)
      })
    })

    this.remoteHandle.addEventListener('textUpdated', ({ textUnderCursor, currentLine }: { textUnderCursor: string | null; currentLine: string | null }) => {
      this._state = { ...this._state, textUnderCursor, currentLine }
      this.textCallbacks.forEach((cb) => {
        cb(textUnderCursor, currentLine)
      })
    })

    this.remoteHandle.addEventListener('keyPressed', ({ keys }: { keys: number }) => {
      this.keyCallbacks.forEach((cb) => {
        cb(keys)
      })
    })

    await this.fetchState()
    this.localHandle.emit('ready', undefined)
  }

  async navigateToView(viewName: string): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('navigateToView', viewName)
  }

  async navigateTo(x: number, y: number): Promise<void> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('navigateTo', x, y)
  }

  async setValueToHex(targetHex: number): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('setValueToHex', targetHex)
  }

  async setValueToInt(targetInt: number): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('setValueToInt', targetInt)
  }

  async setValueFloat(targetFloat: number): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('setValueFloat', targetFloat)
  }

  async setNote(noteString: string): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('setNote', noteString)
  }

  async setValueToString(targetString: string, exact = true, searchInCurrentLine = false): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('setValueToString', targetString, exact, searchInCurrentLine)
  }

  async browseFile(targetText: string, exact = true): Promise<boolean> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('browseFile', targetText, exact)
  }

  async sendKeyPress(keys: M8KeyName[]): Promise<void> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('sendKeyPress', keys)
  }

  async sendKeyDown(keys: M8KeyName[]): Promise<void> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('sendKeyDown', keys)
  }

  async sendKeyUp(): Promise<void> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    return this.remoteHandle.call('sendKeyUp')
  }

  getState(): M8State {
    return this._state
  }

  async fetchState(): Promise<M8State> {
    if (!this.remoteHandle) throw new Error('M8 SDK client is not connected')
    const state = await this.remoteHandle.call('getState')
    this._state = state
    return state
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

  disconnect(): void {
    this.connection?.close()
    this.connection = null
    this.remoteHandle = null
    this.localHandle = null
    this._isConnected = false
    this.stateCallbacks.clear()
    this.viewCallbacks.clear()
    this.cursorCallbacks.clear()
    this.textCallbacks.clear()
    this.keyCallbacks.clear()
  }

  getSemanticContext(): M8SemanticContext | null {
    return getSemanticContext(this._state)
  }

  describeContext(): string | null {
    const ctx = getSemanticContext(this._state)
    return ctx ? describeContext(ctx) : null
  }
}

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
