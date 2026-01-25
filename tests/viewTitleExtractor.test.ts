import { describe, expect, it } from 'bun:test'
import { createEventBus } from '../src/features/eventBus'
import type { CharacterCommand, KeyCommand, RectCommand, SystemCommand, WaveCommand } from '../src/features/connection/protocol'
import { registerViewExtractor } from '../src/features/state/viewExtractor'
import { getDefaultStore } from 'jotai'
import { viewNameAtom, viewTitleAtom, cellMetricsAtom, fontModeAtom, deviceModelAtom } from '../src/features/state/viewStore'

function makeBus() {
    const eventBus = createEventBus<{
        rect: (data: RectCommand) => void
        text: (data: CharacterCommand) => void
        wave: (data: WaveCommand) => void
        key: (data: KeyCommand) => void
        system: (data: SystemCommand) => void
        systemInfo: (data: { model: SystemCommand['model']; fontMode: SystemCommand['fontMode']; spacingX: number; spacingY: number; offX: number; offY: number }) => void
        any: (data: Uint8Array<ArrayBufferLike>) => void
    }>()

    // Provide dummy commands and reader to satisfy type requirements
    const protocol = {
        eventBus,
        getSystemInfos: () => ({ model: 'M8 Model:02' as const, fontMode: 0 as 0 | 1 | 2, spacingX: 12, spacingY: 14, offX: 0, offY: 0 }),
        getSystemInfo: () => ({ model: 'M8 Model:02' as const, version: 'v0.0.0', fontMode: 0 as 0 | 1 | 2 }),
        dispatch: () => { },
    }

    const commands = {}
    const reader = {
        on: () => { },
        off: () => { },
        // Add any other minimal stubs if needed by type
        pause: () => { },
        resume: () => { },
        destroy: () => { },
    }

    // Return an object with a protocol property, matching ConnectedBus shape
    return { protocol, commands, reader } as unknown as Parameters<typeof registerViewExtractor>[0]
}

const emitChar = (bus: ReturnType<typeof makeBus>, ch: string, x: number, y: number) => {
    const cmd: CharacterCommand = {
        character: ch,
        pos: { x, y },
        foreground: { r: 255, g: 255, b: 255 },
        background: { r: 0, g: 0, b: 0 },
    }
    bus?.protocol.eventBus.emit('text', cmd)
}

describe('AssemblyViewNameExtractor', () => {
    it('early-accepts SONG from partial characters', async () => {
        const bus = makeBus()
        const dispose = registerViewExtractor(bus)
        const store = getDefaultStore()

        // Ensure small font metrics (row 3)
        store.set(fontModeAtom, 0)
        store.set(deviceModelAtom, 'M8 Model:02')
        store.set(cellMetricsAtom, { cellW: 12, cellH: 14, offX: 0, offY: 0 })

        // Emit S O N on row 3 at columns 0,1,2,3 (pixels = col*12, row*14)
        const row = 3
        emitChar(bus, 'S', 0 * 12, row * 14)
        emitChar(bus, 'O', 1 * 12, row * 14)
        emitChar(bus, 'N', 2 * 12, row * 14)
        emitChar(bus, 'G', 3 * 12, row * 14)

        // Give a tiny time for setTimeout(50) stabilization
        await new Promise((r) => setTimeout(r, 60))

        const name = store.get(viewNameAtom)
        expect(name).toBeDefined()
        // Accepts lowercase normalized title
        expect(name).toBe('song')

        dispose()
    })

    it('normalizes trailing hex tokens', async () => {
        const bus = makeBus()
        const dispose = registerViewExtractor(bus)
        const store = getDefaultStore()
        store.set(fontModeAtom, 0)
        store.set(deviceModelAtom, 'M8 Model:02')
        store.set(cellMetricsAtom, { cellW: 12, cellH: 14, offX: 0, offY: 0 })

        const row = 3
        const title = 'CHAIN 0B*'
        for (let i = 0; i < title.length; i++) {
            emitChar(bus, title.charAt(i), i * 12, row * 14)
        }

        await new Promise((r) => setTimeout(r, 60))

        expect(store.get(viewTitleAtom)?.startsWith('CHAIN')).toBe(true)
        expect(store.get(viewNameAtom)).toBe('chain')

        dispose()
    })
})
