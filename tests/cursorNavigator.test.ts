import { describe, expect, it } from 'bun:test'
import type { EngineBus } from '../packages/m8-sdk/src/engine/bus'
import { cellId, createCursorMap, findPath } from '../packages/m8-sdk/src/engine/cursorMap'
import { createCursorNavigator } from '../packages/m8-sdk/src/engine/cursorNavigator'
import { fixedGridLayout, gridRows, layoutSignature, pickGoal, snapToGrid, textRuns } from '../packages/m8-sdk/src/engine/cursorTargets'
import { createEventBus } from '../packages/m8-sdk/src/engine/eventBus'
import { M8KeyMask } from '../packages/m8-sdk/src/engine/keys'
import type { ProtocolEvents } from '../packages/m8-sdk/src/engine/protocol'
import { createM8Store, type M8CellMetrics } from '../packages/m8-sdk/src/engine/store'

// The cursor navigator against a simulated M8 cursor. A layout is a list of cursor cells (column,
// row, width, text) plus labels the cursor never reaches. Up/Down go to the row above/below that
// has cells, to the cell in the same column or else the leftmost one (so on irregular views a
// vertical move can jump columns and is not undone by the opposite key); Left/Right go along the row.

type Cell = { col: number; row: number; text: string }
type Label = { col: number; row: number; text: string }
type Dir = 'up' | 'down' | 'left' | 'right'

const SMALL: M8CellMetrics = { cellW: 12, cellH: 14, offX: 0, offY: 0 }
const LARGE: M8CellMetrics = { cellW: 15, cellH: 16, offX: 0, offY: 0 }

const dirOf = (mask: number): Dir | null => {
    if (mask & M8KeyMask.Up) return 'up'
    if (mask & M8KeyMask.Down) return 'down'
    if (mask & M8KeyMask.Left) return 'left'
    if (mask & M8KeyMask.Right) return 'right'
    return null
}

