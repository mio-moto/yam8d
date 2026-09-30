import { expect, test } from 'bun:test'
import type { M8Screen, M8State } from '../packages/m8-sdk/src/types'
import { describeContext, describeContextParts, getSemanticContext } from '../packages/m8-sdk/src/viewContext'

//  fixture builders 

/** A data line (schema columns, no screen margin) with each text placed at its x. */
function row(...cells: [number, string][]): string {
  const chars = Array.from({ length: 40 }, () => ' ')
  for (const [x, text] of cells) for (let i = 0; i < text.length; i += 1) chars[x + i] = text[i]
  return chars.join('').trimEnd()
}

interface Fixture {
  viewName: string
  viewTitle: string
  /** Data lines by screen row; '>' at the start marks the playing row (drawn in the margin). */
  lines: string[]
  /** Screen rows to sweep the cursor over. */
  rows: number[]
  /** File browsers: the host reports the entry under the cursor. */
  entryUnderCursor?: boolean
}

const screenLine = (line: string): string => (line.startsWith('>') ? line : ` ${line}`).trimEnd()

function screenOf(f: Fixture): M8Screen {
  return { width: 320, height: 240, lines: f.lines.map(screenLine) }
}

function stateAt(f: Fixture, y: number, x: number): M8State {
  const line = screenLine(f.lines[y] ?? '')
  return {
    viewName: f.viewName,
    viewTitle: f.viewTitle,
    minimapKey: null,
    cursorPos: { x: x + 1, y },
    cursorRect: null,
    selectionMode: false,
    highlightColor: null,
    titleColor: null,
    backgroundColor: null,
    textUnderCursor: f.entryUnderCursor ? line.trim() || null : null,
    currentLine: line.trim() || null,
    deviceModel: null,
    fontMode: null,
    systemInfo: null,
    macroRunning: false,
  }
}

/** getSemanticContext for states that are known to have a view. */
function semanticContext(state: Parameters<typeof getSemanticContext>[0], screen?: Parameters<typeof getSemanticContext>[1]) {
  const context = getSemanticContext(state, screen)
  if (!context) throw new Error(`no semantic context for view ${state.viewName}`)
  return context
}

/**
 * describeContext() for every cursor position of the fixture, with the screen and
 * without it. Consecutive columns that read the same are collapsed into one entry.
 */
function sweep(f: Fixture): string[] {
  const screen = screenOf(f)
  const out: string[] = []
  for (const y of f.rows) {
    let previous = ''
    for (let x = 0; x < 40; x += 1) {
      const state = stateAt(f, y, x)
      const withScreen = describeContext(semanticContext(state, screen))
      const withoutScreen = describeContext(semanticContext(state))
      const entry = withoutScreen === withScreen ? withScreen : `${withScreen}\n        no screen: ${withoutScreen}`
      if (entry !== previous) out.push(`${y.toString().padStart(2)}:${x.toString().padStart(2)} ${entry}`)
      previous = entry
    }
  }
  return out
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)
const hex1 = (i: number): string => i.toString(16).toUpperCase()

//  grid views 

type Fx = [string, string]
interface Step {
  note?: string
  vel?: string
  inst?: string
  fx1?: Fx
  fx2?: Fx
  fx3?: Fx
  raw?: [number, string][]
}

function phraseStep(i: number, s: Step): string {
  const fx = (f?: Fx): Fx => f ?? ['---', '00']
  const [c1, v1] = fx(s.fx1)
  const [c2, v2] = fx(s.fx2)
  const [c3, v3] = fx(s.fx3)
  return row(
    [0, hex1(i)], [2, s.note ?? '---'], [6, s.vel ?? '--'], [9, s.inst ?? '--'],
    [12, c1], [15, v1], [18, c2], [21, v2], [24, c3], [27, v3], ...(s.raw ?? []),
  )
}

function phrase(title: string, steps: Record<number, Step>, playing?: number): Fixture {
  const lines = [row([0, title.trim()]), row([2, 'N'], [6, 'V'], [9, 'I'], [12, 'FX1'], [18, 'FX2'], [24, 'FX3'])]
  for (let i = 0; i < 16; i += 1) {
    const line = phraseStep(i, steps[i] ?? {})
    lines.push(i === playing ? `>${line}` : line)
  }
  return { viewName: 'phrase', viewTitle: title, lines, rows: range(2, 17) }
}

