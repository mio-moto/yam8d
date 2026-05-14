export interface CursorPos {
  x: number
  y: number
}

export interface CursorRect {
  x: number
  y: number
  w: number
  h: number
}

export interface RGB {
  r: number
  g: number
  b: number
}

export interface SystemInfos {
  [key: string]: string | number | boolean | undefined
}

export interface M8State {
  viewName: string | null
  viewTitle: string | null
  minimapKey: string | null
  cursorPos: CursorPos | null
  cursorRect: CursorRect | null
  selectionMode: boolean
  highlightColor: RGB | null
  titleColor: RGB | null
  backgroundColor: RGB | null
  textUnderCursor: string | null
  currentLine: string | null
  deviceModel: string | null
  fontMode: number | null
  systemInfo: SystemInfos | null
  macroRunning: boolean
  macroCurrentStep?: number
  macroSequenceLength?: number
}

export type M8KeyName = 'left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit'

export interface M8HostMethods {
  navigateToView(viewName: string): Promise<boolean>
  navigateTo(x: number, y: number): Promise<void>
  setValueToHex(targetHex: number): Promise<boolean>
  setValueToInt(targetInt: number): Promise<boolean>
  setNote(noteString: string): Promise<boolean>
  setValueToString(targetString: string, exact?: boolean, searchInCurrentLine?: boolean): Promise<boolean>
  browseFile(targetText: string, exact?: boolean): Promise<boolean>
  sendKeyPress(keys: M8KeyName[]): Promise<void>
  sendKeyDown(keys: M8KeyName[]): Promise<void>
  sendKeyUp(): Promise<void>
  getState(): Promise<M8State>
}

export interface M8ClientMethods {
  ping(): Promise<string>
}

export interface M8HostEvents {
  stateChanged: M8State
  viewChanged: { viewName: string | null; viewTitle: string | null }
  cursorMoved: { pos: CursorPos | null; rect: CursorRect | null; selectionMode: boolean }
  textUpdated: { textUnderCursor: string | null; currentLine: string | null }
  keyPressed: { keys: number }
}

export interface M8ClientEvents {
  ready: undefined
  error: { message: string }
}

export interface M8SdkConfig {
  debug?: boolean
}

export interface M8Client {
  readonly state: M8State
  readonly isConnected: boolean
  navigateToView(viewName: string): Promise<boolean>
  navigateTo(x: number, y: number): Promise<void>
  setValueToHex(targetHex: number): Promise<boolean>
  setValueToInt(targetInt: number): Promise<boolean>
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
}

export function createM8Client(config?: M8SdkConfig): Promise<M8Client>

export function createM8ClientSync(config?: M8SdkConfig): {
  client: M8Client
  connect: () => Promise<void>
}

declare const m8Sdk: {
  createM8Client: typeof createM8Client
  createM8ClientSync: typeof createM8ClientSync
}

export default m8Sdk
