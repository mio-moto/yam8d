import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedBus } from '../connection/connection'

// Key mapping for numeric keypad (0-9)
const programKeyMap: Record<string, number> = {
    Digit0: 0,
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
    Digit6: 6,
    Digit7: 7,
    Digit8: 8,
    Digit9: 9,
}

export const useProgramChangeKeyboard = (connection?: ConnectedBus) => {
    // Current programme value (0-127), default to 0
    const [programValue, setProgramValue] = useState(0)
    const programValueRef = useRef(programValue)

    // Shift value for +/- buttons (0-127)
    const [shiftValue, setShiftValue] = useState(0)
    const shiftValueRef = useRef(shiftValue)

    // Track the last key pressed to handle key hold/repeat
    const lastKeyRef = useRef<string>('')

    // Update ref when state changes
    useEffect(() => {
        programValueRef.current = programValue
    }, [programValue])

    useEffect(() => {
        shiftValueRef.current = shiftValue
    }, [shiftValue])

    // Send program change to M8
    const sendProgramChange = useCallback(
        (program: number) => {
            if (connection?.commands) {
                connection.commands.sendProgramChange(program)
                console.log(`[Program Change] Sending program: ${program}`)
            }
        },
        [connection],
    )

    const handleKey = useCallback(
        (ev: KeyboardEvent, isDown: boolean) => {
            if (!ev || !ev.code) return

            const mapped = programKeyMap[ev.code]
            ev.preventDefault()

            // Handle key down events
            if (isDown) {
                // Skip repeat events
                if (ev.repeat) return

                lastKeyRef.current = ev.code

                // Handle numeric keys (0-9)
                if (mapped !== undefined) {
                    // Calculate new program value:
                    // shiftValue is the "tens" digit (0-12 for 0-127)
                    // mapped is the "ones" digit (0-9)
                    const newProgram = shiftValueRef.current * 10 + mapped
                    if (newProgram <= 127) {
                        setProgramValue(newProgram)
                        sendProgramChange(newProgram)
                    }
                }

                // Handle minus key (-) - shift down by 10
                if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') {
                    const newShift = Math.max(0, shiftValueRef.current - 1)
                    setShiftValue(newShift)
                }

                // Handle plus/equal key (+) - shift up by 10
                if (ev.code === 'Equal' || ev.code === 'NumpadAdd') {
                    const newShift = Math.min(12, shiftValueRef.current + 1)
                    setShiftValue(newShift)
                }
            } else {
                // Handle key up - only clear if it's the same key that was pressed
                if (ev.code === lastKeyRef.current) {
                    lastKeyRef.current = ''
                }
            }
        },
        [sendProgramChange],
    )

    useEffect(() => {
        const handleKeyDown = (ev: KeyboardEvent) => {
            handleKey(ev, true)
        }
        const handleKeyUp = (ev: KeyboardEvent) => {
            handleKey(ev, false)
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [handleKey])

    return {
        programValue,
        shiftValue,
        setProgramValue,
        setShiftValue,
    }
}