// REP / RTO / REP00 / replace in lane 1, relative FX + instrument and RET resets in lane 2.
const PHRASE = phrase(' PHRASE 02*', {
  0: { note: 'C-4', vel: '7F', inst: '00', fx1: ['VOL', '05'], fx2: ['ARP', '37'] },
  1: { fx1: ['REP', '02'], fx2: ['KIL', '03'] },
  2: { fx2: ['CUT', '85'] },
  3: { fx1: ['RTO', '0A'], fx3: ['TPO', '78'] },
  4: { fx2: ['CUT', '83'] },
  5: { note: 'D-4', vel: '60', inst: '01' },
  6: { fx2: ['RET', '32'], fx3: ['PIT', '0C'] },
  7: { fx1: ['REP', '00'], fx2: ['PIT', 'F4'] },
  8: { note: 'e-4', fx1: ['pit', '0c'], fx3: ['HOP', '04'] },
  9: { fx1: ['REP', '01'] },
  10: { fx2: ['DEL', '02'] },
  11: { note: 'OFF', fx1: ['TBL', '03'] },
  12: { fx2: ['REP', '04'] },
  13: { fx1: ['REP', '03'] },
  14: { fx3: ['CHA', '8F'] },
  15: { fx3: ['REP', '01'] },
}, 5)

// A REP carried over from the previous phrase ('^^' drawn in lane 2).
const PHRASE_CARRIED = phrase(' PHRASE 03', {
  0: { note: 'C-4', raw: [[18, '^^ ']] },
  2: { fx2: ['REP', '03'] },
  3: { fx2: ['VOL', '04'] },
  4: { fx2: ['REP', '01'] },
  6: { inst: '02', fx1: ['VOL', '10'] },
})

function tableRow(i: number, cells: [number, string][] = []): string {
  return row([0, hex1(i)], [2, '00'], [5, '--'], [8, '---'], [11, '00'], [14, '---'], [17, '00'], [20, '---'], [23, '00'], ...cells)
}

const TABLE: Fixture = {
  viewName: 'table',
  viewTitle: ' TABLE 01',
  lines: [
    row([0, 'TABLE 01']),
    row([2, 'N'], [5, 'V'], [8, 'FX1'], [14, 'FX2'], [20, 'FX3']),
    tableRow(0, [[2, '0C'], [5, '40'], [8, 'TIC'], [11, '04'], [14, 'CHA'], [17, '80']]),
    tableRow(1, [[2, 'F4'], [8, 'HOP'], [11, '23']]),
    tableRow(2, [[8, 'PIT'], [11, '81'], [14, 'REP'], [17, '02']]),
    tableRow(3),
  ],
  rows: range(2, 5),
}

const SONG: Fixture = {
  viewName: 'song',
  viewTitle: ' SONG',
  lines: [
    row([0, 'SONG']),
    row([3, '1'], [6, '2'], [9, '3']),
    row([0, '00'], [3, '00'], [6, '01'], [9, '--'], [12, '--'], [15, '--'], [18, '--'], [21, '--'], [24, '--']),
    row([0, '01'], [3, '02'], [6, '--'], [9, '0A'], [12, '--'], [15, '--'], [18, '--'], [21, '--'], [24, 'FF']),
  ],
  rows: [2, 3],
}

const CHAIN: Fixture = {
  viewName: 'chain',
  viewTitle: ' CHAIN F2*',
  lines: [
    row([0, 'CHAIN F2*']),
    row([2, 'P'], [5, 'T']),
    row([0, '0'], [2, '00'], [5, '00']),
    row([0, '1'], [2, '01'], [5, '0C']),
    row([0, '2'], [2, '1F'], [5, 'F4']),
    row([0, '3'], [2, '--'], [5, '00']),
  ],
  rows: range(2, 5),
}

const GROOVE: Fixture = {
  viewName: 'groove',
  viewTitle: ' GROOVE 00',
  lines: [
    row([0, 'GROOVE 00']),
    row([2, 'T']),
    row([0, '0'], [2, '06'], [6, '24'], [10, '50%']),
    row([0, '1'], [2, '00'], [6, '00']),
    row([0, '2'], [2, '--'], [6, '--']),
  ],
  rows: range(2, 4),
}

