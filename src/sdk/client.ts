// Client-side library for iframe applications to communicate with the M8 host
// Import this in your iframe application to access the M8 SDK

// @ts-expect-error - post-me types not resolving correctly
import { ChildHandshake, WindowMessenger, DebugMessenger } from 'post-me'
// @ts-expect-error - post-me types not resolving correctly
import type { Connection, RemoteHandle, LocalHandle } from 'post-me'
import type {
    M8State,
    M8HostMethods,
    M8ClientMethods,
    M8HostEvents,
    M8ClientEvents,
    M8SdkConfig,
    M8KeyName,
} from './types'

export type { M8State, CursorPos, CursorRect, RGB, SystemInfos, M8KeyName } from './types'

// Client-side M8 SDK instance
export interface M8Client {
    /** Current M8 state (reactive, updated via events) */
    readonly state: M8State

    /** Whether the connection to the host is established */
    readonly isConnected: boolean

    // Navigation methods
    /** Navigate to a specific view by name. Resolves when view is reached or max steps reached. */
    navigateToView(viewName: string): Promise<boolean>

    /** Navigate to specific grid coordinates (0-39 x, 0-23 y). Resolves when destination or best position is reached. */
    navigateTo(x: number, y: number): Promise<void>

    // Value manipulation
    /**
     * Set the value under the cursor to a specific hex number (0-255).
     * Uses edit+navigation keys to increment/decrement the value.
     * edit+up/down = ±16, edit+left/right = ±1
     */
    setValueToHex(targetHex: number): Promise<boolean>

    // Key press
    /**
     * Send a key press to the M8.
     * Available keys: 'left', 'right', 'up', 'down', 'shift', 'play', 'opt', 'edit'
     * Multiple keys can be pressed simultaneously by passing an array
     */
    sendKeyPress(keys: M8KeyName[]): Promise<void>

    // State access
    /** Get the current state (synchronous - returns cached state) */
    getState(): M8State

    /** Fetch fresh state from host (asynchronous) */
    fetchState(): Promise<M8State>

    // Event handling
    /** Subscribe to state changes */
    onStateChange(callback: (state: M8State) => void): () => void

    /** Subscribe to view changes */
    onViewChange(callback: (viewName: string | null, viewTitle: string | null) => void): () => void

    /** Subscribe to cursor movement */
    onCursorMove(callback: (pos: M8State['cursorPos'], rect: M8State['cursorRect']) => void): () => void

    /** Subscribe to text updates */
    onTextUpdate(callback: (textUnderCursor: string | null, currentLine: string | null) => void): () => void

    /** Subscribe to key press events from M8 */
    onKeyPress(callback: (keys: number) => void): () => void

    /** Disconnect from the host */
    disconnect(): void
}

// Client implementation
class M8ClientImpl implements M8Client {
    private connection: Connection<M8ClientMethods, M8HostEvents, M8HostMethods, M8ClientEvents> | null = null
    private remoteHandle: RemoteHandle<M8HostMethods, M8HostEvents> | null = null
    private localHandle: LocalHandle<M8ClientMethods, M8ClientEvents> | null = null
    private _state: M8State = getDefaultState()
    private _isConnected = false
    private stateCallbacks: Set<(state: M8State) => void> = new Set()
    private viewChangeCallbacks: Set<(viewName: string | null, viewTitle: string | null) => void> = new Set()
    private cursorMoveCallbacks: Set<(pos: M8State['cursorPos'], rect: M8State['cursorRect']) => void> = new Set()
    private textUpdateCallbacks: Set<(textUnderCursor: string | null, currentLine: string | null) => void> = new Set()
    private keyPressCallbacks: Set<(keys: number) => void> = new Set()
    private config: M8SdkConfig

    constructor(config: M8SdkConfig = {}) {
        this.config = config
    }

    async connect(): Promise<void> {
        if (this.connection) {
            console.warn('[M8SDK Client] Already connected')
            return
        }

        try {
            // Create messenger
            let messenger = new WindowMessenger({
                localWindow: window,
                remoteWindow: window.parent,
                remoteOrigin: '*', // In production, use specific origin
            })

            // Add debug logging if enabled
            if (this.config.debug) {
                messenger = DebugMessenger(messenger, (msg: string, ...args: unknown[]) => {
                    console.log('[M8SDK Client]', msg, ...args)
                })
            }

            // Define client methods (exposed to host)
            const clientMethods: M8ClientMethods = {
                ping: async () => 'pong',
            }

            // Establish handshake
            const connection = await ChildHandshake<M8ClientMethods, M8HostEvents, M8HostMethods, M8ClientEvents>(
                messenger,
                clientMethods
            )

            this.connection = connection
            this.remoteHandle = connection.remoteHandle()
            this.localHandle = connection.localHandle()
            this._isConnected = true

            // Setup event listeners
            this.setupEventListeners()

            // Fetch initial state
            await this.fetchState()

            // Emit ready event
            this.localHandle.emit('ready', undefined)

            console.log('[M8SDK Client] Connected to host')
        } catch (error) {
            console.error('[M8SDK Client] Failed to connect:', error)
            throw error
        }
    }

