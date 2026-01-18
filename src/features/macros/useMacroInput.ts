import { useCallback, useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection.ts'
import { useViewName } from '../state/viewStore'
// Runtime graph will be loaded from public JSON or discovered by automaton
import { getLoadedGraph, loadM8GraphJson, loadViewList } from './m8GraphLoader'
import { getLatestDiscoveredGraph } from './autoViewGraph'
import { useMacroRunner } from './macroRunner'
import { computePagePath, toKeyMasks } from './navAStar'
import { M8KeyMask } from '../connection/keys.ts'

export function getM8GraphAsMap() {
    // Prefer JSON loaded graph
    const loaded = getLoadedGraph()
    if (loaded) return loaded
    // Fallback to automaton's latest discovery
    const discovered = getLatestDiscoveredGraph()
    if (discovered) return discovered
    // No graph yet
    return new Map<string, { to: string; dir: 'up' | 'down' | 'left' | 'right' }[]>()
}

export const useMacroInput = (connection?: ConnectedBus) => {
    const runner = useMacroRunner(connection)
    const [viewName] = useViewName()
    const pendingTarget = useRef<string>('')
    const viewSetRef = useRef<Set<string>>(new Set())

    const resolveTarget = useCallback((name: string) => {
        const goal = (name || '').toLowerCase()
        if (viewSetRef.current.has(goal)) return goal
        // try case-insensitive match fallback
        for (const v of viewSetRef.current) {
            if (v.toLowerCase() === goal) return v
        }
        console.warn('Target not in viewlist', { goal })
        return goal
    }, [])

    const planAndSendPath = useCallback(
        (targetPage: string) => {

            const start = viewName

            const goal = resolveTarget(targetPage)

            if (!start || !goal) return

            const graph = getM8GraphAsMap()

            if (!graph.has(goal)) {
                console.warn('Unknown goal in graph', { goal })
                return
            }

            // Fallback: navigate shift+left to reach a known start
            if (!graph.has(start)) {
                pendingTarget.current = goal
                runner.start([M8KeyMask.Shift | M8KeyMask.Left])
            }

            const res = computePagePath(graph, start, goal)
            if (!res) {
                console.warn('No path found', { start, goal })
                return
            }

            const seq = toKeyMasks(res.directions, { shift: true })
            console.log('Macro plan', { start, goal, steps: res.directions.length, seqLen: seq.length })
            runner.cancel('new page path')
            runner.start(seq)
        },
        [runner, viewName, resolveTarget],
    )
    // biome-ignore lint/correctness/useExhaustiveDependencies: <title or minimap should trigger>
    useEffect(() => {
        // Try loading runtime graph JSON once and viewlist
        loadM8GraphJson().catch(() => void 0)
        loadViewList().then((set) => {
            if (set?.size) viewSetRef.current = set
        }).catch(() => void 0)
        if (pendingTarget.current) planAndSendPath(pendingTarget.current)
        pendingTarget.current = ''
    }, [planAndSendPath, viewName])

    const handleInput = useCallback(
        (ev: KeyboardEvent) => {
            if (!ev || !ev.code) return
            if (ev.repeat) return

            // Any key should preempt current macro
            runner.cancel('preempted by keyboard')

            //console.log('useMacroInput keydown', ev.code)
            switch (ev.code) {
                case 'F1':
                    planAndSendPath('songpsvcpit')
                    ev.preventDefault()
                    break
                case 'F2':
                    planAndSendPath('chainspcvpit')
                    ev.preventDefault()
                    break
                case 'F3':
                    planAndSendPath('phrasescgpvit')
                    ev.preventDefault()
                    break
                case 'F4':
                    planAndSendPath('tablescpimtv')
                    ev.preventDefault()
                    break
                case 'F5':
                    planAndSendPath('instrumentpoolscppmivit')
                    ev.preventDefault()
                    break
                case 'F6':
                    planAndSendPath('instscpmivt')
                    ev.preventDefault()
                    break
                case 'F7':
                    planAndSendPath('mixerscgpvxit')
                    ev.preventDefault()
                    break
                case 'F8':
                    planAndSendPath('effectsettingsscgpvxit')
                    ev.preventDefault()
                    break
                case 'F9':
                    planAndSendPath('projectspcvpit')
                    ev.preventDefault()
                    break
                default:
                    break
            }
        },
        [planAndSendPath, runner],
    )

    useEffect(() => {
        const handleKeyDown = (ev: KeyboardEvent) => {
            handleInput(ev)
        }
        //console.log('useMacroInput mounted: listening for keydown')
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            //console.log('useMacroInput cleanup: removed listeners')
        }
    }, [handleInput])
}
