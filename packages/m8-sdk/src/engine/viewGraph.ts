// The M8 view graph used to navigate between views, and the list of view names. Both are
// bundled copies of yam8d's public/m8Graph.generated.json and public/viewlist.json (a yam8d
// test keeps them identical).
//
// Edges come in three kinds:
// - shift: Shift+direction (`dir`), the views of the main grid.
// - button: put the cursor on a cell of the screen (`cursor`, moved to the nearest place
//   where `label` is written when it is on screen), then press `keys`. Sub-views such as
//   MIDI Settings or the Mixer EQ sit behind buttons.
// - exit: Option, which leaves a sub-view. Where it lands is not always known, so the
//   navigation checks the view after each step.
//
// Some keys go back to the view the M8 came from (`back`): the Mixer's Shift+Up, the
// Instrument's Shift+Left after the Instrument Pool. Among the edges of one key, a `back` edge
// is taken only when its target is the previous view; otherwise the other edges stand.

import type { Direction, Edge, Graph } from './astar'
import graphJson from './data/m8Graph.generated.json'
import viewListJson from './data/viewlist.json'

type EdgeJson = {
  to: string
  dir?: Direction
  via?: 'button' | 'exit'
  cursor?: [number, number]
  label?: string
  keys?: number[]
  weight?: number
  back?: boolean
}

export type NavEdgeKind = 'shift' | 'button' | 'exit'

export interface NavEdge extends Edge {
  from: string
  kind: NavEdgeKind
  /** Key frames to play (after the cursor move, for buttons). Empty: Shift+dir. */
  keys: number[]
  /** Button cell, in text grid coordinates. */
  cursor?: { x: number; y: number }
  /** Button text, used to find the button where the layout differs from `cursor`. */
  label?: string
  /** Where this key goes when the M8 came from `to` (it goes back). */
  back?: boolean
}

export interface M8ViewGraph {
  graph: Graph<NavEdge>
  /** Explicit key frame sequences per edge: from -> to -> frames. */
  edgeKeys: Map<string, Map<string, number[]>>
}

const buildGraph = (json: Record<string, EdgeJson[]>): M8ViewGraph => {
  const graph: Graph<NavEdge> = new Map()
  const edgeKeys = new Map<string, Map<string, number[]>>()
  for (const [rawKey, list] of Object.entries(json)) {
    const from = rawKey.toLowerCase()
    const edges: NavEdge[] = []
    const perFrom = new Map<string, number[]>()
    for (const e of list) {
      const kind: NavEdgeKind = e.via ?? 'shift'
      if (kind === 'shift' && !e.dir) continue
      if (kind === 'button' && !e.cursor) continue
      const keys = e.keys?.slice() ?? []
      edges.push({
        from,
        to: e.to.toLowerCase(),
        dir: e.dir,
        weight: e.weight,
        kind,
        keys,
        cursor: e.cursor ? { x: e.cursor[0], y: e.cursor[1] } : undefined,
        label: e.label,
        back: e.back,
      })
      if (kind === 'shift' && keys.length) perFrom.set(e.to, keys)
    }
    graph.set(from, edges)
    if (perFrom.size) edgeKeys.set(from, perFrom)
  }
  // Views that are only targets still need a node
  for (const edges of [...graph.values()]) {
    for (const e of edges) if (!graph.has(e.to)) graph.set(e.to, [])
  }
  return { graph, edgeKeys }
}

let viewGraph: M8ViewGraph | null = null
let viewNames: Set<string> | null = null

export const getViewGraph = (): M8ViewGraph => {
  viewGraph ??= buildGraph(graphJson as unknown as Record<string, EdgeJson[]>)
  return viewGraph
}

/** Names of the M8 views, lowercased (as viewName reports them). */
export const getViewNames = (): Set<string> => {
  if (!viewNames) {
    const list = Array.isArray((viewListJson as { views?: unknown }).views) ? (viewListJson as { views: unknown[] }).views : []
    viewNames = new Set(list.map((s) => String(s).trim().toLowerCase()).filter((s) => !!s))
  }
  return viewNames
}
