import { M8KeyMask } from '../../features/connection/keys'

// Pure key-press sequence planners (press/release frames) for editing values.

// Precalculate the key sequence needed to reach target value from current value
// Uses edit+left/right for ±1 and edit+up/down for ±16
export const calculateKeySequence = (currentValue: number, targetValue: number): number[] => {
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
}

// Precalculate note moves in semitone space.
// Uses edit+up/down for octave jumps (±12) and edit+left/right for semitone steps (±1).
export const calculateNoteKeySequence = (currentIndex: number, targetIndex: number): number[] => {
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
}
