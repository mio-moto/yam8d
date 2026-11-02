// Turns a point on the M8 screen into the cell the cursor should go to, and the geometry the
// cursor navigator measures with. Candidates are the learned cursor cells that have text on the
// current screen, plus the runs of text no learned cell covers yet (minus those the cursor could
// not reach before). A click goes to the nearest candidate on its own row when one is close, else to
// the nearest one on the screen. Pure functions.

import viewSchema from '../m8-view-context.json'
import { type CellRect, type CursorDir, type CursorLayout, cellId } from './cursorMap'
import type { M8CellMetrics } from './store'

export type Point = { x: number; y: number }

/**
 * Where the cursor should go. `cell`: a learned cursor cell (reached when the cursor is that cell).
 * `text`: text no learned cell covers yet; `rect` is the character aimed at (reached when the
 * cursor covers it), `run` the whole run (one run can be two cells, as an FX command and value).
 * `point`: no text near the point, or selection mode (reached when the cursor covers the point).
 */
export type CursorGoal =
  | { kind: 'cell'; id: string; rect: CellRect }
  | { kind: 'text'; key: string; rect: CellRect; run: CellRect; row: number }
  | { kind: 'point'; rect: CellRect }

export type TextRun = { key: string; rect: CellRect; row: number; col: number; text: string }

// The 1–2 px corners a cursor rectangle draws outside its cell
const OVERHANG_PX = 3
// Between rows, vertical distance counts more: a column is easier to aim at than a row
const ROW_WEIGHT = 1.5
// A candidate of the clicked row this close (in characters), with no other text between, beats every
// other candidate: a label goes to the value beside it (Project, Instrument). Otherwise the nearest wins: a
// label under its value goes up to it (Mixer).
const SAME_ROW_REACH = 12
// On 40-column layouts the track panel starts here; the cursor never goes there
const PANEL_COLUMN = 34

// Grid views with a row number column (song rows, chain, phrase, table and groove steps, instrument
// slots), and its width. Up on their first row and Down on their last scroll the view or move to
// the neighbouring chain or phrase (and Up Up on song row 00 starts track reordering), so a
// navigation stays between them.
const ROW_NUMBER_WIDTH: Record<string, number> = Object.fromEntries(
  Object.entries(viewSchema.views as Record<string, { rowField?: { width: number } }>).flatMap(([name, view]) =>
    view.rowField ? [[name, view.rowField.width]] : [],
  ),
)

export type GridRows = { first: number; last: number; numberWidth: number }

/** The first and last rows that start with a row number, on grid views that have one; else null. */
export const gridRows = (viewName: string | null, lines: readonly string[]): GridRows | null => {
  const width = viewName ? ROW_NUMBER_WIDTH[viewName] : undefined
  if (!width) return null
  let first = -1
  let last = -1
  lines.forEach((line, row) => {
    if (/^[0-9a-f]+$/i.test(line.slice(1, 1 + width)) && (line[1 + width] ?? ' ') === ' ') {
      if (first < 0) first = row
      last = row
    }
  })
  return first < 0 ? null : { first, last, numberWidth: width }
}

// Grid views whose cursor cells are their schema columns on every numbered row, one character right of
// the schema's x (measured on Model:02 fw 6.5, small and large font). The navigator plans over this
// grid instead of learning it: learned moves there went wrong, as the M8 draws the new view's cursor
// before its title, so cells of one view were learned in another's layout.
const FIXED_GRID_VIEWS = ['song', 'chain', 'phrase']
const GRID_COLUMNS: Record<string, { x: number; width: number }[]> = Object.fromEntries(
  Object.entries(viewSchema.views as Record<string, { columns?: { x: number; width: number }[] }>).flatMap(([name, view]) =>
    FIXED_GRID_VIEWS.includes(name) && view.columns ? [[name, view.columns]] : [],
  ),
)

/** Whether the navigator knows this view's grid and learns nothing there. */
export const hasFixedGrid = (viewName: string | null) => !!viewName && viewName in GRID_COLUMNS

/**
 * The cells and moves of a fixed grid view's numbered rows (Up/Down keep the column, Left/Right keep the
 * row); null on other views. Moves past the grid's edges are left out.
 */
