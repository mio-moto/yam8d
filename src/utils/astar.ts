export type Direction = 'up' | 'down' | 'left' | 'right'

export type Edge = { to: string; dir: Direction }
export type Graph = Map<string, Edge[]>

export type Heuristic = (a: string, b: string) => number

const zeroHeuristic: Heuristic = () => 0

export interface PathResult {
  pages: string[] // includes start and goal
  directions: Direction[] // one per step
  cost: number // number of steps
}

export function aStar(graph: Graph, start: string, goal: string, heuristic: Heuristic = zeroHeuristic): PathResult | null {
  const s = start.trim()
  const g = goal.trim()
  if (!graph.has(s) || !graph.has(g)) return null

  const openSet = new Set<string>([s])
  const cameFrom = new Map<string, { prev: string; viaDir: Direction }>()
  const gScore = new Map<string, number>()
  const fScore = new Map<string, number>()

  for (const node of graph.keys()) {
    gScore.set(node, Infinity)
    fScore.set(node, Infinity)
  }
  gScore.set(s, 0)
  fScore.set(s, heuristic(s, g))

  function lowestF(): string | null {
    let best: string | null = null
    let bestVal = Infinity
    for (const node of openSet) {
      const val = fScore.get(node) ?? Infinity
      if (val < bestVal) {
        bestVal = val
        best = node
      }
    }
    return best
  }

  while (openSet.size) {
    const current = lowestF()
    if (!current) break
    if (current === g) {
      // reconstruct
      const pages: string[] = [g]
      const dirs: Direction[] = []
      let cur = g
      while (cur !== s) {
        const link = cameFrom.get(cur)
        if (!link) break // safety
        dirs.unshift(link.viaDir)
        pages.unshift(link.prev)
        cur = link.prev
      }
      return { pages, directions: dirs, cost: dirs.length }
    }
    openSet.delete(current)
    const neighbors: Edge[] = graph.get(current) ?? []
    for (const e of neighbors) {
      const tentativeG = (gScore.get(current) ?? Infinity) + 1
      if (tentativeG < (gScore.get(e.to) ?? Infinity)) {
        cameFrom.set(e.to, { prev: current, viaDir: e.dir })
        gScore.set(e.to, tentativeG)
        fScore.set(e.to, tentativeG + heuristic(e.to, g))
        if (!openSet.has(e.to)) openSet.add(e.to)
      }
    }
  }

  return null
}