const simulate = (
    cells: Cell[],
    labels: Label[] = [],
    options: {
        metrics?: M8CellMetrics
        start?: number
        viewName?: string
        wraps?: boolean
        delay?: (from: Cell, dir: Dir) => number
        /** True for a press the M8 never answers (it drops keys sent right after a view change). */
        drop?: (from: Cell, dir: Dir) => boolean
        jitter?: boolean
    } = {},
) => {
    const metrics = options.metrics ?? SMALL
    const store = createM8Store({
        viewName: options.viewName ?? 'phrase',
        cellMetrics: metrics,
        systemInfo: {
            model: 'M8 Model:02',
            fontMode: 0,
            spacingX: metrics.cellW,
            spacingY: metrics.cellH,
            offX: 0,
            offY: 0,
            screenWidth: 480,
            screenHeight: 320,
            rectOffset: 0,
        },
    })
    const events = createEventBus<ProtocolEvents>()
    const presses: Dir[] = []
    let wrapped = 0
    let current = cells[options.start ?? 0]

    // Cursor rectangles overhang their characters a little, as the M8 draws them, and with `jitter` one
    // pixel differently every other time (as the device did on a HyperSynth chord note)
    let draws = 0
    const rectOf = (cell: Cell) => {
        const shift = options.jitter && draws++ % 2 === 1 ? 1 : 0
        return {
            x: cell.col * metrics.cellW - 2 + shift,
            y: cell.row * metrics.cellH + shift,
            w: cell.text.length * metrics.cellW + 3 - 2 * shift,
            h: metrics.cellH + 2 * shift,
        }
    }
    /** The cell id the navigator learns for a simulated cell. */
    const idOf = (cell: Cell) => cellId(snapToGrid(rectOf(cell), metrics))
    const show = (cell: Cell) => {
        current = cell
        store.set('cursorPos', { x: cell.col, y: cell.row })
        store.set('cursorRect', rectOf(cell))
    }

    const move = (from: Cell, dir: Dir): Cell | null => {
        if (dir === 'left' || dir === 'right') {
            const row = cells.filter((c) => c.row === from.row).sort((a, b) => a.col - b.col)
            return row[row.indexOf(from) + (dir === 'right' ? 1 : -1)] ?? null
        }
        const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b)
        let row = rows[rows.indexOf(from.row) + (dir === 'down' ? 1 : -1)]
        // A phrase in a chain: past its first or last step the M8 shows the neighbouring phrase
        if (row === undefined && options.wraps) {
            wrapped += 1
            row = dir === 'up' ? rows[rows.length - 1] : rows[0]
        }
        if (row === undefined) return null
        const inRow = cells.filter((c) => c.row === row).sort((a, b) => a.col - b.col)
        return inRow.find((c) => c.col === from.col) ?? inRow[0]
    }

    const bus: EngineBus = {
        protocol: { eventBus: events },
        commands: {
            sendKeys: (keys: number) => {
                const dir = dirOf(keys)
                const from = current
                setTimeout(() => events.emit('key', { keys }), 1)
                if (dir && !options.drop?.(from, dir)) {
                    // The M8 redraws the cursor a little later (a busy M8: much later)
                    setTimeout(
                        () => {
                            const to = move(from, dir)
                            if (to) show(to)
                        },
                        2 + (options.delay?.(from, dir) ?? 0),
                    )
                }
                if (dir) presses.push(dir)
            },
            resetScreen: () => {},
        },
    }

    const lines = () => {
        const rows: string[][] = Array.from({ length: 24 }, () => Array(40).fill(' '))
        for (const item of [...cells, ...labels]) {
            for (let i = 0; i < item.text.length; i++) rows[item.row][item.col + i] = item.text[i]
        }
        return rows.map((r) => r.join('').trimEnd())
    }

    show(current)
    const cursorMap = createCursorMap()
    const navigator = createCursorNavigator({ bus, store, getScreenLines: lines, cursorMap })

    /** Clicks the middle of a character cell (or `dx` px from its left edge). */
    const click = (col: number, row: number, dx = metrics.cellW / 2) => {
        presses.length = 0
        return navigator.navigateTo({ x: col * metrics.cellW + dx, y: row * metrics.cellH + metrics.cellH / 2 })
    }
    /** The user presses and releases an arrow on the M8. */
    const userPress = async (dir: Dir) => {
        const mask = { up: M8KeyMask.Up, down: M8KeyMask.Down, left: M8KeyMask.Left, right: M8KeyMask.Right }[dir]
        events.emit('key', { keys: mask })
        const to = move(current, dir)
        if (to) show(to)
        events.emit('key', { keys: 0 })
        await tick(5)
    }
    return { store, events, navigator, cursorMap, presses, click, userPress, at: () => current, lines, wrapped: () => wrapped, rectOf, idOf }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

// A phrase-like grid: 16 rows of N V I FX1 FX2 (command and value are one cell each here)
const phraseGrid = (): Cell[] => {
    const cells: Cell[] = []
    for (let row = 6; row < 22; row++) {
        cells.push(
            { col: 2, row, text: '---' },
            { col: 6, row, text: '--' },
            { col: 9, row, text: '--' },
            { col: 12, row, text: '---' },
            { col: 16, row, text: '00' },
        )
        cells.push({ col: 19, row, text: '---' }, { col: 23, row, text: '00' })
    }
    return cells
}
const rowNumbers = (): Label[] => Array.from({ length: 16 }, (_, i) => ({ col: 1, row: 6 + i, text: i.toString(16) }))

// A project-like view: labels on the left, one or two values per row
const projectCells: Cell[] = [
    { col: 14, row: 6, text: '120.00' },
    { col: 14, row: 7, text: '00' },
    { col: 14, row: 8, text: '00' },
    { col: 22, row: 8, text: 'SWING' },
    { col: 14, row: 10, text: 'SAVE' },
    { col: 22, row: 10, text: 'LOAD' },
    { col: 14, row: 11, text: 'NEW' },
]
const projectLabels: Label[] = [
    { col: 1, row: 6, text: 'TEMPO' },
    { col: 1, row: 7, text: 'TRANSPOSE' },
    { col: 1, row: 8, text: 'GROOVE' },
    { col: 1, row: 10, text: 'PROJECT' },
]

