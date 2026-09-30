/**
 * viewContext.ts
 *
 * Derives semantic meaning from raw M8State by mapping cursor position and
 * currentLine content to typed, labelled fields using the m8-view-context.json schema.
 *
 * Every view listed in viewlist.json is mapped: the grid views (song, chain, phrase,
 * table, groove, scale, instrument pool) through their columns, the parameter views
 * (instrument, modulation, mixer, project, effects, EQ, scope, system settings, file
 * browsers) through the label/value layouts in m8-parameter-views.json.
 */

import type { M8Screen, M8State } from './types'
import schema from './m8-view-context.json'
import {
  describeOption,
  detectSection,
  detectSlot,
  getInstrumentType,
  getParameterLayout,
  instrumentTypeFromLines,
  parseValue,
  readParameterCells,
  type ParameterLayout,
  type ValueFormat,
} from './parameterViews'
import {
  analyzeFxLane,
  analyzeRelativeFx,
  describeFxLane,
  describeFxValue,
  describeRelativeFx,
  describeRelativeReset,
  formatFxValue,
  isRelativeFx,
  relativeResetBy,
  type M8FxLaneTrace,
  type M8RelativeFxState,
} from './fxInsight'
import { lookupFxCommand, type M8FxCommandInfo } from './fxCommands'
import {
  analyzeScale,
  describeInterval,
  formatOffset,
  normalizeInterval,
  SCALE_INTERVALS,
  scaleSummaryParts,
  type M8ScaleInfo,
  type M8ScaleNote,
} from './scaleInsight'

export type { M8FxLaneTrace, M8RelativeFxState } from './fxInsight'
export { getInstrumentFxCommands, lookupFxCommand, RELATIVE_FX_RULE } from './fxCommands'
export type { M8FxCommandInfo, M8InstrumentFxList } from './fxCommands'
export type { M8ScaleInfo, M8ScaleNote } from './scaleInsight'

//  Public field type union 

export type M8FieldType =
  | 'chainRef'
  | 'phraseRef'
  | 'note'
  | 'velocity'
  | 'instrumentRef'
  | 'fxCommand'
  | 'fxValue'
  | 'transpose'
  | 'ticks'
  | 'volume'
  | 'ppq'
  | 'instrumentName'
  | 'eqSlot'
  | 'rowIndex'
  | 'noteInterval'
  | 'onOff'
  | 'semitoneOffset'
  | 'swing'
  /** Instrument engine of the TYPE field (WAVSYNTH, SAMPLER, …). */
  | 'instrumentType'
  /** Free-text name field (instrument, song, directory). */
  | 'name'
  /** Named, editable value (CUTOFF, TEMPO, GAIN, …). */
  | 'parameter'
  /** Choice from a list, e.g. '00CHORUS', 'BELL'. */
  | 'option'
  /** Button-like caption (LOAD, SAVE, RENDER, SETTINGS, …). */
  | 'action'
  /** Row of a file browser ('/folder', '/..', 'Bass.m8i'). */
  | 'fileEntry'

/** What a file browser entry is: '/..', '/folder', 'Bass.m8i', 'kick.wav', 'song.m8s', anything else. */
export type M8FileKind = 'parent' | 'directory' | 'instrumentPreset' | 'sample' | 'm8file' | 'file'

//  Schema shapes (mirror m8-view-context.json / m8-parameter-views.json)

export interface ColumnDef {
  x: number
  width: number
  key: string
  type: M8FieldType
  label: string
  description?: string
  meta?: Record<string, unknown>
  /** How to read the text (parameter views); grid views use the type's built-in reading. */
  format?: ValueFormat
  /** Unit appended when showing the value (' BPM', ' dB', ' ms'). */
  unit?: string
  /** Names of the numbers of an 'XX:YY' pair (['delay', 'repeat']). */
  parts?: string[]
  /** Explanations of the options a choice cell can show, keyed by option name. */
  options?: Record<string, string>
}

interface RowFieldDef {
  x: number
  width: number
  parse: 'hex' | 'decimal'
  type: M8FieldType
  key: string
  description?: string
}

interface ViewDef {
  title: string
  type: 'grid' | 'parameter'
  description: string
  rowField?: RowFieldDef
  /** Column definitions for grid views. Parameter views have no columns. */
  columns?: ColumnDef[]
}

//  Public result types 

/**
 * A single parsed field value extracted from the currentLine.
 */
export interface M8ParsedField {
  /** Column key as defined in the schema (e.g. 'fx1cmd', 'note', 'track3'). */
  key: string
  /** Human-readable label (e.g. 'FX1 Command', 'Note (N)'). */
  label: string
  /** Semantic type of this field. */
  type: M8FieldType
  /** Raw text extracted from currentLine (trimmed). */
  rawValue: string
  /**
   * Parsed integer (from hex) when the field holds a numeric value.
   * `null` for empty cells ('--', '---') and text-only types (note name, fxCommand).
   */
  hexValue: number | null
  /** True when the cell is empty/unused ('--', '---', '---00'). */
  isEmpty: boolean
  /** Extra view-specific metadata (e.g. { trackIndex: 2 } for song view track columns). */
  meta?: Record<string, unknown>
  /** What this field is, from the schema (parameter views). */
  description?: string
  /**
   * Parameter views: the non-numeric part of the value - option name ('CHORUS'),
   * button caption ('LOAD'), instrument type ('WAVSYNTH'), name text. null otherwise.
   */
  text?: string | null
  /** Parameter views: the value as a number in its natural base (hex, decimal or fractional). */
  numericValue?: number | null
  /** Parameter views: both numbers of an 'XX:YY' pair (e.g. delay time left/right). */
  values?: number[] | null
  /** Names of the numbers in `values`, e.g. ['left time', 'right time']. */
  parts?: string[]
  /** Unit of the value, e.g. ' BPM'. */
  unit?: string
  /** What the currently selected option does (choice cells that list their options). */
  valueDescription?: string
  /** File browser rows: what the entry is. */
  fileKind?: M8FileKind
}

