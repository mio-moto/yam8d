import type { Edge } from './m8Graph'

type EdgeJson = { to: string; dir?: 'up' | 'down' | 'left' | 'right'; keys?: number[]; weight?: number }

let loadedGraph: Map<string, Edge[]> | null = null
let loadedViewList: Set<string> | null = null
// Optional per-edge key sequences (from -> to -> frames)
let loadedEdgeKeys: Map<string, Map<string, number[]>> | null = null

export const loadM8GraphJson = async (): Promise<Map<string, Edge[]>> => {
    try {
        const base = (import.meta as unknown as { env: { BASE_URL?: string } }).env?.BASE_URL || '/'
        const url = `${base}m8Graph.generated.json`
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: Record<string, EdgeJson[]> = await res.json()
        const map = new Map<string, Edge[]>()
        const keyMap = new Map<string, Map<string, number[]>>()
        for (const [rawKey, list] of Object.entries(json)) {
            const k = rawKey.toLowerCase()
            const edges: Edge[] = []
            const perFrom = new Map<string, number[]>()
            for (const e of list) {
                // Preserve direction for A*
                if (e.dir) edges.push({ to: e.to, dir: e.dir, weight: e.weight })
                // Capture explicit key sequences if present
                if (e.keys?.length) perFrom.set(e.to, e.keys.slice())
            }
            map.set(k, edges)
            if (perFrom.size) keyMap.set(k, perFrom)
        }
        loadedGraph = map
        loadedEdgeKeys = keyMap
        return map
    } catch (_e) {
        // No JSON available yet; keep null to allow runtime discovery fallback
        loadedGraph = null
        loadedEdgeKeys = null
        return new Map<string, Edge[]>()
    }
}

export const getLoadedGraph = () => loadedGraph
export const getLoadedEdgeKeys = () => loadedEdgeKeys

export const loadViewList = async (): Promise<Set<string>> => {
    const base = (import.meta as unknown as { env: { BASE_URL?: string } }).env?.BASE_URL || '/'
    try {
        const url = `${base}viewlist.json`
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { views: string[] }
        const list: string[] = Array.isArray(json.views) ? json.views : []
        const set = new Set<string>()
        list
            .map((s) => String(s).trim().toLowerCase())
            .filter((s) => !!s)
            .forEach((s) => { set.add(s) })
        loadedViewList = set
        return set
    } catch (_e) {
        loadedViewList = null
        return new Set<string>()
    }
}

export const getLoadedViewList = () => loadedViewList
