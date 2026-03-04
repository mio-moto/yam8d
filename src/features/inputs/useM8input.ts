import { useCallback, useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection.ts'
import { useSettingsContext } from '../settings/settings.tsx'
import { defaultInputMap } from './defaultInputMap'

const INPUT_MAP_SETTINGS = 'inputMap'

const inputMap: Record<string, number> = {}

type GamepadAxisState = {
    isHat?: boolean
    negative?: boolean
    positive?: boolean
}

type GamepadState = {
    buttons: boolean[]
    axes: GamepadAxisState[]
}

const hatMap: Record<number, [boolean, boolean, boolean, boolean]> = {
    0: [true, false, false, false],
    1: [true, false, false, true],
    2: [false, false, false, true],
    3: [false, true, false, true],
    4: [false, true, false, false],
    5: [false, true, true, false],
    6: [false, false, true, false],
    7: [true, false, true, false],
    8: [false, false, false, false],
    15: [false, false, false, false],
}

export const useM8Input = (connection?: ConnectedBus) => {
    const { settings: settingsContextValues } = useSettingsContext()
    const pressedKeyMask = useRef(0)

    const handleInput = useCallback(
        (inputCode: string, isDown: boolean) => {
            if (!inputCode) return

            const m8Key = inputMap[inputCode]

            // Exit if the input isn't found in the input map
            if (!m8Key) return

            const before = pressedKeyMask.current
            if (isDown) {
                pressedKeyMask.current = before | m8Key
            } else {
                pressedKeyMask.current = before & ~m8Key
            }

            // Avoid unnecessary sends for key repeat
            if (pressedKeyMask.current !== before) {
                connection?.commands.sendKeys(pressedKeyMask.current)
            }
        },
        [connection],
    )

    useEffect(() => {
        // Get config
        Object.assign(inputMap, settingsContextValues[INPUT_MAP_SETTINGS] ?? defaultInputMap)

        const handleKeyDown = (ev: KeyboardEvent) => {
            if (!ev.code) return
            ev.preventDefault()
            handleInput(ev.code, true)
        }

        const handleKeyUp = (ev: KeyboardEvent) => {
            if (!ev.code) return
            ev.preventDefault()
            handleInput(ev.code, false)
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [handleInput, settingsContextValues])

    useEffect(() => {
        let frameId: number | null = null
        let gamepadsRunning = false
        const gamepadStates: Array<GamepadState | null> = []

        const pollGamepads = () => {
            if (!gamepadsRunning) return

            let somethingPresent = false

            for (const gamepad of navigator.getGamepads()) {
                if (!gamepad || !gamepad.connected) continue

                somethingPresent = true

                let state = gamepadStates[gamepad.index]
                if (!state) {
                    state = {
                        buttons: [],
                        axes: Array.from({ length: gamepad.axes.length }, () => ({})),
                    }
                    gamepadStates[gamepad.index] = state
                }

                if (gamepad.mapping !== 'standard') {
                    for (let i = 0; i < gamepad.axes.length; i++) {
                        if (state.axes[i]?.isHat === false) continue

                        // Heuristics to locate a d-pad / hat switch encoded as an axis
                        const value = (gamepad.axes[i] + 1) * 3.5
                        const rounded = Math.round(value)
                        const error = Math.abs(rounded - value)
                        const hatPosition = hatMap[rounded]

                        if (error > 4.8e-7 || hatPosition === undefined) {
                            state.axes[i] = { ...state.axes[i], isHat: false }
                            continue
                        }

                        if (value === 0 && state.axes[i]?.isHat !== true) {
                            // Could still be an unpressed trigger, wait for more data
                            continue
                        }

                        state.axes[i] = { ...state.axes[i], isHat: true }

                        for (let b = 0; b < 4; b++) {
                            const pressed = hatPosition[b]
                            const hatButtonIndex = 64 + b
                            if (state.buttons[hatButtonIndex] !== pressed) {
                                state.buttons[hatButtonIndex] = pressed
                                handleInput(`Gamepad${hatButtonIndex}`, pressed)
                            }
                        }
                    }
                }

                for (let i = 0; i < gamepad.axes.length; i++) {
                    const axisState = state.axes[i] ?? {}
                    const value = gamepad.axes[i]
                    if (axisState.isHat === true || Math.abs(value) > 1) continue

                    const negative = value <= -0.5
                    const positive = value >= 0.5

                    if (axisState.negative !== negative) {
                        axisState.negative = negative
                        handleInput(`GamepadAxis${i}-`, negative)
                    }

                    if (axisState.positive !== positive) {
                        axisState.positive = positive
                        handleInput(`GamepadAxis${i}+`, positive)
                    }

                    state.axes[i] = axisState
                }

                for (let i = 0; i < gamepad.buttons.length; i++) {
                    const pressed = gamepad.buttons[i].pressed
                    if (state.buttons[i] !== pressed) {
                        state.buttons[i] = pressed
                        handleInput(`Gamepad${i}`, pressed)
                    }
                }
            }

            if (somethingPresent) {
                frameId = requestAnimationFrame(pollGamepads)
            } else {
                gamepadsRunning = false
                frameId = null
            }
        }

        const handleGamepadConnected = (ev: GamepadEvent) => {
            if (ev.gamepad.mapping !== 'standard') {
                console.warn('Non-standard gamepad attached. Mappings may be inaccurate.')
            }

            if (!gamepadsRunning) {
                gamepadsRunning = true
                pollGamepads()
            }
        }

        const handleGamepadDisconnected = (ev: GamepadEvent) => {
            gamepadStates[ev.gamepad.index] = null
        }

        window.addEventListener('gamepadconnected', handleGamepadConnected)
        window.addEventListener('gamepaddisconnected', handleGamepadDisconnected)

        // Some browsers require an initial poll to detect already-connected devices.
        if (navigator.getGamepads().some((pad) => !!pad && pad.connected)) {
            gamepadsRunning = true
            pollGamepads()
        }

        return () => {
            gamepadsRunning = false
            if (frameId !== null) {
                cancelAnimationFrame(frameId)
            }
            window.removeEventListener('gamepadconnected', handleGamepadConnected)
            window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected)
        }
    }, [handleInput])
}
