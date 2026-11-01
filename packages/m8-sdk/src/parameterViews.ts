/**
 * parameterViews.ts
 *
 * Maps the non-grid ("parameter") views - instrument, modulation, mixer, project,
 * effects, EQ, scope, system settings, file browsers - onto typed field cells,
 * using m8-parameter-views.json.
 *
 * These views are label/value screens, so a row is recognised from its text (its
 * label), not from a row number, and the cells of that row come from the schema. Views
 * whose labels change with the instrument or modulation type are read through two
 * label/value "zones" and the label is looked up in a vocabulary.
 *
 * Pure text in, cell definitions out; viewContext.ts turns them into parsed fields.
 */

import paramSchema from './m8-parameter-views.json'
import type { ColumnDef } from './viewContext'

export type ValueFormat = 'hex' | 'hexOption' | 'hexPair' | 'decimal' | 'decimalPair' | 'float' | 'text' | 'auto'

interface MatchDef {
  x: number
  text?: string
  regex?: string
  width?: number
}

interface RowDef {
  id: string
  section?: string
  match: MatchDef[]
  cells: ColumnDef[]
}

interface ZoneDef {
  id: string
  labelX: number
  labelWidth: number
  x: number
  width: number
}

type VocabEntry = Pick<ColumnDef, 'type' | 'format' | 'label' | 'description' | 'parts' | 'options' | 'unit'>

interface InstrumentTypeDef {
  name: string
  description: string
  params: Record<string, VocabEntry>
  /** FM: what each destination of an operator's MOD slot does ('LEV', 'RAT'...). */
  operatorDestinations?: Record<string, string>
}

/** Rows with one value per operator (FM): the columns of the values. */
interface OperatorsDef {
  instrument: string
  x: number
  step: number
  width: number
  letters: string[]
}

interface LayoutDef {
  extends?: string
  /** Pattern of the heading label that names the block a cell belongs to ('MOD\\d'): read upward in the cell's zone. */
  slotLabel?: string
  kind?: 'browser' | 'text'
  browserFor?: string
  fieldLabel?: string
  description?: string
  sections?: string[]
  rows?: RowDef[]
  zones?: ZoneDef[]
  operators?: OperatorsDef
  vocabulary?: Record<string, VocabEntry>
  vocabularyFrom?: 'instrumentTypes'
}

export type ParameterLayout = Omit<LayoutDef, 'extends'>

const rawViews = paramSchema.views as unknown as Record<string, LayoutDef>
const instrumentTypes = paramSchema.instrumentTypes as unknown as Record<string, InstrumentTypeDef>
const instrumentTypeNames = paramSchema.instrumentTypeNames as Record<string, string>

const layouts: Record<string, ParameterLayout> = {}
for (const [name, def] of Object.entries(rawViews)) {
  const { extends: parent, ...own } = def
  layouts[name] = parent ? { ...rawViews[parent], ...own } : own
}

/** Layout of a parameter view, or null when the view has none. */
export function getParameterLayout(viewName: string): ParameterLayout | null {
  return layouts[viewName] ?? null
}

//  text helpers 

const slice = (line: string, x: number, width: number): string => (x >= line.length ? '' : line.slice(x, x + width))

function matches(cond: MatchDef, line: string): boolean {
  const width = cond.width ?? cond.text?.length ?? 1
  // The device's text stream is lower case ('tempo', 'b-4'); schema text is upper case.
  const text = slice(line, cond.x, width)
  if (cond.text != null) return text.toUpperCase() === cond.text.toUpperCase()
  if (cond.regex != null) return new RegExp(cond.regex, 'i').test(text)
  return false
}

//  sections and instrument type 

/**
 * Section heading ('MODFX', 'DELAY', 'REVERB') the cursor line belongs to: the
 * nearest heading at column 0 on this line or above it. `linesUpward` starts with the
 * cursor line, then the lines above it.
 */
export function detectSection(layout: ParameterLayout, linesUpward: string[]): string | null {
  const sections = layout.sections
  if (!sections) return null
  for (const line of linesUpward) {
    const upper = line.toUpperCase()
    const hit = sections.find((s) => upper.startsWith(s))
    if (hit) return hit
  }
  return null
}

/**
 * Block heading ('MOD1'…'MOD4') a cell in `zoneId` belongs to: the nearest line at or
 * above the cursor with a heading label in that zone.
 */