    private setupEventListeners(): void {
        if (!this.remoteHandle) return

        // Listen for state changes
        this.remoteHandle.addEventListener('stateChanged', (state: M8State) => {
            this._state = state
            this.stateCallbacks.forEach(cb => { cb(state) })
        })

        // Listen for view changes
        this.remoteHandle.addEventListener('viewChanged', (payload: { viewName: string | null; viewTitle: string | null }) => {
            this._state.viewName = payload.viewName
            this._state.viewTitle = payload.viewTitle
            this.viewChangeCallbacks.forEach(cb => { cb(payload.viewName, payload.viewTitle) })
        })

        // Listen for cursor movements
        this.remoteHandle.addEventListener('cursorMoved', (payload: { pos: M8State['cursorPos']; rect: M8State['cursorRect'] }) => {
            this._state.cursorPos = payload.pos
            this._state.cursorRect = payload.rect
            this.cursorMoveCallbacks.forEach(cb => { cb(payload.pos, payload.rect) })
        })

        // Listen for text updates
        this.remoteHandle.addEventListener('textUpdated', (payload: { textUnderCursor: string | null; currentLine: string | null }) => {
            this._state.textUnderCursor = payload.textUnderCursor
            this._state.currentLine = payload.currentLine
            this.textUpdateCallbacks.forEach(cb => { cb(payload.textUnderCursor, payload.currentLine) })
        })

        // Listen for key press events
        this.remoteHandle.addEventListener('keyPressed', (payload: { keys: number }) => {
            this.keyPressCallbacks.forEach(cb => { cb(payload.keys) })
        })
    }

    // Getters
    get state(): M8State {
        return this._state
    }

    get isConnected(): boolean {
        return this._isConnected
    }

    // Navigation methods
    async navigateToView(viewName: string): Promise<boolean> {
        if (!this.remoteHandle) {
            throw new Error('[M8SDK Client] Not connected')
        }
        return this.remoteHandle.call('navigateToView', viewName)
    }

    async navigateTo(x: number, y: number): Promise<void> {
        if (!this.remoteHandle) {
            throw new Error('[M8SDK Client] Not connected')
        }
        return this.remoteHandle.call('navigateTo', x, y)
    }

    // Value manipulation
    async setValueToHex(targetHex: number): Promise<boolean> {
        if (!this.remoteHandle) {
            throw new Error('[M8SDK Client] Not connected')
        }
        // Validate range
        targetHex = Math.max(0, Math.min(255, Math.floor(targetHex)))
        return this.remoteHandle.call('setValueToHex', targetHex)
    }

    // Key press
    async sendKeyPress(keys: M8KeyName[]): Promise<void> {
        if (!this.remoteHandle) {
            throw new Error('[M8SDK Client] Not connected')
        }
        return this.remoteHandle.call('sendKeyPress', keys)
    }

    // State access
    getState(): M8State {
        return this._state
    }

    async fetchState(): Promise<M8State> {
        if (!this.remoteHandle) {
            throw new Error('[M8SDK Client] Not connected')
        }
        const state = await this.remoteHandle.call('getState')
        this._state = state
        return state
    }

    // Event handling
    onStateChange(callback: (state: M8State) => void): () => void {
        this.stateCallbacks.add(callback)
        return () => { this.stateCallbacks.delete(callback) }
    }

    onViewChange(callback: (viewName: string | null, viewTitle: string | null) => void): () => void {
        this.viewChangeCallbacks.add(callback)
        return () => { this.viewChangeCallbacks.delete(callback) }
    }

    onCursorMove(callback: (pos: M8State['cursorPos'], rect: M8State['cursorRect']) => void): () => void {
        this.cursorMoveCallbacks.add(callback)
        return () => { this.cursorMoveCallbacks.delete(callback) }
    }

    onTextUpdate(callback: (textUnderCursor: string | null, currentLine: string | null) => void): () => void {
        this.textUpdateCallbacks.add(callback)
        return () => { this.textUpdateCallbacks.delete(callback) }
    }

    onKeyPress(callback: (keys: number) => void): () => void {
        this.keyPressCallbacks.add(callback)
        return () => { this.keyPressCallbacks.delete(callback) }
    }

    disconnect(): void {
        this.connection?.close()
        this.connection = null
        this.remoteHandle = null
        this.localHandle = null
        this._isConnected = false
        this.stateCallbacks.clear()
        this.viewChangeCallbacks.clear()
        this.cursorMoveCallbacks.clear()
        this.textUpdateCallbacks.clear()
        this.keyPressCallbacks.clear()
        console.log('[M8SDK Client] Disconnected')
    }
}

// Helper to get default state
function getDefaultState(): M8State {
    return {
        viewName: null,
        viewTitle: null,
        minimapKey: null,
        cursorPos: null,
        cursorRect: null,
        highlightColor: null,
        titleColor: null,
        backgroundColor: null,
        textUnderCursor: null,
        currentLine: null,
        deviceModel: null,
        fontMode: null,
        systemInfo: null,
        macroRunning: false,
    }
}

// Factory function to create and connect a client
export async function createM8Client(config: M8SdkConfig = {}): Promise<M8Client> {
    const client = new M8ClientImpl(config)
    await client.connect()
    return client
}

// Hook for React applications (optional, can be used in iframe apps)
// This is a simple implementation - iframe apps might want their own state management
export function createM8ClientSync(config: M8SdkConfig = {}): { client: M8Client; connect: () => Promise<void> } {
    const client = new M8ClientImpl(config)
    return {
        client,
        connect: async () => { await client.connect() }
    }
}

// Default export
export default {
    createM8Client,
    createM8ClientSync,
}