describe('cursor navigator', () => {
    it('goes straight to a clicked cell, rows first', async () => {
        const sim = simulate(phraseGrid())
        expect(await sim.click(17, 15)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 16, row: 15 })
        expect(sim.presses).toEqual([...Array(9).fill('down'), 'right', 'right', 'right', 'right'])
    })

    it('goes to the nearest cell for a click between cells, without overshooting', async () => {
        const sim = simulate(phraseGrid())
        // Column 5 is the space between the note (2-4) and the volume (6-7); its left edge is nearer the note
        expect(await sim.click(5, 9, 1)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 2, row: 9 })
        expect(sim.presses).toEqual(['down', 'down', 'down'])
        // Its right edge is nearer the volume
        expect(await sim.click(5, 9, 11)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 6, row: 9 })
        expect(sim.presses).toEqual(['right'])
    })

    it('goes to the first cell of the row for a click on its row number', async () => {
        const sim = simulate(phraseGrid(), rowNumbers(), { start: 7 * 3 + 2 })
        expect(await sim.click(1, 12)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 2, row: 12 })
    })

    it('goes to the value of a clicked label, and remembers the label after two failures', async () => {
        const sim = simulate(projectCells, projectLabels, { start: 6, viewName: 'project' })
        expect(await sim.click(3, 7)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 7 })
        // TEMPO fails twice (a single failure could be a slow answer)
        for (let i = 0; i < 2; i++) {
            expect(await sim.click(2, 6)).toBe(true)
            expect(sim.at()).toMatchObject({ col: 14, row: 6 })
            expect(sim.presses).toContain('left')
            expect(await sim.click(5, 11)).toBe(true)
        }
        // Learned: TEMPO is a label, so the goal is its row's value from the start, and no Left is tried
        expect(await sim.click(2, 6)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 6 })
        expect(sim.presses.every((dir) => dir === 'up')).toBe(true)
    })

    it('goes to a value for a click on the text it displays after it (Project SCALE)', async () => {
        // Project, fw 6.5: 'SCALE        00C CHROMATIC', the cursor cell is '00' only; '<>' is a cell 3 rows up
        const cells: Cell[] = [
            { col: 14, row: 5, text: '164.00' },
            { col: 21, row: 5, text: '<>' },
            { col: 14, row: 6, text: '00' },
            { col: 14, row: 7, text: '00DEFAULT' },
            { col: 14, row: 8, text: '00' },
        ]
        const display: Label[] = [
            { col: 16, row: 8, text: 'C' },
            { col: 18, row: 8, text: 'CHROMATIC' },
        ]
        const sim = simulate(cells, display, { start: 0, viewName: 'project' })
        expect(await sim.click(22, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 8 })
        await sim.click(21, 5)
        // Again, with the display text learned as unreachable
        expect(await sim.click(22, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 8 })
    })

    it('goes to the value of a two-word label, and from an empty row to a field, without walking the labels', async () => {
        // System Settings, fw 6.5, huge font: 'NOTE PREVIEW   ON', an empty row 12 inside the label column
        const cells: Cell[] = [
            { col: 16, row: 9, text: 'ON' },
            { col: 16, row: 10, text: '00' },
            { col: 16, row: 11, text: 'SAVE' },
            { col: 16, row: 13, text: 'MULTICHANNEL' },
            { col: 16, row: 14, text: 'MIX' },
        ]
        const labels: Label[] = [
            { col: 1, row: 9, text: 'NOTE PREVIEW' },
            { col: 1, row: 10, text: 'REC.COUNT IN' },
            { col: 1, row: 11, text: 'SONG TEMPLATE' },
            { col: 1, row: 13, text: 'USB AUDIO MODE' },
            { col: 1, row: 14, text: 'USB MAIN OUT' },
        ]
        const sim = simulate(cells, labels, { start: 4, viewName: 'systemsettings', metrics: LARGE })
        expect(await sim.click(2, 9)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 16, row: 9 })
        expect(sim.presses.filter((dir) => dir === 'left').length).toBeLessThanOrEqual(1)
        expect(await sim.click(10, 12)).toBe(true)
        expect(sim.at().col).toBe(16)
        expect(sim.presses.filter((dir) => dir === 'left').length).toBeLessThanOrEqual(1)
    })

    it('goes up to the value of a label drawn under it (Mixer)', async () => {
        // Mixer, Model:02 fw 6.5: send values on row 17, their labels on row 18; LIM's value on row 18
        const cells: Cell[] = [
            { col: 1, row: 17, text: 'E0' },
            { col: 4, row: 17, text: 'E0' },
            { col: 7, row: 17, text: 'E0' },
            { col: 13, row: 17, text: 'F0' },
            { col: 19, row: 17, text: '00' },
            { col: 28, row: 17, text: 'E0' },
            { col: 28, row: 18, text: '15' },
        ]
        const labels: Label[] = [
            { col: 1, row: 18, text: 'MX' },
            { col: 4, row: 18, text: 'DE' },
            { col: 7, row: 18, text: 'RE' },
            { col: 13, row: 18, text: 'INPUT' },
            { col: 19, row: 18, text: 'USB' },
            { col: 24, row: 18, text: 'LIM' },
        ]
        const sim = simulate(cells, labels, { start: 3, viewName: 'mixer' })
        expect(await sim.click(14, 18)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 13, row: 17 })
        // While a label is not known as one (it fails in two navigations), a click on it ends on a known
        // field of the row above; then on its own value
        for (let i = 0; i < 2; i++) {
            expect(await sim.click(28, 18)).toBe(true)
            expect(await sim.click(5, 18)).toBe(true)
            expect(sim.at()).toMatchObject({ row: 17 })
        }
        expect(await sim.click(5, 18)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 4, row: 17 })
        // All the labels left of LIM's value were learned with DE: no more tries
        expect(await sim.click(28, 18)).toBe(true)
        expect(await sim.click(8, 18)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 7, row: 17 })
        expect(sim.presses.filter((dir) => dir === 'down')).toEqual([])
        // LIM's value is near USB on its row, but it is LIM's (its label lies between)
        expect(await sim.click(20, 18)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 19, row: 17 })
    })

    it('reaches a cell that needs a column jump, and checks its way back', async () => {
        // From SWING (22, 8) the way down to NEW (14, 11) ends with a jump: row 11 has no column 22
        const sim = simulate(projectCells, projectLabels, { start: 3, viewName: 'project' })
        expect(await sim.click(15, 11)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 11 })
        // Up from NEW stays in column 14 (SAVE), it does not undo the jump
        expect(await sim.click(23, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 22, row: 8 })
    })

    it('goes to the nearest reachable cell when the clicked text is out of reach', async () => {
        const cells: Cell[] = [
            { col: 14, row: 6, text: '00' },
            { col: 14, row: 7, text: '00' },
        ]
        // Text the cursor never reaches, far right
        const sim = simulate(cells, [{ col: 28, row: 7, text: 'INFO' }], { viewName: 'project' })
        expect(await sim.click(29, 7)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 7 })
        // Tried once more (one failure is not proof), then known: the nearest cell is the goal, and reached
        expect(await sim.click(29, 7)).toBe(true)
        expect(sim.presses).toEqual(['right'])
        expect(await sim.click(29, 7)).toBe(true)
        expect(sim.presses).toEqual([])
    })

    it('follows the shortest learned path once the moves are known', async () => {
        const sim = simulate(projectCells, projectLabels, { start: 0, viewName: 'project' })
        await sim.click(23, 10)
        expect(sim.at()).toMatchObject({ col: 22, row: 10 })
        await sim.click(15, 6)
        await sim.click(23, 10)
        expect(sim.at()).toMatchObject({ col: 22, row: 10 })
        // Four presses: the learned way, no blocked tries
        expect(sim.presses.length).toBe(4)
    })

    it('tells an FX command from its value, though the screen draws them as one run', async () => {
        // Device layout (Phrase): FX1 command at 13-15 and value at 16-17 read as one run '---00'
        const cells: Cell[] = []
        for (let row = 6; row < 10; row++) cells.push({ col: 3, row, text: '---' }, { col: 13, row, text: '---' }, { col: 16, row, text: '00' })
        const sim = simulate(cells)
        expect(await sim.click(16, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 16, row: 8 })
        expect(await sim.click(14, 9)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 13, row: 9 })
        // Only the command of row 7 is learned (passed through); its value stays a target
        await sim.click(3, 7)
        await sim.click(14, 7)
        expect(await sim.click(17, 7)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 16, row: 7 })
    })

    it('gives up a header row at once and goes to the row below', async () => {
        const sim = simulate(
            phraseGrid(),
            [
                { col: 12, row: 5, text: 'FX1' },
                { col: 18, row: 5, text: 'FX2' },
                { col: 24, row: 5, text: 'FX3' },
            ],
            { start: 10 * 7 },
        )
        expect(await sim.click(19, 5)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 19, row: 6 })
        // Ups to row 6 and one blocked Up, then no walk along the header labels
        expect(sim.presses.filter((dir) => dir === 'left' || dir === 'right').length).toBeLessThanOrEqual(5)
        // A second failure makes the header unreachable; then only the move to the cell below is left
        expect(await sim.click(19, 5)).toBe(true)
        expect(await sim.click(25, 5)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 23, row: 6 })
        expect(sim.presses).toEqual(['right'])
    })

    it('never leaves a numbered grid: no scroll, no move to the next phrase', async () => {
        const header: Label[] = [
            { col: 3, row: 5, text: 'N' },
            { col: 12, row: 5, text: 'FX1' },
            { col: 18, row: 5, text: 'FX2' },
            { col: 1, row: 3, text: 'PHRASE 09' },
        ]
        // As on the device: step number at column 1, note at 3, FX command and value as two cells
        const cells: Cell[] = []
        for (let row = 6; row < 22; row++) {
            for (const [col, text] of [
                [3, '---'],
                [7, '--'],
                [10, '--'],
                [13, '---'],
                [16, '00'],
                [19, '---'],
                [22, '00'],
            ] as const)
                cells.push({ col, row, text })
        }
        const sim = simulate(cells, [...rowNumbers(), ...header], { start: 10 * 7 + 4, wraps: true })
        // The header and the title go to the first step, with no Up tried past it
        expect(await sim.click(19, 5)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 19, row: 6 })
        expect(await sim.click(5, 3)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 3, row: 6 })
        // Below the last step: the last step, with no Down tried past it
        expect(await sim.click(23, 22)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 22, row: 21 })
        expect(sim.wrapped()).toBe(0)
        // A wrap the user made is learned but never taken as a shortcut
        await sim.userPress('down')
        expect(sim.wrapped()).toBe(1)
        expect(sim.at()).toMatchObject({ col: 22, row: 6 })
        expect(await sim.click(23, 21)).toBe(true)
        expect(sim.presses).toEqual(Array(15).fill('down'))
        expect(sim.wrapped()).toBe(1)
    })

    it('prefers a short way with an unlearned move over a long learned one', async () => {
        // Found on the device: with only a long way learned, it took 15 presses instead of 7
        const sim = simulate(phraseGrid(), [], { start: 8 * 7 })
        await sim.click(2, 10)
        await sim.click(6, 10)
        await sim.click(6, 18)
        await sim.click(2, 14)
        expect(sim.at()).toMatchObject({ col: 2, row: 14 })
        // Learned: (2,14) up to row 10, right, down column 6. Not learned: Right from (2,14).
        expect(await sim.click(6, 17)).toBe(true)
        expect(sim.presses).toEqual(['right', 'down', 'down', 'down'])
    })

    it('waits for a late answer before learning a key as blocked', async () => {
        // A busy M8 moved the cursor 350 ms after the key (Project, VIEW INST.POOL down to VIEW TIME STATS)
        const sim = simulate(projectCells, projectLabels, {
            start: 0,
            viewName: 'project',
            delay: (from, dir) => (from.row === 7 && dir === 'down' ? 350 : 0),
        })
        expect(await sim.click(15, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 8 })
        const layout = sim.cursorMap.toJSON().layouts[0]
        expect(layout.moves.find(([from, dir]) => from === sim.idOf(projectCells[1]) && dir === 'down')?.[2]).toBe(sim.idOf(projectCells[2]))
    })

    it('tries again a key wrongly learned as blocked, and corrects the map', async () => {
        const sim = simulate(projectCells, projectLabels, { start: 0, viewName: 'project' })
        await sim.click(15, 7)
        const key = sim.cursorMap.toJSON().layouts[0].key
        sim.cursorMap.recordMove(key, snapToGrid(sim.rectOf(projectCells[1]), SMALL), 'down', null)
        expect(await sim.click(15, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 14, row: 8 })
        expect(sim.cursorMap.get(key)?.moves.get(sim.idOf(projectCells[1]))?.down).toBe(sim.idOf(projectCells[2]))
    })

    it('keeps one cell when the M8 draws it a pixel differently', async () => {
        const sim = simulate(phraseGrid(), [], { jitter: true })
        for (const [col, row] of [
            [23, 21],
            [2, 6],
            [23, 21],
            [9, 14],
            [23, 21],
        ]) {
            expect(await sim.click(col, row)).toBe(true)
            expect(sim.at()).toMatchObject({ col, row })
        }
        const layout = sim.cursorMap.toJSON().layouts[0]
        expect(layout.cells.filter((id) => id.startsWith(`${23 * 12},${21 * 14},`))).toHaveLength(1)
    })

    it('learns from the user own arrow presses', async () => {
        const sim = simulate(projectCells, projectLabels, { start: 0, viewName: 'project' })
        for (const dir of ['down', 'down', 'right', 'down'] as Dir[]) await sim.userPress(dir)
        expect(sim.at()).toMatchObject({ col: 22, row: 10 })
        const layout = [...sim.cursorMap.toJSON().layouts][0]
        expect(layout.key.startsWith('project|M8 Model:02|0|')).toBe(true)
        expect(layout.moves.length).toBe(4)
        expect(layout.cells.length).toBe(5)
    })

    it('works with the large font cell size', async () => {
        const cells: Cell[] = []
        for (let row = 4; row < 18; row++) cells.push({ col: 2, row, text: '--' }, { col: 5, row, text: '--' }, { col: 8, row, text: '---' })
        const sim = simulate(cells, [], { metrics: LARGE })
        expect(await sim.click(9, 12)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 8, row: 12 })
        expect(await sim.click(4, 5, 14)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 5, row: 5 })
    })

    it('cancels a navigation for a new click and still learns the move in flight', async () => {
        const sim = simulate(phraseGrid())
        const first = sim.click(2, 20)
        const second = sim.click(9, 7)
        expect(await first).toBe(false)
        expect(await second).toBe(true)
        expect(sim.at()).toMatchObject({ col: 9, row: 7 })
    })

    it('goes to the clicked point in selection mode, without learning', async () => {
        const sim = simulate(phraseGrid())
        sim.store.set('selectionMode', true)
        expect(await sim.click(6, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 6, row: 8 })
        expect(sim.cursorMap.toJSON().layouts).toEqual([])
    })
})

