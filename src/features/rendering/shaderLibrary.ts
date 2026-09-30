// The user's saved background shaders, persisted in localStorage. This module is the
// only place that knows the storage key/format: the editor, the VJ numpad and the
// screen renderer all go through it.

export type SavedBackgroundShader = {
    id: string
    name: string
    source: string
    compositeM8Screen: boolean
    videoUrl?: string
    updatedAt: number
}

export const WEBCAM_VIDEO_SOURCE = 'webcam://default'

const STORAGE_KEY = 'M8savedBackgroundShaders'

export type StoredShaderLibrary =
    | { kind: 'missing' }
    | { kind: 'corrupt' }
    | { kind: 'ok'; shaders: SavedBackgroundShader[] }

/** Reads the library, telling "nothing stored yet" apart from unreadable data. */
export const readShaderLibrary = (): StoredShaderLibrary => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { kind: 'missing' }
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? { kind: 'ok', shaders: parsed as SavedBackgroundShader[] } : { kind: 'corrupt' }
    } catch {
        return { kind: 'corrupt' }
    }
}

/** Saved shaders, or an empty list when nothing usable is stored. */
export const loadSavedShaders = (): SavedBackgroundShader[] => {
    const stored = readShaderLibrary()
    return stored.kind === 'ok' ? stored.shaders : []
}

export const findSavedShaderById = (id: string): SavedBackgroundShader | null =>
    loadSavedShaders().find((shader) => shader.id === id) ?? null

export const writeShaderLibrary = (shaders: SavedBackgroundShader[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shaders))
}

export const findMatchingSavedShader = (
    savedShaders: SavedBackgroundShader[],
    source: string,
    compositeM8Screen: boolean,
): SavedBackgroundShader | null =>
    savedShaders.find((shader) => shader.source === source && (shader.compositeM8Screen ?? true) === compositeM8Screen) ?? null

export const createUniqueShaderName = (requestedName: string, savedShaders: SavedBackgroundShader[]): string => {
    const baseName = requestedName.trim()
    const fallbackName = baseName || `Shader ${savedShaders.length + 1}`
    const existingNames = new Set(savedShaders.map((shader) => shader.name))
    if (!existingNames.has(fallbackName)) return fallbackName

    let copyIndex = 1
    let candidate = `${fallbackName} copy`
    while (existingNames.has(candidate)) {
        copyIndex += 1
        candidate = `${fallbackName} copy ${copyIndex}`
    }
    return candidate
}
