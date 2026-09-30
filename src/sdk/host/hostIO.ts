import type { getDefaultStore } from 'jotai'
import type { ConnectedBus } from '../../features/connection/connection'
import { currentLineAtom, cursorPosAtom, textUnderCursorAtom, viewNameAtom, viewTitleAtom } from '../../features/state/viewStore'
import { type FileBrowserSnapshot, getFileBrowserSnapshotFingerprint } from './fileBrowserHelpers'

type Store = ReturnType<typeof getDefaultStore>

// Wait for a specific duration
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * What the value editors and the file browser search need from the host: key output
 * to the M8 and observation of the screen state. Independent of React.
 */
export type HostIO = {
    store: Store
    debugLog: (...args: unknown[]) => void
    hasBus: () => boolean
    sendKeys: (keys: number) => void
    pressAndRelease: (keys: number, delayMs?: number) => Promise<void>
    waitForTextUnderCursorChange: (previousValue: string | null, timeoutMs?: number) => Promise<string | null>
    waitForCurrentLineChange: (previousValue: string | null, timeoutMs?: number) => Promise<string | null>
    getFileBrowserSnapshot: () => FileBrowserSnapshot
    waitForFileBrowserSnapshotChange: (previousSnapshot: FileBrowserSnapshot, timeoutMs?: number) => Promise<FileBrowserSnapshot>
}

export const createHostIO = ({
    getBus,
    store,
    debugLog,
}: {
    getBus: () => ConnectedBus | undefined
    store: Store
    debugLog: (...args: unknown[]) => void
}): HostIO => {
    const hasBus = () => !!getBus()

    // Send keys helper - reads the bus lazily to avoid stale closures
    const sendKeys = (keys: number) => {
        getBus()?.commands.sendKeys(keys)
    }

    // Send keys and release
    const pressAndRelease = async (keys: number, delayMs: number = 50) => {
        sendKeys(keys)
        await wait(delayMs)
        sendKeys(0)
        await wait(delayMs)
    }

    // Prefer atom-change synchronization over fixed sleeps when reading post-key values.
    const waitForTextUnderCursorChange = (previousValue: string | null, timeoutMs: number = 500): Promise<string | null> => {
        return new Promise(resolve => {
            let settled = false
            let unsubscribe: (() => void) | null = null
            let timeout: ReturnType<typeof setTimeout> | null = null

            const finish = (value: string | null) => {
                if (settled) return
                settled = true
                if (timeout !== null) {
                    clearTimeout(timeout)
                }
                unsubscribe?.()
                resolve(value)
            }

            // If the value already changed before we started waiting (race with key press timing),
            // resolve immediately instead of subscribing and timing out.
            const currentValue = store.get(textUnderCursorAtom)
            if (currentValue !== previousValue) {
                finish(currentValue)
                return
            }

            unsubscribe = store.sub(textUnderCursorAtom, () => {
                const next = store.get(textUnderCursorAtom)
                if (next !== previousValue) {
                    finish(next)
                }
            })

            timeout = setTimeout(() => {
                finish(store.get(textUnderCursorAtom))
            }, timeoutMs)
        })
    }

    const getFileBrowserSnapshot = (): FileBrowserSnapshot => {
        return {
            viewName: store.get(viewNameAtom),
            viewTitle: store.get(viewTitleAtom),
            cursorPos: store.get(cursorPosAtom),
            textUnderCursor: store.get(textUnderCursorAtom),
            currentLine: store.get(currentLineAtom),
        }
    }

    const waitForFileBrowserSnapshotChange = (previousSnapshot: FileBrowserSnapshot, timeoutMs: number = 500): Promise<FileBrowserSnapshot> => {
        return new Promise(resolve => {
            let settled = false
            let unsubscribeText: (() => void) | null = null
            let unsubscribeLine: (() => void) | null = null
            let unsubscribeCursor: (() => void) | null = null
            let unsubscribeViewName: (() => void) | null = null
            let unsubscribeViewTitle: (() => void) | null = null
            let timeout: ReturnType<typeof setTimeout> | null = null
            const previousFingerprint = getFileBrowserSnapshotFingerprint(previousSnapshot)

            const finish = (snapshot: FileBrowserSnapshot) => {
                if (settled) return
                settled = true
                if (timeout !== null) {
                    clearTimeout(timeout)
                }
                unsubscribeText?.()
                unsubscribeLine?.()
                unsubscribeCursor?.()
                unsubscribeViewName?.()
                unsubscribeViewTitle?.()
                resolve(snapshot)
            }

            const checkForChange = () => {
                const snapshot = getFileBrowserSnapshot()
                if (getFileBrowserSnapshotFingerprint(snapshot) !== previousFingerprint) {
                    finish(snapshot)
                }
            }

            const currentSnapshot = getFileBrowserSnapshot()
            if (getFileBrowserSnapshotFingerprint(currentSnapshot) !== previousFingerprint) {
                finish(currentSnapshot)
                return
            }

            unsubscribeText = store.sub(textUnderCursorAtom, checkForChange)
            unsubscribeLine = store.sub(currentLineAtom, checkForChange)
            unsubscribeCursor = store.sub(cursorPosAtom, checkForChange)
            unsubscribeViewName = store.sub(viewNameAtom, checkForChange)
            unsubscribeViewTitle = store.sub(viewTitleAtom, checkForChange)

            timeout = setTimeout(() => {
                finish(getFileBrowserSnapshot())
            }, timeoutMs)
        })
    }

    // Prefer atom-change synchronization over fixed sleeps when reading post-key values.
    const waitForCurrentLineChange = (previousValue: string | null, timeoutMs: number = 500): Promise<string | null> => {
        return new Promise(resolve => {
            let settled = false
            let unsubscribe: (() => void) | null = null
            let timeout: ReturnType<typeof setTimeout> | null = null

            const finish = (value: string | null) => {
                if (settled) return
                settled = true
                if (timeout !== null) {
                    clearTimeout(timeout)
                }
                unsubscribe?.()
                resolve(value)
            }

            // If the value already changed before we started waiting (race with key press timing),
            // resolve immediately instead of subscribing and timing out.
            const currentValue = store.get(currentLineAtom)
            if (currentValue !== previousValue) {
                finish(currentValue)
                return
            }

            unsubscribe = store.sub(currentLineAtom, () => {
                const next = store.get(currentLineAtom)
                if (next !== previousValue) {
                    finish(next)
                }
            })

            timeout = setTimeout(() => {
                finish(store.get(currentLineAtom))
            }, timeoutMs)
        })
    }

    return {
        store,
        debugLog,
        hasBus,
        sendKeys,
        pressAndRelease,
        waitForTextUnderCursorChange,
        waitForCurrentLineChange,
        getFileBrowserSnapshot,
        waitForFileBrowserSnapshotChange,
    }
}
