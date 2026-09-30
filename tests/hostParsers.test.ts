import { describe, expect, it } from 'bun:test'
import { M8KeyMask } from '../src/features/connection/keys'
import {
    getFileEntrySearchTerms,
    isDirectoryEntry,
    isFileBrowserView,
    isM8FileEntry,
    isParentDirectoryEntry,
} from '../src/sdk/host/fileBrowserHelpers'
import { calculateKeySequence, calculateNoteKeySequence } from '../src/sdk/host/keySequences'
import {
    detectFloatCursorFocus,
    formatFloatFromTicks,
    isCursorOnForeignFloat,
    parseFloatTokens,
    parseHexValue,
    parseIntValue,
    parseNoteValue,
    pickFloatTokenIndex,
} from '../src/sdk/host/valueParsers'

describe('value parsers', () => {
    it('parses hex values, treating "--" as 00', () => {
        expect(parseHexValue('3F')).toBe(0x3f)
        expect(parseHexValue('0x3f')).toBe(0x3f)
        expect(parseHexValue('--')).toBe(0)
        expect(parseHexValue('zz')).toBeNull()
        expect(parseHexValue(null)).toBeNull()
    })

    it('parses signed integers, treating "--" as 0', () => {
        expect(parseIntValue('123')).toBe(123)
        expect(parseIntValue('-12')).toBe(-12)
        expect(parseIntValue('+7')).toBe(7)
        expect(parseIntValue('--')).toBe(0)
        expect(parseIntValue('abc')).toBeNull()
    })

    it('parses notes into a semitone index', () => {
        expect(parseNoteValue('C-0')?.semitoneIndex).toBe(0)
        expect(parseNoteValue('C#1')?.semitoneIndex).toBe(13)
        expect(parseNoteValue('B-A')?.semitoneIndex).toBe(10 * 12 + 11)
        expect(parseNoteValue('---')).toBeNull()
    })

    it('parses float tokens with ticks measured in the displayed precision', () => {
        const [token] = parseFloatTokens('TUNE 440.00 G')
        expect(token.raw).toBe('440.00')
        expect(token.ticks).toBe(44000)
        expect(token.decScale).toBe(100)

        const [neg] = parseFloatTokens('C ON-10.69 7 ---')
        expect(neg.ticks).toBe(-1069)
        expect(formatFloatFromTicks(neg.ticks, neg.tickHundredths)).toBe('-10.69')
    })

    it('picks the float token under the cursor and detects focus', () => {
        const tokens = parseFloatTokens('GAIN 05.25 -19.75 -15.00')
        expect(pickFloatTokenIndex(tokens, '19.75')).toBe(1)
        expect(detectFloatCursorFocus(tokens[1], '19.75')).toBe('full')
        expect(detectFloatCursorFocus(tokens[1], '75')).toBe('dec')
        expect(detectFloatCursorFocus(tokens[1], '-19')).toBe('int')
        expect(isCursorOnForeignFloat(tokens, 0, '-15.00')).toBe(true)
        expect(isCursorOnForeignFloat(tokens, 0, '05.25')).toBe(false)
    })
})

describe('key sequences', () => {
    const pressed = (seq: number[]) => seq.filter((k) => k !== 0)

    it('uses fine steps (edit+left/right) under 16 and releases after every press', () => {
        const seq = calculateKeySequence(0x10, 0x13)
        expect(seq).toEqual([M8KeyMask.Edit | M8KeyMask.Right, 0, M8KeyMask.Edit | M8KeyMask.Right, 0, M8KeyMask.Edit | M8KeyMask.Right, 0])
    })

    it('uses large steps (edit+up/down) for jumps of 16 or more', () => {
        expect(pressed(calculateKeySequence(0, 32))).toEqual([M8KeyMask.Edit | M8KeyMask.Up, M8KeyMask.Edit | M8KeyMask.Up])
        expect(pressed(calculateKeySequence(0x20, 0x10))).toEqual([M8KeyMask.Edit | M8KeyMask.Down])
    })

    it('returns nothing when already on target', () => {
        expect(calculateKeySequence(5, 5)).toEqual([])
        expect(calculateNoteKeySequence(24, 24)).toEqual([])
    })

    it('moves notes by octaves (up/down) and semitones (left/right)', () => {
        expect(pressed(calculateNoteKeySequence(0, 14))).toEqual([
            M8KeyMask.Edit | M8KeyMask.Up,
            M8KeyMask.Edit | M8KeyMask.Right,
            M8KeyMask.Edit | M8KeyMask.Right,
        ])
        expect(pressed(calculateNoteKeySequence(12, 11))).toEqual([M8KeyMask.Edit | M8KeyMask.Left])
    })
})

describe('file browser helpers', () => {
    it('classifies entries', () => {
        expect(isParentDirectoryEntry('/..')).toBe(true)
        expect(isDirectoryEntry('/drums')).toBe(true)
        expect(isM8FileEntry('KICK.MBN')).toBe(true)
        expect(isM8FileEntry('/drums')).toBe(false)
        expect(isM8FileEntry('readme.txt')).toBe(false)
    })

    it('builds full and base-name search terms', () => {
        expect(getFileEntrySearchTerms('Kick.MBN')).toEqual(['kick.mbn', 'kick'])
        expect(getFileEntrySearchTerms('')).toEqual([])
    })

    it('detects load/save views by name or title', () => {
        expect(isFileBrowserView({ viewName: 'load', viewTitle: null })).toBe(true)
        expect(isFileBrowserView({ viewName: null, viewTitle: 'SAVE AS' })).toBe(true)
        expect(isFileBrowserView({ viewName: 'song', viewTitle: 'SONG' })).toBe(false)
    })
})
