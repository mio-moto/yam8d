import type { FC } from 'react'
import { useProgramChangeKeyboard } from './useProgramChangeKeyboard'
import type { ConnectedBus } from '../connection/connection'

interface ProgramChangeKeyboardProps {
    bus?: ConnectedBus
    strokeColor?: string
}

/**
 * ProgramChangeKeyboard component
 * 
 * Allows users to send MIDI programme changes to the M8 using:
 * - Numeric keypad (0-9) on the keyboard
 * - Minus (-) key to shift down by 10
 * - Plus/Equal (+) key to shift up by 10
 * 
 * Or by clicking the on-screen buttons
 */
export const ProgramChangeKeyboard: FC<ProgramChangeKeyboardProps> = ({
    bus,
    strokeColor = '#00ff00',
}) => {
    const {
        programValue,
        shiftValue,
        setProgramValue,
        setShiftValue,
    } = useProgramChangeKeyboard(bus)

    // Handle clicking on a number button
    const handleNumberClick = (num: number) => {
        const newProgram = shiftValue * 10 + num
        if (newProgram <= 127) {
            setProgramValue(newProgram)
            bus?.commands.sendProgramChange(newProgram)
        }
    }

    // Handle clicking on shift down (-10)
    const handleShiftDown = () => {
        const newShift = Math.max(0, shiftValue - 1)
        setShiftValue(newShift)
    }

    // Handle clicking on shift up (+10)
    const handleShiftUp = () => {
        const newShift = Math.min(12, shiftValue + 1)
        setShiftValue(newShift)
    }

    // Calculate display values
    const tensDigit = Math.floor(programValue / 10)
    const onesDigit = programValue % 10

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            color: strokeColor,
        }}>
            {/* Shift indicator */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
            }}>
                <button
                    onClick={handleShiftUp}
                    style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        border: `1px solid ${strokeColor}`,
                        color: strokeColor,
                        cursor: 'pointer',
                        borderRadius: '2px',
                        fontSize: '12px',
                    }}
                    title="Shift +10 (or press +)"
                >
                    +
                </button>
                <span style={{ fontSize: '10px', minWidth: '20px', textAlign: 'center' }}>
                    {shiftValue * 10}
                </span>
                <button
                    onClick={handleShiftDown}
                    style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        border: `1px solid ${strokeColor}`,
                        color: strokeColor,
                        cursor: 'pointer',
                        borderRadius: '2px',
                        fontSize: '12px',
                    }}
                    title="Shift -10 (or press -)"
                >
                    -
                </button>
            </div>

            {/* Current program display */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '4px 8px',
                border: `1px solid ${strokeColor}`,
                borderRadius: '4px',
                minWidth: '60px',
            }}>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>PGM</span>
                <div style={{
                    display: 'flex',
                    gap: '2px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                }}>
                    <span style={{ opacity: tensDigit > 0 ? 1 : 0.3 }}>{tensDigit}</span>
                    <span>{onesDigit}</span>
                </div>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>{programValue}</span>
            </div>

            {/* Number buttons (0-9) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '2px',
            }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                    <button
                        key={num}
                        onClick={() => handleNumberClick(num)}
                        style={{
                            width: '24px',
                            height: '24px',
                            padding: '0',
                            background: 'transparent',
                            border: `1px solid ${strokeColor}`,
                            color: strokeColor,
                            cursor: 'pointer',
                            borderRadius: '2px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                        }}
                        title={`Program ${shiftValue * 10 + num} (or press ${num})`}
                    >
                        {num}
                    </button>
                ))}
            </div>
        </div>
    )
}
