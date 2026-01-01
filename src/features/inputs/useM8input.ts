import { useSettingsContext } from '../settings/settings.tsx'
import type { ConnectedBus } from '../connection/connection.ts'
import { useEffect, useRef } from 'react'
import { M8KeyMask } from '../connection/keys.ts'


export const defaultInputMap = Object.freeze({
    ArrowUp: M8KeyMask.Up,
    ArrowDown: M8KeyMask.Down,
    ArrowLeft: M8KeyMask.Left,
    ArrowRight: M8KeyMask.Right,
    ShiftLeft: M8KeyMask.Shift,
    Space: M8KeyMask.Play,
    KeyZ: M8KeyMask.Opt,
    KeyX: M8KeyMask.Edit,

    Gamepad12: M8KeyMask.Up,
    Gamepad64: M8KeyMask.Up,
    Gamepad13: M8KeyMask.Down,
    Gamepad65: M8KeyMask.Down,
    Gamepad14: M8KeyMask.Left,
    Gamepad66: M8KeyMask.Left,
    Gamepad15: M8KeyMask.Right,
    Gamepad67: M8KeyMask.Right,
    Gamepad8: M8KeyMask.Shift,
    Gamepad2: M8KeyMask.Shift,
    Gamepad5: M8KeyMask.Shift,
    Gamepad9: M8KeyMask.Play,
    Gamepad3: M8KeyMask.Play,
    Gamepad1: M8KeyMask.Opt,
    Gamepad0: M8KeyMask.Edit
})

const INPUT_MAP_SETTINGS = 'inputMap'

const inputMap: Record<string, number> = {}

export const useM8Input = (connection?: ConnectedBus) => {

    const { settings: settingsContextValues } = useSettingsContext()
    const pressedKeyMask = useRef(0)

    useEffect(() => {

        // get config
        Object.assign(
            inputMap,
            settingsContextValues[INPUT_MAP_SETTINGS] ?? defaultInputMap
        );


        const handleKeyDown = (ev: KeyboardEvent) => {
            handleInput(ev, true)
        };
        const handleKeyUp = (ev: KeyboardEvent) => {
            handleInput(ev, false)
        };


        window.addEventListener("keydown", handleKeyDown)
        window.addEventListener("keyup", handleKeyUp)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
            window.removeEventListener("keyup", handleKeyUp)
        }

    }, [connection])


    function handleInput(ev: KeyboardEvent, isDown: boolean) {
        if (!ev || !ev.code) return

        const M8Key = inputMap[ev.code] as unknown as number

        // exit if the key pressed isn't found in the input map
        if (!M8Key) return

        ev.preventDefault()

        const before = pressedKeyMask.current
        if (isDown) {
            pressedKeyMask.current = before | M8Key
        } else {
            pressedKeyMask.current = before & ~(M8Key)
        }

        // Avoid unnecessary sends for key repeat
        if (pressedKeyMask.current !== before) {
            connection?.commands.sendKeys(pressedKeyMask.current)
        }
    }

}

