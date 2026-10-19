import { describe, expect, it } from 'bun:test'
import type { EngineBus } from '../packages/m8-sdk/src/engine/bus'
import { createM8Engine } from '../packages/m8-sdk/src/engine/engine'
import { createEventBus } from '../packages/m8-sdk/src/engine/eventBus'
import { M8KeyMask } from '../packages/m8-sdk/src/engine/keys'
import type { ProtocolEvents } from '../packages/m8-sdk/src/engine/protocol'
import type { M8HostEvents } from '../packages/m8-sdk/src/types'
import sdkGraph from '../packages/m8-sdk/src/engine/data/m8Graph.generated.json'
import sdkViewList from '../packages/m8-sdk/src/engine/data/viewlist.json'
import publicGraph from '../public/m8Graph.generated.json'
import publicViewList from '../public/viewlist.json'

// The engine on a fake bus: draw commands in, SDK events and key frames out.

const makeBus = () => {
    const sent: number[] = []
    const bus: EngineBus = {
        protocol: { eventBus: createEventBus<ProtocolEvents>() },
        commands: {
            sendKeys: (keys: number) => {
                sent.push(keys)
            },
            resetScreen: () => {},
        },
    }
    const white = { r: 255, g: 255, b: 255 }
    const black = { r: 0, g: 0, b: 0 }
    const writeRow = (row: number, text: string) => {
        for (let i = 0; i < text.length; i++) {
            bus.protocol.eventBus.emit('text', { character: text[i], pos: { x: i * 12, y: row * 14 }, foreground: white, background: black })
        }
    }
    const echo = (keys: number) => bus.protocol.eventBus.emit('key', { keys })
    return { bus, sent, writeRow, echo }
}

const collect = <K extends keyof M8HostEvents>(engine: ReturnType<typeof createM8Engine>, event: K) => {
    const events: M8HostEvents[K][] = []
    engine.on(event, (payload) => events.push(payload))
    return events
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

describe('M8 engine', () => {
    it('reports the view title once it is stable, and the whole screen', async () => {
        const { bus, writeRow } = makeBus()
        const engine = createM8Engine(bus)
        const views = collect(engine, 'viewChanged')

        writeRow(3, 'CHAIN 0B*')
        writeRow(6, '00 01 02')
        await tick(60)

        expect(views.at(-1)).toEqual({ viewName: 'chain', viewTitle: expect.stringContaining('CHAIN') })
        // One event per distinct title, not one per character
        expect(new Set(views.map((v) => v.viewName)).size).toBe(views.length)

        const screen = await engine.methods.getScreen()
        expect(screen.lines[3]).toBe('CHAIN 0B*')
        expect(screen.lines[6]).toBe('00 01 02')
        expect(engine.getState().viewName).toBe('chain')
        engine.dispose()
    })

    it('sends key presses as a mask then a release', async () => {
        const { bus, sent } = makeBus()
        const engine = createM8Engine(bus)
        await engine.methods.sendKeyPress(['shift', 'down'])
        expect(sent).toEqual([M8KeyMask.Shift | M8KeyMask.Down, 0])
        engine.dispose()
    })

    it('plays a macro one frame per key echo and reports its progress', async () => {
        const { bus, sent, echo } = makeBus()
        const engine = createM8Engine(bus)
        const states = collect(engine, 'stateChanged')

        engine.macro.start([M8KeyMask.Shift, M8KeyMask.Shift | M8KeyMask.Right, 0])
        expect(sent).toEqual([M8KeyMask.Shift])
        expect(engine.store.get('macroStatus').running).toBe(true)

        echo(M8KeyMask.Shift)
        echo(M8KeyMask.Shift | M8KeyMask.Right)
        echo(0)
        expect(sent).toEqual([M8KeyMask.Shift, M8KeyMask.Shift | M8KeyMask.Right, 0])
        expect(engine.macro.running).toBe(false)
        expect(engine.store.get('macroStatus')).toEqual({ running: false })

        await tick()
        expect(states.at(-1)?.macroRunning).toBe(false)
        engine.dispose()
    })

    it('cancels a macro when an unexpected key echo arrives', () => {
        const { bus, sent, echo } = makeBus()
        const engine = createM8Engine(bus)

        engine.macro.start([M8KeyMask.Up, 0])
        echo(M8KeyMask.Edit) // someone pressed Edit on the device
        expect(engine.macro.running).toBe(false)
        // Up was down: the cancel releases it
        expect(sent).toEqual([M8KeyMask.Up, 0])
        engine.dispose()
    })

    it('navigates to a view along the graph and resolves when it is reached', async () => {
        const { bus, sent, writeRow, echo } = makeBus()
        const engine = createM8Engine(bus)
        writeRow(3, 'SONG')
        await tick(60)
        expect(engine.store.get('viewName')).toBe('song')

        let done = false
        const navigation = engine.methods.navigateToView('chain').then((ok) => {
            done = ok
        })
        // Song -> Chain is Shift+Right in the graph
        expect(sent).toEqual([M8KeyMask.Shift | M8KeyMask.Right])
        echo(M8KeyMask.Shift | M8KeyMask.Right)
        expect(sent.at(-1)).toBe(0)
        // As on the device: the new view is drawn (rows below the title end it) before the
        // release is echoed, which goes out at least one 20 ms command slot later
        writeRow(3, 'CHAIN 00')
        writeRow(6, '00 --')
        echo(0)

        await navigation
        expect(done).toBe(true)
        expect(engine.store.get('viewName')).toBe('chain')
        engine.dispose()
    })
})

describe('bundled view data', () => {
    it('matches the copies yam8d serves from public/', () => {
        expect(sdkGraph).toEqual(publicGraph)
        expect(sdkViewList).toEqual(publicViewList)
    })
})