/**
 * All fields parsed from the current row (line at cursorPos.y).
 */
export interface M8ParsedRow {
  /** Row index (hex-parsed) derived from the leftmost chars of currentLine. null if not parseable. */
  rowIndex: number | null
  /** Schema key for the row index field (e.g. 'songRow', 'step', 'chainPos'). */
  rowKey: string
  /** Parameter views: id of the schema row that matched this line ('tempo', 'gain', …); null for grid views. */
  rowId: string | null
  /** Map of column key → parsed field for every column in this view. */
  fields: Record<string, M8ParsedField>
}

/**
 * The field currently under the cursor, plus row context.
 */
export interface M8ActiveField extends M8ParsedField {
  /** Repetition of the view name for convenience. */
  viewName: string
  /** Row index of the line containing this field (null if not parseable). */
  rowIndex: number | null
}

/**
 * Full semantic context for the current M8State.
 */
export interface M8SemanticContext {
  /** M8 view name (lowercased), e.g. 'song', 'phrase'. */
  viewName: string
  /** Human-readable view title from schema ('Song View', 'Phrase View', …). */
  viewTitle: string | null
  /** View description from the schema. */
  viewDescription: string | null
  /**
   * The numeric ID of the current view item, parsed from the screen title.
   * e.g. 'F2' from ' CHAIN F2*', '03' from ' PHRASE 03'.
   * null for views that have no item number (song, instrument pool).
   */
  viewId: string | null
  /** True when the title carries a '*' suffix, indicating unsaved changes. */
  isUnsaved: boolean
  /** Whether this view is a structured grid (song/chain/phrase/table/groove). */
  isGridView: boolean
  /** Whether this is a label/value parameter view (instrument, mixer, project, effects, EQ, …). */
  isParameterView: boolean
  /** Effect Settings View: the block the cursor is in ('MODFX', 'DELAY', 'REVERB'). */
  section: string | null
  /**
   * Instrument View: the engine on the TYPE row as displayed ('WAVSYNTH'), and its
   * normalised key ('wavsynth', 'macrosynth', 'sampler', 'fmsynth', 'hypersynth',
   * 'external', 'midiout'). Needs the screen; null otherwise.
   */
  instrumentType: { text: string; key: string | null } | null
  /** All fields on the line at cursorPos.y (null for non-grid views or missing line). */
  row: M8ParsedRow | null
  /** The specific field under the cursor (null when cursor is out of any column range). */
  activeField: M8ActiveField | null
  /** Text of the cursor row with the playback marker removed (null when there is none). */
  lineText: string | null
  /**
   * Every step of the current phrase (index = step 0-F), so an FX cell can be read
   * against the cells above it. Only filled for the phrase view, and only when a
   * screen matching the cursor row was passed to getSemanticContext().
   */
  steps: M8ParsedRow[] | null
  /**
   * FX lane (1-3) that shows the '^^' marker: a REP from a previous phrase is still
   * running there. null when no marker is on screen or there is no screen.
   */
  carriedRepLane: number | null
  /** What the active FX cell means in the light of its lane (phrase view with `steps`). */
  fxLane: M8FxLaneTrace | null
  /**
   * Relative instrument commands (VOL, CUT…) in force after the active step, with their
   * net change since the last note trigger (an instrument number in the I column or a RET).
   * Phrase view with `steps` only; null otherwise.
   */
  relativeFx: Record<string, M8RelativeFxState> | null
  /**
   * When the cursor step triggers the instrument again (an instrument number in the I
   * column, or a RET), the relative commands in force just before it: the trigger puts
   * their parameters back. Entries can have a net change of 0. Phrase view with `steps`,
   * from step 1 on; null otherwise.
   */
  resetsRelative: Record<string, M8RelativeFxState> | null
  /** Scale View: the interval row under the cursor. Null on the other rows and views. */
  scaleNote: M8ScaleNote | null
  /** Scale View only, when the whole screen was passed: the 12 intervals interpreted together. */
  scale: M8ScaleInfo | null
}

/** What a part of the description says, so a consumer can keep, drop, reorder or style it. */
export type M8DescriptionPartKind =
  /** Label and value of the field under the cursor: "FX1 Command: KIL", "Tempo (TEMPO): 120.00 BPM". */
  | 'field'
  /** What the FX command does in general: "(Kill: stops the playing instrument after XX ticks)". */
  | 'fxInfo'
  /** On an FX value, the command it belongs to: "for KIL (…)". */
  | 'fxTarget'
  /** What the value does here: "value 03: stops the note after 3 ticks", "E is detuned by −0.50 st". */
  | 'meaning'
  /** The FX lane read down the phrase: a running REP, its RTO limit, REP00… */
  | 'fxLane'
  /** Relative commands: their net change since the last trigger, or what a trigger resets. */
  | 'relative'
  /** What the selected option does. */
  | 'optionInfo'
  /** What the field is. */
  | 'fieldInfo'
  /** File browser: what the entry is and what [EDIT] does. */
  | 'fileInfo'
  /** Instrument View: the engine ("Wavsynth instrument"). */
  | 'instrument'
  /** Effect Settings block or modulator slot ("Delay", "MOD2"). */
  | 'section'
  /** Scale View: the scale the 12 intervals spell. */
  | 'scale'
  /** Song View: the track of the cell. */
  | 'track'
  /** Where the cursor is: view, item number, row ("Phrase View row 07", "Mixer View"). */
  | 'location'
  /** Text of the cursor row, when no field on it is recognised. */
  | 'line'

