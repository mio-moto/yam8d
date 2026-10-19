// Navigates between M8 views by name. Each step finds a path in the view graph with A* (Shift+
// direction edges, buttons that open sub-views, Option to leave them), takes its first edge and
// waits to see which view the M8 shows. That outcome is remembered for the rest of the
// navigation and the path is recomputed from wherever the M8 landed:
// - an edge that changed nothing is blocked (Shift+Right on an empty chain row has no phrase
//   to go to), and the planner goes around it (Project > View Inst. Pool > Instrument);
// - an edge that landed elsewhere (Option, or the Mixer's Shift+Up, which goes back to the
//   last view) now leads where it went.
// Where a key leads can depend on the view the M8 came from (the Instrument's Shift+Left goes
// back to the Instrument Pool when it was entered from there), so the search runs over
// (view, previous view) pairs and outcomes are remembered per pair.
// On a view that is not in the graph, Option is tried first, then Shift+Up.

import { aStar, type Direction, type Edge, type Graph } from './astar'
import { M8KeyMask } from './keys'
import type { MacroRunner } from './macroRunner'
import type { M8Store } from './store'
import { getViewGraph, getViewNames, type NavEdge } from './viewGraph'

const MAX_STEPS = 20 // Safety limit to prevent infinite loops
/** After the keys of a step, no view change in this time means the edge is blocked. */
const STEP_TIMEOUT_MS = 700
/** A new view name must hold this long: the title is guessed early while it is drawn. */
const SETTLE_MS = 80
/** Longest cursor move to a button. */
const CURSOR_TIMEOUT_MS = 4000
/** After a cursor move, before the button keys: the move's last release is still on its way (20 ms command slots). */
const CURSOR_SETTLE_MS = 120

/** Shift+direction frames, used for edges without an explicit key sequence. */
export const toKeyMasks = (directions: Direction[], opts?: { shift?: boolean }) => {
  const withShift = !!opts?.shift
  const s = M8KeyMask.Shift
  const map: Record<Direction, number> = {
    up: (withShift ? s : 0) | M8KeyMask.Up,
    down: (withShift ? s : 0) | M8KeyMask.Down,
    left: (withShift ? s : 0) | M8KeyMask.Left,
    right: (withShift ? s : 0) | M8KeyMask.Right,
  }
  const seq: number[] = []
  if (withShift) seq.push(s)
  for (const d of directions) {
    seq.push(map[d], withShift ? s : 0)
  }
  // final release
  seq.push(0)
  return seq
}

export interface ViewNavigation {
  /** Resolves true when the view is reached; false when no path is left, the step limit is hit or another navigation starts. */
  navigateToView(viewName: string): Promise<boolean>
  dispose(): void
}

export interface ViewNavigationDeps {
  store: M8Store
  runner: MacroRunner
  /** The 24 text rows of the screen, to find buttons by their label. */
  getScreenLines?: () => string[]
  /** Moves the cursor to a text grid cell. Without it, button edges are not used. */
  moveCursor?: (x: number, y: number) => Promise<void>
}

// Tried in order on a view the graph does not know (or that has no way left)
const FALLBACK_EDGES = (from: string): NavEdge[] => [
  { from, to: '', kind: 'exit', keys: [M8KeyMask.Opt, 0] },
  { from, to: '', kind: 'shift', dir: 'up', keys: [M8KeyMask.Shift | M8KeyMask.Up, 0] },
]

const edgeSignature = (e: NavEdge) => `${e.kind}:${e.dir ?? ''}:${e.keys.join(',')}:${e.cursor ? `${e.cursor.x},${e.cursor.y}` : ''}`

const withFinalRelease = (frames: number[]) => (frames[frames.length - 1] === 0 ? frames.slice() : [...frames, 0])

/** An edge of the search over (view, previous view) states. */
type StateEdge = Edge & { nav: NavEdge }
const GOAL_STATE = '#goal'
const stateId = (view: string, prev: string) => `${view}<${prev}`

