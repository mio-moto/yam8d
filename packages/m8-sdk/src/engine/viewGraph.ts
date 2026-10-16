// The M8 view graph used to navigate between views, and the list of view names. Both are
// bundled copies of yam8d's public/m8Graph.generated.json and public/viewlist.json (a yam8d
// test keeps them identical).

import type { Edge, Graph } from './astar'
import graphJson from './data/m8Graph.generated.json'
import viewListJson from './data/viewlist.json'

type EdgeJson = { to: string; dir?: 'up' | 'down' | 'left' | 'right'; keys?: number[]; weight?: number }

export interface M8ViewGraph {
  graph: Graph
  /** Explicit key frame sequences per edge: from -> to -> frames. */
  edgeKeys: Map<string, Map<string, number[]>>
}

const buildGraph = (json: Record<string, EdgeJson[]>): M8ViewGraph => {
  const graph: Graph = new Map()
  const edgeKeys = new Map<string, Map<string, number[]>>()
  for (const [rawKey, list] of Object.entries(json)) {
    const from = rawKey.toLowerCase()
    const edges: Edge[] = []
    const perFrom = new Map<string, number[]>()
    for (const e of list) {
      // Keep the direction for A*
      if (e.dir) edges.push({ to: e.to, dir: e.dir, weight: e.weight })
      if (e.keys?.length) perFrom.set(e.to, e.keys.slice())
    }
    graph.set(from, edges)
    if (perFrom.size) edgeKeys.set(from, perFrom)
  }
  return { graph, edgeKeys }
}

let viewGraph: M8ViewGraph | null = null
let viewNames: Set<string> | null = null

export const getViewGraph = (): M8ViewGraph => {
  viewGraph ??= buildGraph(graphJson as Record<string, EdgeJson[]>)
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
