export type Direction = 'up' | 'down' | 'left' | 'right'

export type Edge = { to: string; dir: Direction; keys?: number[]; weight?: number }
export type Graph = Map<string, Edge[]>

export type Heuristic = (a: string, b: string) => number
export type EdgeCostFn = (from: string, to: string, dir: Direction) => number

const zeroHeuristic: Heuristic = () => 0

// Default edge cost function: uniform cost for all edges
// Edge-specific weights should be defined in the graph JSON file
const defaultEdgeCost: EdgeCostFn = () => 1

export interface PathResult {
    pages: string[] // includes start and goal
    directions: Direction[] // one per step
    // Concatenated key frames for the full path (if available on edges)
    frames: number[]
    cost: number // number of steps
}

export function aStar(graph: Graph, start: string, goal: string, heuristic: Heuristic = zeroHeuristic, edgeCost: EdgeCostFn = defaultEdgeCost): PathResult | null {
    const s = start.trim()
    const g = goal.trim()
    if (!graph.has(s) || !graph.has(g)) return null

    const openSet = new Set<string>([s])
    const cameFrom = new Map<string, { prev: string; viaDir: Direction; viaKeys?: number[] }>()
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
            const frames: number[] = []
            let cur = g
            while (cur !== s) {
                const link = cameFrom.get(cur)
                if (!link) break // safety
                dirs.unshift(link.viaDir)
                pages.unshift(link.prev)
                // keys are aggregated after loop by inspecting edges between pages
                cur = link.prev
            }
            // Build frames by walking pages forward and using edge keys when present
            if (pages.length > 1) {
                for (let i = 0; i < pages.length - 1; i += 1) {
                    const from = pages[i]
                    const to = pages[i + 1]
                    const neighbors: Edge[] = graph.get(from) ?? []
                    const e = neighbors.find((n) => n.to === to)
                    if (e?.keys?.length) frames.push(...e.keys)
                }
            }
            return { pages, directions: dirs, frames, cost: dirs.length }
        }
        openSet.delete(current)
        const neighbors: Edge[] = graph.get(current) ?? []
        for (const e of neighbors) {
            const cost = e.weight ?? edgeCost(current, e.to, e.dir)
            const tentativeG = (gScore.get(current) ?? Infinity) + cost
            if (tentativeG < (gScore.get(e.to) ?? Infinity)) {
                cameFrom.set(e.to, { prev: current, viaDir: e.dir, viaKeys: e.keys })
                gScore.set(e.to, tentativeG)
                fScore.set(e.to, tentativeG + heuristic(e.to, g))
                if (!openSet.has(e.to)) openSet.add(e.to)
            }
        }
    }

    return null
}