// Song rows: a row number and eight track cells, as on the M8 (cells at columns 4, 7, ... 25)
const songRows = ['FC FC FC 42 FC FC FC 81', '10 20 30 40 FE FE FD FD', '11 21 31 41 FE 61 70 80']
const songCells = (): Cell[] => songRows.flatMap((text, i) => text.split(' ').map((cell, track) => ({ col: 4 + 3 * track, row: 6 + i, text: cell })))
const songLabels = (): Label[] => songRows.map((_, i) => ({ col: 1, row: 6 + i, text: `0${i}` }))

describe('grid views never remember a text as unreachable', () => {
    it('a stored unreachable text of a grid view is still a goal', () => {
        const sim = simulate(songCells(), songLabels(), { viewName: 'song' })
        const map = createCursorMap()
        // Stored by an older version after slow presses: the song's own cells
        for (let i = 0; i < 2; i++) map.markUnreachable('k', '8:22:70')
        const layout = map.get('k')
        expect(layout?.unreachable.has('8:22:70')).toBe(true)
        const grid = gridRows('song', sim.lines())
        const point = { x: 22 * 12 + 6, y: 8 * 14 + 7 }
        expect(pickGoal(point, layout, sim.lines(), SMALL, 34, grid)).toMatchObject({ kind: 'text', key: '8:22:70' })
        // Without the grid (any other view) the same text is skipped
        expect(pickGoal(point, layout, sim.lines(), SMALL, 34, null)).not.toMatchObject({ key: '8:22:70' })
    })

    it('a press the M8 drops is sent again, not learned as a blocked key', async () => {
        let dropped = 0
        const sim = simulate(songCells(), songLabels(), {
            viewName: 'song',
            drop: (from, dir) => from.col === 13 && from.row === 8 && dir === 'right' && dropped++ === 0,
        })
        expect(await sim.click(22, 8)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 22, row: 8 })
        expect(dropped).toBe(2)
        expect(sim.cursorMap.toJSON().layouts.every((layout) => layout.moves.every(([, , to]) => to !== null))).toBe(true)
    })

    it('a press the M8 answers late does not mark the cell, and the cursor ends on it', async () => {
        const sim = simulate(songCells(), songLabels(), { viewName: 'song', delay: (from, dir) => (from.col === 13 && dir === 'right' ? 700 : 0) })
        const reached = await sim.click(22, 8)
        await tick(900)
        expect(sim.cursorMap.toJSON().layouts.every((layout) => layout.unreachable.length === 0 && (layout.suspects ?? []).length === 0)).toBe(true)
        expect(typeof reached).toBe('boolean')
    })
})

