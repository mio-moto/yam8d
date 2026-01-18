import { getDefaultStore } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedBus } from '../connection/connection'
import type { KeyCommand } from '../connection/protocol'
import { macroStatusAtom } from '../state/viewStore'

export const useMacroRunner = (connection?: ConnectedBus) => {
    const store = getDefaultStore()
    const [running, setRunning] = useState(false)
    const queue = useRef<number[]>([])
    const lastSent = useRef<number | null>(null)

    const cancel = useCallback(
        (reason?: string) => {
            queue.current = []
            setRunning(false)
            store.set(macroStatusAtom, { running: false })
            if (reason) {
                // optional: log reason
                console.debug('Macro canceled:', reason)
            }
        },
        [store],
    )

    const start = (sequence: number[]) => {
        queue.current = Array.isArray(sequence) ? sequence.slice() : []
        if (queue.current.length === 0) return
        setRunning(true)
        store.set(macroStatusAtom, { running: true, currentStep: 0, sequenceLength: queue.current.length })
        // kick off
        const first = queue.current.shift() as number
        lastSent.current = first
        connection?.commands.sendKeys(first)
    }


    useEffect(() => {
        const onKeyEcho = (data: KeyCommand) => {
            if (!running) return
            const echoed = data.keys
            // Preempt on unexpected echo (likely external input)
            if (lastSent.current !== null && echoed !== lastSent.current) {
                cancel('external key event')
                return
            }
            if (queue.current.length > 0) {
                const next = queue.current.shift() as number
                lastSent.current = next
                connection?.commands.sendKeys(next)
                const sent = (store.get(macroStatusAtom).currentStep ?? 0) + 1
                store.set(macroStatusAtom, { running: true, currentStep: sent, sequenceLength: queue.current.length + sent })
            } else {
                setRunning(false)
                store.set(macroStatusAtom, { running: false })
                lastSent.current = null
            }
        }

        const onKeyDown = () => {
            if (running) cancel('preempted by keyboard')
        }

        window.addEventListener('keydown', onKeyDown)
        connection?.protocol.eventBus.on('key', onKeyEcho)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            connection?.protocol.eventBus.off('key', onKeyEcho)
        }
    }, [connection, running, cancel, store])

    return { start, cancel, running }
}