const POOL: Fixture = {
  viewName: 'instrumentpool',
  viewTitle: ' INST. POOL',
  lines: [
    row([0, 'INST. POOL']),
    row([3, 'NAME']),
    row([0, '00'], [3, 'BASS'], [16, 'C0'], [19, '00'], [22, '10'], [25, '20'], [28, '01']),
    row([0, '01'], [3, '------------'], [16, '--'], [19, '--'], [22, '--'], [25, '--'], [28, '--']),
  ],
  rows: [2, 3],
}

const SCALE: Fixture = {
  viewName: 'scale',
  viewTitle: ' SCALE 00',
  lines: [
    row([0, 'SCALE 00']),
    row([0, 'N'], [3, 'EN'], [6, 'OFFSET']),
    ...['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'].map((interval, i) => {
      const on = [0, 2, 4, 5, 7, 9, 11].includes(i)
      const en = interval === 'A#' ? '--' : on ? 'ON' : 'OFF'
      const offset = interval === 'E-' ? '-00.50' : interval === 'G#' ? '+01.00' : '00.00'
      return row([0, interval], [3, en], [6, offset])
    }),
    '',
    row([0, 'KEY'], [6, 'C']),
    row([0, 'TUNE'], [6, '440.00']),
    row([0, 'NAME'], [6, 'MAJOR']),
    row([6, 'LOAD'], [11, 'SAVE']),
  ],
  rows: [...range(2, 13), ...range(15, 18)],
}

//  parameter views 

function params(viewName: string, viewTitle: string, body: string[], extra: Partial<Fixture> = {}): Fixture {
  const lines = [row([0, viewTitle.trim()]), '', ...body]
  return { viewName, viewTitle, lines, rows: range(2, lines.length - 1), ...extra }
}

const PROJECT = params('project', ' PROJECT', [
  row([0, 'TEMPO'], [13, '120.00']),
  row([0, 'TRANSPOSE'], [13, '00']),
  row([0, 'GROOVE'], [13, '00DEFAULT']),
  row([0, 'SCALE'], [13, '00CHROMATIC']),
  row([0, 'LIVE QUANTIZ'], [13, '00']),
  row([0, 'MIDI'], [13, 'SETTINGS'], [22, 'MAPPINGS']),
  row([0, 'NAME'], [13, 'MySong']),
  row([0, 'PROJECT'], [13, 'LOAD'], [18, 'SAVE'], [23, 'NEW']),
  row([0, 'EXPORT/SHARE'], [13, 'RENDER'], [20, 'BUNDLE']),
])

const SYSTEM = params('systemsettings', ' SYSTEM SETTINGS', [
  row([0, 'BACKLIGHT'], [15, 'FF']),
  row([0, 'NOTE PREVIEW'], [15, 'ON']),
  row([0, 'KEY DELAY:REP'], [15, '150:45']),
  row([0, 'USB AUDIO MODE'], [15, 'OFF']),
])

const EFFECTS = params('effectsettings', ' EFFECT SETTINGS', [
  row([0, 'MODFX'], [7, 'MOD TYPE'], [21, '00CHORUS']),
  row([7, 'MOD DEPTH:FRQ'], [21, '40:80']),
  row([7, 'STEREO WIDTH'], [21, 'FF']),
  '',
  row([0, 'DELAY'], [7, 'INPUT EQ'], [21, '01']),
  row([7, 'TIME L:R'], [21, '30:30']),
  row([7, 'STEREO WIDTH'], [21, 'C0']),
  '',
  row([0, 'REVERB'], [7, 'ROOM SIZE'], [21, 'E0']),
  row([7, 'DECAY:SHIMMER'], [21, 'C0:00']),
])

const MIXER = params('mixer', ' MIXER', [
  row([0, 'OUTPUT VOL'], [12, 'E0']),
  row([0, 'E0'], [3, 'E0'], [6, 'D0'], [9, 'C0'], [12, 'E0'], [15, 'E0'], [18, 'E0'], [21, 'E0'], [27, 'EQ']),
  row([0, 'MX'], [3, 'DE'], [6, 'RE'], [27, 'F0']),
])