export const fixedGridLayout = (viewName: string | null, grid: GridRows | null, metrics: M8CellMetrics): CursorLayout | null => {
  const columns = viewName ? GRID_COLUMNS[viewName] : undefined
  if (!columns || !grid) return null
  const layout: CursorLayout = { cells: new Map(), moves: new Map(), unreachable: new Set(), suspects: new Set() }
  const idAt = (row: number, column: { x: number; width: number }) => {
    const rect = {
      x: (column.x + 1) * metrics.cellW + metrics.offX,
      y: row * metrics.cellH + metrics.offY,
      w: column.width * metrics.cellW,
      h: metrics.cellH,
    }
    const id = cellId(rect)
    layout.cells.set(id, rect)
    return id
  }
  for (let row = grid.first; row <= grid.last; row++) {
    columns.forEach((column, i) => {
      const moves: Partial<Record<CursorDir, string>> = {}
      if (row > grid.first) moves.up = idAt(row - 1, column)
      if (row < grid.last) moves.down = idAt(row + 1, column)
      if (i > 0) moves.left = idAt(row, columns[i - 1])
      if (i < columns.length - 1) moves.right = idAt(row, columns[i + 1])
      layout.moves.set(idAt(row, column), moves)
    })
  }
  return layout
}

/** A cursor rectangle as the character cells it covers (column, row, width in characters). */
export const snapToGrid = (rect: CellRect, metrics: M8CellMetrics): CellRect => {
  const col = Math.round((rect.x - metrics.offX) / metrics.cellW)
  const row = Math.round((rect.y - metrics.offY) / metrics.cellH)
  const chars = Math.max(1, Math.round(rect.w / metrics.cellW))
  return { x: col * metrics.cellW + metrics.offX, y: row * metrics.cellH + metrics.offY, w: chars * metrics.cellW, h: metrics.cellH }
}

/** The screen row of a cursor cell. */
export const rowOf = (rect: CellRect, metrics: M8CellMetrics) => Math.round((rect.y - metrics.offY) / metrics.cellH)

/** First column of the track panel, or null when the layout has no 40 columns. */
export const panelColumnFor = (screenWidth: number, metrics: M8CellMetrics): number | null =>
  Math.round(screenWidth / metrics.cellW) >= 40 ? PANEL_COLUMN : null

/**
 * The labels that start the rows (words with a letter outside hex digits, two characters or more).
 * Values, row numbers and markers are left out, so the signature changes with the layout
 * (instrument type, modulator type) but not with the song.
 */
export const layoutSignature = (lines: readonly string[], panelColumn: number | null): string =>
  lines
    .map((line, row) => {
      const token = (panelColumn === null ? line : line.slice(0, panelColumn)).trim().split(/\s+/)[0] ?? ''
      return token.length >= 2 && /[g-z]/i.test(token) ? `${row}${token.toLowerCase()}` : ''
    })
    .filter(Boolean)
    .join(' ')

const charRect = (row: number, col: number, metrics: M8CellMetrics): CellRect => ({
  x: col * metrics.cellW + metrics.offX,
  y: row * metrics.cellH + metrics.offY,
  w: metrics.cellW,
  h: metrics.cellH,
})

/**
 * Runs of text on the screen, in M8 pixels. Column 0 (the playback marker margin) is left out, and
 * so are the characters `covered` says belong to a known cell.
 */
export const textRuns = (
  lines: readonly string[],
  metrics: M8CellMetrics,
  panelColumn: number | null,
  covered: (row: number, col: number) => boolean = () => false,
): TextRun[] => {
  const runs: TextRun[] = []
  lines.forEach((line, row) => {
    const chars = [...` ${(panelColumn === null ? line : line.slice(0, panelColumn)).slice(1)}`]
    const visible = chars.map((ch, col) => (ch !== ' ' && covered(row, col) ? ' ' : ch)).join('')
    for (const match of visible.matchAll(/\S+/g)) {
      const col = match.index ?? 0
      const text = match[0]
      runs.push({
        key: `${row}:${col}:${text.toLowerCase()}`,
        rect: { x: col * metrics.cellW + metrics.offX, y: row * metrics.cellH + metrics.offY, w: text.length * metrics.cellW, h: metrics.cellH },
        row,
        col,
        text,
      })
    }
  })
  return runs
}