const timeout = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const createViewNavigation = ({ store, runner, getScreenLines, moveCursor }: ViewNavigationDeps): ViewNavigation => {
  const viewSet = getViewNames()
  let goal: string | null = null
  let steps = 0
  let pendingResolve: ((reached: boolean) => void) | null = null
  // Bumped by every navigation, so a step of an older one stops after its cursor move
  let session = 0
  /**
   * What each edge did during this navigation: `${from}<${previous view}|${signature}` -> the view
   * it reached. A blocked edge (it changed nothing) is kept under the previous view '*': that
   * depends on what the view shows, not on where the M8 came from.
   */
  let outcomes = new Map<string, string>()
  // The view the M8 showed before the current one ('' when not known), followed at all times
  let cameFrom = ''
  let lastView = store.get('viewName') || ''
  const unsubscribeHistory = store.sub('viewName', () => {
    const view = store.get('viewName') || ''
    if (view && view !== lastView) {
      if (lastView) cameFrom = lastView
      lastView = view
    }
  })

  type Step = { from: string; prev: string; edge: NavEdge; phase: 'cursor' | 'keys' }
  let step: Step | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const resolveTarget = (name: string) => {
    const wanted = (name || '').toLowerCase().trim()
    if (!viewSet.has(wanted)) console.warn('Target not in viewlist', { goal: wanted })
    return wanted
  }

  const outcomeKey = (e: NavEdge, prev: string) => `${e.from}<${prev}|${edgeSignature(e)}`

  // The moves from `view` when the M8 came from `prev`, one per key: what this navigation saw
  // that key do, else the back edge to `prev`, else the key's other edges.
  const movesFrom = (view: string, prev: string): NavEdge[] => {
    const groups = new Map<string, NavEdge[]>()
    for (const e of getViewGraph().graph.get(view) ?? []) {
      if (e.kind === 'button' && !moveCursor) continue
      const sig = edgeSignature(e)
      groups.set(sig, [...(groups.get(sig) ?? []), e])
    }
    const moves: NavEdge[] = []
    for (const group of groups.values()) {
      if (outcomes.get(outcomeKey(group[0], '*')) === view) continue
      const seen = outcomes.get(outcomeKey(group[0], prev))
      if (seen !== undefined) {
        if (seen !== view) moves.push({ ...group[0], to: seen })
        continue
      }
      const back = group.find((e) => e.back && e.to === prev)
      if (back) {
        moves.push(back)
        continue
      }
      const others = group.filter((e) => !e.back)
      moves.push(...(others.length ? others : group))
    }
    return moves
  }

  // The (view, previous view) states reachable from the current one, with a goal node
  const stateGraph = (from: string, prev: string, target: string): Graph<StateEdge> => {
    const graph: Graph<StateEdge> = new Map([[GOAL_STATE, []]])
    const queue: [string, string][] = [[from, prev]]
    graph.set(stateId(from, prev), [])
    while (queue.length) {
      const [view, before] = queue.shift() as [string, string]
      const edges = graph.get(stateId(view, before)) as StateEdge[]
      if (view === target) {
        edges.push({ to: GOAL_STATE, weight: 0, nav: { from: view, to: view, kind: 'shift', keys: [] } })
        continue
      }
      for (const nav of movesFrom(view, before)) {
        const id = stateId(nav.to, view)
        edges.push({ to: id, weight: nav.weight, nav })
        if (!graph.has(id)) {
          graph.set(id, [])
          queue.push([nav.to, view])
        }
      }
    }
    return graph
  }

  const nextEdge = (from: string, target: string): NavEdge | null => {
    const res = aStar(stateGraph(from, cameFrom, target), stateId(from, cameFrom), GOAL_STATE)
    if (res?.edges.length) return res.edges[0].nav
    // A view without edges, or a sub-view with no way left: try to leave it. Main views get
    // no Option press (it is the mute/solo modifier there).
    const edges = getViewGraph().graph.get(from) ?? []
    if (edges.length && !edges.some((e) => e.kind === 'exit')) return null
    return FALLBACK_EDGES(from).find((e) => !outcomes.has(outcomeKey(e, cameFrom)) && !outcomes.has(outcomeKey(e, '*'))) ?? null
  }

  // Where to put the cursor for a button: the label nearest to the measured cell, else the cell
  const buttonCell = (e: NavEdge) => {
    const cell = e.cursor as { x: number; y: number }
    if (!e.label || !getScreenLines) return cell
    let best: { x: number; y: number; d: number } | null = null
    const lines = getScreenLines()
    // Skip the title rows and the track panel on the right
    for (let row = 4; row < lines.length; row++) {
      const line = (lines[row] ?? '').slice(0, 33)
      for (let i = line.indexOf(e.label); i >= 0; i = line.indexOf(e.label, i + 1)) {
        const d = Math.hypot(i - cell.x, (row - cell.y) * 1.5)
        if (!best || d < best.d) best = { x: i, y: row, d }
      }
    }
    return best ? { x: best.x, y: best.y } : cell
  }

  const cursorCovers = (cell: { x: number; y: number }) => {
    const pos = store.get('cursorPos')
    const rect = store.get('cursorRect')
    if (!pos || pos.y !== cell.y) return false
    const width = rect ? Math.max(1, Math.round(rect.w / store.get('cellMetrics').cellW)) : 1
    return cell.x >= pos.x && cell.x < pos.x + width
  }

  const complete = (reached: boolean) => {
    goal = null
    steps = 0
    step = null
    clearTimer()
    if (pendingResolve) {
      const resolve = pendingResolve
      pendingResolve = null
      resolve(reached)
    }
  }

  const finishStep = (reachedView: string) => {
    if (!step) return
    const { edge, from, prev } = step
    const moved = !!reachedView && reachedView !== from
    outcomes.set(outcomeKey(edge, moved ? prev : '*'), moved ? reachedView : from)
    step = null
    clearTimer()
    if (reachedView && reachedView !== from && edge.to && reachedView !== edge.to) {
      console.log('Navigation step landed elsewhere', { from, expected: edge.to, reached: reachedView })
    } else if (!reachedView || reachedView === from) {
      console.log('Navigation step blocked', { from, to: edge.to || '?', kind: edge.kind, dir: edge.dir })
    }
    executeNextStep()
  }

  const runButton = async (s: Step, mySession: number) => {
    const cell = buttonCell(s.edge)
    if (!cursorCovers(cell)) {
      await Promise.race([(moveCursor as NonNullable<typeof moveCursor>)(cell.x, cell.y), timeout(CURSOR_TIMEOUT_MS)])
      // Its release echo would otherwise reach the macro runner as a foreign key and cancel the macro
      await timeout(CURSOR_SETTLE_MS)
    }
    if (mySession !== session || step !== s) return
    // Never press a key on the wrong cell: on the Project view, Edit on TEMPO taps the tempo
    if (store.get('viewName') !== s.from || !cursorCovers(cell)) {
      console.warn('Navigation: button not reached', { from: s.from, to: s.edge.to, cell, cursor: store.get('cursorPos') })
      finishStep(store.get('viewName') !== s.from ? store.get('viewName') || '' : s.from)
      return
    }
    s.phase = 'keys'
    runner.cancel('navigation button')
    runner.start(withFinalRelease(s.edge.keys))
  }

  const executeNextStep = () => {
    const goalTitle = goal
    const startTitle = store.get('viewName') || ''

    if (!goalTitle) return
    if (!startTitle) {
      console.warn('Navigation aborted: no view name (a dialog?)', { goal: goalTitle })
      complete(false)
      return
    }
    if (startTitle === goalTitle) {
      console.log('Navigation complete:', { goal: goalTitle, steps })
      complete(true)
      return
    }
    if (steps >= MAX_STEPS) {
      console.warn('Navigation aborted: max steps reached', { startTitle, goalTitle, steps })
      complete(false)
      return
    }

    const edge = nextEdge(startTitle, goalTitle)
    if (!edge) {
      console.warn('No path found', { startTitle, goalTitle, step: steps })
      complete(false)
      return
    }

    steps += 1
    console.log('Navigation step', { step: steps, from: startTitle, to: edge.to || '?', kind: edge.kind, dir: edge.dir, goal: goalTitle })

    const s: Step = { from: startTitle, prev: cameFrom, edge, phase: edge.kind === 'button' ? 'cursor' : 'keys' }
    step = s
    if (edge.kind === 'button') {
      void runButton(s, session)
      return
    }
    const frames = edge.keys.length ? withFinalRelease(edge.keys) : toKeyMasks([edge.dir as Direction], { shift: true })
    runner.cancel('iterative navigation step')
    runner.start(frames)
  }

  // Once the keys of a step are played: wait for the view to change and settle, or time out
  const onChange = () => {
    if (step?.phase !== 'keys') return
    const running = store.get('macroStatus').running
    const view = store.get('viewName') || ''
    const changed = !!view && view !== step.from
    if (running && !changed) return
    clearTimer()
    if (running) {
      // The view changed but the macro still waits for an echo: the M8 does not always echo the
      // release of a key that opened another view. Release explicitly and go on.
      timer = setTimeout(() => {
        runner.cancel('navigation: no release echo')
        runner.start([0])
        finishStep(store.get('viewName') || '')
      }, STEP_TIMEOUT_MS)
      return
    }
    timer = setTimeout(() => finishStep(store.get('viewName') || ''), changed ? SETTLE_MS : STEP_TIMEOUT_MS)
  }
  const unsubscribeView = store.sub('viewName', onChange)
  const unsubscribeMacro = store.sub('macroStatus', onChange)

  return {
    navigateToView: (targetViewTitle: string): Promise<boolean> =>
      new Promise((resolve) => {
        const goalTitle = resolveTarget(targetViewTitle)
        if (!goalTitle) {
          resolve(false)
          return
        }

        // A navigation already running ends here
        complete(false)
        session += 1
        outcomes = new Map()
        pendingResolve = resolve
        goal = goalTitle
        steps = 0

        console.log('Starting iterative navigation', { goal: goalTitle, from: store.get('viewName') || 'unknown' })
        executeNextStep()
      }),
    dispose: () => {
      unsubscribeHistory()
      unsubscribeView()
      unsubscribeMacro()
      session += 1
      complete(false)
    },
  }
}