// Chain rows as on the M8: a row number, the phrase at column 3 and the transpose at column 6
const chainCells = (): Cell[] => Array.from({ length: 16 }, (_, i) => [{ col: 3, row: 6 + i, text: '20' }, { col: 6, row: 6 + i, text: '00' }]).flat()
const chainLabels = (): Label[] => Array.from({ length: 16 }, (_, i) => ({ col: 1, row: 6 + i, text: i.toString(16) }))

describe('known grids (Song, Chain, Phrase)', () => {
    it('lays out the cursor cells the device draws, in both font sizes', () => {
        const chain = fixedGridLayout('chain', { first: 6, last: 21, numberWidth: 1 }, SMALL)
        expect(chain?.cells.has('36,84,24,14')).toBe(true)
        expect(chain?.moves.get('36,84,24,14')).toEqual({ down: '36,98,24,14', right: '72,84,24,14' })
        const phrase = fixedGridLayout('phrase', { first: 6, last: 21, numberWidth: 1 }, LARGE)
        const row6 = [...(phrase?.cells.values() ?? [])].filter((rect) => rect.y === 96).sort((a, b) => a.x - b.x)
        expect(row6.map(cellId)).toEqual([
            '45,96,45,16',
            '105,96,30,16',
            '150,96,30,16',
            '195,96,45,16',
            '240,96,30,16',
            '285,96,45,16',
            '330,96,30,16',
            '375,96,45,16',
            '420,96,30,16',
        ])
        expect(fixedGridLayout('table', { first: 6, last: 21, numberWidth: 1 }, SMALL)).toBeNull()
    })

    it('goes straight down a chain despite a wrong learned move, and learns nothing', async () => {
        const sim = simulate(chainCells(), chainLabels(), { viewName: 'chain' })
        // Learned by an older version while the view changed: Down from row A landing on a Phrase note cell
        const key = `chain|M8 Model:02|0|${layoutSignature(sim.lines(), 34)}`
        const rowA = snapToGrid(sim.rectOf(chainCells()[20]), SMALL)
        sim.cursorMap.recordMove(key, rowA, 'down', { x: 36, y: 84, w: 36, h: 14 })
        expect(await sim.click(4, 18)).toBe(true)
        expect(sim.at()).toMatchObject({ col: 3, row: 18 })
        expect(sim.presses).toEqual(Array(12).fill('down'))
        expect(await sim.click(7, 9)).toBe(true)
        await sim.userPress('down')
        expect(sim.cursorMap.toJSON().layouts.map((layout) => [layout.key, layout.moves.length])).toEqual([[key, 1]])
    })

    it('learns as before when the cursor is on none of the known cells', async () => {
        // The simulated phrase grid has its note at column 2, the device at 3
        const sim = simulate(phraseGrid(), rowNumbers())
        expect(await sim.click(17, 9)).toBe(true)
        expect(sim.cursorMap.toJSON().layouts).toHaveLength(1)
    })
})

