import { useSettingsContext } from '../settings/settings.tsx'
import type { ConnectedBus } from '../connection/connection.ts'
import { useEffect, useRef, useState } from 'react'

export const defaultKeyMap = Object.freeze({
    KeyA: 0,
    KeyW: 1,
    KeyS: 2,
    KeyE: 3,
    KeyD: 4,
    KeyF: 5,
    KeyT: 6,
    KeyG: 7,
    KeyY: 8,
    KeyH: 9,
    KeyU: 10,
    KeyJ: 11,
    KeyK: 12,
    KeyO: 13,
    KeyL: 14,
    KeyP: 15,
    Semicolon: 16,
    Quote: 17,
    BracketLeft: 'velDown',
    BracketRight: 'velUp',
    Minus: 'octDown',
    Equal: 'octUp'
})

const KEY_MAP_SETTINGS = 'keyMap'

const keyMap: Record<string, number | string> = {}


export const useVirtualKeyboard = (connection?: ConnectedBus) => {

    const { settings: settingsContextValues } = useSettingsContext()
    const [octave, setOctave] = useState(3)
    const [velocity, setVelocity] = useState(103)
    const octaveRef = useRef(octave)
    const velocityRef = useRef(velocity)

    const pressedKey = useRef(0)

    useEffect(() => {
        octaveRef.current = octave
    }, [octave])

    useEffect(() => {
        velocityRef.current = velocity
    }, [velocity])

    useEffect(() => {

        // get config
        Object.assign(
            keyMap,
            settingsContextValues[KEY_MAP_SETTINGS] ?? defaultKeyMap
        );


        const handleKeyDown = (ev: KeyboardEvent) => {
            handleKey(ev, true)
        };
        const handleKeyUp = (ev: KeyboardEvent) => {
            handleKey(ev, false)
        };


        window.addEventListener("keydown", handleKeyDown)
        window.addEventListener("keyup", handleKeyUp)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
            window.removeEventListener("keyup", handleKeyUp)
        }

    }, [connection])


    function handleKey(ev: KeyboardEvent, isDown: boolean) {
        if (!ev || !ev.code) return

        const mapped = keyMap[ev.code]
        // exit if the key pressed isn't found in the key map
        if (mapped === undefined) return
        const key = mapped as unknown as number | string

        ev.preventDefault()

        // do nothing if the key repeats, let the note goes on
        if (ev.repeat) return

        switch (key) {
            case 'octDown':
                if (isDown) {
                    setOctave(o => Math.max(o - 1, 0))
                }
                break;

            case 'octUp':
                if (isDown) {
                    setOctave(o => Math.min(o + 1, 10))
                }
                break;

            case 'velDown':
                if (isDown) {
                    setVelocity(v => Math.max(v - 8, 7))
                }
                break;

            case 'velUp':
                if (isDown) {
                    setVelocity(v => Math.min(v + 8, 127))
                }
                break;

            default:
                const noteBase = key as number
                const note = noteBase + octaveRef.current * 12;
                if (note > 128)
                    return;

                if (isDown) {
                    pressedKey.current = noteBase;
                    connection?.commands.sendNoteOn(note, velocityRef.current);

                } else if (noteBase === pressedKey.current) {
                    connection?.commands.sendNoteOff();
                }
                break;
        }
    }

    return { octave: octave, velocity: velocity }
}


