// Names of the M8 views (lowercased), loaded from public/viewlist.json.

let loadedViewList: Set<string> | null = null

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
