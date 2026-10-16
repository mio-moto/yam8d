import { useEffect, useRef, useState } from 'react'
// @ts-expect-error - post-me types not resolving correctly
import { ParentHandshake, WindowMessenger, DebugMessenger } from 'post-me'
// @ts-expect-error - post-me types not resolving correctly
import type { Connection, LocalHandle } from 'post-me'
import type { ConnectedBus } from '../../packages/m8-sdk/src/engine/connection'
import type { M8Engine } from '../../packages/m8-sdk/src/engine/engine'
import { useM8Engine } from '../features/engine'
import type { M8HostMethods, M8ClientMethods, M8HostEvents, M8ClientEvents, M8SdkConfig, M8State } from './types'

const SDK_EVENTS: (keyof M8HostEvents)[] = ['stateChanged', 'viewChanged', 'cursorMoved', 'textUpdated', 'keyPressed', 'transport']

const EMPTY_STATE: M8State = {
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
}

// Answers while no M8 is connected: actions warn and do nothing, reads return empty values
const offline =
    <R>(name: string, result: R) =>
    async (): Promise<R> => {
        console.warn(`[M8SDK] ${name}: no bus connection`)
        return result
    }

const DISCONNECTED_METHODS: M8HostMethods = {
    navigateToView: offline('navigateToView', false),
    navigateTo: offline('navigateTo', undefined),
    setValueToHex: offline('setValueToHex', false),
    setValueToInt: offline('setValueToInt', false),
    setValueFloat: offline('setValueFloat', false),
    setNote: offline('setNote', false),
    setValueToString: offline('setValueToString', false),
    browseFile: offline('browseFile', false),
    sendKeyPress: offline('sendKeyPress', undefined),
    sendKeyDown: offline('sendKeyDown', undefined),
    sendKeyUp: offline('sendKeyUp', undefined),
    getState: async () => EMPTY_STATE,
    getScreen: async () => ({ width: 40, height: 24, lines: [] }),
    getScreenCells: async () => ({ width: 40, height: 24, lines: [], fg: [], bg: [] }),
    enableMidiTransport: async () => ({ ok: false, error: 'no M8 connected' }),
}

/**
 * Hosts an iframe app and bridges it to the M8: handshake over post-me, then the engine's
 * methods (packages/m8-sdk/src/engine) exposed to the client and its events forwarded.
 * The iframe should carry name={YAM8D_FRAME_NAME} so the client knows it runs in yam8d.
 */
export const useM8SdkHost = (bus: ConnectedBus | undefined, config: M8SdkConfig = {}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const connectionRef = useRef<Connection<M8HostMethods, M8ClientEvents, M8ClientMethods, M8HostEvents> | null>(null)
    const localHandleRef = useRef<LocalHandle<M8HostMethods, M8HostEvents> | null>(null)
    const [clientConnected, setClientConnected] = useState(false)
    const connectionAttemptRef = useRef(0)

    const engine = useM8Engine(bus)
    // Methods are bound once per handshake: they read the current engine through this ref
    const engineRef = useRef<M8Engine | undefined>(engine)
    useEffect(() => {
        engineRef.current = engine
    }, [engine])

    // Setup post-me connection
    useEffect(() => {
        if (!iframeRef.current) return

        let isActive = true

        const setupConnection = async () => {
            const attemptId = connectionAttemptRef.current + 1
            connectionAttemptRef.current = attemptId
            const childWindow = iframeRef.current?.contentWindow
            if (!childWindow) {
                return
            }

            try {
                let messenger = new WindowMessenger({
                    localWindow: window,
                    remoteWindow: childWindow,
                    remoteOrigin: '*', // TODO: Use specific origins from config
                })

                if (config.debug) {
                    messenger = DebugMessenger(messenger, (msg: string, ...args: unknown[]) => {
                        console.log('[M8SDK Host]', msg, ...args)
                    })
                }

                // Each call goes to the engine of the bus connected at that moment
                const methods = Object.fromEntries(
                    (Object.keys(DISCONNECTED_METHODS) as (keyof M8HostMethods)[]).map((name) => [
                        name,
                        (...args: unknown[]) => {
                            const target = engineRef.current?.methods ?? DISCONNECTED_METHODS
                            return (target[name] as (...a: unknown[]) => unknown)(...args)
                        },
                    ]),
                ) as unknown as M8HostMethods

                const connection = await ParentHandshake<M8HostMethods, M8ClientEvents, M8ClientMethods, M8HostEvents>(messenger, methods)

                if (!isActive || attemptId !== connectionAttemptRef.current) {
                    connection.close()
                    return
                }

                connectionRef.current = connection
                localHandleRef.current = connection.localHandle()
                setClientConnected(true)

                // Emit initial state after a small delay to ensure connection is ready
                setTimeout(() => {
                    if (localHandleRef.current) {
                        localHandleRef.current.emit('stateChanged', engineRef.current?.getState() ?? EMPTY_STATE)
                    }
                }, 100)

                if (config.debug) console.log('[M8SDK] Client connected')
            } catch (error) {
                console.error('[M8SDK] Failed to establish connection:', error)
            }
        }

        // Wait for iframe to load before connecting
        const iframe = iframeRef.current
        const handleLoad = () => {
            if (isActive) {
                connectionRef.current?.close()
                connectionRef.current = null
                localHandleRef.current = null
                setClientConnected(false)
                void setupConnection()
            }
        }

        iframe.addEventListener('load', handleLoad)

        return () => {
            isActive = false
            connectionAttemptRef.current += 1
            iframe.removeEventListener('load', handleLoad)
            connectionRef.current?.close()
            connectionRef.current = null
            localHandleRef.current = null
            setClientConnected(false)
        }
    }, [config.debug])

    // Forward the engine's events to the connected client
    useEffect(() => {
        if (!engine || !clientConnected) return
        const unsubscribers = SDK_EVENTS.map((event) =>
            engine.on(event, (payload) => {
                localHandleRef.current?.emit(event, payload)
            }),
        )
        // A client that connected before the device gets the full state once it is there
        localHandleRef.current?.emit('stateChanged', engine.getState())
        return () => {
            for (const unsubscribe of unsubscribers) unsubscribe()
        }
    }, [engine, clientConnected])

    return {
        iframeRef,
        isReady: clientConnected,
    }
}
