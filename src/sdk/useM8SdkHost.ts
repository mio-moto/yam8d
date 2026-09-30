import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { getDefaultStore, useAtomValue } from 'jotai'
// @ts-expect-error - post-me types not resolving correctly
import { ParentHandshake, WindowMessenger, DebugMessenger } from 'post-me'
// @ts-expect-error - post-me types not resolving correctly
import type { Connection, LocalHandle } from 'post-me'
import type { ConnectedBus } from '../features/connection/connection'
import { useViewNavigator } from '../features/macros/useViewNavigator'
import { useViewNavigation } from '../features/macros/useViewNavigation'
import {
    viewNameAtom,
    viewTitleAtom,
    cursorPosAtom,
    cursorRectAtom,
    selectionModeAtom,
    textUnderCursorAtom,
    currentLineAtom,
    macroStatusAtom,
} from '../features/state/viewStore'
import { createFileBrowserSearch } from './host/fileBrowserSearch'
import { createFloatEditor } from './host/floatEditor'
import { createHostIO } from './host/hostIO'
import { createHostMethods } from './host/hostMethods'
import { getCurrentState } from './host/hostState'
import { createValueEditors } from './host/valueEditors'
import type {
    M8HostMethods,
    M8ClientMethods,
    M8HostEvents,
    M8ClientEvents,
    M8SdkConfig,
} from './types'

/**
 * Hosts an iframe app and bridges it to the M8: handshake over post-me, exposed
 * methods (see host/hostMethods.ts) and state/cursor/text/key events pushed to the client.
 * The value editing and file browsing logic lives in ./host/*, independent of React.
 */
