import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectedBus } from '../connection/connection'
import type { Direction, Edge } from './m8Graph'
import { toKeyMasks, computePagePath } from './navAStar'
import { useViewName, useViewTitle, useCursorRect } from '../state/viewStore'
import { loadViewList } from './m8GraphLoader'

type ExploreStatus = {
    running: boolean
    visitedCount: number
    edgesCount: number
    queueSize: number
    currentPageKey?: string
    lastAction?: string
    elapsedMs: number
    transport?: string
    recentErrors?: string[]
    backtrackMethod?: 'opposite' | 'path' | 'none'
    mode?: 'view' | 'cursor'
    currentViewTitle?: string | null
}

const DIRS: Direction[] = ['up', 'down', 'left', 'right']

type EdgeState = 'unexplored' | 'exploratory' | 'recorded' | 'asymmetric' | 'deadend'
type DirState = { state: EdgeState; to?: string }

export const useAutoViewGraph = (connection?: ConnectedBus) => {
    const [viewName] = useViewName()
    const [viewTitle] = useViewTitle()
    const [cursorRect] = useCursorRect()
    const currentPageRef = useRef<string>('')
    const currentViewTitleRef = useRef<string | null>(null)
    const currentCursorRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
    useEffect(() => {
        currentPageRef.current = (viewName || '').toLowerCase()
    }, [viewName])
    useEffect(() => {
        currentViewTitleRef.current = viewTitle || null
    }, [viewTitle])
    useEffect(() => {
        currentCursorRectRef.current = cursorRect || null
    }, [cursorRect])

    // Local extension to include recorded key frames per edge
    type EdgeWithKeys = Edge & { keys?: number[] }
    // Graph data
    const graphRef = useRef<Map<string, EdgeWithKeys[]>>(new Map())
    // Per-view cursor graphs: viewTitle -> (cursorKey -> edges)
    const cursorGraphsRef = useRef<Map<string, Map<string, EdgeWithKeys[]>>>(new Map())
    const dirStatesRef = useRef<Map<string, Record<Direction, DirState>>>(new Map())
    // Cursor dir states per node (only within current view during exploration)
    const cursorDirStatesRef = useRef<Map<string, Record<Direction, DirState>>>(new Map())
    const visitedRef = useRef<Set<string>>(new Set())
    const queueRef = useRef<string[]>([])
    const enqueuedRef = useRef<Set<string>>(new Set())

    // Status
    const [status, setStatus] = useState<ExploreStatus>({ running: false, visitedCount: 0, edgesCount: 0, queueSize: 0, elapsedMs: 0, mode: 'view', currentViewTitle: null })
    const startTsRef = useRef<number>(0)
    const errorsRef = useRef<string[]>([])
    const lastActionRef = useRef<string>('')
    const backtrackMethodRef = useRef<ExploreStatus['backtrackMethod']>('none')
    const stopFlagRef = useRef<boolean>(false)

    // Safety caps
    const caps = useMemo(() => ({ perDirRetries: 2, globalMoveBudget: 400, settleMs: 50, queueLimit: 20 }), [])
    const moveBudgetRef = useRef<number>(caps.globalMoveBudget)
    const expectedViewsRef = useRef<Set<string>>(new Set())

    const updateStatus = useCallback((partial: Partial<ExploreStatus>) => {
        console.log('update status with:', partial)
        setStatus((s) => ({
            running: partial.running ?? s.running,
            visitedCount: partial.visitedCount ?? s.visitedCount,
            edgesCount: partial.edgesCount ?? s.edgesCount,
            queueSize: partial.queueSize ?? s.queueSize,
            currentPageKey: partial.currentPageKey ?? s.currentPageKey,
            lastAction: partial.lastAction ?? s.lastAction,
            elapsedMs: partial.elapsedMs ?? s.elapsedMs,
            transport: partial.transport ?? s.transport,
            recentErrors: partial.recentErrors ?? s.recentErrors,
            backtrackMethod: partial.backtrackMethod ?? s.backtrackMethod,
            mode: partial.mode ?? s.mode,
            currentViewTitle: partial.currentViewTitle ?? s.currentViewTitle,
        }))
    }, [])

    const getPageKey = () => currentPageRef.current || ''
    const getViewTitle = () => currentViewTitleRef.current || null
    const getCursorRect = () => currentCursorRectRef.current
    const makeCursorNodeKey = (rect: { x: number; y: number; w: number; h: number }) => `${rect.x},${rect.y},${rect.w},${rect.h}`

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    // Send a whole key sequence directly with small delays, bypassing macro echo pacing
    const sendSequenceDirect = async (sequence: number[], delayMs = 30) => {
        for (const mask of sequence) {
            connection?.commands.sendKeys(mask)
            await sleep(delayMs)
        }
    }

    const waitForPageChange = async (fromKey: string, timeoutMs: number): Promise<string | null> => {
        return new Promise((resolve) => {
            const failTimer = setTimeout(() => resolve(null), timeoutMs)
            const tick = () => {
                const k = getPageKey()
                if (k && k !== fromKey) {
                    clearTimeout(failTimer)
                    resolve(k)
                    return
                }
                setTimeout(tick, 30)
            }
            // kick off
            setTimeout(tick, 20)
        })
    }

    const waitForCursorChange = async (fromKey: string, timeoutMs: number): Promise<string | null> => {
        return new Promise((resolve) => {
            const failTimer = setTimeout(() => resolve(null), timeoutMs)
            const tick = () => {
                const vt = getViewTitle()
                // abort on view change
                if (vt !== currentViewTitleRef.current) {
                    clearTimeout(failTimer)
                    resolve(null)
                    return
                }
                const rect = getCursorRect()
                if (rect) {
                    const k = makeCursorNodeKey(rect)
                    if (k && k !== fromKey) {
                        clearTimeout(failTimer)
                        resolve(k)
                        return
                    }
                }
                setTimeout(tick, 30)
            }
            setTimeout(tick, 20)
        })
    }

    const waitForSeed = async (timeoutMs: number): Promise<string | null> => {
        return new Promise((resolve) => {
            const failTimer = setTimeout(() => resolve(null), timeoutMs)
            const tick = () => {
                const k = getPageKey()
                if (k) {
                    clearTimeout(failTimer)
                    resolve(k)
                    return
                }
                setTimeout(tick, 40)
            }
            setTimeout(tick, 20)
        })
    }

    const primeSeed = async (): Promise<string | null> => {
        console.log('Explore prime: reset screen')
        try {
            connection?.commands.resetScreen()
        } catch (_e) {
            // ignore
        }
        await sleep(150)
        let seeded = await waitForSeed(300)
        if (seeded) return seeded
        const trials: Direction[] = ['left', 'right', 'up', 'down']
        for (const d of trials) {
            console.log('Explore prime: try', d)
            await sendSequenceDirect(toKeyMasks([d], { shift: true }))
            seeded = await waitForSeed(caps.settleMs)
            if (seeded) return seeded
        }
        return null
    }

    const ensureRelease = async () => {
        // Release any held keys and allow quiet period
        connection?.commands.sendKeys(0)
        await sleep(30)
    }

    const ensureDirStates = (key: string) => {
        const k = key.toLowerCase()
        if (!dirStatesRef.current.has(k)) {
            dirStatesRef.current.set(k, {
                up: { state: 'unexplored' },
                down: { state: 'unexplored' },
                left: { state: 'unexplored' },
                right: { state: 'unexplored' },
            })
        }
        return dirStatesRef.current.get(k) as Record<Direction, DirState>
    }

    const ensureCursorDirStates = (nodeKey: string) => {
        const k = nodeKey
        if (!cursorDirStatesRef.current.has(k)) {
            cursorDirStatesRef.current.set(k, {
                up: { state: 'unexplored' },
                down: { state: 'unexplored' },
                left: { state: 'unexplored' },
                right: { state: 'unexplored' },
            })
        }
        return cursorDirStatesRef.current.get(k) as Record<Direction, DirState>
    }

    const addEdge = (from: string, to: string, dir: Direction, keys?: number[]) => {
        // Optional: only record edges to known views when list is available
        if (expectedViewsRef.current.size && !expectedViewsRef.current.has(to)) {
            console.warn('Explore skip edge to unknown view', { from, to, dir })
            return
        }
        const g = graphRef.current
        const list = g.get(from) ?? []
        // de-duplicate
        if (!list.find((e) => e.to === to && e.dir === dir)) {
            list.push({ to, dir, keys })
            g.set(from, list)
            // Recompute edge count as sum of adjacency sizes
            let edgeCount = 0
            for (const [, v] of g.entries()) edgeCount += v.length
            updateStatus({ edgesCount: edgeCount })
            console.log('Explore edge discovered', { from, to, dir })
        }
    }

    const addCursorEdge = (view: string, from: string, to: string, dir: Direction, keys?: number[]) => {
        const g = cursorGraphsRef.current
        const vg = g.get(view) ?? new Map<string, EdgeWithKeys[]>()
        const list = vg.get(from) ?? []
        if (!list.find((e) => e.to === to && e.dir === dir)) {
            list.push({ to, dir, keys })
            vg.set(from, list)
            g.set(view, vg)
            // recompute edge count for status from current view only
            let edgeCount = 0
            for (const [, v] of vg.entries()) edgeCount += v.length
            updateStatus({ edgesCount: edgeCount })
            console.log('Cursor edge discovered', { view, from, to, dir })
        }
    }

    const tryDirection = async (origin: string, dir: Direction): Promise<{ changed: boolean; newKey?: string; keysSent?: number[] }> => {
        moveBudgetRef.current -= 1
        if (moveBudgetRef.current <= 0) {
            errorsRef.current.push('Move budget exhausted')
            updateStatus({ recentErrors: [...errorsRef.current] })
            return { changed: false }
        }
        lastActionRef.current = `try ${dir}`
        updateStatus({ lastAction: lastActionRef.current })
        console.log('Explore try direction', { origin, dir })
        await ensureRelease()
        const seq = toKeyMasks([dir], { shift: true })
        await sendSequenceDirect(seq)
        await sleep(50)
        const changedKey = await waitForPageChange(origin, caps.settleMs)
        if (changedKey && changedKey !== origin) {
            // Only return the discovered key; edge recording happens after confirming symmetric backtrack.
            return { changed: true, newKey: changedKey, keysSent: seq }
        }
        return { changed: false }
    }

    const tryCursorDirection = async (originKey: string, dir: Direction): Promise<{ changed: boolean; newKey?: string; keysSent?: number[] }> => {
        moveBudgetRef.current -= 1
        if (moveBudgetRef.current <= 0) {
            errorsRef.current.push('Move budget exhausted')
            updateStatus({ recentErrors: [...errorsRef.current] })
            return { changed: false }
        }
        lastActionRef.current = `try cursor ${dir}`
        updateStatus({ lastAction: lastActionRef.current })
        console.log('Cursor try direction', { originKey, dir })
        await ensureRelease()
        const seq = toKeyMasks([dir], { shift: false })
        await sendSequenceDirect(seq)
        await sleep(40)
        const changedKey = await waitForCursorChange(originKey, Math.max(40, caps.settleMs))
        if (changedKey && changedKey !== originKey) {
            return { changed: true, newKey: changedKey, keysSent: seq }
        }
        return { changed: false }
    }

    const backtrackOpposite = async (origin: string, viaDir: Direction): Promise<{ ok: boolean; at?: string }> => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        const seq = toKeyMasks([opposite[viaDir]], { shift: true })
        await sendSequenceDirect(seq)
        await sleep(50)
        const timeoutAt = Date.now() + caps.settleMs
        let ok = false
        while (Date.now() < timeoutAt) {
            const k = getPageKey()
            if (k && k === origin) {
                ok = true
                break
            }
            await sleep(20)
        }
        const at: string | undefined = getPageKey() || undefined
        backtrackMethodRef.current = ok ? 'opposite' : 'none'
        updateStatus({ backtrackMethod: backtrackMethodRef.current })
        console.log('Explore backtrack opposite', { origin, viaDir, ok, at })
        return { ok, at }
    }

    const backtrackOppositeCursor = async (originKey: string, viaDir: Direction): Promise<{ ok: boolean; at?: string }> => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        const seq = toKeyMasks([opposite[viaDir]], { shift: false })
        await sendSequenceDirect(seq)
        await sleep(40)
        const timeoutAt = Date.now() + Math.max(40, caps.settleMs)
        let ok = false
        while (Date.now() < timeoutAt) {
            const rect = getCursorRect()
            const vt = getViewTitle()
            if (vt !== currentViewTitleRef.current) break // abort on view change
            if (rect) {
                const k = makeCursorNodeKey(rect)
                if (k && k === originKey) {
                    ok = true
                    break
                }
            }
            await sleep(20)
        }
        const rect = getCursorRect()
        const at: string | undefined = rect ? makeCursorNodeKey(rect) : undefined
        backtrackMethodRef.current = ok ? 'opposite' : 'none'
        updateStatus({ backtrackMethod: backtrackMethodRef.current })
        console.log('Cursor backtrack opposite', { originKey, viaDir, ok, at })
        return { ok, at }
    }

    const stepFrom = async (origin: string) => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        ensureDirStates(origin)
        for (const dir of DIRS) {
            if (stopFlagRef.current) return
            const states = ensureDirStates(origin)
            const st = states[dir]
            if (st.state === 'recorded' || st.state === 'deadend' || st.state === 'asymmetric') continue
            // RAY: go as far as we can in this direction, marking exploratory edges
            const ray: Array<{ from: string; to: string; dir: Direction; keys?: number[] }> = []
            let current = origin
            while (!stopFlagRef.current) {
                // Skip retrying directions already marked as deadend at this node
                const currState = ensureDirStates(current)[dir]
                if (currState && (currState.state === 'deadend' || currState.state === 'asymmetric')) break
                let changed = false
                let newKey: string | undefined
                for (let attempt = 0; attempt <= caps.perDirRetries; attempt++) {
                    const res = await tryDirection(current, dir)
                    if (res.changed) {
                        changed = true
                        newKey = res.newKey as string
                        ray.push({ from: current, to: newKey, dir, keys: res.keysSent })
                        break
                    }
                }
                if (!changed || !newKey) {
                    // dead end for this direction from current
                    ensureDirStates(current)[dir] = { state: 'deadend' }
                    break
                }
                ensureDirStates(current)[dir] = { state: 'exploratory', to: newKey }
                ensureDirStates(newKey) // init states for landed view
                // edge already recorded in ray when changed
                if (!visitedRef.current.has(newKey)) {
                    visitedRef.current.add(newKey)
                    updateStatus({ visitedCount: visitedRef.current.size, currentPageKey: newKey })
                } else {
                    updateStatus({ currentPageKey: newKey })
                }
                current = newKey
            }
            if (!ray.length) continue
            // BACKTRACK: walk back along the ray confirming symmetry; record symmetric edges
            for (let i = ray.length - 1; i >= 0 && !stopFlagRef.current; i--) {
                const step = ray[i]
                const res = await backtrackOpposite(step.from, dir)
                if (res.ok) {
                    // Confirmed symmetric; record both dirs
                    addEdge(step.from, step.to, dir, step.keys)
                    addEdge(step.to, step.from, opposite[dir], toKeyMasks([opposite[dir]], { shift: true }))
                    ensureDirStates(step.from)[dir] = { state: 'recorded', to: step.to }
                    ensureDirStates(step.to)[opposite[dir]] = { state: 'recorded', to: step.from }
                    updateStatus({ currentPageKey: step.from })
                } else {
                    // Asymmetric: remove exploratory forward edge and mark; keep backtrack as a new exploratory edge
                    ensureDirStates(step.from)[dir] = { state: 'asymmetric', to: step.to }
                    const landed = res.at
                    if (landed && landed !== step.from) {
                        ensureDirStates(step.to)[opposite[dir]] = { state: 'exploratory', to: landed }
                        // We are at landed now; continue the ray from there in same global direction search via frontier loop later
                        updateStatus({ currentPageKey: landed })
                    }
                    break
                }
            }
        }
    }

    const stepFromCursor = async (view: string, originKey: string) => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        ensureCursorDirStates(originKey)
        for (const dir of DIRS) {
            if (stopFlagRef.current) return
            const states = ensureCursorDirStates(originKey)
            const st = states[dir]
            if (st.state === 'recorded' || st.state === 'deadend' || st.state === 'asymmetric') continue
            const ray: Array<{ from: string; to: string; dir: Direction; keys?: number[] }> = []
            let current = originKey
            while (!stopFlagRef.current) {
                const currState = ensureCursorDirStates(current)[dir]
                if (currState && (currState.state === 'deadend' || currState.state === 'asymmetric')) break
                let changed = false
                let newKey: string | undefined
                for (let attempt = 0; attempt <= caps.perDirRetries; attempt++) {
                    const res = await tryCursorDirection(current, dir)
                    if (res.changed) {
                        changed = true
                        newKey = res.newKey as string
                        ray.push({ from: current, to: newKey, dir, keys: res.keysSent })
                        break
                    }
                }
                if (!changed || !newKey) {
                    ensureCursorDirStates(current)[dir] = { state: 'deadend' }
                    break
                }
                ensureCursorDirStates(current)[dir] = { state: 'exploratory', to: newKey }
                ensureCursorDirStates(newKey)
                // edge already recorded in ray when changed
                updateStatus({ currentPageKey: currentPageRef.current, currentViewTitle: view })
                current = newKey
            }
            if (!ray.length) continue
            for (let i = ray.length - 1; i >= 0 && !stopFlagRef.current; i--) {
                const step = ray[i]
                const res = await backtrackOppositeCursor(step.from, dir)
                if (res.ok) {
                    addCursorEdge(view, step.from, step.to, dir, step.keys)
                    addCursorEdge(view, step.to, step.from, opposite[dir], toKeyMasks([opposite[dir]], { shift: false }))
                    ensureCursorDirStates(step.from)[dir] = { state: 'recorded', to: step.to }
                    ensureCursorDirStates(step.to)[opposite[dir]] = { state: 'recorded', to: step.from }
                } else {
                    ensureCursorDirStates(step.from)[dir] = { state: 'asymmetric', to: step.to }
                    const landed = res.at
                    if (landed && landed !== step.from) {
                        ensureCursorDirStates(step.to)[opposite[dir]] = { state: 'exploratory', to: landed }
                    }
                    break
                }
            }
        }
    }

    const hasFrontier = () => {
        for (const [, dirs] of dirStatesRef.current.entries()) {
            for (const d of DIRS) {
                const s = dirs[d]
                if (!s || s.state === 'unexplored' || s.state === 'exploratory') return true
            }
        }
        return false
    }

    const hasCursorFrontier = () => {
        for (const [, dirs] of cursorDirStatesRef.current.entries()) {
            for (const d of DIRS) {
                const s = dirs[d]
                if (!s || s.state === 'unexplored' || s.state === 'exploratory') return true
            }
        }
        return false
    }

    const pickFrontier = (): { node: string; dir: Direction } | null => {
        for (const [k, dirs] of dirStatesRef.current.entries()) {
            for (const d of DIRS) {
                const s = dirs[d]
                if (!s || s.state === 'unexplored') return { node: k, dir: d }
            }
        }
        for (const [k, dirs] of dirStatesRef.current.entries()) {
            for (const d of DIRS) {
                const s = dirs[d]
                if (s.state === 'exploratory') return { node: k, dir: d }
            }
        }
        return null
    }

    const pickCursorFrontier = (): { node: string; dir: Direction } | null => {
        for (const [k, dirs] of cursorDirStatesRef.current.entries()) {
            for (const d of DIRS) {
                const s = dirs[d]
                if (!s || s.state === 'unexplored') return { node: k, dir: d }
            }
        }
        for (const [k, dirs] of cursorDirStatesRef.current.entries()) {
            for (const d of DIRS) {
                const s = dirs[d]
                if (s.state === 'exploratory') return { node: k, dir: d }
            }
        }
        return null
    }

    const navigateRecordedPath = async (fromKey: string, toKey: string) => {
        const res = computePagePath(graphRef.current, fromKey.toLowerCase(), toKey.toLowerCase())
        if (!res) return false
        const seq = res.frames?.length ? res.frames : toKeyMasks(res.directions, { shift: true })
        await sendSequenceDirect(seq)
        const timeoutAt = Date.now() + Math.max(caps.settleMs, res.directions.length * caps.settleMs)
        while (Date.now() < timeoutAt) {
            const k = getPageKey()
            if (k && k.toLowerCase() === toKey.toLowerCase()) return true
            await sleep(20)
        }
        return getPageKey()?.toLowerCase() === toKey.toLowerCase()
    }

    const navigateRecordedCursorPath = async (view: string, fromKey: string, toKey: string) => {
        const vg = cursorGraphsRef.current.get(view)
        if (!vg) return false
        const res = computePagePath(vg, fromKey, toKey)
        if (!res) return false
        const seq = res.frames?.length ? res.frames : toKeyMasks(res.directions, { shift: false })
        await sendSequenceDirect(seq)
        const timeoutAt = Date.now() + Math.max(Math.max(40, caps.settleMs), res.directions.length * Math.max(40, caps.settleMs))
        while (Date.now() < timeoutAt) {
            const rect = getCursorRect()
            const vt = getViewTitle()
            if (vt !== currentViewTitleRef.current) break
            if (rect) {
                const k = makeCursorNodeKey(rect)
                if (k && k === toKey) return true
            }
            await sleep(20)
        }
        const rect = getCursorRect()
        const at = rect ? makeCursorNodeKey(rect) : ''
        return at === toKey
    }

    // biome-ignore lint/correctness/useExhaustiveDependencies: <internal helpers are stable enough>
    const start = useCallback(async () => {
        if (!connection) return
        stopFlagRef.current = false
        errorsRef.current = []
        moveBudgetRef.current = caps.globalMoveBudget
        startTsRef.current = Date.now()
        graphRef.current = new Map()
        dirStatesRef.current = new Map()
        visitedRef.current = new Set()
        queueRef.current = []
        enqueuedRef.current = new Set()
        // Load view list if available to filter nodes
        try {
            const set = await loadViewList()
            if (set?.size) expectedViewsRef.current = set
        } catch (_e) {
            // ignore
        }
        await ensureRelease()
        updateStatus({ running: true, lastAction: 'seeding', mode: 'view', currentViewTitle: getViewTitle() })
        let seed: string | null = getPageKey()
        if (!seed) {
            seed = await waitForSeed(300)
            if (!seed) {
                // Try to prime the device state to obtain a seed
                seed = await primeSeed()
                if (!seed) {
                    errorsRef.current.push('Seed pageKey unavailable')
                    updateStatus({ running: false, recentErrors: [...errorsRef.current] })
                    console.warn('Explore start failed: no seed pageKey (after prime)')
                    return
                }
            }
        }
        const seedKey = seed as string
        visitedRef.current.add(seedKey)
        ensureDirStates(seedKey)
        updateStatus({ running: true, currentPageKey: seedKey, queueSize: 0, visitedCount: visitedRef.current.size, elapsedMs: 0 })
        console.log('Frontier start', { seed: seedKey })
        while (!stopFlagRef.current && hasFrontier()) {
            const current = getPageKey() || seedKey
            const next = pickFrontier()
            if (!next) break
            if (current.toLowerCase() !== next.node.toLowerCase()) {
                await navigateRecordedPath(current, next.node)
                updateStatus({ currentPageKey: getPageKey() || next.node })
            }
            await stepFrom(next.node)
            updateStatus({ visitedCount: visitedRef.current.size, elapsedMs: Date.now() - startTsRef.current })
        }

        updateStatus({ running: false, elapsedMs: Date.now() - startTsRef.current })
    }, [connection, caps])

    // biome-ignore lint/correctness/useExhaustiveDependencies: <internal helpers are stable enough>
    const stop = useCallback(async () => {
        stopFlagRef.current = true
        await ensureRelease()
        updateStatus({ running: false })
    }, [])

    // biome-ignore lint/correctness/useExhaustiveDependencies: <internal helpers are stable enough>
    const startCursor = useCallback(async () => {
        if (!connection) return
        stopFlagRef.current = false
        errorsRef.current = []
        moveBudgetRef.current = caps.globalMoveBudget
        startTsRef.current = Date.now()
        cursorDirStatesRef.current = new Map()
        visitedRef.current = new Set()
        queueRef.current = []
        enqueuedRef.current = new Set()
        await ensureRelease()
        const vt = getViewTitle()
        updateStatus({ running: true, lastAction: 'cursor seeding', mode: 'cursor', currentViewTitle: vt })
        if (!vt) {
            errorsRef.current.push('View title unavailable')
            updateStatus({ running: false, recentErrors: [...errorsRef.current] })
            return
        }
        const rect = getCursorRect()
        if (!rect) {
            errorsRef.current.push('Cursor rect unavailable')
            updateStatus({ running: false, recentErrors: [...errorsRef.current] })
            return
        }
        const seedKey = makeCursorNodeKey(rect)
        visitedRef.current.add(seedKey)
        ensureCursorDirStates(seedKey)
        updateStatus({ running: true, currentPageKey: currentPageRef.current, queueSize: 0, visitedCount: visitedRef.current.size, elapsedMs: 0, currentViewTitle: vt })
        console.log('Cursor frontier start', { view: vt, seed: seedKey })
        while (!stopFlagRef.current && hasCursorFrontier()) {
            const currentRect = getCursorRect()
            const currentKey = currentRect ? makeCursorNodeKey(currentRect) : seedKey
            const next = pickCursorFrontier()
            if (!next) break
            if (currentKey !== next.node) {
                await navigateRecordedCursorPath(vt, currentKey, next.node)
            }
            await stepFromCursor(vt, next.node)
            updateStatus({ visitedCount: visitedRef.current.size, elapsedMs: Date.now() - startTsRef.current, currentViewTitle: vt })
        }
        updateStatus({ running: false, elapsedMs: Date.now() - startTsRef.current, currentViewTitle: vt })
    }, [connection, caps])

    const getGraphMap = useCallback(() => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        const filtered = new Map<string, Edge[]>()
        for (const [from, edges] of graphRef.current.entries()) {
            const keep: Edge[] = []
            for (const e of edges) {
                const revs = graphRef.current.get(e.to) || []
                if (revs.find((r) => r.to === from && r.dir === opposite[e.dir])) {
                    keep.push(e)
                }
            }
            if (keep.length) filtered.set(from, keep)
        }
        latestGraph = filtered
        return filtered
    }, [])

    const getCursorGraph = useCallback((view: string) => {
        return cursorGraphsRef.current.get(view) ?? null
    }, [])

    // biome-ignore lint/correctness/useExhaustiveDependencies: <internal helpers are stable enough>
    const getCurrentGraphMap = useCallback(() => {
        if (status.mode === 'cursor') {
            const vt = getViewTitle() || ''
            return cursorGraphsRef.current.get(vt) ?? null
        }
        return getGraphMap()
    }, [status.mode, getGraphMap])

    const getAllCursorGraphs = useCallback(() => {
        return cursorGraphsRef.current
    }, [])

    const downloadJson = useCallback(() => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        // Always export the view exploration graph, including keys
        const obj: Record<string, { to: string; dir: Direction; keys?: number[] }[]> = {}
        for (const [from, edges] of graphRef.current.entries()) {
            const keep: { to: string; dir: Direction; keys?: number[] }[] = []
            for (const e of edges) {
                const revs = graphRef.current.get(e.to) || []
                if (revs.find((r) => r.to === from && r.dir === opposite[e.dir])) {
                    keep.push({ to: e.to, dir: e.dir, keys: e.keys })
                }
            }
            if (keep.length) obj[from] = keep
        }
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'm8Graph.generated.json'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }, [])

    // Export all cursor graphs in a single combined JSON file
    const downloadAllCursorJson = useCallback(() => {
        const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
        const combined: Record<string, Record<string, Edge[]>> = {}
        for (const [vt, vg] of cursorGraphsRef.current.entries()) {
            const obj: Record<string, Edge[]> = {}
            for (const [from, edges] of vg.entries()) {
                const keep: Edge[] = []
                for (const e of edges) {
                    const revs = vg.get(e.to) || []
                    if (revs.find((r) => r.to === from && r.dir === opposite[e.dir])) {
                        keep.push({ to: e.to, dir: e.dir })
                    }
                }
                if (keep.length) obj[from] = keep
            }
            combined[vt] = obj
        }
        const payload = { graphs: combined }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'cursorGraphs.json'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }, [])

    return {
        start,
        stop,
        startCursor,
        status,
        getGraphMap,
        getCursorGraph,
        getCurrentGraphMap,
        getAllCursorGraphs,
        downloadJson,
        downloadAllCursorJson,
    }
}

// Expose latest discovered graph for non-hook consumers
let latestGraph: Map<string, Edge[]> | null = null
export const getLatestDiscoveredGraph = () => latestGraph