/*
let gamepadsRunning = false;
const gamepadStates: { buttons: never[]; axes: {}[]; }[] = [];
const hatMap = {
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
};

function pollGamepads() {
    if (!gamepadsRunning)
        return;

    let somethingPresent = false;
    for (const gamepad of navigator.getGamepads()) {
        if (!gamepad || !gamepad.connected)
            continue;

        somethingPresent = true;

        let state = gamepadStates[gamepad.index];
        if (!state) {
            state = gamepadStates[gamepad.index] = {
                buttons: [],
                axes: Array(gamepad.axes.length).fill(null).map(_ => ({}))
            };
        }

        if (gamepad.mapping !== 'standard') {
            for (let i = 0; i < gamepad.axes.length; i++) {
                if (state.axes[i].isHat === false)
                    continue;

                // Heuristics to locate a d-pad or
                // "hat switch" masquerading as an axis
                const value = (gamepad.axes[i] + 1) * 3.5;
                const error = Math.abs(Math.round(value) - value);
                const hatPosition = hatMap[Math.round(value)];
                if (error > 4.8e-7 || hatPosition === undefined) {
                    // definitely not a hat based on this value
                    state.axes[i].isHat = false;
                    continue;
                } else if (value === 0 && state.axes[i].isHat !== true) {
                    // could be a hat but could also be an unpressed trigger
                    continue;
                } else {
                    // almost certainly a hat - we're very close to a "special"
                    // value and we haven't seen any invalid values
                    state.axes[i].isHat = true;
                }

                for (let b = 0; b < 4; b++) {
                    const pressed = hatPosition[b];
                    if (state.buttons[64 + b] !== pressed) {
                        state.buttons[64 + b] = pressed;
                        handleInput(`Gamepad${64 + b}`, pressed);
                    }
                }
            }
        }

        for (let i = 0; i < gamepad.axes.length; i++) {
            const value = gamepad.axes[i];
            if (state.axes[i].isHat === true || Math.abs(value) > 1)
                continue;

            const negative = value <= -0.5;
            const positive = value >= 0.5;
            if (state.axes[i].negative !== negative) {
                state.axes[i].negative = negative;
                handleInput(`GamepadAxis${i}-`, negative);
            }
            if (state.axes[i].positive !== positive) {
                state.axes[i].positive = positive;
                handleInput(`GamepadAxis${i}+`, positive);
            }
        }

        for (let i = 0; i < gamepad.buttons.length; i++) {
            const pressed = gamepad.buttons[i].pressed;
            if (state.buttons[i] !== pressed) {
                state.buttons[i] = pressed;
                handleInput(`Gamepad${i}`, pressed);
            }
        }
    }

    if (somethingPresent) {
        requestAnimationFrame(pollGamepads);
    } else {
        gamepadsRunning = false;
    }
}

on(window, 'gamepadconnected', e => {
    if (e.gamepad.mapping !== 'standard') {
        console.warn('Non-standard gamepad attached. Mappings may be funny.');
    }

    if (!gamepadsRunning) {
        gamepadsRunning = true;
        pollGamepads();
    }
});

on(window, 'gamepaddisconnected', e => {
    gamepadStates[e.gamepad.index] = null;
});

export let isMapping = false;
let resolveMapping: ((value: unknown) => void) | null = null;
let resolveCapture: ((arg0: null) => void) | null = null;

export function startMapping() {
    isMapping = true;
    document.body.classList.add('mapping');
    return new Promise(resolve => { resolveMapping = resolve });
}

export function stopMapping() {
    cancelCapture();
    document.body.classList.remove('mapping');
    isMapping = false;
    resolveMapping && resolveMapping();
}

export function captureNextInput() {
    cancelCapture();
    return new Promise(
        resolve => { resolveCapture = resolve; })
        .then(input => {
            resolveCapture = null;
            return input;
        });
}

export function cancelCapture() {
    resolveCapture && resolveCapture(null);
}

async function startMapKey(keyElement: { classList: { add: (arg0: string) => void; remove: (arg0: string) => void; }; }, action: any) {
    const cancel = (e: { stopPropagation: () => void; }) => {
        e.stopPropagation();
        cancelCapture();
    };

    on(document.body, 'mousedown', cancel, true);
    on(document.body, 'touchstart', cancel, true);
    document.body.classList.add('capturing');
    keyElement.classList.add('mapping');
    try {
        const input = await captureNextInput();
        if (input) {
            inputMap[input] = action;
            Settings.save('inputMap', inputMap);
        }
    } finally {
        keyElement.classList.remove('mapping');
        document.body.classList.remove('capturing');
        off(document.body, 'touchstart', cancel, true);
        off(document.body, 'mousedown', cancel, true);
    }
}

export function resetMappings() {
    for (const input of Object.keys(inputMap)) {
        delete inputMap[input];
    }
    Object.assign(inputMap, defaultInputMap);
    Settings.save('inputMap', inputMap);
}

export function clearMappings() {
    for (const input of Object.keys(inputMap)) {
        delete inputMap[input];
    }
    Settings.save('inputMap', inputMap);
}
*/