const MIXEQ = params('mixeq', ' MIXER EQ', [
  row([0, 'GAIN'], [5, '+01.50'], [16, '-03.00'], [27, '000.00']),
  row([0, 'FREQ'], [6, '100'], [17, '1000'], [28, '8000']),
  row([0, 'TYPE'], [6, 'LOWSHELF'], [17, 'BELL'], [28, 'HIGHSHELF']),
])

const INST = params('inst', ' INST. 00', [
  row([0, 'TYPE'], [8, 'WAVSYNTH'], [22, 'LOAD'], [27, 'SAVE']),
  row([0, 'NAME'], [8, 'Lead']),
  row([0, 'TRANSP.'], [8, 'ON'], [13, 'TBL. TIC'], [21, '01'], [26, 'EQ'], [29, '00']),
  row([0, 'SHAPE'], [8, '00PULSE12'], [18, 'AMP'], [22, '20']),
  row([0, 'SIZE'], [8, '80'], [18, 'LIM'], [22, '00CLIP']),
  row([0, 'FILTER'], [8, '01LOWPASS'], [18, 'PAN'], [22, '80']),
  row([0, 'CUTOFF'], [8, 'FF'], [18, 'DRY'], [22, 'C0']),
])

const INSTMODS = params('instmods', ' INST. MODS 00', [
  row([0, 'MOD1'], [5, 'AHD ENV'], [16, 'MOD2'], [21, 'LFO']),
  row([0, 'DEST'], [5, 'VOLUME'], [16, 'OSC'], [21, 'TRI']),
  row([0, 'AMT'], [5, 'FF'], [16, 'DEST'], [21, 'CUTOFF']),
  row([0, 'MOD3'], [5, 'TRIG ENV'], [16, 'MOD4'], [21, 'TRACKING']),
  row([0, 'DEST'], [5, 'PITCH'], [16, 'SRC'], [21, 'NOTE']),
])

const BROWSER = params('loadinstrument', ' LOAD INSTRUMENT', [
  row([0, '/..']),
  row([0, '/Bass']),
  row([0, 'Lead.m8i']),
  row([0, 'kick.wav']),
  row([0, 'song.m8s']),
  row([0, 'readme.txt']),
], { entryUnderCursor: true })

const NEW_DIR = params('createdirectory', ' CREATE DIRECTORY', [row([0, 'NEWDIR'])])

//  tests 

const FIXTURES: Record<string, Fixture> = {
  phrase: PHRASE,
  phraseCarried: PHRASE_CARRIED,
  table: TABLE,
  song: SONG,
  chain: CHAIN,
  groove: GROOVE,
  instrumentPool: POOL,
  scale: SCALE,
  project: PROJECT,
  systemSettings: SYSTEM,
  effectSettings: EFFECTS,
  mixer: MIXER,
  mixerEq: MIXEQ,
  instrument: INST,
  instrumentMods: INSTMODS,
  fileBrowser: BROWSER,
  createDirectory: NEW_DIR,
}

for (const [name, fixture] of Object.entries(FIXTURES)) {
  test(`describeContext: ${name}`, () => {
    expect(sweep(fixture)).toMatchSnapshot()
  })
}

const contextAt = (f: Fixture, y: number, x: number, withScreen = true) => semanticContext(stateAt(f, y, x), withScreen ? screenOf(f) : null)
const kindsAt = (f: Fixture, y: number, x: number) => describeContextParts(contextAt(f, y, x)).map((p) => p.kind)

test('describeContextParts: non-empty parts, no separator inside, same text as describeContext', () => {
  for (const f of Object.values(FIXTURES)) {
    for (const y of f.rows) {
      for (let x = 0; x < 40; x += 1) {
        for (const ctx of [contextAt(f, y, x), contextAt(f, y, x, false)]) {
          const parts = describeContextParts(ctx)
          expect(parts.length).toBeGreaterThan(0)
          for (const p of parts) {
            expect(p.text).not.toBe('')
            expect(p.text).not.toContain(' — ')
          }
          expect(parts.map((p) => p.text).join(' — ')).toBe(describeContext(ctx))
        }
      }
    }
  }
})