/** One piece of describeContext(); a kind can appear more than once. */
export interface M8DescriptionPart {
  kind: M8DescriptionPartKind
  text: string
}

//  Internal helpers 

const EMPTY_PATTERNS = new Set(['--', '---', '---00', '----', '-'])

function isEmptyRaw(raw: string): boolean {
  if (!raw) return true
  // Also count strings that are all dashes
  return EMPTY_PATTERNS.has(raw) || /^-+$/.test(raw)
}

function parseHex(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed || isEmptyRaw(trimmed)) return null
  const n = parseInt(trimmed, 16)
  return Number.isNaN(n) ? null : n
}

function extractFromLine(line: string, x: number, width: number): string {
  // Guard: x may exceed line length (line might be shorter than full 40-char row)
  if (x >= line.length) return ''
  return line.slice(x, Math.min(x + width, line.length))
}

/**
 * When a row is currently playing, the M8 prepends a single non-alphanumeric
 * indicator character (e.g. '<' or '>') to currentLine, shifting all data
 * positions right by 1. Strip it so column offsets remain consistent.
 * Returns the clean line and the number of stripped characters (0 or 1).
 */
/**
 * Extracts the item ID and unsaved flag from a raw M8 screen title.
 * Titles follow the pattern ' VIEWNAME ID*  ' where ID is 1–2 hex chars
 * and '*' is an optional unsaved-changes marker.
 * Returns { viewId: null, isUnsaved: false } for views without an item number.
 */
function extractViewId(rawTitle: string | null): { viewId: string | null; isUnsaved: boolean } {
  if (!rawTitle) return { viewId: null, isUnsaved: false }
  // The M8 font draws a slashed zero as '{' / '}' in some titles (e.g. 'PHRASE {2').
  const trimmed = rawTitle.replace(/[{}]/g, '0').trim()
  const isUnsaved = trimmed.endsWith('*')
  const withoutStar = isUnsaved ? trimmed.slice(0, -1).trimEnd() : trimmed
  const parts = withoutStar.split(/\s+/)
  const last = parts[parts.length - 1] ?? ''
  // Accept 1–2 uppercase hex digits as a view ID
  const viewId = /^[0-9A-Fa-f]{1,2}$/.test(last) ? last.toUpperCase() : null
  return { viewId, isUnsaved }
}

function stripPlaybackIndicator(line: string): { line: string; offset: number } {
  if (line.length > 0 && /^[^a-zA-Z0-9 ]/.test(line[0])) {
    return { line: line.slice(1), offset: 1 }
  }
  return { line, offset: 0 }
}

function parseColumn(col: ColumnDef, line: string): M8ParsedField {
  let raw = extractFromLine(line, col.x, col.width).trim()
  // The '^^' marker (a REP still running from a previous phrase) is not cell content.
  if (raw.includes('^') && (col.type === 'fxCommand' || col.type === 'fxValue')) raw = ''
  const empty = isEmptyRaw(raw)

  // Parameter views say how to read each cell; grid views use the type's built-in reading below.
  if (col.format) {
    const v = empty ? null : parseValue(raw, col.format)
    // Option names and captions come from a fixed vocabulary and are shown upper case;
    // names the user typed and file names keep the case the device sent.
    const keepCase = col.type === 'name' || col.type === 'fileEntry'
    const text = v?.text != null && !keepCase ? v.text.toUpperCase() : (v?.text ?? null)
    return {
      key: col.key,
      label: col.label,
      type: col.type,
      rawValue: raw,
      hexValue: v?.hexValue ?? null,
      isEmpty: empty,
      meta: col.meta,
      description: col.description,
      text,
      numericValue: v?.numericValue ?? null,
      values: v?.values ?? null,
      parts: col.parts,
      unit: col.unit,
      valueDescription: (!empty && describeOption(col.options, text ?? raw)) || undefined,
      fileKind: col.type === 'fileEntry' ? fileKindOf(raw) : undefined,
    }
  }

  // Numeric types we try to parse as hex
  const numericTypes: M8FieldType[] = [
    'chainRef', 'phraseRef', 'velocity', 'instrumentRef',
    'fxValue', 'transpose', 'ticks', 'volume', 'ppq', 'eqSlot', 'rowIndex',
  ]
  // Types that are decimal (not hex)
  const decimalTypes: M8FieldType[] = ['ppq']
  let hexValue: number | null = null
  if (!empty && numericTypes.includes(col.type)) {
    if (decimalTypes.includes(col.type)) {
      const n = parseInt(raw, 10)
      hexValue = Number.isNaN(n) ? null : n
    } else {
      hexValue = parseHex(raw)
    }
  }

  return {
    key: col.key,
    label: col.label,
    type: col.type,
    rawValue: raw,
    hexValue,
    isEmpty: empty,
    meta: col.meta,
  }
}

function fileKindOf(name: string): M8FileKind {
  if (name === '/..') return 'parent'
  if (name.startsWith('/')) return 'directory'
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  if (ext === 'm8i') return 'instrumentPreset'
  if (ext === 'wav') return 'sample'
  return ext?.startsWith('m8') ? 'm8file' : 'file'
}

