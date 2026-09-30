import { M8KeyMask } from '../../features/connection/keys'
import { currentLineAtom, textUnderCursorAtom } from '../../features/state/viewStore'
import { normalizeForSearch } from './fileBrowserHelpers'
import { type HostIO, wait } from './hostIO'
import { calculateKeySequence, calculateNoteKeySequence } from './keySequences'
import { parseHexValue, parseIntValue, parseNoteValue } from './valueParsers'

// Edit the value under the M8 cursor using edit+arrow key combos.
export const createValueEditors = (io: HostIO) => {
    const { store, debugLog, hasBus, sendKeys, pressAndRelease, waitForTextUnderCursorChange } = io

    // Implementation of setValueToHex using edit+navigation keys
    // Precalculates the entire key sequence and sends it to the macroRunner
    const setValueToHexImpl = async (targetHex: number): Promise<boolean> => {
        if (!hasBus()) return false

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
            sendKeys(keys)
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
    }

    // Implementation of setValueToInt using edit+navigation keys
    const setValueToIntImpl = async (targetInt: number): Promise<boolean> => {
        if (!hasBus()) return false

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
    }

    // Implementation of setNote using edit+up/down for octave and edit+left/right for semitone
    // If the exact note is unreachable (for example due to scale), this stops on the closest note found.
    const setNoteImpl = async (targetNoteString: string): Promise<boolean> => {
        if (!hasBus()) return false

        const normalizedTarget = targetNoteString.trim().toUpperCase()

        // Handle special values: '---' (no note / delete) and 'OFF' (note off)
        // opt+edit cycles: regular note → '---' → 'OFF' → '---' → ...
        if (normalizedTarget === '---' || normalizedTarget === 'OFF') {
            const currentText = store.get(textUnderCursorAtom)
            const currentNormalized = currentText?.trim().toUpperCase() ?? ''

            if (currentNormalized === normalizedTarget) return true

            // If current is a regular note, one opt+edit lands on '---'
            // then a second opt+edit lands on 'OFF'
            await pressAndRelease(M8KeyMask.Opt | M8KeyMask.Edit)
            await waitForTextUnderCursorChange(currentText, 250)

            if (normalizedTarget === 'OFF' && currentNormalized !== '---') {
                // Was a regular note: first press gave '---', need a second press for 'OFF'
                const afterFirst = store.get(textUnderCursorAtom)
                if (afterFirst?.trim().toUpperCase() === '---') {
                    await pressAndRelease(M8KeyMask.Opt | M8KeyMask.Edit)
                    await waitForTextUnderCursorChange(afterFirst, 250)
                }
            }

            const finalText = store.get(textUnderCursorAtom)?.trim().toUpperCase()
            debugLog('[M8SDK] setNote special value result:', finalText)
            return finalText === normalizedTarget
        }

        const parsedTarget = parseNoteValue(targetNoteString)
        if (!parsedTarget) {
            console.warn('[M8SDK] Invalid note format. Expected like C-1, C#1, D#A, ---, OFF:', targetNoteString)
            return false
        }

        let currentText = store.get(textUnderCursorAtom)
        if (currentText?.trim() === '---' || currentText?.trim().toUpperCase() === 'OFF') {
            debugLog('[M8SDK] Initial note is "---" or "OFF", priming with edit key')
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
                sendKeys(keys)
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
    }

    // Implementation of setValueToString by anchoring at bottom and scanning forward one step at a time.
    const setValueToStringImpl = async (targetString: string, exact: boolean = true, searchInCurrentLine: boolean = false): Promise<boolean> => {
        if (!hasBus()) return false

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
    }

    return {
        setValueToHex: setValueToHexImpl,
        setValueToInt: setValueToIntImpl,
        setNote: setNoteImpl,
        setValueToString: setValueToStringImpl,
    }
}
