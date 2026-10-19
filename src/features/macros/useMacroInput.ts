import { useCallback, useEffect } from 'react'
import type { ConnectedBus } from '../../../packages/m8-sdk/src/engine/connection'
import { useSettingsContext } from '../settings/settings'
import { defaultMacroInputMap } from './defaultMacroInputMap'
import { shouldIgnoreAppKeyboardEvent } from '../inputs/inputGate'
import { useM8Engine } from '../engine'

export const useMacroInput = (connection?: ConnectedBus) => {
    const { settings } = useSettingsContext()
    const engine = useM8Engine(connection)
    const navigateToView = useCallback((viewName: string) => engine?.navigateToView(viewName) ?? Promise.resolve(), [engine])
    const macroInputMap = settings.macroInputMap ?? defaultMacroInputMap

    const handleInput = useCallback(
        (ev: KeyboardEvent) => {
            if (!ev?.code) return
            if (shouldIgnoreAppKeyboardEvent(ev)) return
            if (ev.repeat) return

            const runner = engine?.macro
            // Any key should preempt current macro
            if (runner?.running) {
                runner.cancel('preempted by keyboard')
            }

            const macroView = macroInputMap[ev.code]
            if (macroView) {
                navigateToView(macroView)
                ev.preventDefault()
                return
            }

            switch (ev.code) {
                case 'PageUp':
                    runner?.start([0b00000010 | 0b01000000, 0])
                    ev.preventDefault()
                    break
                case 'PageDown':
                    runner?.start([0b00000010 | 0b00100000, 0])
                    ev.preventDefault()
                    break
                default:
                    break
            }
        },
        [macroInputMap, navigateToView, engine],
    )

    useEffect(() => {
        window.addEventListener('keydown', handleInput)

        return () => {
            window.removeEventListener('keydown', handleInput)
        }
    }, [handleInput])

    return { navigateToView }
}
