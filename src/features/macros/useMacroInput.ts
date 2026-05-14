import { useCallback, useEffect } from 'react'
import type { ConnectedBus } from '../connection/connection.ts'
import { useSettingsContext } from '../settings/settings'
import { defaultMacroInputMap } from './defaultMacroInputMap'
import { useMacroRunner } from './macroRunner'
import { useViewNavigation } from './useViewNavigation'

export const useMacroInput = (connection?: ConnectedBus) => {
    const { settings } = useSettingsContext()
    const runner = useMacroRunner(connection)
    const { navigateToView } = useViewNavigation(connection)
    const macroInputMap = settings.macroInputMap ?? defaultMacroInputMap

    const handleInput = useCallback(
        (ev: KeyboardEvent) => {
            if (!ev || !ev.code) return
            if (ev.repeat) return

            // Any key should preempt current macro
            if (runner.running) {
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
                    runner.start([0b00000010 | 0b01000000, 0])
                    ev.preventDefault()
                    break
                case 'PageDown':
                    runner.start([0b00000010 | 0b00100000, 0])
                    ev.preventDefault()
                    break
                default:
                    break
            }
        },
        [macroInputMap, navigateToView, runner],
    )

    useEffect(() => {
        window.addEventListener('keydown', handleInput)

        return () => {
            window.removeEventListener('keydown', handleInput)
        }
    }, [handleInput])

    return { navigateToView }
}
