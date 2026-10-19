// View navigation against a fake M8: a table of what each key does on each view, a cursor that
// jumps where it is sent, and a macro runner that plays the frames a few ms later.

import { describe, expect, it } from 'bun:test'
import { M8KeyMask } from '../packages/m8-sdk/src/engine/keys'
import type { MacroRunner } from '../packages/m8-sdk/src/engine/macroRunner'
import { createM8Store } from '../packages/m8-sdk/src/engine/store'
import { getViewGraph } from '../packages/m8-sdk/src/engine/viewGraph'
import { createViewNavigation } from '../packages/m8-sdk/src/engine/viewNavigation'

type Keys = Record<string, string | ((at: { x: number; y: number } | null, prev: string) => string | null)>

const keyName = (frame: number) => {
    const parts: string[] = []
    if (frame & M8KeyMask.Shift) parts.push('shift')
    if (frame & M8KeyMask.Opt) parts.push('opt')
    if (frame & M8KeyMask.Edit) parts.push('edit')
    if (frame & M8KeyMask.Up) parts.push('up')
    if (frame & M8KeyMask.Down) parts.push('down')
    if (frame & M8KeyMask.Left) parts.push('left')
    if (frame & M8KeyMask.Right) parts.push('right')
    return parts.join('+')
}

/**
 * `device[view][key]` is the view a key press leads to (a function gets the cursor cell);
 * keys that are missing change nothing. `screens[view]` are the text rows of a view.
 * `cursorStuck` makes cursor moves fail.
 */
const fakeM8 = (
    start: string,
    device: Record<string, Keys>,
    opts: { screens?: Record<string, string[]>; cursorStuck?: boolean; noReleaseEcho?: boolean } = {},
) => {
    const store = createM8Store()
    store.set('viewName', start)
    const pressed: string[] = []
    let cursor: { x: number; y: number } | null = null
    let running = false
    let prevView = ''

    const press = (key: string) => {
        pressed.push(cursor && key === 'edit' ? `edit@${cursor.x},${cursor.y}` : key)
        const view = store.get('viewName') ?? ''
        const action = device[view]?.[key]
        const next = typeof action === 'function' ? action(cursor, prevView) : action
        if (next && next !== view) {
            cursor = null
            prevView = view
            store.set('viewName', next)
        }
    }

    const runner: MacroRunner = {
        start: (frames) => {
            running = true
            store.set('macroStatus', { running: true, currentStep: 0, sequenceLength: frames.length })
            const viewBefore = store.get('viewName')
            setTimeout(() => {
                // A key press is each frame that adds a key to the previous one
                let prev = 0
                for (const f of frames) {
                    if (f && f & ~prev && f !== M8KeyMask.Shift) press(keyName(f))
                    prev = f
                }
                // The M8 does not always echo the release of a key that opened another view
                if (opts.noReleaseEcho && store.get('viewName') !== viewBefore) return
                running = false
                store.set('macroStatus', { running: false })
            }, 5)
        },
        cancel: () => {},
        get running() {
            return running
        },
        dispose: () => {},
    }

    const navigation = createViewNavigation({
        store,
        runner,
        getScreenLines: () => opts.screens?.[store.get('viewName') ?? ''] ?? [],
        moveCursor: async (x, y) => {
            if (opts.cursorStuck) return
            cursor = { x, y }
            store.set('cursorPos', { x, y })
            store.set('cursorRect', { x: x * 12, y: y * 14, w: 12 * 8, h: 14 })
        },
    })
    return { store, navigation, pressed }
}

const at = (x: number, y: number, view: string) => (c: { x: number; y: number } | null) => (c?.x === x && c?.y === y ? view : null)

