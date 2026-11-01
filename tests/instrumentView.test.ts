import { expect, test } from 'bun:test'
import type { M8Screen, M8State } from '../packages/m8-sdk/src/types'
import { describeContext, getSemanticContext } from '../packages/m8-sdk/src/viewContext'

// Instrument views as captured on a Model:02, firmware 6.5 (data lines, no screen margin).
const FM = [
  'INST. 05',
  '',
  'TYPE    FMSYNTH       LOAD SAVE',
  'NAME    LEAD--------',
  'TRANSP. ON   TBL.TIC 01   EQ --',
  '',
  'ALGO    02[A>B+C]>D',
  '        A SW4 B W0F C SIN D SIN',
  'RATIO   01.00 02.00 01.00 00.50',
  'LEV/FB  80/00 FF/40 80/00 80/00',
  'MOD     1>RAT ----- 2>LEV -----',
  '        ----- 3>FBK ----- -----',
  'MOD1    70        AMP 00',
]
const SAMPLER = ['INST. 00', '', 'TYPE    SAMPLER       LOAD SAVE', '', '', '', 'SAMPLE  LOAD             REC.', '', 'SLICE   00OFF     AMP 00', 'PLAY    00FWD     LIM 00CLIP', 'START   00        PAN 80', 'LOOP ST 00        DRY C0', 'LENGTH  FF        MFX 00']
const HYPER = ['INST. 04', '', 'TYPE    HYPERSYN      LOAD SAVE', '', '', '', 'SCALE   00DEFAULT', 'CHORD   00> 00 00 00 00 00 00', '', '', 'SHAPE   00SAW']
const MIDI = ['INST. 06', '', 'TYPE    MIDI OUT      LOAD SAVE', '', '', '', 'PORT        00MIDI+USB', 'CHANNEL     01', 'BANK:PG    ---:---', 'CCA CC:VAL  074:7F', 'CCB CC:VAL  ---:--']
const EXTERNAL = ['INST. 07', '', 'TYPE    EXTERNAL      LOAD SAVE', '', '', '', 'INPUT   00LINE-IN STEREO', 'PORT    01MIDI+USB', 'CHANNEL 01', 'BANK:PG ---:---', '', 'CCA 001:--        AMP 00', 'CCB 002:7F        LIM 00CLIP']

/** What the SDK says with the cursor on the first character of the value at `x` of the line starting with `label`. */
function describeAt(lines: string[], label: string, x: number, nth = 0): string {
  const y = lines.map((line, i) => [line, i] as const).filter(([line]) => line.toUpperCase().startsWith(label))[nth][1]
  const screenLines = lines.map((line) => (line ? ` ${line.toLowerCase()}` : ''))
  const state: M8State = {
    viewName: 'inst',
    viewTitle: lines[0],
    minimapKey: null,
    cursorPos: { x: x + 1, y },
    cursorRect: null,
    selectionMode: false,
    highlightColor: null,
    titleColor: null,
    backgroundColor: null,
    textUnderCursor: null,
    currentLine: lines[y].toLowerCase().trim(),
    deviceModel: null,
    fontMode: null,
    systemInfo: null,
    macroRunning: false,
  }
  const screen: M8Screen = { width: 320, height: 240, lines: screenLines }
  const context = getSemanticContext(state, screen)
  if (!context) throw new Error('no context')
  return describeContext(context)
}

test('FM operator rows: every column is read on its own, with its operator', () => {
  const at = (label: string, nth = 0) => [8, 14, 20, 26].map((x) => describeAt(FM, label, x, nth))
  expect(at('RATIO').map((text) => /^Ratio \(RATIO\) · operator ([A-D]): (\S+)/.exec(text)?.slice(1))).toEqual([['A', '01.00'], ['B', '02.00'], ['C', '01.00'], ['D', '00.50']])
  expect(at('LEV/FB').map((text) => /^Level \/ Feedback \(LEV\/FB\) · operator ([A-D]): (\S+) \(level (\S+), feedback (\S+)\)/.exec(text)?.slice(1))).toEqual([
    ['A', '80/00', '80', '00'],
    ['B', 'FF/40', 'FF', '40'],
    ['C', '80/00', '80', '00'],
    ['D', '80/00', '80', '00'],
  ])
  expect(describeAt(FM, 'MOD', 8)).toContain('Modulation Slot 1 (MOD) · operator A: 1>RAT')
  expect(describeAt(FM, 'MOD', 8)).toContain('MOD1 RAT: adds 0.00 to +16.00')
  expect(describeAt(FM, 'MOD', 14)).toContain('operator B: (empty)')
  expect(describeAt(FM, 'MOD', 20)).toContain('MOD2 LEV: controls the level')
  // The second MOD row has no label.
  expect(describeAt(FM, '        -----', 14)).toContain('Modulation Slot 2 (MOD) · operator B: 3>FBK')
  expect(describeAt(FM, '        -----', 14)).toContain('MOD3 FBK: controls the feedback')
})

test('FM shapes are read at their own place', () => {
  expect([10, 16, 22, 28].map((x) => /^Shape · operator ([A-D]): (\S+)/.exec(describeAt(FM, '        A SW4', x))?.slice(1))).toEqual([['A', 'SW4'], ['B', 'W0F'], ['C', 'SIN'], ['D', 'SIN']])
})

test('FM rows that are not per operator keep their zones', () => {
  expect(describeAt(FM, 'MOD1', 8)).toContain('Modulation Source: 70h')
  expect(describeAt(FM, 'MOD1', 22)).toContain('Amplification (AMP)')
})

test('Sampler LOOP ST and LENGTH, as the device spells them', () => {
  expect(describeAt(SAMPLER, 'LOOP ST', 8)).toContain('Loop Start')
  expect(describeAt(SAMPLER, 'LENGTH', 8)).toContain('Length')
})

test('Hypersynth SHAPE and the whole chord', () => {
  expect(describeAt(HYPER, 'SHAPE', 8)).toContain('Shape (SHAPE): 00 SAW')
  expect(describeAt(HYPER, 'CHORD', 8)).toContain('Chord (CHORD): 00 > 00 00 00 00 00 00 —')
})

test('custom CC rows of MIDI OUT and EXTERNAL', () => {
  expect(describeAt(MIDI, 'CCA', 12)).toContain('Custom CC (CC:VAL): 074:7F')
  expect(describeAt(MIDI, 'CCB', 12)).toContain('Custom CC (CC:VAL): ---:--')
  expect(describeAt(EXTERNAL, 'CCB', 4)).toContain('Custom CC (CC:VAL): 002:7F')
  expect(describeAt(EXTERNAL, 'CCA', 22)).toContain('Amplification (AMP)')
})
