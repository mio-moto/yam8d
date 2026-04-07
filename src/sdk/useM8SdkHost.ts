import { useEffect, useRef, useCallback, useState } from 'react'
import { getDefaultStore, useAtomValue } from 'jotai'
// @ts-expect-error - post-me types not resolving correctly
import { ParentHandshake, WindowMessenger, DebugMessenger } from 'post-me'
// @ts-expect-error - post-me types not resolving correctly
import type { Connection, LocalHandle } from 'post-me'
import type { ConnectedBus } from '../features/connection/connection'
import { M8KeyMask, pressKeys } from '../features/connection/keys'
import { useViewNavigator } from '../features/macros/useViewNavigator'
import { useViewNavigation } from '../features/macros/useViewNavigation'
import {
    viewNameAtom,
    viewTitleAtom,
    minimapKeyAtom,
    cursorPosAtom,
    cursorRectAtom,
    selectionModeAtom,
    highlightColorAtom,
    textUnderCursorAtom,
    currentLineAtom,
    titleColorAtom,
    backgroundColorAtom,
    macroStatusAtom,
    deviceModelAtom,
    fontModeAtom,
    systemInfoAtom,
    cellMetricsAtom,
} from '../features/state/viewStore'
import type {
    M8State,
    M8HostMethods,
    M8ClientMethods,
    M8HostEvents,
    M8ClientEvents,
    M8SdkConfig,
} from './types'


// Helper to get current state from all atoms
const getCurrentState = (): M8State => {
    const store = getDefaultStore()
    const macroStatus = store.get(macroStatusAtom)

    return {
        viewName: store.get(viewNameAtom),
        viewTitle: store.get(viewTitleAtom),
        minimapKey: store.get(minimapKeyAtom),
        cursorPos: store.get(cursorPosAtom),
        cursorRect: store.get(cursorRectAtom),
        selectionMode: store.get(selectionModeAtom),
        highlightColor: store.get(highlightColorAtom),
        titleColor: store.get(titleColorAtom),
        backgroundColor: store.get(backgroundColorAtom),
        textUnderCursor: store.get(textUnderCursorAtom),
        currentLine: store.get(currentLineAtom),
        deviceModel: store.get(deviceModelAtom),
        fontMode: store.get(fontModeAtom),
        systemInfo: store.get(systemInfoAtom),
        macroRunning: macroStatus.running,
        macroCurrentStep: macroStatus.currentStep,
        macroSequenceLength: macroStatus.sequenceLength,
    }
}

// Parse hex value from text (handles formats like "3F", "0x3F", "3f", "--")
// Returns 0 for '--' which represents 00 in the M8 UI
const parseHexValue = (text: string | null): number | null => {
    if (!text) return null
    const cleaned = text.trim()
    // Handle '--' as 00
    if (cleaned === '--') return 0
    const hexCleaned = cleaned.replace(/^0x/i, '')
    const match = hexCleaned.match(/^[0-9A-Fa-f]+/)
    if (!match) return null
    const parsed = parseInt(match[0], 16)
    return Number.isNaN(parsed) ? null : parsed
}

// Parse integer value from text (handles formats like "123", "-12", "+7", "--")
// Returns 0 for '--' which is commonly used as an empty numeric placeholder in M8 UI
const parseIntValue = (text: string | null): number | null => {
    if (!text) return null
    const cleaned = text.trim()
    if (cleaned === '--') return 0
    const match = cleaned.match(/^[+-]?\d+/)
    if (!match) return null
    const parsed = Number.parseInt(match[0], 10)
    return Number.isNaN(parsed) ? null : parsed
}

const NOTE_ORDER = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'] as const

type ParsedNote = {
    label: string
    noteName: string
    octave: number
    semitoneIndex: number
}