describe('cursor map and targets', () => {
    it('finds the shortest learned path and skips distrusted moves', () => {
        const map = createCursorMap()
        const a = { x: 0, y: 0, w: 10, h: 10 }
        const b = { x: 20, y: 0, w: 10, h: 10 }
        const c = { x: 20, y: 20, w: 10, h: 10 }
        map.recordMove('k', a, 'right', b)
        map.recordMove('k', b, 'down', c)
        map.recordMove('k', a, 'down', c)
        const layout = map.get('k')
        if (!layout) throw new Error('no layout')
        expect(findPath(layout, cellId(a), (id) => id === cellId(c))?.map((s) => s.dir)).toEqual(['down'])
        expect(findPath(layout, cellId(a), (id) => id === cellId(c), new Set([`${cellId(a)}:down`]))?.map((s) => s.dir)).toEqual(['right', 'down'])
    })

    it('saves and restores what it learned', () => {
        const map = createCursorMap()
        map.recordMove('k', { x: 0, y: 0, w: 10, h: 10 }, 'left', null)
        map.markUnreachable('k', '6:1:tempo')
        const copy = createCursorMap({ data: JSON.parse(JSON.stringify(map.toJSON())) })
        expect(copy.toJSON()).toEqual(map.toJSON())
        expect(copy.get('k')?.moves.get('0,0,10,10')?.left).toBeNull()
    })

    it('keys layouts by their row labels, not by values or row numbers', () => {
        const fm = ['', '', '', ' INST. 05', '', ' TYPE    FMSYNTH', ' NAME    LEAD--------', ' ALGO    02']
        const sampler = ['', '', '', ' INST. 00', '', ' TYPE    SAMPLER', ' NAME    KICK--------', ' SLICE   00OFF']
        expect(layoutSignature(fm, 34)).toBe('3inst. 5type 6name 7algo')
        expect(layoutSignature(sampler, 34)).not.toBe(layoutSignature(fm, 34))
        expect(layoutSignature([' 0 C-4 7F 00', ' a --- -- --', ' ff 00 01'], 34)).toBe('')
    })

    it('picks the nearest text on the clicked row when it is close, else the nearest one', () => {
        const lines = ['', '', '', '', '', '', ' TEMPO        120.00', '', ' TRANSPOSE    00']
        const runs = textRuns(lines, SMALL, 34)
        expect(runs.map((r) => r.text)).toEqual(['TEMPO', '120.00', 'TRANSPOSE', '00'])
        const keyAt = (x: number, y: number) => {
            const goal = pickGoal({ x, y }, undefined, lines, SMALL, 34)
            return goal.kind === 'text' ? goal.key : null
        }
        // On the empty row 7, in the value column: the value of the row above (nearer)
        expect(keyAt(15 * 12, 7 * 14 + 2)).toBe('6:14:120.00')
        // Right of row 8's value, within 12 characters: still row 8's value
        expect(keyAt(25 * 12, 8 * 14 + 7)).toBe('8:14:00')
        // Farther: the nearest text, here row 6's value
        expect(keyAt(30 * 12, 8 * 14 + 7)).toBe('6:14:120.00')
    })
})