export function detectSlot(layout: ParameterLayout, zoneId: string, linesUpward: string[]): string | null {
  const zone = layout.zones?.find((z) => z.id === zoneId)
  if (!layout.slotLabel || !zone) return null
  const pattern = new RegExp(`^${layout.slotLabel}$`, 'i')
  for (const line of linesUpward) {
    const label = slice(line, zone.labelX, zone.labelWidth).trim()
    if (pattern.test(label)) return label.toUpperCase()
  }
  return null
}

/** 'WAVSYNTH' → 'wavsynth', 'MIDI OUT' → 'midiout', unknown text → null. */
export function instrumentKeyFromText(text: string): string | null {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '')
  if (!letters) return null
  const prefix = Object.keys(instrumentTypeNames).find((p) => letters.startsWith(p))
  return prefix ? instrumentTypeNames[prefix] : null
}

/** Instrument type shown on the TYPE row of the Instrument View, read off the screen lines. */
export function instrumentTypeFromLines(lines: string[]): { text: string; key: string | null } | null {
  for (const line of lines) {
    if (line.toUpperCase().startsWith('TYPE')) {
      const text = slice(line, 8, 13).trim()
      return text ? { text, key: instrumentKeyFromText(text) } : null
    }
  }
  return null
}

/** Display name and description of an instrument type key ('wavsynth' → Wavsynth). */
export function getInstrumentType(key: string): { name: string; description: string } | null {
  const t = instrumentTypes[key]
  return t ? { name: t.name, description: t.description } : null
}

//  vocabulary 

function lookupVocabulary(layout: ParameterLayout, label: string, instrumentKey: string | null): VocabEntry | null {
  // 'MOD1'..'MOD4' and 'CCA'..'CCJ' share one entry.
  const norm = label.replace(/^MOD\d$/, 'MOD#').replace(/^CC[A-J]$/, 'CC#')
  if (layout.vocabulary) return layout.vocabulary[norm] ?? null
  if (layout.vocabularyFrom !== 'instrumentTypes') return null
  const order = instrumentKey ? [instrumentKey, 'common'] : ['common', ...Object.keys(instrumentTypes).filter((k) => k !== 'common')]
  for (const key of order) {
    const hit = instrumentTypes[key]?.params[norm]
    if (hit) return hit
  }
  return null
}

const camel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
    .replace(/^[^a-z]+/, '')

