import { describe, expect, test } from 'bun:test'
import { observeThemeColors, parseThemeScreen } from '../packages/m8-sdk/src/theme'
import type { M8Screen, M8State } from '../packages/m8-sdk/src/types'
import { parseGridScreen, parseViewTitle, readPlayPositions } from '../packages/m8-sdk/src/viewContext'

/** A screen row: the margin column, then each text placed at its schema x. */
function line(...cells: [number, string][]): string {
    const chars = Array.from({ length: 40 }, () => ' ')
    for (const [x, text] of cells) for (let i = 0; i < text.length; i += 1) chars[x + 1 + i] = text[i]
    return chars.join('').trimEnd()
}

const screen = (lines: string[]): M8Screen => ({ width: 40, height: 24, lines })

// The Theme View as the manual shows it (lower case, as the text stream sends it), with
// the track panel on the right of the same rows.
const themeLines = [
    '',
    '',
    '',
    line([0, 'theme settings']),
    '',
    line([0, 'mode'], [15, 'r  g  b  <>'], [32, 't>120']),
    line([0, 'background'], [15, 'ff ff ff'], [33, '1 ---']),
    line([0, 'text:empty'], [15, 'b3 b3 ad'], [33, '2 ---']),
    line([0, 'text:info'], [15, '74 74 74']),
    line([0, 'text:default'], [15, '73 73 73']),
    line([0, 'text:value'], [15, '00 00 00']),
    line([0, 'text:titles'], [15, '37 96 d0']),
    line([0, 'play markers'], [15, '00 bf 00']),
    line([0, 'cursor'], [15, 'ff 00 bf']),
    line([0, 'selection'], [15, 'ff 50 7d']),
    line([0, 'scope/slider'], [15, '60 60 60']),
    line([0, 'meter low'], [15, '9f df df']),
    line([0, 'meter mid'], [15, 'df df 20']),
    line([0, 'meter peak'], [15, 'ff 80 a0']),
    '',
    line([0, 'theme name'], [15, '------------'], [33, 'p']),
    line([15, 'load save reset']),
]

describe('parseThemeScreen', () => {
    test('reads all 13 colours, the mode and the name', () => {
        const theme = parseThemeScreen(screen(themeLines))
        expect(theme).not.toBeNull()
        expect(theme?.mode).toBe('rgb')
        expect(theme?.name).toBeNull()
        expect(theme?.colors).toEqual({
            background: '#ffffff',
            textEmpty: '#b3b3ad',
            textInfo: '#747474',
            textDefault: '#737373',
            textValue: '#000000',
            textTitles: '#3796d0',
            playMarkers: '#00bf00',
            cursor: '#ff00bf',
            selection: '#ff507d',
            scopeSlider: '#606060',
            meterLow: '#9fdfdf',
            meterMid: '#dfdf20',
            meterPeak: '#ff80a0',
        })
    })

    test('keeps a theme name and stops it before the track panel', () => {
        const lines = [...themeLines]
        lines[20] = line([0, 'theme name'], [15, 'NIGHT'], [33, 'p'])
        expect(parseThemeScreen(screen(lines))?.name).toBe('NIGHT')
    })

    test('converts HSV rows to RGB', () => {
        const lines = [...themeLines]
        lines[5] = line([0, 'mode'], [15, 'h  s  v  <>'])
        lines[6] = line([0, 'background'], [15, '00 00 ff'])
        lines[7] = line([0, 'text:empty'], [15, '00 ff ff'])
        const theme = parseThemeScreen(screen(lines))
        expect(theme?.mode).toBe('hsv')
        expect(theme?.colors.background).toBe('#ffffff')
        expect(theme?.colors.textEmpty).toBe('#ff0000')
    })

    test('refuses a half-drawn screen', () => {
        expect(parseThemeScreen(screen(themeLines.slice(0, 12)))).toBeNull()
    })
})

describe('observeThemeColors', () => {
    test('takes background and titles from the state, not the animated cursor', () => {
        const state = {
            backgroundColor: { r: 0, g: 0, b: 0 },
            titleColor: { r: 0x37, g: 0x96, b: 0xd0 },
            cursorColor: { r: 255, g: 0, b: 191 },
        } as M8State
        expect(observeThemeColors(state)).toEqual({ background: '#000000', textTitles: '#3796d0' })
    })
})

