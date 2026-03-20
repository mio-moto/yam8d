import type { CursorPos, CursorRect, RGB, SystemInfos } from '../features/state/viewStore'

export type { CursorPos, CursorRect, RGB, SystemInfos }

// M8 State exposed to SDK clients
export interface M8State {
    // View information
    viewName: string | null
    viewTitle: string | null
    minimapKey: string | null

    // Cursor information
    cursorPos: CursorPos | null
    cursorRect: CursorRect | null
    selectionMode: boolean

    // Colors
    highlightColor: RGB | null
    titleColor: RGB | null
    backgroundColor: RGB | null

    // Text content
    textUnderCursor: string | null
    currentLine: string | null

    // Device info
    deviceModel: string | null
    fontMode: number | null
    systemInfo: SystemInfos | null

    // Macro status
    macroRunning: boolean
    macroCurrentStep?: number
    macroSequenceLength?: number
}

// M8 Key names for sendKeyPress
export type M8KeyName = 'left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit'

// Methods exposed by the host (parent) to the client (iframe)
export interface M8HostMethods {
    // Navigation methods
    /** Navigate to view by name - resolves when view is reached or max steps reached */
    navigateToView(viewName: string): Promise<boolean>
    /** Navigate to text grid coordinates (0-39 x, 0-23 y) - resolves when destination or best position is reached */
    navigateTo(x: number, y: number): Promise<void>

    // Value manipulation
    setValueToHex(targetHex: number): Promise<boolean>
    setValueToInt(targetInt: number): Promise<boolean>
    setNote(noteString: string): Promise<boolean>
    setValueToString(targetString: string, exact?: boolean, searchInCurrentLine?: boolean): Promise<boolean>

    // Key press
    /** Send a key press to the M8. Keys: left, right, up, down, shift, play, opt, edit */
    sendKeyPress(keys: M8KeyName[]): Promise<void>

    // Get current state
    getState(): Promise<M8State>
}

// Methods exposed by the client (iframe) to the host (parent) - if needed
export interface M8ClientMethods {
    // Client can expose methods to parent if needed
    ping(): Promise<string>
}

// Events emitted by host to client
export interface M8HostEvents {
    stateChanged: M8State
    viewChanged: { viewName: string | null; viewTitle: string | null }
    cursorMoved: { pos: CursorPos | null; rect: CursorRect | null; selectionMode: boolean }
    textUpdated: { textUnderCursor: string | null; currentLine: string | null }
    keyPressed: { keys: number }
}

// Events emitted by client to host
export interface M8ClientEvents {
    ready: undefined
    error: { message: string }
}

// Connection configuration
export interface M8SdkConfig {
    // Origin of the iframe content for security
    allowedOrigins?: string[]
    // Enable debug logging
    debug?: boolean
}

// Navigation target types
export interface ViewNavigationTarget {
    type: 'view'
    viewName: string
}

export interface CoordinateNavigationTarget {
    type: 'coordinate'
    x: number
    y: number
}

export type NavigationTarget = ViewNavigationTarget | CoordinateNavigationTarget
