// Navigates between M8 views by name: finds a path in the view graph with A*, plays the
// first edge's key frames with the macro runner, and recomputes after each view change
// until the goal is reached (or MAX_STEPS edges were taken).

import { aStar, type Direction } from './astar'
import { M8KeyMask } from './keys'
import type { MacroRunner } from './macroRunner'
import type { M8Store } from './store'
import { getViewGraph, getViewNames } from './viewGraph'

const MAX_STEPS = 20 // Safety limit to prevent infinite loops

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
  /** Resolves when the view is reached, no path is found, or the step limit is hit. */
  navigateToView(viewName: string): Promise<void>
  dispose(): void
}

export const createViewNavigation = ({ store, runner }: { store: M8Store; runner: MacroRunner }): ViewNavigation => {
  const viewSet = getViewNames()
  let goal: string | null = null
  let steps = 0
  let pendingResolve: (() => void) | null = null

  const resolveTarget = (name: string) => {
    const wanted = (name || '').toLowerCase()
    if (viewSet.has(wanted)) return wanted
    for (const v of viewSet) {
      if (v.toLowerCase() === wanted) return v
    }
    console.warn('Target not in viewlist', { goal: wanted })
    return wanted
  }

  // The view name of a graph node: the longest view name the node id starts with
  const titleOfNode = (nodeId: string) => {
    const id = (nodeId || '').toLowerCase()
    let pick = ''
    for (const name of viewSet) {
      if (id.startsWith(name) && name.length > pick.length) pick = name
    }
    return pick
  }

  // Shortest path among all nodes of the current view and all nodes of the target view
  const buildTitlePath = (targetTitle: string) => {
    const { graph } = getViewGraph()
    const viewName = store.get('viewName') || ''
    const starts: string[] = []
    const goals: string[] = []
    for (const node of graph.keys()) {
      const t = titleOfNode(node)
      if (!t) continue
      if (t === viewName) starts.push(node)
      if (t === targetTitle) goals.push(node)
    }
    if (!goals.length) return null

    // Unknown current view: one Shift+Up step to get back to a known view
    if (!starts.length) {
      return { pages: ['unknown', 'fallback'], directions: ['up'] as Direction[], cost: 1 }
    }

    let best: { pages: string[]; directions: Direction[]; cost: number } | null = null
    for (const s of starts) {
      for (const g of goals) {
        const res = aStar(graph, s, g)
        if (res && (!best || res.cost < best.cost)) best = res
      }
    }
    return best
  }

  const framesForEdge = (from: string, to: string, dir: Direction) => {
    const frames = getViewGraph().edgeKeys.get(from.toLowerCase())?.get(to)
    if (frames?.length) {
      // Ensure final release present
      return frames[frames.length - 1] === 0 ? frames.slice() : [...frames, 0]
    }
    return toKeyMasks([dir], { shift: true })
  }

  const complete = () => {
    goal = null
    steps = 0
    if (pendingResolve) {
      const resolve = pendingResolve
      pendingResolve = null
      resolve()
    }
  }

  const executeNextStep = () => {
    const goalTitle = goal
    const startTitle = store.get('viewName') || ''

    if (!goalTitle || !startTitle) {
      complete()
      return
    }

    if (startTitle === goalTitle) {
      console.log('Navigation complete:', { goal: goalTitle, steps })
      complete()
      return
    }

    if (steps >= MAX_STEPS) {
      console.warn('Navigation aborted: max steps reached', { startTitle, goalTitle, steps })
      complete()
      return
    }

    const res = buildTitlePath(goalTitle)
    if (!res) {
      console.warn('No path found (iterative)', { startTitle, goalTitle, step: steps })
      complete()
      return
    }

    // Take only the first edge; the path is recomputed once the view has changed
    if (res.pages.length > 1) {
      const from = res.pages[0]
      const to = res.pages[1]
      const dir = res.directions[0]
      const frames = framesForEdge(from, to, dir)

      steps += 1
      console.log('Navigation step', { step: steps, from: startTitle, to: titleOfNode(to), dir, goal: goalTitle, frames })

      runner.cancel('iterative navigation step')
      runner.start(frames)
    }
  }

  // After a view change or the end of a macro, take the next step
  const onChange = () => {
    if (goal && store.get('viewName') && !store.get('macroStatus').running) executeNextStep()
  }
  const unsubscribeView = store.sub('viewName', onChange)
  const unsubscribeMacro = store.sub('macroStatus', onChange)

  return {
    navigateToView: (targetViewTitle: string): Promise<void> =>
      new Promise((resolve) => {
        const goalTitle = resolveTarget(targetViewTitle)
        if (!goalTitle) {
          resolve()
          return
        }

        // Resolve any pending navigation first
        pendingResolve?.()
        pendingResolve = resolve

        goal = goalTitle
        steps = 0

        console.log('Starting iterative navigation', { goal: goalTitle, from: store.get('viewName') || 'unknown' })
        executeNextStep()
      }),
    dispose: () => {
      unsubscribeView()
      unsubscribeMacro()
      complete()
    },
  }
}