// The main views, as the graph has them (Mixer's Shift+Up goes back to the last view)
const MAIN: Record<string, Keys> = {
    song: { 'shift+up': 'project', 'shift+right': 'chain', 'shift+down': 'mixer' },
    project: { 'shift+down': 'chain', edit: at(14, 17, 'instrumentpool') },
    chain: { 'shift+right': 'phrase', 'shift+left': 'song', 'shift+up': 'project', 'shift+down': 'mixer' },
    phrase: { 'shift+right': 'inst', 'shift+left': 'chain', 'shift+up': 'groove', 'shift+down': 'mixer' },
    inst: { 'shift+left': 'phrase', 'shift+right': 'table', 'shift+up': 'instmods', 'shift+down': 'mixer' },
    table: { 'shift+left': 'inst', 'shift+up': 'instmods', 'shift+down': 'mixer' },
    instmods: { 'shift+up': 'instrumentpool', 'shift+down': 'inst' },
    instrumentpool: { 'shift+right': 'inst', 'shift+down': 'instmods' },
    mixer: { 'shift+up': 'phrase', 'shift+down': 'effectsettings' },
    effectsettings: { 'shift+up': 'mixer' },
}

const PROJECT_SCREEN = Object.assign(Array(24).fill(''), {
    3: 'PROJECT',
    17: 'INST. POOL    VIEW INST. POOL',
    20: 'SYSTEM        SETTINGS',
})