function parseRowIndex(line: string, rf: RowFieldDef): number | null {
  const raw = extractFromLine(line, rf.x, rf.width).trim()
  if (!raw) return null
  if (rf.parse === 'hex') return parseHex(raw)
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

/**
 * Find the column whose x range contains cursorX.
 * Falls back to the closest column within 1-character tolerance.
 */
function findColumn(cols: ColumnDef[], cursorX: number): ColumnDef | null {
  // Exact range hit
  for (const col of cols) {
    if (cursorX >= col.x && cursorX < col.x + col.width) return col
  }
  // 1-char tolerance (cursor border may be 1 px off)
  let best: ColumnDef | null = null
  let bestDist = 2 // reject anything > 1 char away
  for (const col of cols) {
    const dist = Math.min(
      Math.abs(cursorX - col.x),
      Math.abs(cursorX - (col.x + col.width - 1)),
    )
    if (dist < bestDist) {
      bestDist = dist
      best = col
    }
  }
  return best
}

function parseRow(viewDef: ViewDef, line: string): M8ParsedRow {
  const fields: Record<string, M8ParsedField> = {}
  for (const col of viewDef.columns ?? []) {
    fields[col.key] = parseColumn(col, line)
  }
  // '---00': an FX lane without a command shows a filler value that means nothing.
  for (const key of Object.keys(fields)) {
    const lane = /^fx(\d)cmd$/.exec(key)?.[1]
    const value = lane ? fields[`fx${lane}val`] : undefined
    if (value && fields[key].isEmpty) fields[`fx${lane}val`] = { ...value, isEmpty: true }
  }
  return {
    rowIndex: viewDef.rowField ? parseRowIndex(line, viewDef.rowField) : null,
    rowKey: viewDef.rowField?.key ?? 'row',
    rowId: null,
    fields,
  }
}

const squash = (s: string): string => s.replace(/\s+/g, '')

/**
 * Every screen row has a one-column left margin (the playback marker '<' / '>' is drawn
 * in it), so the schema's x positions are counted from column 1, and `cursorPos.x` is
 * one more than the schema x of the cell it covers. `currentLine` is trimmed and so
 * already starts at the schema's column 0.
 */
export const SCREEN_MARGIN = 1

/** A screen row with the margin removed: columns then match the schema's x positions. */
const screenDataLine = (raw: string): string => raw.slice(SCREEN_MARGIN)

/**
 * The screen can lag behind the state (they arrive through separate messages), so
 * only trust it when its row under the cursor is the very line we were given.
 * `currentLine` is trimmed while screen lines keep their columns, hence squash().
 */
function screenMatchesCursor(state: M8State, screen: M8Screen | null | undefined): screen is M8Screen {
  if (!screen || !state.cursorPos || !state.currentLine) return false
  const onScreen = screen.lines[state.cursorPos.y]
  return onScreen != null && squash(onScreen) === squash(state.currentLine)
}

const PHRASE_STEPS = 16

/**
 * All 16 steps of the phrase on screen, plus the FX lane showing the '^^' marker
 * (a REP carried over from a previous phrase). Null when any step does not line up.
 */
function readPhraseSteps(
  viewDef: ViewDef,
  state: M8State,
  screen: M8Screen,
  cursorStep: number,
): { steps: M8ParsedRow[]; carriedRepLane: number | null } | null {
  const y0 = (state.cursorPos?.y ?? -1) - cursorStep
  if (y0 < 0) return null

  const steps: M8ParsedRow[] = []
  let carriedRepLane: number | null = null
  for (let i = 0; i < PHRASE_STEPS; i += 1) {
    const raw = screen.lines[y0 + i]
    if (raw == null) return null
    const line = screenDataLine(raw)
    const row = parseRow(viewDef, line)
    if (row.rowIndex !== i) return null
    steps.push(row)

    // '^^' sits next to the FX lane a previous phrase's REP is still driving.
    const caret = line.indexOf('^^')
    if (carriedRepLane == null && caret >= 0) carriedRepLane = nearestFxLane(viewDef, caret)
  }
  return { steps, carriedRepLane }
}

/**
 * FX lane (1-3) that text column `x` belongs to: inside a lane's cells, or at most one
 * column outside exactly one lane. Null when it is out of reach or ambiguous - the
 * manual doesn't say exactly where the '^^' is drawn, so don't guess.
 */
function nearestFxLane(viewDef: ViewDef, x: number): number | null {
  const dists: { lane: number; dist: number }[] = []
  for (let lane = 1; lane <= 3; lane += 1) {
    const cmd = viewDef.columns?.find((c) => c.key === `fx${lane}cmd`)
    const val = viewDef.columns?.find((c) => c.key === `fx${lane}val`)
    if (!cmd || !val) continue
    const to = val.x + val.width - 1
    dists.push({ lane, dist: x < cmd.x ? cmd.x - x : x > to ? x - to : 0 })
  }
  const min = Math.min(...dists.map((d) => d.dist))
  const closest = dists.filter((d) => d.dist === min)
  return min <= 1 && closest.length === 1 ? closest[0].lane : null
}

/** A Scale View row as an interval; null when its first column is not an interval label. */
function parseScaleNote(row: M8ParsedRow): M8ScaleNote | null {
  const interval = normalizeInterval(row.fields.interval?.rawValue ?? '')
  if (!interval) return null
  const en = row.fields.en?.rawValue.toUpperCase()
  const offset = parseFloat(row.fields.offset?.rawValue ?? '')
  return {
    interval,
    semitone: (SCALE_INTERVALS as readonly string[]).indexOf(interval),
    enabled: en === 'ON' ? true : en === 'OFF' ? false : null,
    offset: Number.isNaN(offset) ? null : offset,
  }
}

/** Reads the 12 interval rows of the Scale View off the screen. Null unless all 12 are found. */
function readScaleNotes(viewDef: ViewDef, screen: M8Screen): M8ScaleNote[] | null {
  const found = new Map<string, M8ScaleNote>()
  for (const raw of screen.lines) {
    const row = parseRow(viewDef, screenDataLine(raw))
    const note = parseScaleNote(row)
    // An interval row reads ON, OFF or '--' in its EN column.
    const en = row.fields.en?.rawValue.toUpperCase()
    if (!note || (en !== 'ON' && en !== 'OFF' && en !== '--')) continue
    if (!found.has(note.interval)) found.set(note.interval, note)
  }
  if (found.size !== SCALE_INTERVALS.length) return null
  return SCALE_INTERVALS.map((i) => found.get(i) as M8ScaleNote)
}

/**
 * Context of a label/value parameter view. The line is read from the screen when a
 * matching one is available (it keeps leading blanks, which the trimmed `currentLine`
 * loses), and the section / instrument type are found by looking at the lines around it.
 */
function getParameterContext(
  state: M8State,
  screen: M8Screen | null | undefined,
  layout: ParameterLayout,
  head: Pick<M8SemanticContext, 'viewName' | 'viewTitle' | 'viewDescription' | 'viewId' | 'isUnsaved'>,
): M8SemanticContext {
  const empty: M8SemanticContext = {
    ...head,
    isGridView: false,
    isParameterView: true,
    section: null,
    instrumentType: null,
    row: null,
    activeField: null,
    lineText: null,
    steps: null,
    carriedRepLane: null,
    fxLane: null,
    relativeFx: null,
    resetsRelative: null,
    scaleNote: null,
    scale: null,
  }

  const cursor = state.cursorPos
  const cursorX = cursor ? cursor.x - SCREEN_MARGIN : 0
  const trusted = cursor && screenMatchesCursor(state, screen) ? screen : null
  let line = trusted && cursor ? screenDataLine(trusted.lines[cursor.y] ?? '') : (state.currentLine ?? '')
  if (!line.trim()) return empty

  const linesUpward = trusted && cursor ? trusted.lines.slice(0, cursor.y + 1).reverse().map(screenDataLine) : [line]
  const instrumentType =
    head.viewName === 'inst' ? instrumentTypeFromLines(trusted ? trusted.lines.map(screenDataLine) : [line]) : null
  const opts = { instrumentKey: instrumentType?.key ?? null, entryText: state.textUnderCursor }

  // `currentLine` is trimmed, so a row that starts with blanks lost its column offsets.
  // Without the screen, put blanks back until the cursor lands inside a recognised cell.
  if (!trusted && cursor && layout.kind == null) {
    for (let pad = 0; pad <= Math.min(cursorX, 24); pad += 1) {
      const padded = ' '.repeat(pad) + line
      const found = readParameterCells(layout, padded, { ...opts, section: detectSection(layout, [padded]) })
      if (found.cells.some((c) => cursorX >= c.x && cursorX < c.x + c.width)) {
        line = padded
        break
      }
    }
  }

  let section = detectSection(layout, trusted ? linesUpward : [line])
  const { rowId, cells } = readParameterCells(layout, line, { ...opts, section })
  const fields: Record<string, M8ParsedField> = {}
  for (const cell of cells) fields[cell.key] = parseColumn(cell, line)
  const row: M8ParsedRow = { rowIndex: null, rowKey: 'param', rowId, fields }

  let activeField: M8ActiveField | null = null
  const cell = cursor ? findColumn(cells, cursorX) : null
  if (cell) activeField = { ...fields[cell.key], viewName: head.viewName, rowIndex: null }

  // Modulation view: which of MOD1-MOD4 the cell belongs to (the heading of its block).
  const zoneId = cell?.meta?.zone
  if (trusted && typeof zoneId === 'string') section = detectSlot(layout, zoneId, linesUpward) ?? section

  return { ...empty, section, instrumentType, row, activeField, lineText: line.trim() }
}

//  Public API

/**
 * Derives a full semantic context from the current M8State.
 *
 * Pass the whole `screen` (see M8Client.getScreen) to let the context look beyond the
 * cursor row: the other steps of a phrase (so an FX cell can be read against the
 * commands above it) and the other rows of the Scale View. Without a screen, or with
 * one that no longer matches the cursor row, only the cursor row is interpreted.
 *
 * @example
 * ```ts
 * const ctx = getSemanticContext(state)
 * if (ctx?.activeField?.type === 'chainRef') {
 *   const track = ctx.activeField.meta?.trackIndex  // 1–8
 *   const chainNum = ctx.activeField.hexValue        // 0–255 or null if empty
 *   const songRow = ctx.row?.rowIndex
 * }
 * ```
 */
export function getSemanticContext(state: M8State, screen?: M8Screen | null): M8SemanticContext | null {
  const viewName = state.viewName
  if (!viewName) return null

  const viewDefs = schema.views as Record<string, ViewDef>
  const viewDef = viewDefs[viewName] ?? null

  const isGridView = viewDef?.type === 'grid'
  const viewTitle = viewDef?.title ?? null
  const viewDescription = viewDef?.description ?? null
  const { viewId, isUnsaved } = extractViewId(state.viewTitle)
  const head = { viewName, viewTitle, viewDescription, viewId, isUnsaved }
  const base = { ...head, isParameterView: false, section: null, instrumentType: null, lineText: null, steps: null, carriedRepLane: null, fxLane: null, relativeFx: null, resetsRelative: null, scaleNote: null, scale: null }

  const paramLayout = viewDef?.type === 'parameter' ? getParameterLayout(viewName) : null
  if (paramLayout) return getParameterContext(state, screen, paramLayout, head)

  if (!isGridView || !viewDef) {
    return { ...base, isGridView: false, row: null, activeField: null }
  }

  const rawLine = state.currentLine
  if (!rawLine) {
    return { ...base, isGridView: true, row: null, activeField: null }
  }

  // Strip playback indicator prefix ('>' or '<') emitted when the row is playing.
  const { line } = stripPlaybackIndicator(rawLine)
  const cursorX = state.cursorPos ? state.cursorPos.x - SCREEN_MARGIN : 0

  const row = parseRow(viewDef, line)

  // The rows under the 12 scale intervals (KEY, TUNE, NAME, LOAD/SAVE) are label/value rows.
  const scaleLayout = viewName === 'scale' && !normalizeInterval(row.fields.interval?.rawValue ?? '') ? getParameterLayout(viewName) : null
  if (scaleLayout) return getParameterContext(state, screen, scaleLayout, head)

  // Determine active field from cursor X position
  let activeField: M8ActiveField | null = null
  if (state.cursorPos) {
    const col = findColumn(viewDef.columns ?? [], cursorX)
    if (col) {
      const field = row.fields[col.key]
      if (field) {
        activeField = { ...field, viewName, rowIndex: row.rowIndex }
      }
    }
  }

  // Look beyond the cursor row when a screen that still matches it was supplied.
  let steps: M8ParsedRow[] | null = null
  let carriedRepLane: number | null = null
  let fxLane: M8FxLaneTrace | null = null
  let relativeFx: Record<string, M8RelativeFxState> | null = null
  let resetsRelative: Record<string, M8RelativeFxState> | null = null
  let scale: M8ScaleInfo | null = null
  if (screenMatchesCursor(state, screen)) {
    if (viewName === 'phrase' && row.rowIndex != null) {
      const phrase = readPhraseSteps(viewDef, state, screen, row.rowIndex)
      if (phrase) {
        steps = phrase.steps
        carriedRepLane = phrase.carriedRepLane
        const lane = activeField ? /^fx(\d)(cmd|val)$/.exec(activeField.key)?.[1] : undefined
        if (lane) fxLane = analyzeFxLane(steps, Number(lane), row.rowIndex, carriedRepLane === Number(lane))
        relativeFx = analyzeRelativeFx(steps, row.rowIndex, carriedRepLane)
        if (row.rowIndex > 0 && relativeResetBy(row)) resetsRelative = analyzeRelativeFx(steps, row.rowIndex - 1, carriedRepLane)
      }
    } else if (viewName === 'scale') {
      const notes = readScaleNotes(viewDef, screen)
      if (notes) scale = analyzeScale(notes)
    }
  }
  const scaleNote = viewName === 'scale' ? parseScaleNote(row) : null

  return {
    ...base,
    isGridView: true,
    row,
    activeField,
    lineText: line.trim() || null,
    steps,
    carriedRepLane,
    fxLane,
    relativeFx,
    resetsRelative,
    scaleNote,
    scale,
  }
}

/**
 * What the cursor is on, as ordered, tagged parts. Every part is built from
 * `ctx` alone, so a consumer can keep, drop, reorder or restyle them, or ignore them
 * and write its own text from the context.
 *
 * @example
 * ```ts
 * describeContextParts(ctx)
 * // [{ kind: 'field', text: 'FX2 Command: KIL' },
 * //  { kind: 'fxInfo', text: '(Kill: stops the playing instrument after XX ticks)' },
 * //  { kind: 'meaning', text: 'value 03: stops the note after 3 ticks' },
 * //  { kind: 'location', text: 'Phrase View row 01' }]
 * ```
 */
export function describeContextParts(ctx: M8SemanticContext): M8DescriptionPart[] {
  if (ctx.isParameterView) return describeParameterContext(ctx)
  if (ctx.viewName === 'scale') {
    const scaleParts = describeScaleContext(ctx)
    if (scaleParts) return scaleParts
  }
  if (!ctx.activeField) return partsOf(['location', ctx.viewTitle ?? ctx.viewName])

  const { activeField: f, row } = ctx
  const parts = partsOf(['field', `${f.label}: ${formatFieldValue(f)}`])

  // What the FX does here, read against its surroundings (value meaning, running REP…)
  const isFx = f.type === 'fxCommand' || f.type === 'fxValue'
  const meaning = isFx && row ? describeFxCell(ctx, f, row) : describeInstrumentCell(ctx, f)
  // The generic REP/RTO blurb only repeats what the specific explanation already says.
  const explained = meaning.length > 0

  // FX command extra info
  if (f.type === 'fxCommand' && !f.isEmpty) {
    const info = explained && /^(REP|RTO)$/i.test(f.rawValue) ? undefined : lookupFxCommand(f.rawValue)
    if (info) parts.push({ kind: 'fxInfo', text: `(${fxInfoText(info)})` })
  }

  // FX value context: include sibling command if we're on a value column
  if (f.type === 'fxValue' && row) {
    const cmdKey = f.key.replace('val', 'cmd') // fx1val → fx1cmd, fx2val → fx2cmd …
    const cmdField = row.fields[cmdKey]
    if (cmdField && !cmdField.isEmpty) {
      const info = explained && /^(REP|RTO)$/i.test(cmdField.rawValue) ? undefined : lookupFxCommand(cmdField.rawValue)
      const label = info ? `${cmdField.rawValue} (${fxInfoText(info)})` : cmdField.rawValue
      parts.push({ kind: 'fxTarget', text: `for ${label}` })
    }
  }

  parts.push(...meaning)

  // Track index for song view
  if (f.meta?.trackIndex != null) parts.push({ kind: 'track', text: `Track ${f.meta.trackIndex}` })

  // Row index
  if (row?.rowIndex != null) {
    const rowHex = row.rowIndex.toString(16).toUpperCase().padStart(2, '0')
    parts.push({ kind: 'location', text: `${ctx.viewTitle ?? ctx.viewName} row ${rowHex}` })
  }

  return parts
}

/**
 * Returns a short human-readable description of what the cursor is currently on:
 * the text of describeContextParts(), joined with ' — '.
 *
 * @example
 * "Track 3: 0A — Track 3 — Song View row 01"
 * "Note (N): Note C-4 — Phrase View row 00"
 * "FX2 Command: KIL — (Kill: stops the playing instrument after XX ticks) — value 03: stops the note after 3 ticks — Phrase View row 01"
 */
export function describeContext(ctx: M8SemanticContext): string {
  return describeContextParts(ctx)
    .map((p) => p.text)
    .join(' — ')
}

/** Parts in the order given, leaving out those with no text. */
function partsOf(...entries: [M8DescriptionPartKind, string | null | undefined][]): M8DescriptionPart[] {
  return entries.flatMap(([kind, text]) => (text ? [{ kind, text }] : []))
}

/**
 * Meaning of the FX cell under the cursor. Uses the lane trace (REP/RTO, empty cells
 * under a running REP) when the phrase was read off the screen, else explains the
 * value of the command in this row.
 */
function describeFxCell(ctx: M8SemanticContext, f: M8ActiveField, row: M8ParsedRow): M8DescriptionPart[] {
  const lane = /^fx(\d)/.exec(f.key)?.[1]
  if (!lane) return []
  const cmd = row.fields[`fx${lane}cmd`]
  const val = row.fields[`fx${lane}val`]

  // Empty cell: only interesting when a REP is still running through it.
  if (!cmd || cmd.isEmpty) {
    if (ctx.fxLane?.event !== 'continue') return []
    const repeated = ctx.fxLane.source?.cmd
    const relative = repeated && isRelativeFx(repeated) ? describeRelativeFx(ctx.relativeFx?.[repeated]) : null
    return partsOf(['fxLane', describeFxLane(ctx.fxLane)], ['relative', relative])
  }

  const name = cmd.rawValue.toUpperCase()
  const laneText = ctx.fxLane && ctx.fxLane.event !== 'none' && ctx.fxLane.event !== 'set' ? describeFxLane(ctx.fxLane) : null
  // REP / RTO are explained entirely by the lane; other commands add their value meaning.
  if (name === 'REP' || name === 'RTO') {
    const repeated = ctx.fxLane?.source?.cmd
    const relative = name === 'REP' && ctx.fxLane?.active && repeated && isRelativeFx(repeated) ? describeRelativeFx(ctx.relativeFx?.[repeated]) : null
    return partsOf(['fxLane', laneText], ['relative', relative])
  }
  if (!val || val.isEmpty || val.hexValue == null) return partsOf(['fxLane', laneText])

  const shown = f.type === 'fxCommand' ? `value ${formatFxValue(name, val.hexValue)}: ` : ''
  const described = describeFxValue(name, val.hexValue, {
    note: row.fields.note?.isEmpty ? null : row.fields.note?.rawValue,
    inTable: ctx.viewName === 'table',
  })
  // Relative commands stay applied until a note with an instrument number or a RET resets them.
  let relative: string | null = null
  if (isRelativeFx(name)) relative = describeRelativeFx(ctx.relativeFx?.[name])
  else if (name === 'RET' && ctx.resetsRelative) relative = describeRelativeReset(ctx.resetsRelative)
  return partsOf(['meaning', described ? `${shown}${described}` : null], ['fxLane', laneText], ['relative', relative])
}

/** Command description, plus the instrument types that offer it when not all do. */
function fxInfoText(info: M8FxCommandInfo): string {
  const text = info.description.replace(/\.$/, '')
  if (!info.instrumentTypes) return text
  return `${text}; offered by ${info.instrumentTypes.map((t) => INSTRUMENT_TYPE_LABELS[t] ?? t).join(', ')} instruments`
}

const INSTRUMENT_TYPE_LABELS: Record<string, string> = {
  sampler: 'Sampler',
  macrosynth: 'Macrosynth',
  fmsynth: 'FM Synth',
  hypersynth: 'Hypersynth',
  wavsynth: 'Wavsynth',
  external: 'External',
  midiout: 'MIDI Out',
}

/**
 * Instrument number typed on a step of a phrase: it retriggers the instrument, which
 * wipes the relative FX changes that were still in force.
 */
function describeInstrumentCell(ctx: M8SemanticContext, f: M8ActiveField): M8DescriptionPart[] {
  if (f.type !== 'instrumentRef' || f.isEmpty || !ctx.resetsRelative) return []
  return partsOf(['relative', describeRelativeReset(ctx.resetsRelative)])
}

const SECTION_NAMES: Record<string, string> = { MODFX: 'ModFX', DELAY: 'Delay', REVERB: 'Reverb' }

const FILE_KIND_TEXT: Record<M8FileKind, string> = {
  parent: 'goes up to the parent directory',
  directory: 'directory: [EDIT] opens it',
  instrumentPreset: 'instrument preset: [EDIT] selects it',
  sample: 'sample: [EDIT] selects it',
  m8file: 'M8 file: [EDIT] selects it',
  file: 'file: [EDIT] selects it',
}

/**
 * Parameter views: "<label>: <value> — <what the option does> — <what the field is>
 * — <where>". The instrument type and effect section are added when they change what
 * the field means.
 */
function describeParameterContext(ctx: M8SemanticContext): M8DescriptionPart[] {
  const title = `${ctx.viewTitle ?? ctx.viewName}${ctx.viewId ? ` ${ctx.viewId}` : ''}`
  const f = ctx.activeField
  if (!f) return partsOf(['location', title], ['line', ctx.lineText])

  const type = ctx.instrumentType?.key ? getInstrumentType(ctx.instrumentType.key) : null
  return partsOf(
    ['field', `${f.label}: ${formatFieldValue(f)}`],
    ['optionInfo', f.valueDescription],
    ['fieldInfo', f.description],
    ['fileInfo', f.fileKind && FILE_KIND_TEXT[f.fileKind]],
    ['instrument', ctx.instrumentType && `${type?.name ?? ctx.instrumentType.text} instrument`],
    ['section', ctx.section && (SECTION_NAMES[ctx.section] ?? ctx.section)],
    ['location', title],
  )
}

/**
 * Scale View interval rows: what the row means and, when the whole screen was
 * available, which scale the 12 intervals spell together. Null → fall back to generic.
 * (KEY / TUNE / NAME / LOAD / SAVE rows are parameter rows.)
 */
function describeScaleContext(ctx: M8SemanticContext): M8DescriptionPart[] | null {
  const title = `${ctx.viewTitle ?? ctx.viewName}${ctx.viewId ? ` ${ctx.viewId}` : ''}`
  const f = ctx.activeField
  const note = ctx.scaleNote
  if (!f || !note) return ctx.lineText ? partsOf(['location', title], ['line', ctx.lineText]) : null

  const { interval, enabled, offset } = note
  let parts: M8DescriptionPart[]
  if (f.key === 'offset') {
    const detune = offset == null ? `detune of ${interval}` : offset === 0 ? `${interval} is not detuned` : `${interval} is detuned by ${formatOffset(offset)}`
    parts = partsOf(['field', `${f.label}: ${f.rawValue || '(empty)'}`], ['meaning', detune], ['meaning', enabled === false ? '(note is OFF)' : null])
  } else {
    const state = enabled === true ? 'is in' : enabled === false ? 'is not in' : 'is not yet set in'
    parts = partsOf(
      ['field', `${f.label}: ${f.key === 'en' ? f.rawValue.toUpperCase() || '(unset)' : interval}`],
      ['meaning', interval],
      ['meaning', describeInterval(interval)],
      ['meaning', `${state} the scale`],
    )
  }

  if (ctx.scale) {
    const [notes, shape] = scaleSummaryParts(ctx.scale)
    parts.push(...partsOf(['scale', `Scale: ${notes}`], ['scale', shape]))
  }
  return [...parts, ...partsOf(['location', `${title} row ${interval}`])]
}

/** 'FF' → 'FFh (dec 255)', '40:80' → '40:80 (mod depth 40, mod frequency 80)', '120' → '120 BPM'. */
function formatParameterValue(field: M8ParsedField): string {
  const unit = field.unit ?? ''
  if (field.values && field.parts) {
    // Hex pairs carry a hexValue ('40:80'); decimal pairs don't ('150:45').
    const hex = field.hexValue != null
    const shown = field.values.map((v) => (hex ? v.toString(16).toUpperCase().padStart(2, '0') : String(v)))
    const named = field.parts.map((p, i) => `${p} ${shown[i] ?? '?'}${unit}`).join(', ')
    return `${shown.join(':')} (${named})`
  }
  if (field.hexValue != null) {
    return `${field.rawValue.slice(0, 2)}h (dec ${field.hexValue})${field.text ? ` ${field.text}` : ''}`
  }
  if (field.numericValue != null) return `${field.rawValue}${unit}`
  return field.text ?? field.rawValue
}

/**
 * Formats a parsed field value as a human-readable string.
 */
export function formatFieldValue(input: M8ParsedField): string {
  if (input.isEmpty) return '(empty)'
  // The device sends lower case ('arp', 'b-4', 'ff'); show it the way the M8 draws it.
  // Text the user typed and file names keep their case.
  const keepCase = input.type === 'name' || input.type === 'fileEntry'
  const field = keepCase ? input : { ...input, rawValue: input.rawValue.toUpperCase() }

  switch (field.type) {
    case 'note':
      if (field.rawValue.toUpperCase() === 'OFF') return 'Note Off'
      return `Note ${field.rawValue}`

    case 'transpose': {
      if (field.hexValue == null) return field.rawValue
      // Relative hex: 00=none, 01–7F=positive, 80–FF=negative (two's complement)
      if (field.hexValue === 0) return '±0 st'
      const signed = field.hexValue > 0x7f ? field.hexValue - 0x100 : field.hexValue
      return `${signed > 0 ? '+' : ''}${signed} st`
    }

    case 'velocity':
      if (field.hexValue == null) return field.rawValue
      return `${field.rawValue}h (${field.hexValue} / 127 max)`

    case 'chainRef':
    case 'phraseRef':
    case 'instrumentRef':
      return field.rawValue

    case 'fxCommand':
      return field.rawValue

    case 'fxValue':
      if (field.hexValue == null) return field.rawValue
      return `${field.rawValue}h (dec ${field.hexValue})`

    case 'ticks':
      if (field.rawValue === '00') return '00 (skip step)'
      if (field.hexValue == null) return field.rawValue
      return `${field.rawValue}h (${field.hexValue} ticks)`

    case 'volume':
      return field.rawValue

    case 'instrumentType':
    case 'action':
    case 'fileEntry':
      return field.text ?? field.rawValue

    case 'name':
      return `"${field.rawValue}"`

    case 'option':
      // '00CHORUS' → '00 CHORUS'; text-only options ('BELL') stay as they are.
      if (field.hexValue != null && field.text) return `${field.rawValue.slice(0, 2)} ${field.text}`
      return field.text ?? field.rawValue

    case 'parameter':
      return formatParameterValue(field)

    case 'noteInterval':
      return `Interval ${normalizeInterval(field.rawValue) ?? field.rawValue}`

    case 'semitoneOffset':
      return field.isEmpty ? '(empty)' : `${field.rawValue} st`

    default:
      return field.rawValue
  }
}
