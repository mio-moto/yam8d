import { M8KeyMask } from '../../features/connection/keys'
import { currentLineAtom, textUnderCursorAtom } from '../../features/state/viewStore'
import { type HostIO, wait } from './hostIO'
import {
    detectFloatCursorFocus,
    type FloatCursorFocus,
    formatFloatFromTicks,
    isCursorOnForeignFloat,
    type ParsedFloatToken,
    parseFloatTokens,
    pickFloatTokenIndex,
} from './valueParsers'

// Edit a float field (e.g. "TUNE 440.00 G") using edit+arrow key combos.
export const createFloatEditor = (io: HostIO) => {
    const { store, debugLog, hasBus, sendKeys, pressAndRelease, waitForTextUnderCursorChange, waitForCurrentLineChange } = io

    // Implementation of setValueFloat using edit+navigation keys.
    //
    // Float fields (e.g. "TUNE 440.00 G" or "GAIN 05.25 -19.75 -15.00") are rendered
    // as two linked digit groups separated by a dot: the integer part and the decimal
    // part. Stepping the decimal part past its bounds carries into the integer part
    // (1.99 -> 2.00), so the whole signed token behaves like a single number that the
    // closed loop below steers through measured edit+arrow key steps.
    //
    // Cursor focus modes (deduced from textUnderCursor):
    // - 'full': the cursor spans the whole float ("19.75", sign often excluded).
    //   There, edit+up/down moves the INTEGER part and edit+left/right the DECIMAL
    //   part, so both granularities are directly available and no cursor relocation
    //   is needed (attempting it could even drift to a neighboring field).
    // - 'int' / 'dec': the cursor highlights a single digit group. The cursor is then
    //   relocated with bare left/right onto whichever group is most efficient:
    //   integer part for whole-unit travel, decimal part for sub-unit finishing.
    //
    // Step sizes and arrow polarities are measured from real device feedback
    // ("learned") per focus mode and per arrow channel (up/down vs left/right),
    // then reused for fast press bursts.
    // Negative targets are supported (fields display like "-10.69").
    // Note: opt+edit resets the field to its default value (0.00 / 440.00 / ...).
    const setValueFloatImpl = async (targetFloat: number): Promise<boolean> => {
        if (!hasBus()) return false
        if (!Number.isFinite(targetFloat)) return false

        let tokenIndex = 0
        let tickHundredths = 1

        let lastTokens: ParsedFloatToken[] = []

        const readFloatState = (): ParsedFloatToken | null => {
            const tokens = parseFloatTokens(store.get(currentLineAtom))
            lastTokens = tokens
            if (!tokens.length) return null
            tokenIndex = Math.min(tokenIndex, tokens.length - 1)
            const token = tokens[tokenIndex]
            if (token.tickHundredths > 0) tickHundredths = token.tickHundredths
            return token
        }

        const initialTokens = parseFloatTokens(store.get(currentLineAtom))
        if (!initialTokens.length) {
            console.warn('[M8SDK] Could not find a float value like "440.00" or "-10.69" on the current line:', store.get(currentLineAtom))
            return false
        }

        tokenIndex = pickFloatTokenIndex(initialTokens, store.get(textUnderCursorAtom))
        if (initialTokens.length > 1) {
            debugLog('[M8SDK] Multiple float values on line, editing:', initialTokens[tokenIndex]?.raw)
        }

        const initialToken = initialTokens[tokenIndex]
        tickHundredths = initialToken.tickHundredths
        // Caller-provided floats are quantized to the precision actually displayed.
        const targetTicks = Math.round(Math.round(targetFloat * 100) / tickHundredths)

        if (initialToken.ticks === targetTicks) {
            debugLog('[M8SDK] Already at target float value:', formatFloatFromTicks(targetTicks, tickHundredths))
            return true
        }

        debugLog(
            '[M8SDK] Setting float value from',
            formatFloatFromTicks(initialToken.ticks, tickHundredths),
            'to',
            formatFloatFromTicks(targetTicks, tickHundredths),
        )

        // Enter edit mode. Numeric rows do not necessarily change their text when
        // entering edit mode, so a short settle wait is enough here.
        await pressAndRelease(M8KeyMask.Edit)
        await wait(80)

        // Measured step size and arrow polarity per arrow channel (up/down vs
        // left/right), tracked PER focus mode: 'full' has up/down -> integer part
        // and left/right -> decimal part, while 'int'/'dec' group focus changes
        // what each arrow channel steps. Measured magnitudes are in ticks.
        type FloatChannel = 'upDown' | 'leftRight'
        type FloatChannelStats = {
            mag: number | null
            bias: number
        }
        type FloatFocusStats = Record<FloatChannel, FloatChannelStats>
        const makeFocusStats = (): FloatFocusStats => ({
            upDown: { mag: null, bias: 1 },
            leftRight: { mag: null, bias: 1 },
        })
        const statsByFocus: Record<FloatCursorFocus, FloatFocusStats> = {
            full: makeFocusStats(),
            int: makeFocusStats(),
            dec: makeFocusStats(),
        }

        // Ticks contained in one whole unit (100 for two decimals, 10 for one).
        const UNIT_IN_TICKS = initialToken.decScale

        const COARSE_MIN_TICKS = 32
        const MAX_RUNTIME_MS = 15000
        const MAX_PRESSES_PER_BURST = 96
        const startedAt = Date.now()

        // Trust textUnderCursor to tell which part of the field is highlighted;
        // when unclear, assume integer-group focus (self-corrects via measurement).
        let focus: FloatCursorFocus = detectFloatCursorFocus(initialToken, store.get(textUnderCursorAtom)) ?? 'int'
        debugLog('[M8SDK] Float cursor focus:', focus)
        // Set when cursor relocation proves unreliable (layout quirks); the value
        // closed-loop below keeps working without side management.
        let sideControlDisabled = false
        // Set when the cursor drifted onto another field: editing must stop at once.
        let driftedToForeignField = false

        let previousTicks = initialToken.ticks
        let valueTwoStepsAgo: number | null = null
        let bestTicks = initialToken.ticks
        let bestDistance = Math.abs(initialToken.ticks - targetTicks)
        let fruitlessStreak = 0
        let reachedTarget = false
        let gaveUp = false

        // Build an edit+arrow mask for an arrow channel.
        const getMaskForChannel = (channel: FloatChannel, effectiveDirection: number): number => {
            const positiveKey = channel === 'upDown' ? M8KeyMask.Up : M8KeyMask.Right
            const negativeKey = channel === 'upDown' ? M8KeyMask.Down : M8KeyMask.Left
            return M8KeyMask.Edit | (effectiveDirection >= 0 ? positiveKey : negativeKey)
        }

        const applyBurst = async (channel: FloatChannel, direction: number, presses: number): Promise<void> => {
            const stats = statsByFocus[focus][channel]
            const mask = getMaskForChannel(channel, direction * stats.bias)
            const beforeLine = store.get(currentLineAtom)
            for (let i = 0; i < presses; i++) {
                sendKeys(mask)
                await wait(22)
            }
            await waitForCurrentLineChange(beforeLine, 350)
        }

        // Hop the cursor onto the wanted digit group using bare left/right (no edit):
        // the decimal part sits right of the dot, the integer part left of it. The
        // landing is verified through textUnderCursor; if the first arrow did not
        // reach the wanted group, the opposite arrow is tried before giving up.
        // Only ever called from 'int'/'dec' focus — never from 'full', where a bare
        // arrow could leave the field entirely.
        const ensureFloatCursorSide = async (side: 'int' | 'dec'): Promise<boolean> => {
            const currentFocusOf = (): FloatCursorFocus | null => (
                detectFloatCursorFocus(readFloatState(), store.get(textUnderCursorAtom))
            )

            const detected = currentFocusOf()
            if (detected === side) {
                focus = side
                return true
            }

            const beforeHint = store.get(textUnderCursorAtom)
            const towardDot = side === 'dec' ? M8KeyMask.Right : M8KeyMask.Left
            const awayFromDot = side === 'dec' ? M8KeyMask.Left : M8KeyMask.Right

            await pressAndRelease(towardDot, 35)
            await waitForTextUnderCursorChange(beforeHint, 250)
            if (currentFocusOf() === side) {
                focus = side
                return true
            }

            // Unexpected layout: try the reverse arrow instead of getting stuck.
            await pressAndRelease(awayFromDot, 35)
            await waitForTextUnderCursorChange(beforeHint, 250)
            const landed = currentFocusOf() === side
            if (landed) focus = side
            return landed
        }

        while (!reachedTarget && !gaveUp && Date.now() - startedAt < MAX_RUNTIME_MS) {
            const state = readFloatState()
            if (!state) {
                console.warn('[M8SDK] Float value no longer parseable while editing:', store.get(currentLineAtom))
                gaveUp = true
                break
            }

            // Never keep editing when the cursor moved onto another field of the line.
            if (isCursorOnForeignFloat(lastTokens, tokenIndex, store.get(textUnderCursorAtom))) {
                console.warn('[M8SDK] Float cursor drifted to another field, aborting to avoid editing the wrong value')
                driftedToForeignField = true
                gaveUp = true
                break
            }

            const diffTicks = targetTicks - state.ticks
            if (diffTicks === 0) {
                reachedTarget = true
                break
            }

            const distance = Math.abs(diffTicks)
            if (distance < bestDistance) {
                bestDistance = distance
                bestTicks = state.ticks
            }

            // Detect 2-value bounce (A -> B -> A), especially when crossing the target.
            const isOscillating = valueTwoStepsAgo !== null && state.ticks === valueTwoStepsAgo
            const crossesTarget = (previousTicks - targetTicks) * (state.ticks - targetTicks) < 0
            if (isOscillating && crossesTarget) {
                debugLog('[M8SDK] Float adjustment bouncing around target, stopping')
                break
            }
            valueTwoStepsAgo = previousTicks
            previousTicks = state.ticks

            // Route the cursor between digit groups for efficiency, but only when a
            // single group is focused. With 'full' focus, up/down already drives the
            // integer part and left/right the decimal part, so there is nothing to
            // relocate — and a bare arrow there could leave the field entirely.
            if (focus !== 'full' && !sideControlDisabled) {
                const desiredSide: 'int' | 'dec' = distance >= UNIT_IN_TICKS ? 'int' : 'dec'
                if (desiredSide !== focus) {
                    const hopped = await ensureFloatCursorSide(desiredSide)
                    if (!hopped) {
                        // The cursor may have landed on another field during the
                        // failed relocation: verify before pressing edit combos.
                        if (isCursorOnForeignFloat(lastTokens, tokenIndex, store.get(textUnderCursorAtom))) {
                            console.warn('[M8SDK] Float cursor drifted to another field, aborting to avoid editing the wrong value')
                            driftedToForeignField = true
                            gaveUp = true
                            break
                        }
                        debugLog('[M8SDK] Could not relocate float cursor, continuing on current digit group')
                        sideControlDisabled = true
                    }
                }
            }

            // Choose the arrow channel and burst size for this round, using only
            // measurements gathered in the current focus mode. up/down probing is
            // gated by focus: on the integer group a jump spans several whole units
            // and would badly overshoot short distances; spanning the whole float it
            // moves whole units too; on the decimal group jumps are sub-unit only,
            // so probing pays off much sooner.
            const focusStats = statsByFocus[focus]
            const upDownProbeGateTicks = focus === 'int'
                ? Math.max(COARSE_MIN_TICKS, 3 * UNIT_IN_TICKS)
                : focus === 'full'
                    ? UNIT_IN_TICKS
                    : Math.max(8, Math.floor(COARSE_MIN_TICKS / 4))

            let channel: FloatChannel
            let presses = 1
            if (focusStats.upDown.mag !== null && focusStats.upDown.mag > 0 && distance >= focusStats.upDown.mag) {
                channel = 'upDown'
                presses = Math.min(Math.max(1, Math.floor(distance / focusStats.upDown.mag)), MAX_PRESSES_PER_BURST)
            } else if (focusStats.upDown.mag === null && distance >= upDownProbeGateTicks) {
                // One probe press measures the actual up/down step in this focus mode.
                channel = 'upDown'
                presses = 1
            } else if (focusStats.leftRight.mag !== null && focusStats.leftRight.mag > 0) {
                channel = 'leftRight'
                presses = Math.min(Math.max(1, Math.floor(distance / focusStats.leftRight.mag)), MAX_PRESSES_PER_BURST)
            } else {
                // left/right magnitude unknown (or not yet usable): probe it once.
                channel = 'leftRight'
                presses = 1
            }

            const direction = diffTicks > 0 ? 1 : -1
            const beforeTicks = state.ticks
            const focusAtPress = focus
            const channelAtPress = channel
            await applyBurst(channel, direction, presses)

            const nextState = readFloatState()
            if (!nextState) {
                gaveUp = true
                break
            }
            const deltaTicks = nextState.ticks - beforeTicks

            if (deltaTicks === 0) {
                fruitlessStreak += 1
                if (fruitlessStreak >= 4) {
                    console.warn(
                        `[M8SDK] Float value stopped reacting at ${formatFloatFromTicks(nextState.ticks, tickHundredths)}`
                        + ` (target ${formatFloatFromTicks(targetTicks, tickHundredths)} may be out of range)`,
                    )
                    gaveUp = true
                }
                continue
            }
            fruitlessStreak = 0

            // Learn/refresh the measured magnitude and polarity for the channel that
            // was used, in the focus mode it was used from.
            const pressedStats = statsByFocus[focusAtPress][channelAtPress]
            pressedStats.mag = Math.max(1, Math.round(Math.abs(deltaTicks) / presses))

            // If the pressed arrows moved away from the target despite our assumed
            // mapping, flip that channel's arrow expectation for next rounds.
            if (Math.sign(deltaTicks) !== Math.sign(diffTicks)) {
                debugLog(`[M8SDK] Float ${channelAtPress} arrows move oppositely in '${focusAtPress}' focus, inverting mapping`)
                pressedStats.bias *= -1
                valueTwoStepsAgo = null
            }
        }

        // If the exact target was never reached, walk back to the closest observed
        // value so the parameter is never left worse off than necessary. Skipped
        // after a foreign-field drift — recovery presses would edit the wrong value.
        if (!reachedTarget && !driftedToForeignField) {
            const snapStartedAt = Date.now()
            while (Date.now() - snapStartedAt < 1800) {
                const snapState = readFloatState()
                if (!snapState || snapState.ticks === bestTicks) break

                const gap = bestTicks - snapState.ticks
                const snapDistance = Math.abs(gap)

                // Same digit-group routing as the main loop for efficient recovery.
                if (focus !== 'full' && !sideControlDisabled && (snapDistance >= UNIT_IN_TICKS) !== (focus === 'int')) {
                    const hoppedBack = await ensureFloatCursorSide(snapDistance >= UNIT_IN_TICKS ? 'int' : 'dec')
                    if (!hoppedBack) sideControlDisabled = true
                }

                const snapStats = statsByFocus[focus]
                let snapChannel: FloatChannel
                let snapPresses = 1
                if (snapStats.upDown.mag !== null && snapStats.upDown.mag > 0 && snapDistance >= snapStats.upDown.mag) {
                    snapChannel = 'upDown'
                    snapPresses = Math.min(Math.max(1, Math.floor(snapDistance / snapStats.upDown.mag)), 16)
                } else if (snapStats.leftRight.mag !== null && snapStats.leftRight.mag > 0) {
                    snapChannel = 'leftRight'
                    snapPresses = Math.min(Math.max(1, Math.floor(snapDistance / snapStats.leftRight.mag)), 16)
                } else {
                    snapChannel = 'leftRight'
                }

                const beforeSnapTicks = snapState.ticks
                await applyBurst(snapChannel, gap > 0 ? 1 : -1, snapPresses)
                const afterSnap = readFloatState()
                if (!afterSnap || afterSnap.ticks === beforeSnapTicks) break
            }
        }

        // Exit edit mode and verify the final value against the parsed line.
        // After a foreign-field drift, pressing edit could open edit mode on the
        // wrong field, so skip it and just report failure.
        if (!driftedToForeignField) {
            await pressAndRelease(M8KeyMask.Edit)
        }

        const finalToken = readFloatState()
        const success = !!finalToken && finalToken.ticks === targetTicks
        debugLog(
            `[M8SDK] Float setting ${success ? 'succeeded' : 'failed'}: "${finalToken?.raw ?? 'N/A'}"`
            + ` (${finalToken ? formatFloatFromTicks(finalToken.ticks, tickHundredths) : 'N/A'})`,
        )
        return success
    }

    return setValueFloatImpl
}
