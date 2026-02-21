import { useCallback, useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection.ts'
import { useMacroStatus, useViewName } from '../state/viewStore'
import { getLoadedEdgeKeys, getLoadedGraph, loadM8GraphJson, loadViewList } from './m8GraphLoader'
import { getLatestDiscoveredGraph } from './autoViewGraph'
import { useMacroRunner } from './macroRunner'
import { computePagePath, toKeyMasks } from './navAStar'
//import { M8KeyMask } from '../connection/keys.ts'

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

export const useViewNavigation = (connection?: ConnectedBus) => {
    const runner = useMacroRunner(connection)
    const [viewName] = useViewName()
    const [macroStatus] = useMacroStatus()
    const viewSetRef = useRef<Set<string>>(new Set())
    //const retryRef = useRef<boolean>(false)
    const navigationGoal = useRef<string | null>(null)
    const navigationSteps = useRef<number>(0)
    const maxNavigationSteps = 20 // Safety limit to prevent infinite loops

    // Promise resolver for view navigation completion
    const viewNavigationResolver = useRef<(() => void) | null>(null)

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

    // Infer the normalized title from a node id by longest prefix match from view list
    const titleOfNode = useCallback((nodeId: string) => {
        const id = (nodeId || '').toLowerCase()
        let pick = ''
        for (const name of viewSetRef.current) {
            if (id.startsWith(name) && name.length > pick.length) pick = name
        }
        return pick
    }, [])

    // Build a path using title-only start/goal: choose the shortest among all matching nodes
    const buildTitlePath = useCallback((targetTitle: string) => {
        const graph = getM8GraphAsMap()
        const starts: string[] = []
        const goals: string[] = []
        for (const node of graph.keys()) {
            const t = titleOfNode(node)
            if (!t) continue
            if (t === (viewName || '')) starts.push(node)
            if (t === targetTitle) goals.push(node)
        }
        if (!goals.length) return null

        // Unknown current title: return a default Shift+Up navigation step
        // This helps escape unknown views and reach a known view in the graph
        if (!starts.length) {
            return {
                pages: ['unknown', 'fallback'],
                directions: ['up'],
                cost: 1
            }
        }

        let best: { pages: string[]; directions: ('up' | 'down' | 'left' | 'right')[]; cost: number } | null = null
        for (const s of starts) {
            for (const g of goals) {
                const res = computePagePath(graph, s, g)
                if (res && (!best || res.cost < best.cost)) best = res
            }
        }
        return best
    }, [titleOfNode, viewName])

    const framesForEdge = useCallback((from: string, to: string, dir: 'up' | 'down' | 'left' | 'right') => {
        const keysMap = getLoadedEdgeKeys()
        const frames = keysMap?.get(from.toLowerCase())?.get(to)
        if (frames?.length) {
            // Ensure final release present
            return frames[frames.length - 1] === 0 ? frames.slice() : [...frames, 0]
        }
        // Fallback to directional masks (legacy)
        return toKeyMasks([dir], { shift: true })
    }, [])

    // Complete the navigation and resolve the promise
    const completeNavigation = useCallback(() => {
        navigationGoal.current = null
        navigationSteps.current = 0
        if (viewNavigationResolver.current) {
            viewNavigationResolver.current()
            viewNavigationResolver.current = null
        }
    }, [])

    const executeNextNavigationStep = useCallback(() => {
        const goalTitle = navigationGoal.current
        const startTitle = viewName || ''

        if (!goalTitle || !startTitle) {
            completeNavigation()
            return
        }

        // Check if we've reached the goal
        if (startTitle === goalTitle) {
            console.log('Navigation complete:', { goal: goalTitle, steps: navigationSteps.current })
            completeNavigation()
            return
        }

        // Safety check: prevent infinite loops
        if (navigationSteps.current >= maxNavigationSteps) {
            console.warn('Navigation aborted: max steps reached', { startTitle, goalTitle, steps: navigationSteps.current })
            completeNavigation()
            return
        }


        // Compute path from current position to goal
        const res = buildTitlePath(goalTitle)
        if (!res) {
            console.warn('No path found (iterative)', { startTitle, goalTitle, step: navigationSteps.current })
            completeNavigation()
            return
        }

        // Execute ONLY the first step
        if (res.pages.length > 1) {
            const from = res.pages[0]
            const to = res.pages[1]
            const dir = res.directions[0] as 'up' | 'down' | 'left' | 'right'
            const frames = framesForEdge(from, to, dir)

            navigationSteps.current += 1
            console.log('Navigation step', {
                step: navigationSteps.current,
                from: startTitle,
                to: titleOfNode(to),
                dir,
                goal: goalTitle,
                frames
            })

            runner.cancel('iterative navigation step')
            runner.start(frames)
        }
    }, [runner, viewName, buildTitlePath, framesForEdge, titleOfNode, completeNavigation])

    const navigateToView = useCallback(
        (targetViewTitle: string): Promise<void> => {
            return new Promise((resolve) => {
                const goalTitle = resolveTarget(targetViewTitle)
                if (!goalTitle) {
                    resolve()
                    return
                }

                // Resolve any pending navigation first
                if (viewNavigationResolver.current) {
                    viewNavigationResolver.current()
                }
                viewNavigationResolver.current = resolve

                // Set the navigation goal and reset step counter
                navigationGoal.current = goalTitle
                navigationSteps.current = 0

                console.log('Starting iterative navigation', { goal: goalTitle, from: viewName || 'unknown' })

                // Start the first step immediately
                executeNextNavigationStep()
            })
        },
        [resolveTarget, viewName, executeNextNavigationStep],
    )

    // Subscribe to view changes AND macro completion to execute next navigation step
    useEffect(() => {
        if (navigationGoal.current && viewName && !macroStatus.running) {
            // View changed and macro completed while navigating - execute next step
            executeNextNavigationStep()
        }
    }, [viewName, macroStatus.running, executeNextNavigationStep])

    // Load graph and view list on mount
    useEffect(() => {
        loadM8GraphJson().catch(() => void 0)
        loadViewList().then((set) => {
            if (set?.size) viewSetRef.current = set
        }).catch(() => void 0)
    }, [])

    return { navigateToView }
}
