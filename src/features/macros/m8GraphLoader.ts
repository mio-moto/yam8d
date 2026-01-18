import type { Edge } from './m8Graph'

let loadedGraph: Map<string, Edge[]> | null = null
let loadedViewList: Set<string> | null = null

export const loadM8GraphJson = async (): Promise<Map<string, Edge[]>> => {
    try {
        const base = (import.meta as unknown as { env: { BASE_URL?: string } }).env?.BASE_URL || '/'
        const url = `${base}m8Graph.generated.json`
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: Record<string, Edge[]> = await res.json()
        const map = new Map<string, Edge[]>()
        for (const [k, v] of Object.entries(json)) map.set(k.toLowerCase(), v.slice())
        loadedGraph = map
        return map
    } catch (_e) {
        // No JSON available yet; keep null to allow runtime discovery fallback
        loadedGraph = null
        return new Map<string, Edge[]>()
    }
}

export const getLoadedGraph = () => loadedGraph

export const loadViewList = async (): Promise<Set<string>> => {
    try {
        const base = (import.meta as unknown as { env: { BASE_URL?: string } }).env?.BASE_URL || '/'
        const url = `${base}viewlist.txt`
        const res = await fetch(url, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        const set = new Set<string>()
        text
            .split(/\r?\n/)
            .map((s) => s.trim().toLowerCase())
            .filter((s) => !!s)
            .forEach((s) => {
                set.add(s)
            })
        loadedViewList = set
        return set
    } catch (_e) {
        loadedViewList = null
        return new Set<string>()
    }
}

export const getLoadedViewList = () => loadedViewList