const parseNoteValue = (text: string | null): ParsedNote | null => {
    if (!text) return null
    const match = text.trim().toUpperCase().match(/([A-G][#-][0-9A-F])/)
    if (!match) return null

    const label = match[1]
    const noteName = label.slice(0, 2)
    const octave = Number.parseInt(label.slice(2, 3), 16)
    const noteOffset = NOTE_ORDER.indexOf(noteName as (typeof NOTE_ORDER)[number])

    if (noteOffset < 0 || Number.isNaN(octave)) {
        return null
    }

    return {
        label,
        noteName,
        octave,
        semitoneIndex: octave * 12 + noteOffset,
    }
}

const normalizeForSearch = (text: string | null): string => {
    return text?.trim().toLowerCase() ?? ''
}

// M8 browser files use short extensions such as .MBN, .MNS, .MNT...
// Accept ".M" followed by two alphanumeric characters so base-name matching
// works across file browser types without hardcoding each one.
const FILE_BROWSER_EXTENSION_SUFFIX_REGEX = /\.m[a-z0-9]{2}$/i

type FileBrowserSnapshot = {
    viewName: string | null
    viewTitle: string | null
    cursorPos: M8State['cursorPos']
    textUnderCursor: string | null
    currentLine: string | null
}

const getFileBrowserSnapshotFingerprint = (snapshot: FileBrowserSnapshot): string => {
    return [
        snapshot.viewName ?? '',
        snapshot.viewTitle ?? '',
        snapshot.cursorPos?.x ?? '',
        snapshot.cursorPos?.y ?? '',
        snapshot.textUnderCursor ?? '',
        snapshot.currentLine ?? '',
    ].join('|')
}

const getSelectedFileBrowserEntry = (snapshot: FileBrowserSnapshot): string | null => {
    return snapshot.textUnderCursor?.trim() || snapshot.currentLine?.trim() || null
}

const isFileBrowserView = (snapshot: Pick<FileBrowserSnapshot, 'viewName' | 'viewTitle'>): boolean => {
    const normalizedViewName = normalizeForSearch(snapshot.viewName)
    const normalizedViewTitle = normalizeForSearch(snapshot.viewTitle)
    return normalizedViewName.includes('load')
        || normalizedViewName.includes('save')
        || normalizedViewTitle.includes('load')
        || normalizedViewTitle.includes('save')
}

const isParentDirectoryEntry = (entry: string | null): boolean => normalizeForSearch(entry) === '/..'
const isDirectoryEntry = (entry: string | null): boolean => !!entry?.trim().startsWith('/')
const isM8FileEntry = (entry: string | null): boolean => !!entry && !isDirectoryEntry(entry) && FILE_BROWSER_EXTENSION_SUFFIX_REGEX.test(entry.trim())
const getFileEntrySearchTerms = (entry: string | null): string[] => {
    const trimmedEntry = entry?.trim() ?? ''
    if (!trimmedEntry) return []

    const normalizedFullName = normalizeForSearch(trimmedEntry)
    const normalizedBaseName = normalizeForSearch(trimmedEntry.replace(FILE_BROWSER_EXTENSION_SUFFIX_REGEX, ''))
    return Array.from(new Set([normalizedFullName, normalizedBaseName].filter(Boolean)))
}

// Wait for a specific duration
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const useM8SdkHost = (bus: ConnectedBus | undefined, config: M8SdkConfig = {}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const connectionRef = useRef<Connection<M8HostMethods, M8ClientEvents, M8ClientMethods, M8HostEvents> | null>(null)
    const localHandleRef = useRef<LocalHandle<M8HostMethods, M8HostEvents> | null>(null)
    const [clientConnected, setClientConnected] = useState(false)
    const busRef = useRef(bus)

    const debugLog = useCallback((...args: unknown[]) => {
        if (config.debug) {
            console.log(...args)
        }
    }, [config.debug])

    const browseLog = useCallback((message: string, details?: unknown) => {
        if (details === undefined) {
            console.log('[M8SDK browseFile]', message)
            return
        }
        console.log('[M8SDK browseFile]', message, details)
    }, [])

    // Keep bus ref up to date
    useEffect(() => {
        busRef.current = bus
    }, [bus])

    const { navigateTo } = useViewNavigator(bus)
    const { navigateToView: navigateToViewByName } = useViewNavigation(bus)
    const store = getDefaultStore()

    // Send keys helper with proper timing - use ref to avoid stale closure
    const sendKeys = useCallback((keys: number) => {
        busRef.current?.commands.sendKeys(keys)
    }, [])

    // Send keys and release
    const pressAndRelease = useCallback(async (keys: number, delayMs: number = 50) => {
        sendKeys(keys)
        await wait(delayMs)
        sendKeys(0)
        await wait(delayMs)
    }, [sendKeys])

    // Prefer atom-change synchronization over fixed sleeps when reading post-key values.
    const waitForTextUnderCursorChange = useCallback((previousValue: string | null, timeoutMs: number = 500): Promise<string | null> => {
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
    }, [store])

    const getFileBrowserSnapshot = useCallback((): FileBrowserSnapshot => {
        return {
            viewName: store.get(viewNameAtom),
            viewTitle: store.get(viewTitleAtom),
            cursorPos: store.get(cursorPosAtom),
            textUnderCursor: store.get(textUnderCursorAtom),
            currentLine: store.get(currentLineAtom),
        }
    }, [store])

    const waitForFileBrowserSnapshotChange = useCallback((previousSnapshot: FileBrowserSnapshot, timeoutMs: number = 500): Promise<FileBrowserSnapshot> => {
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
    }, [getFileBrowserSnapshot, store])

    // Precalculate the key sequence needed to reach target value from current value
    // Uses edit+left/right for ±1 and edit+up/down for ±16
    const calculateKeySequence = useCallback((currentValue: number, targetValue: number): number[] => {
        const sequence: number[] = []
        let current = currentValue
        const target = targetValue

        while (current !== target) {
            const diff = target - current
            const absDiff = Math.abs(diff)
            const direction = diff > 0 ? 1 : -1

            if (absDiff >= 16) {
                // Use large steps (±16) - edit+up for +16, edit+down for -16
                const steps16 = Math.floor(absDiff / 16)
                const key = direction > 0 ? M8KeyMask.Up : M8KeyMask.Down
                const keys = M8KeyMask.Edit | key

                // Take as many large steps as possible (capped at keep-alive limit)
                const stepsToTake = Math.min(steps16, 10)
                for (let i = 0; i < stepsToTake; i++) {
                    // Press key
                    sequence.push(keys)
                    // Release key
                    sequence.push(0)
                    current += direction * 16
                    if (current === target) break
                }
            } else if (absDiff > 0) {
                // Use fine adjustment (±1) - edit+right for +1, edit+left for -1
                const key = direction > 0 ? M8KeyMask.Right : M8KeyMask.Left
                const keys = M8KeyMask.Edit | key

                // Press key
                sequence.push(keys)
                // Release key
                sequence.push(0)
                current += direction * 1
            } else {
                break
            }
        }

        return sequence
    }, [])

    // Precalculate note moves in semitone space.
    // Uses edit+up/down for octave jumps (±12) and edit+left/right for semitone steps (±1).
    const calculateNoteKeySequence = useCallback((currentIndex: number, targetIndex: number): number[] => {
        const sequence: number[] = []
        let current = currentIndex

        while (current !== targetIndex) {
            const diff = targetIndex - current
            const direction = diff > 0 ? 1 : -1

            if (Math.abs(diff) >= 12) {
                const key = direction > 0 ? M8KeyMask.Up : M8KeyMask.Down
                sequence.push(M8KeyMask.Edit | key)
                sequence.push(0)
                current += direction * 12
            } else {
                const key = direction > 0 ? M8KeyMask.Right : M8KeyMask.Left
                sequence.push(M8KeyMask.Edit | key)
                sequence.push(0)
                current += direction
            }

            // Safety cap for malformed input.
            if (sequence.length > 2048) {
                break
            }
        }

        return sequence
    }, [])

    // Implementation of setValueToHex using edit+navigation keys
    // Precalculates the entire key sequence and sends it to the macroRunner
    const setValueToHexImpl = useCallback(async (targetHex: number): Promise<boolean> => {
        if (!busRef.current) return false

        // Validate target
        targetHex = Math.max(0, Math.min(255, targetHex))

        // Read current value using the atom directly (no wait needed)
        const currentText = store.get(textUnderCursorAtom)
        const currentValue = parseHexValue(currentText)
        const isInitialDashDash = currentText?.trim() === '--'

        if (currentValue === null) {
            console.warn('[M8SDK] Could not parse current value under cursor:', currentText)
            return false
        }

        if (currentValue === targetHex && !isInitialDashDash) {
            debugLog('[M8SDK] Already at target value:', targetHex.toString(16).padStart(2, '0').toUpperCase())
            return true
        }

        debugLog(`[M8SDK] Setting value from "${currentText?.trim() ?? 'N/A'}" (${currentValue.toString(16).padStart(2, '0').toUpperCase()}) to ${targetHex.toString(16).padStart(2, '0').toUpperCase()}`)

        // Starting value after entering edit mode
        let startValue = currentValue

        // If initial value is '--', we need to press edit first to recall the last value
        if (isInitialDashDash) {
            debugLog('[M8SDK] Initial value is "--", pressing edit to recall last value')
            const beforePrime = currentText
            await pressAndRelease(M8KeyMask.Edit)
            await waitForTextUnderCursorChange(beforePrime, 250)

            // Read the actual value after pressing edit (not always 00!)
            const newText = store.get(textUnderCursorAtom)
            const newValue = parseHexValue(newText)
            debugLog(`[M8SDK] After edit press, value is now: "${newText?.trim() ?? 'N/A'}" (${newValue?.toString(16).padStart(2, '0').toUpperCase() ?? 'N/A'})`)

            if (newValue === null) {
                console.warn('[M8SDK] Failed to read value after edit press on "--"')
                // Try to exit edit mode and return failure
                await pressAndRelease(M8KeyMask.Edit)
                return false
            }

            // Use the actual value after edit press as starting point
            startValue = newValue
        } else {
            // Normal case: enter edit mode
            const beforeEnterEdit = currentText
            await pressAndRelease(M8KeyMask.Edit)
            await waitForTextUnderCursorChange(beforeEnterEdit, 250)
        }

        // Precalculate the key sequence (starting from the actual current value after edit mode)
        const keySequence = calculateKeySequence(startValue, targetHex)
        debugLog(`[M8SDK] Precalculated ${keySequence.length / 2} key presses from ${startValue.toString(16).padStart(2, '0').toUpperCase()} to ${targetHex.toString(16).padStart(2, '0').toUpperCase()}`)

        // Execute the key sequence
        for (const keys of keySequence) {
            busRef.current.commands.sendKeys(keys)
            await wait(30) // Short delay between key presses
        }

        // Wait for final value to settle
        await waitForTextUnderCursorChange(currentText, 250)

        // Read final value using the atom
        const finalText = store.get(textUnderCursorAtom)
        let finalValue = parseHexValue(finalText)

        // Check if precomputation succeeded, if not try iterative mode
        if (finalValue !== targetHex) {
            debugLog('[M8SDK] Precomputation missed target, falling back to iterative mode')

            // Continue from current position using iterative approach
            let current = finalValue ?? startValue
            const timeoutMs = 5000
            const startTime = Date.now()

            while (current !== targetHex && Date.now() - startTime < timeoutMs) {
                const diff = targetHex - current
                const absDiff = Math.abs(diff)
                const direction = diff > 0 ? 1 : -1
                const beforeStepText = store.get(textUnderCursorAtom)

                if (absDiff >= 16) {
                    // Large step
                    const key = direction > 0 ? M8KeyMask.Up : M8KeyMask.Down
                    const keys = M8KeyMask.Edit | key
                    await pressAndRelease(keys)
                } else if (absDiff > 0) {
                    // Fine adjustment
                    const key = direction > 0 ? M8KeyMask.Right : M8KeyMask.Left
                    const keys = M8KeyMask.Edit | key
                    await pressAndRelease(keys)
                }

                await waitForTextUnderCursorChange(beforeStepText, 250)
                const newText = store.get(textUnderCursorAtom)
                const newValue = parseHexValue(newText)
                if (newValue !== null) {
                    current = newValue
                    debugLog(`[M8SDK] Iterative: current value: ${current.toString(16).padStart(2, '0').toUpperCase()}`)
                }
            }

            // Read final value after iterative mode
            finalValue = parseHexValue(store.get(textUnderCursorAtom))
        }

        // Exit edit mode
        await pressAndRelease(M8KeyMask.Edit)

        const success = finalValue === targetHex
        debugLog(`[M8SDK] Value setting ${success ? 'succeeded' : 'failed'}. Final value: "${finalText?.trim() ?? 'N/A'}" (${finalValue?.toString(16).padStart(2, '0').toUpperCase() ?? 'N/A'})`)

        return success
    }, [pressAndRelease, store, calculateKeySequence, waitForTextUnderCursorChange, debugLog])

    // Implementation of setValueToInt using edit+navigation keys
    const setValueToIntImpl = useCallback(async (targetInt: number): Promise<boolean> => {
        if (!busRef.current) return false

        targetInt = Math.floor(targetInt)

        const currentText = store.get(textUnderCursorAtom)
        const currentValue = parseIntValue(currentText)
        if (currentValue === null) {
            console.warn('[M8SDK] Could not parse current integer value under cursor:', currentText)
            return false
        }

        if (currentValue === targetInt) {
            return true
        }

        // Enter edit mode
        await pressAndRelease(M8KeyMask.Edit)
        await waitForTextUnderCursorChange(currentText, 250)

        let current = currentValue
        let bestValue = currentValue
        let bestDistance = Math.abs(currentValue - targetInt)
        let valueTwoStepsAgo: number | null = null
        const timeoutMs = 5000
        const startedAt = Date.now()

        while (current !== targetInt && Date.now() - startedAt < timeoutMs) {
            const diff = targetInt - current
            const absDiff = Math.abs(diff)
            const direction = diff > 0 ? 1 : -1
            const beforeStepText = store.get(textUnderCursorAtom)
            const previousValue = current

            if (absDiff >= 16) {
                const key = direction > 0 ? M8KeyMask.Up : M8KeyMask.Down
                await pressAndRelease(M8KeyMask.Edit | key, 35)
            } else {
                const key = direction > 0 ? M8KeyMask.Right : M8KeyMask.Left
                await pressAndRelease(M8KeyMask.Edit | key, 35)
            }

            await waitForTextUnderCursorChange(beforeStepText, 250)
            const newValue = parseIntValue(store.get(textUnderCursorAtom))
            if (newValue === null || newValue === current) {
                break
            }

            const newDistance = Math.abs(newValue - targetInt)
            if (newDistance < bestDistance) {
                bestDistance = newDistance
                bestValue = newValue
            }

            // Detect 2-value bounce (A -> B -> A), especially when crossing target.
            const isOscillating = valueTwoStepsAgo !== null && newValue === valueTwoStepsAgo
            const crossesTarget = (previousValue - targetInt) * (newValue - targetInt) < 0

            current = newValue
            if (isOscillating && crossesTarget) {
                break
            }

            valueTwoStepsAgo = previousValue
        }

        // If exact target was not reached, move back to the nearest value observed.
        if (current !== bestValue) {
            const snapStartedAt = Date.now()
            while (current !== bestValue && Date.now() - snapStartedAt < 1500) {
                const diffToBest = bestValue - current
                const absDiffToBest = Math.abs(diffToBest)
                const directionToBest = diffToBest > 0 ? 1 : -1
                const beforeSnapStepText = store.get(textUnderCursorAtom)

                if (absDiffToBest >= 16) {
                    const key = directionToBest > 0 ? M8KeyMask.Up : M8KeyMask.Down
                    await pressAndRelease(M8KeyMask.Edit | key, 35)
                } else {
                    const key = directionToBest > 0 ? M8KeyMask.Right : M8KeyMask.Left
                    await pressAndRelease(M8KeyMask.Edit | key, 35)
                }

                await waitForTextUnderCursorChange(beforeSnapStepText, 250)
                const snappedValue = parseIntValue(store.get(textUnderCursorAtom))
                if (snappedValue === null || snappedValue === current) {
                    break
                }
                current = snappedValue
            }
        }

        await pressAndRelease(M8KeyMask.Edit)

        const finalValue = parseIntValue(store.get(textUnderCursorAtom))
        return finalValue === targetInt
    }, [pressAndRelease, store, waitForTextUnderCursorChange])

    // Implementation of setNote using edit+up/down for octave and edit+left/right for semitone
    // If the exact note is unreachable (for example due to scale), this stops on the closest note found.
    const setNoteImpl = useCallback(async (targetNoteString: string): Promise<boolean> => {
        if (!busRef.current) return false

        const parsedTarget = parseNoteValue(targetNoteString)
        if (!parsedTarget) {
            console.warn('[M8SDK] Invalid note format. Expected like C-1, C#1, D#A:', targetNoteString)
            return false
        }

        let currentText = store.get(textUnderCursorAtom)
        if (currentText?.trim() === '---') {
            debugLog('[M8SDK] Initial note is "---", priming with edit key')
            await pressAndRelease(M8KeyMask.Edit)
            await waitForTextUnderCursorChange(currentText, 250)
            currentText = store.get(textUnderCursorAtom)
        }

        let currentNote = parseNoteValue(currentText)
        if (!currentNote) {
            console.warn('[M8SDK] Could not parse current note under cursor:', currentText)
            return false
        }

        if (currentNote.semitoneIndex === parsedTarget.semitoneIndex) {
            return true
        }

        // First attempt: precomputed semitone/octave path (fast path).
        await pressAndRelease(M8KeyMask.Edit)
        await waitForTextUnderCursorChange(currentText, 250)

        const precomputedSequence = calculateNoteKeySequence(currentNote.semitoneIndex, parsedTarget.semitoneIndex)
        if (precomputedSequence.length > 0) {
            for (const keys of precomputedSequence) {
                busRef.current?.commands.sendKeys(keys)
                await wait(25)
            }

            await waitForTextUnderCursorChange(currentText, 280)
            const precomputedFinal = parseNoteValue(store.get(textUnderCursorAtom))
            if (precomputedFinal?.semitoneIndex === parsedTarget.semitoneIndex) {
                await pressAndRelease(M8KeyMask.Edit)
                return true
            }

            // Precomputed path can miss when scale quantization makes exact steps unreachable.
            currentNote = precomputedFinal ?? currentNote
        }

        // Fallback: iterative closest-note search.

        const seen = new Set<string>()
        seen.add(currentNote.label)

        const timeoutMs = 7000
        const startedAt = Date.now()

        while (Date.now() - startedAt < timeoutMs) {
            const diff = parsedTarget.semitoneIndex - currentNote.semitoneIndex
            if (diff === 0) {
                break
            }

            const useOctaveStep = Math.abs(diff) >= 12
            const positiveDirection = diff > 0
            const key = useOctaveStep
                ? (positiveDirection ? M8KeyMask.Up : M8KeyMask.Down)
                : (positiveDirection ? M8KeyMask.Right : M8KeyMask.Left)
            const reverseKey = useOctaveStep
                ? (positiveDirection ? M8KeyMask.Down : M8KeyMask.Up)
                : (positiveDirection ? M8KeyMask.Left : M8KeyMask.Right)

            const previousNote = currentNote
            const previousDistance = Math.abs(previousNote.semitoneIndex - parsedTarget.semitoneIndex)

            const beforeStepText = store.get(textUnderCursorAtom)
            await pressAndRelease(M8KeyMask.Edit | key, 35)
            await waitForTextUnderCursorChange(beforeStepText, 250)

            const newNote = parseNoteValue(store.get(textUnderCursorAtom))
            if (!newNote) {
                break
            }
            if (newNote.label === previousNote.label) {
                break
            }

            currentNote = newNote
            const currentDistance = Math.abs(currentNote.semitoneIndex - parsedTarget.semitoneIndex)

            if (currentDistance > previousDistance) {
                // Overshot into a worse candidate, step back and stop on the closer one.
                const beforeReverseStep = store.get(textUnderCursorAtom)
                await pressAndRelease(M8KeyMask.Edit | reverseKey, 35)
                await waitForTextUnderCursorChange(beforeReverseStep, 250)
                const steppedBack = parseNoteValue(store.get(textUnderCursorAtom))
                if (steppedBack) {
                    currentNote = steppedBack
                }
                break
            }

            if (seen.has(currentNote.label)) {
                break
            }
            seen.add(currentNote.label)
        }

        await pressAndRelease(M8KeyMask.Edit)

        const finalNote = parseNoteValue(store.get(textUnderCursorAtom))
        return finalNote?.semitoneIndex === parsedTarget.semitoneIndex
    }, [pressAndRelease, store, waitForTextUnderCursorChange, calculateNoteKeySequence, debugLog])

    // Implementation of setValueToString by anchoring at bottom and scanning forward one step at a time.
    const setValueToStringImpl = useCallback(async (targetString: string, exact: boolean = true, searchInCurrentLine: boolean = false): Promise<boolean> => {
        if (!busRef.current) return false

        const normalizedTarget = normalizeForSearch(targetString)
        if (!normalizedTarget) {
            return false
        }

        const getSearchSource = (): string | null => {
            return searchInCurrentLine ? store.get(currentLineAtom) : store.get(textUnderCursorAtom)
        }

        const matches = (value: string | null): boolean => {
            const normalizedValue = normalizeForSearch(value)
            if (!normalizedValue) return false
            return exact ? normalizedValue === normalizedTarget : normalizedValue.includes(normalizedTarget)
        }

        // 0) Check if we're already on the right value before doing anything.
        if (matches(getSearchSource())) {
            return true
        }

        // Some fields start at "---" and need one edit press before they expose real values.
        const initialCursorText = store.get(textUnderCursorAtom)
        if (initialCursorText?.trim() === '---') {
            debugLog('[M8SDK] Initial string value is "---", priming with edit key')
            await pressAndRelease(M8KeyMask.Edit)
            await waitForTextUnderCursorChange(initialCursorText, 250)
        }

        const beforeEnterEdit = store.get(textUnderCursorAtom)
        await pressAndRelease(M8KeyMask.Edit)
        await waitForTextUnderCursorChange(beforeEnterEdit, 250)

        // Check again right after entering edit mode before going to the bottom.
        if (matches(getSearchSource())) {
            await pressAndRelease(M8KeyMask.Edit)
            return true
        }

        // 1) Go to the bottom: keep sending edit+down until value stops changing.
        // Guard against circular lists (no bottom) using a seed of the first few observed
        // values, and a hard timeout.
        let currentText = store.get(textUnderCursorAtom)
        const maxBottomConfirmationRetries = 1
        let bottomNoChangeCount = 0
        const bottomStartTime = Date.now()
        const BOTTOM_TIMEOUT_MS = 2000
        const CIRCULAR_SEED_COUNT = 4
        const bottomSeedValues: string[] = []
        for (let i = 0; i < 512; i++) {
            if (Date.now() - bottomStartTime > BOTTOM_TIMEOUT_MS) {
                debugLog('[M8SDK] Timeout reached while seeking bottom of list')
                break
            }

            const normalizedCurrent = normalizeForSearch(currentText)
            if (normalizedCurrent) {
                if (i < CIRCULAR_SEED_COUNT) {
                    bottomSeedValues.push(normalizedCurrent)
                } else if (bottomSeedValues.includes(normalizedCurrent)) {
                    debugLog('[M8SDK] Circular list detected while seeking bottom, treating current position as start')
                    break
                }
            }

            const beforeStepText = currentText
            await pressAndRelease(M8KeyMask.Edit | M8KeyMask.Down, 35)
            const nextText = await waitForTextUnderCursorChange(beforeStepText, 250)
            if (normalizeForSearch(nextText) === normalizeForSearch(currentText)) {
                bottomNoChangeCount += 1
            } else {
                bottomNoChangeCount = 0
                currentText = nextText
            }

            // Once bottom is detected (no change), allow only one confirmation retry.
            if (bottomNoChangeCount > maxBottomConfirmationRetries) {
                break
            }
        }

        // 2) Walk forward with edit+right and compare text at each step.
        const seen = new Set<string>()
        for (let i = 0; i < 1024; i++) {
            const searchSource = getSearchSource()
            if (matches(searchSource)) {
                await pressAndRelease(M8KeyMask.Edit)
                return true
            }

            const normalizedText = normalizeForSearch(searchSource)
            if (normalizedText) {
                if (seen.has(normalizedText)) {
                    break
                }
                seen.add(normalizedText)
            }

            const beforeStepText = store.get(textUnderCursorAtom)
            await pressAndRelease(M8KeyMask.Edit | M8KeyMask.Right, 35)
            const nextText = await waitForTextUnderCursorChange(beforeStepText, 250)
            if (normalizeForSearch(nextText) === normalizedText) {
                break
            }
        }

        await pressAndRelease(M8KeyMask.Edit)
        return false
    }, [pressAndRelease, store, waitForTextUnderCursorChange, debugLog])

    const browseFileImpl = useCallback(async (targetText: string, exact: boolean = true): Promise<boolean> => {
        if (!busRef.current) return false

        type FileBrowserDirection = 'up' | 'down'

        const normalizedTarget = normalizeForSearch(targetText)
        const targetIncludesExtension = FILE_BROWSER_EXTENSION_SUFFIX_REGEX.test(normalizedTarget)
        if (!normalizedTarget) {
            return false
        }

        browseLog('start', { targetText, normalizedTarget, exact })

        const ensureFileBrowserActive = (): boolean => {
            const snapshot = getFileBrowserSnapshot()
            return isFileBrowserView(snapshot)
        }

        const stepFileBrowser = async (keyMask: number, timeoutMs: number = 350): Promise<{ changed: boolean; snapshot: FileBrowserSnapshot }> => {
            const previousSnapshot = getFileBrowserSnapshot()
            await pressAndRelease(keyMask, 35)
            const nextSnapshot = await waitForFileBrowserSnapshotChange(previousSnapshot, timeoutMs)
            const changed = getFileBrowserSnapshotFingerprint(nextSnapshot) !== getFileBrowserSnapshotFingerprint(previousSnapshot)
            return { changed, snapshot: nextSnapshot }
        }

        const getStepMask = (direction: FileBrowserDirection): number => direction === 'up' ? M8KeyMask.Up : M8KeyMask.Down
        const getJumpMask = (direction: FileBrowserDirection): number => direction === 'up' ? (M8KeyMask.Opt | M8KeyMask.Up) : (M8KeyMask.Opt | M8KeyMask.Down)

        const moveToTopOfCurrentDirectory = async (): Promise<FileBrowserSnapshot> => {
            let snapshot = getFileBrowserSnapshot()
            for (let i = 0; i < 512; i++) {
                const result = await stepFileBrowser(M8KeyMask.Up, 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('reached top of directory', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    return snapshot
                }
            }
            browseLog('top search hit safety cap', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
            return snapshot
        }

        const applyAlphabeticalSort = async (): Promise<void> => {
            const previousSnapshot = getFileBrowserSnapshot()
            browseLog('apply alphabetical sort')
            await pressAndRelease(M8KeyMask.Shift | M8KeyMask.Opt, 35)
            // Sorting the browser can take a moment; give the UI time to settle
            // before relying on the next cursor/text snapshot.
            await wait(180)
            const sortedSnapshot = await waitForFileBrowserSnapshotChange(previousSnapshot, 300)
            browseLog('sort settled', { entry: getSelectedFileBrowserEntry(sortedSnapshot), y: sortedSnapshot.cursorPos?.y })
        }

        const moveByRowCount = async (direction: FileBrowserDirection, rows: number): Promise<FileBrowserSnapshot> => {
            let remainingRows = Math.max(0, Math.floor(rows))
            let snapshot = getFileBrowserSnapshot()
            browseLog('move by row count', { direction, rows: remainingRows, from: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })

            while (remainingRows >= 8) {
                const result = await stepFileBrowser(getJumpMask(direction), 280)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('jump stopped early', { direction, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    return snapshot
                }
                remainingRows -= 8
            }

            while (remainingRows > 0) {
                const result = await stepFileBrowser(getStepMask(direction), 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('fine move stopped early', { direction, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    return snapshot
                }
                remainingRows -= 1
            }

            browseLog('move by row count complete', { direction, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
            return snapshot
        }

        const entryMatchesTarget = (entry: string | null): boolean => {
            if (!isM8FileEntry(entry)) return false
            const searchTerms = getFileEntrySearchTerms(entry)
            return searchTerms.some(term => exact ? term === normalizedTarget : term.includes(normalizedTarget))
        }

        const getPrimaryFileSearchTerm = (entry: string | null): string | null => {
            if (!isM8FileEntry(entry)) return null
            const terms = getFileEntrySearchTerms(entry)
            return targetIncludesExtension ? (terms[0] ?? null) : (terms[1] ?? terms[0] ?? null)
        }

        const compareFileEntryToTarget = (entry: string | null): number | null => {
            const primaryTerm = getPrimaryFileSearchTerm(entry)
            if (!primaryTerm) return null
            return primaryTerm.localeCompare(normalizedTarget)
        }

        const sharedPrefixLength = (a: string, b: string): number => {
            const maxLength = Math.min(a.length, b.length)
            let index = 0
            while (index < maxLength && a[index] === b[index]) {
                index += 1
            }
            return index
        }

        const shouldRescanJumpedBlock = (entry: string | null, compareToTarget: number | null): boolean => {
            if (compareToTarget === null) return true
            if (compareToTarget >= 0) return true

            const primaryTerm = getPrimaryFileSearchTerm(entry)
            if (!primaryTerm) return true

            // In exact sorted mode, stay in coarse-jump mode until we reach the
            // alphabetical neighborhood of the target. Once the landing entry
            // shares a meaningful prefix with the target, switch to fine scan
            // so we don't skip nearby exact matches inside the jumped block.
            const neighborhoodPrefix = Math.max(1, Math.min(3, normalizedTarget.length))
            return sharedPrefixLength(primaryTerm, normalizedTarget) >= neighborhoodPrefix
        }

        const shouldJumpTowardExactTarget = (entry: string | null): boolean => {
            if (!exact) return false
            const primaryTerm = getPrimaryFileSearchTerm(entry)
            if (!primaryTerm) return false
            if (primaryTerm.localeCompare(normalizedTarget) >= 0) return false
            return sharedPrefixLength(primaryTerm, normalizedTarget) < 2
        }

        const restoreEntryInCurrentDirectory = async (targetEntry: string): Promise<boolean> => {
            const normalizedEntry = normalizeForSearch(targetEntry)
            let snapshot = await moveToTopOfCurrentDirectory()
            browseLog('restore entry', { targetEntry })
            for (let i = 0; i < 2048; i++) {
                const currentEntry = getSelectedFileBrowserEntry(snapshot)
                if (normalizeForSearch(currentEntry) === normalizedEntry) {
                    browseLog('restore entry success', { targetEntry, y: snapshot.cursorPos?.y })
                    return true
                }

                const result = await stepFileBrowser(M8KeyMask.Down, 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    break
                }
            }

            browseLog('restore entry failed', { targetEntry })
            return false
        }

        const navigateToParentDirectory = async (): Promise<boolean> => {
            const topSnapshot = await moveToTopOfCurrentDirectory()
            const topEntry = getSelectedFileBrowserEntry(topSnapshot)
            if (!isParentDirectoryEntry(topEntry)) {
                browseLog('parent directory entry missing at top', { topEntry })
                return false
            }

            browseLog('navigate to parent directory')
            await stepFileBrowser(M8KeyMask.Edit, 500)
            return ensureFileBrowserActive()
        }

        const searchCurrentDirectory = async (depth: number): Promise<boolean> => {
            if (depth > 64 || !ensureFileBrowserActive()) {
                browseLog('search aborted', { depth, active: ensureFileBrowserActive() })
                return false
            }

            browseLog('search directory', { depth, entry: getSelectedFileBrowserEntry(getFileBrowserSnapshot()) })

            if (exact) {
                await applyAlphabeticalSort()
            }

            const inspectCurrentEntry = async (): Promise<'found' | 'continue' | 'failed'> => {
                const currentEntry = getSelectedFileBrowserEntry(getFileBrowserSnapshot())
                const normalizedEntry = normalizeForSearch(currentEntry)
                if (!normalizedEntry || isParentDirectoryEntry(currentEntry)) {
                    browseLog('skip entry', { currentEntry })
                    return 'continue'
                }

                browseLog('inspect entry', {
                    depth,
                    currentEntry,
                    y: getFileBrowserSnapshot().cursorPos?.y,
                    file: isM8FileEntry(currentEntry),
                    directory: isDirectoryEntry(currentEntry),
                })

                if (entryMatchesTarget(currentEntry)) {
                    browseLog('match found', { currentEntry, depth })
                    await stepFileBrowser(M8KeyMask.Edit, 500)
                    return 'found'
                }

                if (isDirectoryEntry(currentEntry)) {
                    const directoryEntry = currentEntry
                    browseLog('enter directory', { directoryEntry, depth })
                    await stepFileBrowser(M8KeyMask.Edit, 500)
                    if (!ensureFileBrowserActive()) {
                        browseLog('directory entry left file browser unexpectedly', { directoryEntry, depth })
                        return 'failed'
                    }

                    const foundInDirectory = await searchCurrentDirectory(depth + 1)
                    if (foundInDirectory) {
                        return 'found'
                    }

                    const navigatedBack = await navigateToParentDirectory()
                    if (!navigatedBack) {
                        browseLog('failed to navigate back to parent', { directoryEntry, depth })
                        return 'failed'
                    }

                    return (await restoreEntryInCurrentDirectory(directoryEntry ?? '')) ? 'continue' : 'failed'
                }

                return 'continue'
            }

            if (exact) {
                let snapshot = await moveToTopOfCurrentDirectory()
                let allowCoarseJumps = true
                let coarseResumeFingerprint: string | null = null
                browseLog('exact search begins', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                for (let i = 0; i < 2048; i++) {
                    if (coarseResumeFingerprint && getFileBrowserSnapshotFingerprint(snapshot) === coarseResumeFingerprint) {
                        allowCoarseJumps = true
                        coarseResumeFingerprint = null
                        browseLog('coarse jumps re-enabled after rescanning jumped block', {
                            entry: getSelectedFileBrowserEntry(snapshot),
                            y: snapshot.cursorPos?.y,
                        })
                    }

                    const entry = getSelectedFileBrowserEntry(snapshot)
                    const compare = compareFileEntryToTarget(entry)

                    const inspection = await inspectCurrentEntry()
                    if (inspection === 'found') {
                        return true
                    }
                    if (inspection === 'failed') {
                        return false
                    }
                    snapshot = getFileBrowserSnapshot()

                    if (allowCoarseJumps && shouldJumpTowardExactTarget(entry)) {
                        browseLog('coarse jump down', { entry, compare, y: snapshot.cursorPos?.y })
                        const jumpResult = await stepFileBrowser(getJumpMask('down'), 280)
                        snapshot = jumpResult.snapshot
                        if (!jumpResult.changed) {
                            browseLog('coarse jump hit end', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                            break
                        }

                        const afterJumpCompare = compareFileEntryToTarget(getSelectedFileBrowserEntry(snapshot))
                        browseLog('after coarse jump', {
                            entry: getSelectedFileBrowserEntry(snapshot),
                            compareBefore: compare,
                            compareAfter: afterJumpCompare,
                            y: snapshot.cursorPos?.y,
                        })
                        if (shouldRescanJumpedBlock(getSelectedFileBrowserEntry(snapshot), afterJumpCompare)) {
                            // We are at or near the target alphabetic window: rewind into the
                            // jumped block, scan it line-by-line, then resume coarse jumps only
                            // once we return to the landing entry.
                            const landingFingerprint = getFileBrowserSnapshotFingerprint(snapshot)
                            let rewoundSnapshot = snapshot
                            browseLog('rewind for fine scan of jumped block', {
                                landingEntry: getSelectedFileBrowserEntry(snapshot),
                                landingY: snapshot.cursorPos?.y,
                            })
                            for (let rewind = 0; rewind < 7; rewind++) {
                                const rewindResult = await stepFileBrowser(getStepMask('up'), 250)
                                rewoundSnapshot = rewindResult.snapshot
                                if (!rewindResult.changed) {
                                    break
                                }
                            }
                            snapshot = rewoundSnapshot
                            allowCoarseJumps = false
                            coarseResumeFingerprint = landingFingerprint
                            browseLog('rewind complete, scanning jumped block line-by-line', {
                                entry: getSelectedFileBrowserEntry(snapshot),
                                y: snapshot.cursorPos?.y,
                            })
                        } else {
                            browseLog('still below target letters, keep coarse jumps', {
                                entry: getSelectedFileBrowserEntry(snapshot),
                                compareAfter: afterJumpCompare,
                                y: snapshot.cursorPos?.y,
                            })
                        }
                        continue
                    }

                    const result = await stepFileBrowser(getStepMask('down'), 250)
                    snapshot = result.snapshot
                    if (!result.changed) {
                        browseLog('exact scan reached end', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                        break
                    }
                }

                browseLog('exact search failed', { targetText, normalizedTarget })
                return false
            }

            const startSnapshot = getFileBrowserSnapshot()
            browseLog('fuzzy search begins', { entry: getSelectedFileBrowserEntry(startSnapshot), y: startSnapshot.cursorPos?.y })
            const initialInspection = await inspectCurrentEntry()
            if (initialInspection === 'found') {
                return true
            }
            if (initialInspection === 'failed') {
                return false
            }

            let upwardRows = 0
            let snapshot = startSnapshot
            for (let i = 0; i < 2048; i++) {
                const result = await stepFileBrowser(getStepMask('up'), 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('fuzzy upward pass reached top', { upwardRows, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    break
                }

                upwardRows += 1
                const upwardInspection = await inspectCurrentEntry()
                if (upwardInspection === 'found') {
                    return true
                }
                if (upwardInspection === 'failed') {
                    return false
                }
            }

            await moveByRowCount('down', upwardRows)

            let downwardSnapshot = getFileBrowserSnapshot()
            if (getFileBrowserSnapshotFingerprint(downwardSnapshot) !== getFileBrowserSnapshotFingerprint(startSnapshot)) {
                browseLog('restore exact starting point after upward pass', {
                    startEntry: getSelectedFileBrowserEntry(startSnapshot),
                    currentEntry: getSelectedFileBrowserEntry(downwardSnapshot),
                })
                await restoreEntryInCurrentDirectory(getSelectedFileBrowserEntry(startSnapshot) ?? '')
                downwardSnapshot = getFileBrowserSnapshot()
            }

            for (let i = 0; i < 2048; i++) {
                const result = await stepFileBrowser(getStepMask('down'), 250)
                downwardSnapshot = result.snapshot
                if (!result.changed) {
                    browseLog('fuzzy downward pass reached end', { entry: getSelectedFileBrowserEntry(downwardSnapshot), y: downwardSnapshot.cursorPos?.y })
                    break
                }

                const downwardInspection = await inspectCurrentEntry()
                if (downwardInspection === 'found') {
                    return true
                }
                if (downwardInspection === 'failed') {
                    return false
                }
            }

            browseLog('fuzzy search failed', { targetText, normalizedTarget })
            return false
        }

        if (!ensureFileBrowserActive()) {
            console.warn('[M8SDK] browseFile requires a file browser view (load/save)')
            return false
        }

        return searchCurrentDirectory(0)
    }, [browseLog, getFileBrowserSnapshot, pressAndRelease, waitForFileBrowserSnapshotChange])

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

    // Store pressAndRelease in ref
    const pressAndReleaseRef = useRef(pressAndRelease)
    useEffect(() => {
        pressAndReleaseRef.current = pressAndRelease
    }, [pressAndRelease])

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

    // Convert text grid coordinates to pixel coordinates
    // Text grid: x (0-39), y (0-23) - independent of font size
    // Pixel: depends on current cell metrics (cellW, cellH, offX, offY)
    // Send the center of the target cell so M8 places the cursor exactly there.
    // gx extraction in viewExtractor uses Math.round to absorb the cursor border
    // overhang, so no additional x compensation is needed here.
    const textGridToPixel = useCallback((gridX: number, gridY: number): { x: number; y: number } => {
        const cellMetrics = store.get(cellMetricsAtom)

        // Center of cell (gridX, gridY) in raw M8 protocol pixel space
        const pixelX = gridX * cellMetrics.cellW + cellMetrics.offX + cellMetrics.cellW / 2
        const pixelY = gridY * cellMetrics.cellH + cellMetrics.offY + cellMetrics.cellH / 2

        return { x: pixelX, y: pixelY }
    }, [store])

    // Setup post-me connection
    // biome-ignore lint/correctness/useExhaustiveDependencies: <on model change to get correct refs>
    useEffect(() => {
        if (!iframeRef.current) return

        const childWindow = iframeRef.current.contentWindow
        if (!childWindow) return

        let isActive = true

        const setupConnection = async () => {
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

                // Define methods exposed to child - use refs to get latest values
                const methods: M8HostMethods = {
                    navigateToView: async (viewName: string): Promise<boolean> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] navigateToView: no bus connection')
                            return false
                        }
                        debugLog('[M8SDK] Executing navigateToView:', viewName)
                        await navigateToViewByNameRef.current(viewName)
                        return true
                    },
                    navigateTo: async (gridX: number, gridY: number): Promise<void> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] navigateTo: no bus connection')
                            return
                        }
                        // Convert text grid coordinates (0-39, 0-23) to pixel coordinates
                        const pixelCoords = textGridToPixel(gridX, gridY)
                        await navigateToRef.current(pixelCoords)
                    },
                    setValueToHex: async (hex: number): Promise<boolean> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] setValueToHex: no bus connection')
                            return false
                        }
                        debugLog('[M8SDK] Executing setValueToHex:', hex)
                        return setValueToHexImpl(hex)
                    },
                    setValueToInt: async (targetInt: number): Promise<boolean> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] setValueToInt: no bus connection')
                            return false
                        }
                        debugLog('[M8SDK] Executing setValueToInt:', targetInt)
                        return setValueToIntImpl(targetInt)
                    },
                    setNote: async (noteString: string): Promise<boolean> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] setNote: no bus connection')
                            return false
                        }
                        debugLog('[M8SDK] Executing setNote:', noteString)
                        return setNoteImpl(noteString)
                    },
                    setValueToString: async (targetString: string, exact: boolean = true, searchInCurrentLine: boolean = false): Promise<boolean> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] setValueToString: no bus connection')
                            return false
                        }
                        debugLog('[M8SDK] Executing setValueToString:', { targetString, exact, searchInCurrentLine })
                        return setValueToStringImpl(targetString, exact, searchInCurrentLine)
                    },
                    browseFile: async (targetText: string, exact: boolean = true): Promise<boolean> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] browseFile: no bus connection')
                            return false
                        }
                        debugLog('[M8SDK] Executing browseFile:', { targetText, exact })
                        return browseFileImpl(targetText, exact)
                    },
                    sendKeyPress: async (keys: ('left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit')[]): Promise<void> => {
                        if (!busRef.current) {
                            console.warn('[M8SDK] sendKeyPress: no bus connection')
                            return
                        }
                        debugLog('[M8SDK] Executing sendKeyPress:', keys)
                        const keyMask = pressKeys({
                            left: keys.includes('left'),
                            right: keys.includes('right'),
                            up: keys.includes('up'),
                            down: keys.includes('down'),
                            shift: keys.includes('shift'),
                            play: keys.includes('play'),
                            opt: keys.includes('opt'),
                            edit: keys.includes('edit'),
                        })
                        await pressAndReleaseRef.current(keyMask)
                    },
                    getState: async (): Promise<M8State> => {
                        return getCurrentState()
                    },
                }

                // Establish handshake
                const connection = await ParentHandshake<M8HostMethods, M8ClientEvents, M8ClientMethods, M8HostEvents>(
                    messenger,
                    methods
                )

                if (!isActive) {
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
                void setupConnection()
            }
        }

        iframe.addEventListener('load', handleLoad)

        return () => {
            isActive = false
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