describe('parseGridScreen', () => {
    test('reads every song row, skipping the title and the track panel', () => {
        const lines = ['', '', '', line([0, 'song']), '']
        lines.push(line([0, '00'], [3, '00'], [6, '01'], [9, '--'], [32, 't>120']))
        lines.push(line([0, '01'], [3, '02'], [6, '--'], [9, 'fe']))
        lines[5] = `>${lines[5].slice(1)}` // play marker in the margin
        const rows = parseGridScreen('song', screen(lines))
        expect(rows.map((r) => r.rowIndex)).toEqual([0, 1])
        expect(rows[0].screenRow).toBe(5)
        expect(rows[0].fields.track1.hexValue).toBe(0)
        expect(rows[0].fields.track3.isEmpty).toBe(true)
        expect(rows[1].fields.track3.hexValue).toBe(0xfe)
    })

    test('reads phrase steps with their FX', () => {
        const lines = ['', '', '', line([0, 'phrase 1f*']), '']
        for (let i = 0; i < 16; i += 1) {
            lines.push(i === 2
                ? line([0, '2'], [2, 'c-4'], [6, '64'], [9, '03'], [12, 'kil03'], [18, '---00'], [24, '---00'])
                : line([0, i.toString(16)], [2, '---'], [6, '--'], [9, '--'], [12, '---00'], [18, '---00'], [24, '---00']))
        }
        const rows = parseGridScreen('phrase', screen(lines))
        expect(rows).toHaveLength(16)
        expect(rows[2].fields.note.rawValue).toBe('c-4')
        expect(rows[2].fields.inst.hexValue).toBe(3)
        expect(rows[2].fields.fx1cmd.rawValue).toBe('kil')
        expect(rows[2].fields.fx1val.hexValue).toBe(3)
        expect(rows[3].fields.fx1val.isEmpty).toBe(true)
    })

    test('ignores views without a grid', () => {
        expect(parseGridScreen('mixer', screen(themeLines))).toEqual([])
    })
})

describe('readPlayPositions', () => {
    // Captured on a Model:02 (firmware 6.5) playing LAAMAA_SNOWYDAY, Song view.
    const playing = [
        '',
        '',
        '',
        ' SONG',
        '',
        '    1  2  3  4  5  6  7  8        T>095',
        ' 00 00 01 02 FE 1C 07 17 FE',
        ' 01 26 0A 27 04 28 08 0F 11       1 C-4',
        ' 02>1B>16>12 23>13 10>0D 0C       2 F#5',
        ' 03 15 14 FD 2A 0E 10 0D 0C       3 F-6',
    ]

    test('a marker before a chain gives that track its song row', () => {
        const pos = readPlayPositions('song', screen(playing))
        expect(pos?.tracks).toEqual([2, 2, 2, null, 2, null, 2, null])
    })

    test('the playing row is still read as a song row', () => {
        const rows = parseGridScreen('song', screen(playing))
        expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3])
        expect(rows[2].fields.track1.hexValue).toBe(0x1b)
        expect(rows[2].fields.track4.hexValue).toBe(0x23)
    })

    test('other grid views: the row with the marker after its index, not the cursor row', () => {
        // Captured on the device: '<' marks the cursor row, '>' the playing step.
        const lines = [
            '', '', '', ' PHRASE 14', '',
            '   N   V  I  FX1   FX2   FX3      T>096',
            '<0 E-4 67 7F ---00 ---00 ---C0',
            ' 1 --- -- -- ---00 ---00 REP02    1 ---',
        ]
        for (let i = 2; i < 15; i += 1) lines.push(line([0, i.toString(16)], [2, '---'], [6, '--'], [9, '--'], [12, '---00'], [18, '---00'], [24, '---00']))
        lines.push(' F>--- -- -- ---00 ---00 ---00      V')
        expect(parseGridScreen('phrase', screen(lines))).toHaveLength(16)
        expect(readPlayPositions('phrase', screen(lines))).toEqual({ tracks: null, row: 15 })
        lines[21] = ' F --- -- -- ---00 ---00 ---00      V'
        expect(readPlayPositions('phrase', screen(lines))).toEqual({ tracks: null, row: null })
        expect(readPlayPositions('mixer', screen(lines))).toBeNull()
    })

    test('nothing playing', () => {
        const still = playing.map((l) => l.replace(/>/g, ' ').replace('T 095', 'T>095'))
        expect(readPlayPositions('song', screen(still))?.tracks).toEqual(Array(8).fill(null))
    })
})

describe('parseViewTitle', () => {
    test('splits the item number and the asterisk', () => {
        expect(parseViewTitle(' PHRASE 1F* ')).toEqual({ viewId: '1F', isUnsaved: true, marker: '*' })
        expect(parseViewTitle('PHRASE 27^')).toEqual({ viewId: '27', isUnsaved: false, marker: '^' })
        expect(parseViewTitle('INST. {3')).toEqual({ viewId: '03', isUnsaved: false, marker: null })
        expect(parseViewTitle('SONG')).toEqual({ viewId: null, isUnsaved: false, marker: null })
    })
})