/** Whether the screen has text under a cursor cell (the same columns as textUnderCursor). */
export const cellHasText = (rect: CellRect, lines: readonly string[], metrics: M8CellMetrics): boolean => {
  const row = rowOf(rect, metrics)
  const first = Math.round((rect.x - metrics.offX) / metrics.cellW)
  const last = Math.floor((rect.x + rect.w - 1 - metrics.offX) / metrics.cellW)
  return (lines[row] ?? '').slice(Math.max(0, first), last + 1).trim().length > 0
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** Whether `cursor` covers `target` horizontally (at least half a character, or half the target). */
export const coversX = (cursor: CellRect, target: CellRect, metrics: M8CellMetrics) =>
  overlap(cursor.x, cursor.x + cursor.w, target.x, target.x + target.w) >= Math.min(metrics.cellW, target.w) / 2

/** Whether `cursor` covers `target` vertically (at least half a row, or half the target). */
export const coversY = (cursor: CellRect, target: CellRect, metrics: M8CellMetrics) =>
  overlap(cursor.y, cursor.y + cursor.h, target.y, target.y + target.h) >= Math.min(metrics.cellH, target.h) / 2

export const covers = (cursor: CellRect, target: CellRect, metrics: M8CellMetrics) =>
  coversX(cursor, target, metrics) && coversY(cursor, target, metrics)

const center = (rect: CellRect): Point => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })

/** How far the cursor is from a target: the gap between the rectangles, plus a small centre term to break ties. */
export const rectDistance = (a: CellRect, b: CellRect): number => {
  const ca = center(a)
  const cb = center(b)
  const gapX = Math.max(0, Math.abs(ca.x - cb.x) - (a.w + b.w) / 2 + OVERHANG_PX)
  const gapY = Math.max(0, Math.abs(ca.y - cb.y) - (a.h + b.h) / 2 + OVERHANG_PX)
  return Math.hypot(gapX, gapY) + 0.01 * Math.hypot(ca.x - cb.x, ca.y - cb.y)
}

const pointOffset = (point: Point, rect: CellRect) => ({
  dx: Math.max(0, rect.x - point.x, point.x - (rect.x + rect.w)),
  dy: Math.max(0, rect.y - point.y, point.y - (rect.y + rect.h)),
})

export const pointGoal = (point: Point): CursorGoal => ({ kind: 'point', rect: { x: point.x, y: point.y, w: 1, h: 1 } })

/** Whether the cursor rectangle has reached the goal. */
export const goalReached = (goal: CursorGoal, cursor: CellRect, metrics: M8CellMetrics): boolean => {
  if (goal.kind === 'cell') return cellId(cursor) === goal.id || covers(cursor, goal.rect, metrics)
  return covers(cursor, goal.rect, metrics)
}

/**
 * What a click can go to: the learned cells with text on screen, and the runs of the text they do
 * not cover (an FX value stays a candidate once only its command is learned).
 */
export const candidates = (
  layout: CursorLayout | undefined,
  lines: readonly string[],
  metrics: M8CellMetrics,
  panelColumn: number | null,
  grid: GridRows | null = null,
): { cells: { id: string; rect: CellRect }[]; runs: TextRun[] } => {
  // On grid views only the numbered rows hold cells (not the headers or the title)
  const inGrid = (row: number) => !grid || (row >= grid.first && row <= grid.last)
  const cells: { id: string; rect: CellRect }[] = []
  for (const [id, rect] of layout?.cells ?? []) {
    if (inGrid(rowOf(rect, metrics)) && cellHasText(rect, lines, metrics)) cells.push({ id, rect })
  }
  const covered = (row: number, col: number) => {
    const char = charRect(row, col, metrics)
    return cells.some((cell) => covers(cell.rect, char, metrics))
  }
  // The row numbers are not fields either
  const isRowNumber = (run: TextRun) => !!grid && run.col === 1 && run.text.length <= grid.numberWidth
  return { cells, runs: textRuns(lines, metrics, panelColumn, covered).filter((run) => inGrid(run.row) && !isRowNumber(run)) }
}

