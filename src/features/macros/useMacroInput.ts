import { useCallback, useEffect } from 'react'
import type { ConnectedBus } from '../connection/connection.ts'
import { useMacroRunner } from './macroRunner'
import { useViewNavigation } from './useViewNavigation'

export const useMacroInput = (connection?: ConnectedBus) => {
    const runner = useMacroRunner(connection)
    const { navigateToView } = useViewNavigation(connection)

    const handleInput = useCallback(
        (ev: KeyboardEvent) => {
            if (!ev || !ev.code) return
            if (ev.repeat) return

            // Any key should preempt current macro
            runner.cancel('preempted by keyboard')

            switch (ev.code) {
                case 'F1':
                    navigateToView('song')
                    ev.preventDefault()
                    break
                case 'F2':
                    navigateToView('chain')
                    ev.preventDefault()
                    break
                case 'F3':
                    navigateToView('phrase')
                    ev.preventDefault()
                    break
                case 'F4':
                    navigateToView('table')
                    ev.preventDefault()
                    break
                case 'F5':
                    navigateToView('instrumentpool')
                    ev.preventDefault()
                    break
                case 'F6':
                    navigateToView('inst')
                    ev.preventDefault()
                    break
                case 'F7':
                    navigateToView('instmods')
                    ev.preventDefault()
                    break
                case 'F8':
                    navigateToView('effectsettings')
                    ev.preventDefault()
                    break
                case 'F9':
                    navigateToView('project')
                    ev.preventDefault()
                    break
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
        [navigateToView, runner],
    )

    useEffect(() => {
        window.addEventListener('keydown', handleInput)

        return () => {
            window.removeEventListener('keydown', handleInput)
        }
    }, [handleInput])

    return { navigateToView }
}
