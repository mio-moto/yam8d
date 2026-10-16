import type { M8Store } from '../store'
import { type FileBrowserSnapshot, getFileBrowserSnapshotFingerprint } from './fileBrowserHelpers'

// Wait for a specific duration
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Where key frames go: a connected bus's commands, or nothing while disconnected. */
export type KeySink = { sendKeys: (keys: number) => void }

/**
 * What the value editors and the file browser search need from the engine: key output
 * to the M8 and observation of the screen state.
 */
export type HostIO = {
  store: M8Store
  debugLog: (...args: unknown[]) => void
  hasBus: () => boolean
  sendKeys: (keys: number) => void
  pressAndRelease: (keys: number, delayMs?: number) => Promise<void>
  waitForTextUnderCursorChange: (previousValue: string | null, timeoutMs?: number) => Promise<string | null>
  waitForCurrentLineChange: (previousValue: string | null, timeoutMs?: number) => Promise<string | null>
  getFileBrowserSnapshot: () => FileBrowserSnapshot
  waitForFileBrowserSnapshotChange: (previousSnapshot: FileBrowserSnapshot, timeoutMs?: number) => Promise<FileBrowserSnapshot>
  /** Whole M8 screen as text rows (row index === cursor grid row). */
  getScreenLines: () => string[]
}

export const createHostIO = ({
  getKeySink,
  store,
  debugLog,
  getScreenLines,
}: {
  getKeySink: () => KeySink | undefined
  store: M8Store
  debugLog: (...args: unknown[]) => void
  getScreenLines: () => string[]
}): HostIO => {
  const hasBus = () => !!getKeySink()

  // Send keys helper - reads the sink lazily so a reconnected device is picked up
  const sendKeys = (keys: number) => {
    getKeySink()?.sendKeys(keys)
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
    return new Promise((resolve) => {
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
      const currentValue = store.get('textUnderCursor')
      if (currentValue !== previousValue) {
        finish(currentValue)
        return
      }

      unsubscribe = store.sub('textUnderCursor', () => {
        const next = store.get('textUnderCursor')
        if (next !== previousValue) {
          finish(next)
        }
      })

      timeout = setTimeout(() => {
        finish(store.get('textUnderCursor'))
      }, timeoutMs)
    })
  }

  const getFileBrowserSnapshot = (): FileBrowserSnapshot => {
    return {
      viewName: store.get('viewName'),
      viewTitle: store.get('viewTitle'),
      cursorPos: store.get('cursorPos'),
      textUnderCursor: store.get('textUnderCursor'),
      currentLine: store.get('currentLine'),
    }
  }

  const waitForFileBrowserSnapshotChange = (previousSnapshot: FileBrowserSnapshot, timeoutMs: number = 500): Promise<FileBrowserSnapshot> => {
    return new Promise((resolve) => {
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

      unsubscribeText = store.sub('textUnderCursor', checkForChange)
      unsubscribeLine = store.sub('currentLine', checkForChange)
      unsubscribeCursor = store.sub('cursorPos', checkForChange)
      unsubscribeViewName = store.sub('viewName', checkForChange)
      unsubscribeViewTitle = store.sub('viewTitle', checkForChange)

      timeout = setTimeout(() => {
        finish(getFileBrowserSnapshot())
      }, timeoutMs)
    })
  }

  // Prefer atom-change synchronization over fixed sleeps when reading post-key values.
  const waitForCurrentLineChange = (previousValue: string | null, timeoutMs: number = 500): Promise<string | null> => {
    return new Promise((resolve) => {
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
      const currentValue = store.get('currentLine')
      if (currentValue !== previousValue) {
        finish(currentValue)
        return
      }

      unsubscribe = store.sub('currentLine', () => {
        const next = store.get('currentLine')
        if (next !== previousValue) {
          finish(next)
        }
      })

      timeout = setTimeout(() => {
        finish(store.get('currentLine'))
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
    getScreenLines,
  }
}