test('describeContextParts: kinds', () => {
  // Phrase step 1: KIL 03 in FX2, command then value.
  expect(kindsAt(PHRASE, 3, 18)).toEqual(['field', 'fxInfo', 'meaning', 'location'])
  expect(kindsAt(PHRASE, 3, 21)).toEqual(['field', 'fxTarget', 'meaning', 'location'])
  // Step 1: REP 02 in FX1 - explained by its lane, the generic REP blurb is left out.
  expect(kindsAt(PHRASE, 3, 12)).toEqual(['field', 'fxLane', 'relative', 'location'])
  // Step 5: instrument number that resets the relative changes.
  expect(kindsAt(PHRASE, 7, 9)).toEqual(['field', 'relative', 'location'])
  expect(kindsAt(SONG, 3, 9)).toEqual(['field', 'track', 'location'])
  expect(kindsAt(PHRASE, 2, 0)).toEqual(['location'])
  expect(kindsAt(EFFECTS, 8, 21)).toEqual(['field', 'fieldInfo', 'section', 'location'])
  expect(kindsAt(INST, 5, 8)).toEqual(['field', 'fieldInfo', 'instrument', 'location'])
  expect(kindsAt(BROWSER, 2, 0)).toEqual(['field', 'fileInfo', 'location'])
  expect(kindsAt(SCALE, 6, 0)).toEqual(['field', 'meaning', 'meaning', 'meaning', 'scale', 'scale', 'location'])
  expect(kindsAt(SCALE, 3, 6)).toEqual(['field', 'meaning', 'meaning', 'scale', 'scale', 'location'])
})

test('getSemanticContext: resetsRelative', () => {
  // Step 5 has an instrument number: VOL (driven by REP up to its RTO limit) and CUT are put back.
  const inst = contextAt(PHRASE, 7, 9).resetsRelative
  expect(inst?.VOL).toMatchObject({ total: 0x1f, resetBy: 'instrument', resetStep: 0, viaRep: true })
  expect(inst?.CUT).toMatchObject({ total: -0xf8, count: 2 })
  // Step 6 has a RET: what is in force after step 5's trigger.
  expect(contextAt(PHRASE, 8, 18).resetsRelative?.VOL).toMatchObject({ resetStep: 5, resetBy: 'instrument' })
  // Any cell of a triggering step carries it; other steps, step 0 and a missing screen don't.
  expect(contextAt(PHRASE, 7, 2).resetsRelative).not.toBeNull()
  expect(contextAt(PHRASE, 4, 9).resetsRelative).toBeNull()
  expect(contextAt(PHRASE, 2, 9).resetsRelative).toBeNull()
  expect(contextAt(PHRASE, 7, 9, false).resetsRelative).toBeNull()
})

test('getSemanticContext: scaleNote', () => {
  expect(contextAt(SCALE, 6, 6).scaleNote).toEqual({ interval: 'E', semitone: 4, enabled: true, offset: -0.5 })
  expect(contextAt(SCALE, 3, 0, false).scaleNote).toEqual({ interval: 'C#', semitone: 1, enabled: false, offset: 0 })
  expect(contextAt(SCALE, 12, 3).scaleNote?.enabled).toBeNull()
  const key = contextAt(SCALE, 15, 6)
  expect(key.isParameterView).toBe(true)
  expect(key.scaleNote).toBeNull()
  expect(contextAt(PHRASE, 2, 2).scaleNote).toBeNull()
})

test('getSemanticContext: fileKind', () => {
  const kinds = BROWSER.rows.map((y) => contextAt(BROWSER, y, 0).activeField?.fileKind)
  expect(kinds).toEqual(['parent', 'directory', 'instrumentPreset', 'sample', 'm8file', 'file'])
})

test('describeContext: no cursor line, unknown view', () => {
  const blank = { ...stateAt(SONG, 2, 3), currentLine: null }
  const unknown = { ...stateAt(SONG, 2, 3), viewName: 'nowhere' }
  expect([
    describeContext(semanticContext(blank)),
    describeContext(semanticContext(unknown)),
  ]).toMatchSnapshot()
})
