/**
 * viewContext.ts
 *
 * Derives semantic meaning from raw M8State by mapping cursor position and
 * currentLine content to typed, labelled fields using the m8-view-context.json schema.
 *
 * The five grid views (song, chain, phrase, table, groove) are fully supported.
 * Parameter views (inst, mixer, project, …) return a minimal context with viewName only.
 */

import type { M8State } from './types'
import schema from './m8-view-context.json'

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

//  Schema shapes (mirror m8-view-context.json) 

interface ColumnDef {
  x: number
  width: number
  key: string
  type: M8FieldType
  label: string
  description?: string
  meta?: Record<string, unknown>
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
  columns: ColumnDef[]
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
}

/**
 * All fields parsed from the current row (line at cursorPos.y).
 */
export interface M8ParsedRow {
  /** Row index (hex-parsed) derived from the leftmost chars of currentLine. null if not parseable. */
  rowIndex: number | null
  /** Schema key for the row index field (e.g. 'songRow', 'step', 'chainPos'). */
  rowKey: string
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
  /** All fields on the line at cursorPos.y (null for non-grid views or missing line). */
  row: M8ParsedRow | null
  /** The specific field under the cursor (null when cursor is out of any column range). */
  activeField: M8ActiveField | null
}

//  FX command lookup 

type FxCategory = 'sequencer' | 'instrument' | 'mixer'
type FxCommandMap = Record<string, { description: string }>

const fxCommands = schema.fxCommands as Record<FxCategory, FxCommandMap>

/**
 * Look up the description of a 3-character FX command name.
 * Returns undefined if the command is unknown.
 */
export function lookupFxCommand(cmd: string): { description: string } | undefined {
  const upper = cmd.toUpperCase()
  for (const cat of Object.values(fxCommands)) {
    if (upper in cat) return cat[upper]
  }
  return undefined
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
  const trimmed = rawTitle.trim()
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
  const raw = extractFromLine(line, col.x, col.width).trim()
  const empty = isEmptyRaw(raw)

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

//  Public API 

/**
 * Derives a full semantic context from the current M8State.
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
export function getSemanticContext(state: M8State): M8SemanticContext | null {
  const viewName = state.viewName
  if (!viewName) return null

  const viewDefs = schema.views as Record<string, ViewDef>
  const viewDef = viewDefs[viewName] ?? null

  const isGridView = viewDef?.type === 'grid'
  const viewTitle = viewDef?.title ?? null
  const viewDescription = viewDef?.description ?? null
  const { viewId, isUnsaved } = extractViewId(state.viewTitle)

  if (!isGridView || !viewDef) {
    return { viewName, viewTitle, viewDescription, viewId, isUnsaved, isGridView: false, row: null, activeField: null }
  }

  const rawLine = state.currentLine
  if (!rawLine) {
    return { viewName, viewTitle, viewDescription, viewId, isUnsaved, isGridView: true, row: null, activeField: null }
  }

  // Strip playback indicator prefix ('>' or '<') emitted when the row is playing.
  const { line, offset } = stripPlaybackIndicator(rawLine)
  const cursorX = state.cursorPos ? state.cursorPos.x - offset : 0

  // Parse row index
  const rowIndex = viewDef.rowField ? parseRowIndex(line, viewDef.rowField) : null

  // Parse every column defined for this view
  const fields: Record<string, M8ParsedField> = {}
  for (const col of viewDef.columns) {
    fields[col.key] = parseColumn(col, line)
  }

  const row: M8ParsedRow = {
    rowIndex,
    rowKey: viewDef.rowField?.key ?? 'row',
    fields,
  }

  // Determine active field from cursor X position
  let activeField: M8ActiveField | null = null
  if (state.cursorPos) {
    const col = findColumn(viewDef.columns, cursorX)
    if (col) {
      const field = fields[col.key]
      if (field) {
        activeField = { ...field, viewName, rowIndex }
      }
    }
  }

  return { viewName, viewTitle, viewDescription, viewId, isUnsaved, isGridView: true, row, activeField }
}

/**
 * Returns a short human-readable description of what the cursor is currently on.
 *
 * @example
 * "Track 3 — Chain 0A — Song Row 02"
 * "Note A#4 — Step 7 (Phrase)"
 * "FX1 Command: KIL (Kill Note) — Step 0"
 */
export function describeContext(ctx: M8SemanticContext): string {
  if (!ctx.activeField) return ctx.viewTitle ?? ctx.viewName

  const { activeField: f, row } = ctx
  const parts: string[] = []

  // Label + value
  const val = formatFieldValue(f)
  parts.push(`${f.label}: ${val}`)

  // FX command extra info
  if (f.type === 'fxCommand' && !f.isEmpty) {
    const info = lookupFxCommand(f.rawValue)
    if (info) parts.push(`(${info.description})`)
  }

  // FX value context: include sibling command if we're on a value column
  if (f.type === 'fxValue' && row) {
    const cmdKey = f.key.replace('val', 'cmd') // fx1val → fx1cmd, fx2val → fx2cmd …
    const cmdField = row.fields[cmdKey]
    if (cmdField && !cmdField.isEmpty) {
      const info = lookupFxCommand(cmdField.rawValue)
      const label = info ? `${cmdField.rawValue} (${info.description})` : cmdField.rawValue
      parts.push(`for ${label}`)
    }
  }

  // Track index for song view
  if (f.meta?.trackIndex != null) parts.push(`Track ${f.meta.trackIndex}`)

  // Row index
  if (row?.rowIndex != null) {
    const rowHex = row.rowIndex.toString(16).toUpperCase().padStart(2, '0')
    parts.push(`${ctx.viewTitle ?? ctx.viewName} row ${rowHex}`)
  }

  return parts.join(' — ')
}

/**
 * Formats a parsed field value as a human-readable string.
 */
export function formatFieldValue(field: M8ParsedField): string {
  if (field.isEmpty) return '(empty)'

  switch (field.type) {
    case 'note':
      if (field.rawValue === 'OFF') return 'Note Off'
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

    default:
      return field.rawValue
  }
}
