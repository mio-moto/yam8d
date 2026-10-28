// What describeFxValue says about FX values that mean something else in a table than in a phrase.
import { describe, expect, test } from 'bun:test'
import { describeFxValue } from '../packages/m8-sdk/src/fxInsight'

const inTable = (row: number) => ({ inTable: true, row })

describe('describeFxValue in a table', () => {
    test('HOP X0 jumps for ever, HOP XY jumps X times, a HOP onto its own row stops the column', () => {
        expect(describeFxValue('HOP', 0x00, inTable(4))).toBe('always jumps back to row 0: the rows in between loop')
        expect(describeFxValue('HOP', 0x21, inTable(3))).toBe('jumps to row 1 twice, then the column runs on past it')
        expect(describeFxValue('HOP', 0x0f, inTable(15))).toBe('this column stops on row F')
    })

    test('TIC sets the rate of its own column, read in steps', () => {
        expect(describeFxValue('TIC', 0x01, inTable(15))).toBe('this column moves one row every 1 tick (6 rows per step)')
        expect(describeFxValue('TIC', 0x06, inTable(15))).toBe('this column moves one row every 6 ticks (one row per step)')
        expect(describeFxValue('TIC', 0x0c, inTable(15))).toBe('this column moves one row every 12 ticks (one row every 2 steps)')
        expect(describeFxValue('TIC', 0x04, inTable(15))).toBe('this column moves one row every 4 ticks')
        expect(describeFxValue('TIC', 0xff, inTable(15))).toBe('this column moves one row every 5 ms (200 Hz)')
        expect(describeFxValue('TIC', 0xfe, inTable(0))).toBe('note map: the note played picks the table row (instrument tables only)')
    })

    test('REP and RTO count rows in a table', () => {
        expect(describeFxValue('REP', 0x05, inTable(1))).toBe('plays the command above it 5 more times, one row each')
        expect(describeFxValue('REP', 0x00, inTable(1))).toBeNull()
        expect(describeFxValue('RTO', 0x20, inTable(1))).toBe('repeats the relative command above it until it has added 20 in total')
        expect(describeFxValue('RTO', 0xe0, inTable(1))).toBe('repeats the relative command above it until it has added E0 (-32) in total')
    })

    test('DEL holds the playhead, MTT does nothing, THO moves every column', () => {
        expect(describeFxValue('DEL', 0x03, inTable(2))).toBe("holds the table's playhead for 3 ticks")
        expect(describeFxValue('MTT', 0x04, inTable(2))).toBe('no effect in a table')
        expect(describeFxValue('THO', 0x02, inTable(7))).toBe('every column of the table jumps to row 2')
    })
})

describe('describeFxValue in a phrase', () => {
    test('REP and RTO are left to the lane trace', () => {
        expect(describeFxValue('REP', 0x05, { row: 1 })).toBeNull()
        expect(describeFxValue('RTO', 0x20, { row: 1 })).toBeNull()
    })

    test('a negative MTT does nothing on the first step', () => {
        expect(describeFxValue('MTT', 0xfc, { row: 0 })).toBe('no effect: a row cannot be moved earlier on the first step')
        expect(describeFxValue('MTT', 0xfc, { row: 1 })).toBe('shifts the row by −4/8 tick')
    })

    test("TIC and THO act on the instrument's table", () => {
        expect(describeFxValue('TIC', 0x03, { row: 0 })).toBe("the instrument's table moves one row every 3 ticks (2 rows per step)")
        expect(describeFxValue('THO', 0x04, { row: 0 })).toBe("the instrument's table jumps to row 4 (the aux table when a TBX is on this step)")
        expect(describeFxValue('HOP', 0x04, { row: 0 })).toBe('jumps to row 4 of the next phrase')
    })
})