export const useM8SdkHost = (bus: ConnectedBus | undefined, config: M8SdkConfig = {}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const connectionRef = useRef<Connection<M8HostMethods, M8ClientEvents, M8ClientMethods, M8HostEvents> | null>(null)
    const localHandleRef = useRef<LocalHandle<M8HostMethods, M8HostEvents> | null>(null)
    const [clientConnected, setClientConnected] = useState(false)
    const busRef = useRef(bus)
    const connectionAttemptRef = useRef(0)

    const debugLog = useCallback((...args: unknown[]) => {
        if (config.debug) {
            console.log(...args)
        }
    }, [config.debug])

    // Keep bus ref up to date
    useEffect(() => {
        busRef.current = bus
    }, [bus])

    const { navigateTo } = useViewNavigator(bus)
    const { navigateToView: navigateToViewByName } = useViewNavigation(bus)
    const store = getDefaultStore()

    // Screen I/O and the editors built on it; rebuilt only when debug logging is toggled
    const io = useMemo(() => createHostIO({ getBus: () => busRef.current, store, debugLog }), [store, debugLog])
    const editors = useMemo(() => createValueEditors(io), [io])
    const setValueFloat = useMemo(() => createFloatEditor(io), [io])
    const browseFile = useMemo(() => createFileBrowserSearch(io), [io])

    // Store navigateTo in ref to avoid stale closures in the effect
    const navigateToRef = useRef(navigateTo)
    useEffect(() => {
        navigateToRef.current = navigateTo
    }, [navigateTo])

    // Store navigateToView in ref
    const navigateToViewByNameRef = useRef(navigateToViewByName)
    useEffect(() => {
        navigateToViewByNameRef.current = navigateToViewByName
    }, [navigateToViewByName])

    // Emit state to client
    const emitState = useCallback(() => {
        const handle = localHandleRef.current
        if (!handle) return

        const state = getCurrentState()
        handle.emit('stateChanged', state)
    }, [])

    // Emit specific events
    const emitViewChanged = useCallback((viewName: string | null, viewTitle: string | null) => {
        const handle = localHandleRef.current
        if (!handle) return
        handle.emit('viewChanged', { viewName, viewTitle })
    }, [])

    const emitCursorMoved = useCallback((pos: ReturnType<typeof getCurrentState>['cursorPos'], rect: ReturnType<typeof getCurrentState>['cursorRect'], selectionMode: boolean) => {
        const handle = localHandleRef.current
        if (!handle) return
        handle.emit('cursorMoved', { pos, rect, selectionMode })
    }, [])

    const emitTextUpdated = useCallback((textUnderCursor: string | null, currentLine: string | null) => {
        const handle = localHandleRef.current
        if (!handle) return
        handle.emit('textUpdated', { textUnderCursor, currentLine })
    }, [])

    const emitKeyPressed = useCallback((keys: number) => {
        const handle = localHandleRef.current
        if (!handle) return
        handle.emit('keyPressed', { keys })
    }, [])

    // Setup post-me connection
    // biome-ignore lint/correctness/useExhaustiveDependencies: <on model change to get correct refs>
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
                // Create messenger
                let messenger = new WindowMessenger({
                    localWindow: window,
                    remoteWindow: childWindow,
                    remoteOrigin: '*', // TODO: Use specific origins from config
                })

                // Add debug logging if enabled
                if (config.debug) {
                    messenger = DebugMessenger(messenger, (msg: string, ...args: unknown[]) => {
                        console.log('[M8SDK Host]', msg, ...args)
                    })
                }

                // Methods exposed to child - navigation goes through refs to get the latest values
                const methods = createHostMethods({
                    io,
                    editors,
                    setValueFloat,
                    browseFile,
                    navigateToView: (viewName) => navigateToViewByNameRef.current(viewName),
                    navigateTo: (point) => navigateToRef.current(point),
                })

                // Establish handshake
                const connection = await ParentHandshake<M8HostMethods, M8ClientEvents, M8ClientMethods, M8HostEvents>(
                    messenger,
                    methods
                )

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
                        const state = getCurrentState()
                        localHandleRef.current.emit('stateChanged', state)
                        debugLog('[M8SDK] Initial state emitted')
                    }
                }, 100)

                debugLog('[M8SDK] Client connected')
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

    // Use atom values for reactive updates
    // Note: We need to use the atoms that are actually updated by the M8 rendering pipeline
    // The viewExtractor updates these atoms when new frame data arrives from the M8
    const viewName = useAtomValue(viewNameAtom)
    const viewTitle = useAtomValue(viewTitleAtom)
    const cursorPos = useAtomValue(cursorPosAtom)
    const cursorRect = useAtomValue(cursorRectAtom)
    const selectionMode = useAtomValue(selectionModeAtom)
    const textUnderCursor = useAtomValue(textUnderCursorAtom)
    const currentLine = useAtomValue(currentLineAtom)
    const macroStatus = useAtomValue(macroStatusAtom)

    // Keep track of previous values to avoid duplicate emissions
    const prevViewRef = useRef<{ name: string | null; title: string | null } | null>(null)
    const prevCursorRef = useRef<{ pos: typeof cursorPos; rect: typeof cursorRect } | null>(null)
    const prevTextRef = useRef<{ text: string | null; line: string | null } | null>(null)

    // Emit view changes - only when actually changed
    useEffect(() => {
        if (!clientConnected) return

        const prev = prevViewRef.current
        const current = { name: viewName, title: viewTitle }

        // Skip if no change
        if (prev && prev.name === current.name && prev.title === current.title) {
            return
        }

        prevViewRef.current = current
        debugLog('[M8SDK] View changed:', viewName, viewTitle)
        emitViewChanged(viewName, viewTitle)
    }, [clientConnected, viewName, viewTitle, emitViewChanged, debugLog])

    // Emit cursor changes - only when actually changed
    useEffect(() => {
        if (!clientConnected) return

        const prev = prevCursorRef.current
        const current = { pos: cursorPos, rect: cursorRect }

        // Skip if no change (pos, rect, or selectionMode)
        if (prev &&
            prev.pos?.x === current.pos?.x &&
            prev.pos?.y === current.pos?.y &&
            prev.rect?.x === current.rect?.x &&
            prev.rect?.y === current.rect?.y &&
            prev.rect?.w === current.rect?.w &&
            prev.rect?.h === current.rect?.h) {
            return
        }

        prevCursorRef.current = current
        debugLog('[M8SDK] Cursor moved:', cursorPos, cursorRect, 'selection:', selectionMode)
        emitCursorMoved(cursorPos, cursorRect, selectionMode)
    }, [clientConnected, cursorPos, cursorRect, selectionMode, emitCursorMoved, debugLog])

    // Emit text changes - only when actually changed
    useEffect(() => {
        if (!clientConnected) return

        const prev = prevTextRef.current
        const current = { text: textUnderCursor, line: currentLine }

        // Skip if no change
        if (prev && prev.text === current.text && prev.line === current.line) {
            return
        }

        prevTextRef.current = current
        debugLog('[M8SDK] Text updated:', textUnderCursor, currentLine)
        emitTextUpdated(textUnderCursor, currentLine)
    }, [clientConnected, textUnderCursor, currentLine, emitTextUpdated, debugLog])

    // Emit state on macro changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: <on model change to get correct refs>
    useEffect(() => {
        if (!clientConnected) return
        debugLog('[M8SDK] Macro status changed:', macroStatus)
        emitState()
    }, [clientConnected, macroStatus.running, macroStatus.currentStep, emitState, debugLog])

    // Emit key events from M8 to SDK client
    useEffect(() => {
        if (!bus || !clientConnected) return

        const handleKeyEvent = (data: { keys: number }) => {
            // Emit all key events (including releases when keys === 0)
            debugLog('[M8SDK] Key event:', data.keys)
            emitKeyPressed(data.keys)
        }

        bus.protocol.eventBus.on('key', handleKeyEvent)

        return () => {
            bus.protocol.eventBus.off('key', handleKeyEvent)
        }
    }, [bus, clientConnected, emitKeyPressed, debugLog])

    return {
        iframeRef,
        isReady: clientConnected,
    }
}
