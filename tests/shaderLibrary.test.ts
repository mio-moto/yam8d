import { beforeEach, describe, expect, it } from 'bun:test'
import {
    createUniqueShaderName,
    findMatchingSavedShader,
    findSavedShaderById,
    loadSavedShaders,
    readShaderLibrary,
    type SavedBackgroundShader,
    writeShaderLibrary,
} from '../src/features/rendering/shaderLibrary'

const memoryStorage = () => {
    const data = new Map<string, string>()
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
        raw: data,
    }
}

const shader = (id: string, name: string, source = `src-${id}`, compositeM8Screen = true): SavedBackgroundShader => ({
    id,
    name,
    source,
    compositeM8Screen,
    updatedAt: 1,
})

let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
    storage = memoryStorage()
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = storage
})

describe('shader library storage', () => {
    it('reports a never-written library as missing and loads it as empty', () => {
        expect(readShaderLibrary()).toEqual({ kind: 'missing' })
        expect(loadSavedShaders()).toEqual([])
        expect(findSavedShaderById('a')).toBeNull()
    })

    it('round-trips saved shaders', () => {
        const shaders = [shader('a', 'A'), shader('b', 'B')]
        writeShaderLibrary(shaders)
        expect(readShaderLibrary()).toEqual({ kind: 'ok', shaders })
        expect(findSavedShaderById('b')?.name).toBe('B')
        expect(findSavedShaderById('nope')).toBeNull()
    })

    it('tells unreadable data apart from a missing library', () => {
        for (const key of Array.from(storage.raw.keys())) storage.removeItem(key)
        storage.setItem('M8savedBackgroundShaders', '{not json')
        expect(readShaderLibrary()).toEqual({ kind: 'corrupt' })
        expect(loadSavedShaders()).toEqual([])

        storage.setItem('M8savedBackgroundShaders', '{"id":"a"}')
        expect(readShaderLibrary()).toEqual({ kind: 'corrupt' })
    })

    it('keeps an emptied library distinct from a missing one', () => {
        writeShaderLibrary([])
        expect(readShaderLibrary()).toEqual({ kind: 'ok', shaders: [] })
    })
})

describe('shader library helpers', () => {
    it('matches shaders by source and composite flag, defaulting composite to true', () => {
        const legacy = { ...shader('a', 'A', 'code'), compositeM8Screen: undefined as unknown as boolean }
        const list = [legacy, shader('b', 'B', 'code', false)]
        expect(findMatchingSavedShader(list, 'code', true)?.id).toBe('a')
        expect(findMatchingSavedShader(list, 'code', false)?.id).toBe('b')
        expect(findMatchingSavedShader(list, 'other', true)).toBeNull()
    })

    it('creates unique names with copy suffixes', () => {
        const list = [shader('a', 'Glow'), shader('b', 'Glow copy')]
        expect(createUniqueShaderName('Fresh', list)).toBe('Fresh')
        expect(createUniqueShaderName('Glow', list)).toBe('Glow copy 2')
        expect(createUniqueShaderName('  ', list)).toBe('Shader 3')
    })
})