describe('view navigation', () => {
    it('follows Shift+arrow edges', async () => {
        const { navigation, pressed } = fakeM8('song', MAIN)
        expect(await navigation.navigateToView('phrase')).toBe(true)
        expect(pressed).toEqual(['shift+right', 'shift+right'])
    })

    it('goes around an empty chain through Project and View Inst. Pool', async () => {
        const device = { ...MAIN, chain: { ...MAIN.chain, 'shift+right': '' } }
        const { navigation, pressed, store } = fakeM8('song', device, { screens: { project: PROJECT_SCREEN } })
        expect(await navigation.navigateToView('inst')).toBe(true)
        expect(store.get('viewName')).toBe('inst')
        // Song > Chain, then Chain > Phrase changes nothing
        expect(pressed).toEqual(['shift+right', 'shift+right', 'shift+up', 'edit@14,17', 'shift+right'])
    })

    it('leaves the instrument group through the Pool when Instrument goes back to the Pool', async () => {
        // As on the device: entered from the Pool, Instrument's Shift+Left goes back to it, and
        // the Mixer's Shift+Up goes back to the Instrument
        const device = {
            ...MAIN,
            inst: { ...MAIN.inst, 'shift+left': (_c: unknown, prev: string) => (prev === 'instrumentpool' ? 'instrumentpool' : 'phrase') },
            instrumentpool: { ...MAIN.instrumentpool, 'shift+left': 'phrase' },
            mixer: { 'shift+up': 'inst', 'shift+down': 'effectsettings' },
        }
        const { navigation, pressed, store } = fakeM8('project', device, { screens: { project: PROJECT_SCREEN } })
        expect(await navigation.navigateToView('inst')).toBe(true)
        pressed.length = 0
        expect(await navigation.navigateToView('project')).toBe(true)
        expect(store.get('viewName')).toBe('project')
        // Not Shift+Left from the Instrument (back to the Pool): Table, back to the Instrument, which
        // then goes left to Phrase. Pool > Phrase (it also sets the default instrument) costs more.
        expect(pressed).toEqual(['shift+right', 'shift+left', 'shift+left', 'shift+left', 'shift+up'])
    })

    it('takes Pool > Phrase when the Instrument cannot get out', async () => {
        const device = {
            ...MAIN,
            inst: { 'shift+left': 'instrumentpool', 'shift+up': 'instmods' },
            instrumentpool: { ...MAIN.instrumentpool, 'shift+left': 'phrase' },
        }
        const { navigation, pressed } = fakeM8('instrumentpool', device)
        expect(await navigation.navigateToView('chain')).toBe(true)
        // Whatever it tried first, it leaves through Pool > Phrase > Chain
        expect(pressed.slice(-2)).toEqual(['shift+left', 'shift+left'])
    })

    it('goes on when the release of a key is never echoed', async () => {
        const device = { ...MAIN, project: { ...MAIN.project, edit: at(14, 20, 'systemsettings') } }
        const { navigation, pressed } = fakeM8('song', device, { screens: { project: PROJECT_SCREEN }, noReleaseEcho: true })
        expect(await navigation.navigateToView('systemsettings')).toBe(true)
        expect(pressed).toEqual(['shift+up', 'edit@14,20'])
    })

    it('never presses Edit when the cursor does not reach the button', async () => {
        const device = { ...MAIN, project: { ...MAIN.project, edit: 'systemsettings' } }
        const { navigation, pressed } = fakeM8('project', device, { screens: { project: PROJECT_SCREEN }, cursorStuck: true })
        expect(await navigation.navigateToView('systemsettings')).toBe(false)
        expect(pressed.some((k) => k.startsWith('edit'))).toBe(false)
    })

    it('finds a button by its label where the layout moved', async () => {
        const screen = [...PROJECT_SCREEN]
        screen[20] = ''
        screen[21] = 'SYSTEM         SETTINGS'
        const device = { ...MAIN, project: { ...MAIN.project, edit: at(15, 21, 'systemsettings') } }
        const { navigation, pressed } = fakeM8('project', device, { screens: { project: screen } })
        expect(await navigation.navigateToView('systemsettings')).toBe(true)
        expect(pressed).toEqual(['edit@15,21'])
    })

    it('leaves sub-views with Option and replans from where it lands', async () => {
        const device = {
            ...MAIN,
            // Option lands on the Mixer instead of Effect Settings; the Mixer goes back to Phrase
            modfxeq: { opt: 'mixer' },
        }
        const { navigation, pressed } = fakeM8('modfxeq', device)
        expect(await navigation.navigateToView('song')).toBe(true)
        expect(pressed).toEqual(['opt', 'shift+up', 'shift+left', 'shift+left'])
    })

    it('chains exits: Theme > System Settings > Project', async () => {
        const device = { ...MAIN, themesettings: { opt: 'systemsettings' }, systemsettings: { opt: 'project' } }
        const { navigation, pressed } = fakeM8('themesettings', device)
        expect(await navigation.navigateToView('project')).toBe(true)
        expect(pressed).toEqual(['opt', 'opt'])
    })

    it('falls back to Shift+Up when Option does not leave a sub-view', async () => {
        const device = { ...MAIN, midisettings: { 'shift+up': 'project' } }
        const { navigation, pressed } = fakeM8('midisettings', device)
        expect(await navigation.navigateToView('project')).toBe(true)
        expect(pressed).toEqual(['opt', 'shift+up'])
    })

    it('presses Option on a view the graph does not know', async () => {
        const device = { ...MAIN, sample: { opt: 'inst' } }
        const { navigation, pressed } = fakeM8('sample', device)
        expect(await navigation.navigateToView('table')).toBe(true)
        expect(pressed).toEqual(['opt', 'shift+right'])
    })

    it('gives up when nothing leads to the view', async () => {
        // An empty chain, a View Inst. Pool button that does nothing, and a Mixer that does not go back up
        const device = {
            ...MAIN,
            chain: { ...MAIN.chain, 'shift+right': '' },
            project: { 'shift+down': 'chain' },
            mixer: { 'shift+down': 'effectsettings' },
        }
        const { navigation, store } = fakeM8('chain', device)
        expect(await navigation.navigateToView('phrase')).toBe(false)
        expect(store.get('viewName')).not.toBe('phrase')
    })

    it('ends a running navigation when another one starts', async () => {
        const { navigation } = fakeM8('song', MAIN)
        const first = navigation.navigateToView('inst')
        const second = navigation.navigateToView('chain')
        expect(await first).toBe(false)
        expect(await second).toBe(true)
    })
})

describe('view graph', () => {
    it('reaches every view from the Song view and comes back', () => {
        const { graph } = getViewGraph()
        const reach = (from: string, reverse = false) => {
            const seen = new Set([from])
            const queue = [from]
            while (queue.length) {
                const v = queue.shift() as string
                for (const [node, edges] of graph) {
                    for (const e of edges) {
                        const [a, b] = reverse ? [e.to, node] : [node, e.to]
                        if (a === v && !seen.has(b)) {
                            seen.add(b)
                            queue.push(b)
                        }
                    }
                }
            }
            return seen
        }
        const all = [...graph.keys()]
        // The project file browser has no way in: on a changed song, LOAD asks to lose the changes (OK selected)
        expect(all.filter((v) => !reach('song').has(v))).toEqual(['loadproject'])
        expect(all.filter((v) => !reach('song', true).has(v))).toEqual([])
    })
})