const LABEL_SHAPE = /^[A-Z][A-Z0-9.:#/ -]*$/

//  reading a line 

/** Operator rows of the Instrument view: label to the vocabulary key and key prefix of its cells. */
const OPERATOR_ROWS: Record<string, string> = { RATIO: 'ratio', 'LEV/FB': 'levFb', MOD: 'mod' }
const OPERATOR_MOD_VALUE = /^(?:-----|[1-4]>[A-Z]{3})$/i

/**
 * The cells of an FM row with one value per operator (RATIO, LEV/FB, the two MOD rows, the
 * shapes under ALGO), or null when the line is none of them. Each cell names its operator, so
 * the four columns of a row are described alike.
 */
function operatorCells(def: OperatorsDef, line: string, vocab: InstrumentTypeDef): ColumnDef[] | null {
  const label = slice(line, 0, def.x).trim().toUpperCase()
  const columns = def.letters.map((letter, i) => ({ letter, x: def.x + i * def.step }))
  const cellOf = (key: string, x: number, width: number, entry: Pick<ColumnDef, 'type' | 'format' | 'label' | 'description'> & Partial<ColumnDef>, letter: string): ColumnDef => ({
    ...entry,
    x,
    width,
    key: `${key}${letter}`,
    label: `${entry.label} · operator ${letter}`,
    meta: { paramLabel: label || key, operator: letter },
  })

  const rowKey = OPERATOR_ROWS[label]
  if (rowKey) {
    const entry = vocab.params[label]
    if (!entry) return null
    return columns.map(({ letter, x }) => cellOf(rowKey, x, def.width, label === 'MOD' ? modSlotEntry(entry, 1, vocab) : entry, letter))
  }
  if (label) return null

  // The shapes under ALGO: 'A SW4 B W0F C SIN D SIN', each as wide as its name.
  if (/^\s+[A-D] \S/i.test(line)) {
    const cells: ColumnDef[] = []
    for (const match of line.matchAll(/([A-D]) (\S+)/gi)) {
      const letter = match[1].toUpperCase()
      const entry = vocab.params[letter]
      if (!entry || !def.letters.includes(letter)) continue
      cells.push({ ...entry, type: 'option', format: 'text', x: (match.index ?? 0) + 2, width: match[2].length, key: `shape${letter}`, label: `Shape · operator ${letter}`, meta: { paramLabel: 'SHAPE', operator: letter } })
    }
    return cells.length ? cells : null
  }

  // The second MOD row has no label: four slots, each '-----' or 'n>DEST'.
  const values = columns.map(({ x }) => slice(line, x, def.width).trim())
  const entry = vocab.params.MOD
  if (entry && values.every((value) => OPERATOR_MOD_VALUE.test(value)) && !slice(line, 0, def.x).trim()) {
    return columns.map(({ letter, x }) => cellOf('mod2', x, def.width, modSlotEntry(entry, 2, vocab), letter))
  }
  return null
}

/** The vocabulary entry of an operator's MOD slot `slot` (1 or 2), with what each 'n>DEST' value does. */
function modSlotEntry(entry: VocabEntry, slot: number, vocab: InstrumentTypeDef): VocabEntry {
  const options: Record<string, string> = {}
  for (const [dest, text] of Object.entries(vocab.operatorDestinations ?? {})) {
    for (let source = 1; source <= 4; source += 1) options[`${source}>${dest}`] = `MOD${source} ${dest}: ${text}`
  }
  return { ...entry, type: 'option', format: 'text', label: `Modulation Slot ${slot} (MOD)`, options }
}

/** The custom CC row of MIDI OUT ('CCA CC:VAL  074:7F') or EXTERNAL ('CCA 074:7F'): its label and where its value starts. */
const CC_LABEL = /^(CC[A-J])(?: CC:VAL)? +(?=\S)/i
const CC_VALUE_WIDTH = 6

export interface ParameterLineOptions {
  section: string | null
  instrumentKey: string | null
  /** Text under the cursor; the entry of a file-browser row. */
  entryText?: string | null
}

/**
 * The cells present on `line`: the schema row whose label text matches, or else the
 * label/value zones. Empty when nothing on the line is recognised.
 */
export function readParameterCells(
  layout: ParameterLayout,
  line: string,
  opts: ParameterLineOptions,
): { rowId: string | null; cells: ColumnDef[] } {
  if (layout.kind === 'browser') {
    const entry = opts.entryText?.trim() || line.trim()
    if (!entry) return { rowId: null, cells: [] }
    const x = Math.max(0, line.indexOf(entry))
    return {
      rowId: 'entry',
      cells: [{ x, width: entry.length, key: 'entry', type: 'fileEntry', format: 'text', label: 'File Browser Entry', meta: { browserFor: layout.browserFor } }],
    }
  }
  if (layout.kind === 'text') {
    if (!line.trim()) return { rowId: null, cells: [] }
    const x = Math.max(0, line.search(/\S/))
    return {
      rowId: 'text',
      cells: [{ x, width: Math.max(12, line.length - x), key: 'name', type: 'name', format: 'text', label: layout.fieldLabel ?? 'Name', description: layout.description }],
    }
  }

  for (const row of layout.rows ?? []) {
    if (row.section && opts.section && row.section !== opts.section) continue
    if (row.match.every((m) => matches(m, line))) return { rowId: row.id, cells: row.cells }
  }

  if (layout.operators && opts.instrumentKey === layout.operators.instrument) {
    const found = operatorCells(layout.operators, line, instrumentTypes[layout.operators.instrument])
    if (found) return { rowId: 'operators', cells: found }
  }

  const zones = layout.zones ?? []
  const cells: ColumnDef[] = []
  zones.forEach((zone, i) => {
    let label = slice(line, zone.labelX, zone.labelWidth).trim().toUpperCase()
    let valueX = zone.x
    let valueWidth: number | null = null
    // Custom CC rows have a longer label and their own value column.
    const cc = i === 0 ? CC_LABEL.exec(line) : null
    if (cc) {
      label = cc[1].toUpperCase()
      valueX = cc[0].length
      valueWidth = CC_VALUE_WIDTH
    }
    if (!LABEL_SHAPE.test(label)) return
    // The value ends where the next zone's label begins, when that label is present.
    const next = zones[i + 1]
    // A label is set off by a blank; letters spilling out of a long value ('16wt-osc:tube')
    // are not one.
    const nextIsLabel =
      next != null &&
      slice(line, next.labelX - 1, 1).trim() === '' &&
      LABEL_SHAPE.test(slice(line, next.labelX, next.labelWidth).trim().toUpperCase())
    const width = valueWidth ?? (next && nextIsLabel ? Math.max(1, next.labelX - 1 - valueX) : zone.width)
    if (!slice(line, valueX, width).trim()) return
    const vocab = lookupVocabulary(layout, label, opts.instrumentKey)
    // The same label can sit in both zones (two modulators side by side): keep keys unique.
    const base = camel(label) || zone.id
    const key = cells.some((c) => c.key === base) ? `${base}${zone.id[0].toUpperCase()}${zone.id.slice(1)}` : base
    cells.push({
      x: valueX,
      width,
      key,
      type: vocab?.type ?? 'parameter',
      format: vocab?.format ?? 'auto',
      label: vocab?.label ?? label,
      description: vocab?.description,
      parts: vocab?.parts,
      options: vocab?.options,
      unit: vocab?.unit,
      meta: { paramLabel: label, zone: zone.id },
    })
  })
  return { rowId: cells.length ? 'params' : null, cells }
}

//  values 

export interface ParsedValue {
  hexValue: number | null
  /** Natural number of the value: the hex value, decimal integer or float. */
  numericValue: number | null
  /** Both numbers of an 'XX:YY' pair. */
  values: number[] | null
  /** The non-numeric part: option name, caption, name text. */
  text: string | null
}

const NONE: ParsedValue = { hexValue: null, numericValue: null, values: null, text: null }

function detectFormat(s: string): ValueFormat {
  if (/^[0-9A-F]{2}$/i.test(s)) return 'hex'
  if (/^[0-9A-F]{2}:[0-9A-F]{2}$/i.test(s)) return 'hexPair'
  if (/^[+-]?\d+([.,]\d+)?$/.test(s)) return 'float'
  if (/^[0-9A-F]{2}\S/i.test(s)) return 'hexOption'
  return 'text'
}

/** Reads a cell's text according to its format. Empty text gives all-null. */
export function parseValue(raw: string, format: ValueFormat): ParsedValue {
  const s = raw.trim()
  if (!s) return NONE
  const fmt = format === 'auto' ? detectFormat(s) : format

  switch (fmt) {
    case 'hex': {
      const m = /^([0-9A-F]{2})/i.exec(s)
      const n = m ? parseInt(m[1], 16) : null
      return { hexValue: n, numericValue: n, values: null, text: m ? null : s }
    }
    case 'hexOption': {
      const m = /^([0-9A-F]{2})\s?(.*)$/i.exec(s)
      if (!m) return { ...NONE, text: s }
      const n = parseInt(m[1], 16)
      return { hexValue: n, numericValue: n, values: null, text: m[2].trim() || null }
    }
    case 'hexPair': {
      const m = /^([0-9A-F]{2})[:/]([0-9A-F]{2})/i.exec(s)
      if (!m) return { ...NONE, text: s }
      const values = [parseInt(m[1], 16), parseInt(m[2], 16)]
      return { hexValue: values[0], numericValue: values[0], values, text: null }
    }
    case 'decimal': {
      const n = parseInt(s, 10)
      return Number.isNaN(n) ? { ...NONE, text: s } : { hexValue: null, numericValue: n, values: null, text: null }
    }
    case 'decimalPair': {
      const m = /^(\d+):(\d+)/.exec(s)
      if (!m) return { ...NONE, text: s }
      const values = [parseInt(m[1], 10), parseInt(m[2], 10)]
      return { hexValue: null, numericValue: values[0], values, text: null }
    }
    case 'float': {
      const n = parseFloat(s.replace(',', '.'))
      return Number.isNaN(n) ? { ...NONE, text: s } : { hexValue: null, numericValue: n, values: null, text: null }
    }
    default:
      return { ...NONE, text: s }
  }
}

/** Description of the option currently selected ('CLIP' → "Values above the maximum level are clipped."). */
export function describeOption(options: Record<string, string> | undefined, text: string | null): string | null {
  if (!options || !text) return null
  const t = text.toUpperCase().trim()
  if (options[t]) return options[t]
  const key = Object.keys(options).find((k) => k.length >= 3 && t.startsWith(k))
  return key ? options[key] : null
}