/** The candidate nearest to `point`, or a point goal when the screen offers none. */
export const pickGoal = (
  point: Point,
  layout: CursorLayout | undefined,
  lines: readonly string[],
  metrics: M8CellMetrics,
  panelColumn: number | null,
  grid: GridRows | null = null,
  /** Texts to leave out besides the unreachable ones (those that failed in this navigation). */
  skip: ReadonlySet<string> = new Set(),
  /** After a text failed: only learned cells and texts beside the click (not the next label down the column). */
  knownFirst = false,
): CursorGoal => {
  const { cells, runs } = candidates(layout, lines, metrics, panelColumn, grid)
  const goals: { goal: CursorGoal; area: CellRect }[] = cells.map((cell) => ({ goal: { kind: 'cell', ...cell }, area: cell.rect }))
  for (const run of runs) {
    // On grid views the text is song data (it differs per song) and every cell is reachable by arrows: a failure there was
    // a slow or missed press, so nothing is ever remembered as unreachable
    if ((!grid && layout?.unreachable.has(run.key)) || skip.has(run.key)) continue
    // Aim at the clicked character of the run, or its end nearest the click
    const col = Math.min(run.col + run.text.length - 1, Math.max(run.col, Math.floor((point.x - metrics.offX) / metrics.cellW)))
    goals.push({ goal: { kind: 'text', key: run.key, rect: charRect(run.row, col, metrics), run: run.rect, row: run.row }, area: run.rect })
  }

  // A candidate of the clicked row is "beside" the click when it is close and, when it lies to the right,
  // no other text lies between them (the value after the next label belongs to that label). Text between
  // the click and a candidate on its left is that candidate's own display ('00C CHROMATIC' is the cell 00).
  // On a tie, the candidate on the right wins: a value follows its label.
  const line = lines[Math.floor((point.y - metrics.offY) / metrics.cellH)] ?? ''
  const textAt = (col: number) => col > 0 && (line[col] ?? ' ') !== ' '
  const clickCol = Math.floor((point.x - metrics.offX) / metrics.cellW)
  // The end of the clicked text (the click itself when it is on a space). A single space does not end it:
  // label words are one space apart ('NOTE PREVIEW'), a label and its value two or more.
  let runEnd = clickCol
  while (textAt(runEnd) && (textAt(runEnd + 1) || textAt(runEnd + 2))) runEnd += textAt(runEnd + 1) ? 1 : 2
  const besideClick = (area: CellRect) => {
    const { dx, dy } = pointOffset(point, area)
    if (dy > 0 || dx > SAME_ROW_REACH * metrics.cellW) return false
    const first = Math.round((area.x - metrics.offX) / metrics.cellW)
    if (first <= runEnd) return true
    for (let col = runEnd + 1; col < first; col++) if (textAt(col)) return false
    return true
  }
  const anyBeside = goals.some(({ area }) => besideClick(area))
  const anyKnown = goals.some(({ goal }) => goal.kind === 'cell')

  let best: { goal: CursorGoal; score: number; tie: number } | null = null
  for (const { goal, area } of goals) {
    const { dx, dy } = pointOffset(point, area)
    if (anyBeside && !besideClick(area)) continue
    if (knownFirst && !anyBeside && anyKnown && goal.kind !== 'cell') continue
    // A learned cell wins a tie with a text run
    const rightOfClick = area.x > point.x
    const score = Math.hypot(dx, dy * ROW_WEIGHT) - (goal.kind === 'cell' ? 0.001 : 0) - (rightOfClick ? 0.5 : 0)
    const c = center(area)
    const tie = Math.hypot(c.x - point.x, c.y - point.y)
    if (!best || score < best.score - 1e-6 || (Math.abs(score - best.score) <= 1e-6 && tie < best.tie)) best = { goal, score, tie }
  }
  return best?.goal ?? pointGoal(point)
}
