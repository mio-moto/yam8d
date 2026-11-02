// What the cursor navigator has learned about each screen layout: the cursor cells seen there,
// where each arrow key went from each cell (or that it did not move), and the screen texts the
// cursor could not reach (labels; once they failed in two navigations). Cells are the M8's own cursor rectangles in M8 pixels, so the
// map fits any model and font mode. Layouts are keyed by the caller (view, model, font mode and
// the labels on screen); the oldest are dropped past MAX_LAYOUTS.

export type CursorDir = 'up' | 'down' | 'left' | 'right'
export type CellRect = { x: number; y: number; w: number; h: number }

/** The cells and moves of one layout. A move to `null` means the key did not move the cursor. */
export interface CursorLayout {
  readonly cells: Map<string, CellRect>
  readonly moves: Map<string, Partial<Record<CursorDir, string | null>>>
  readonly unreachable: Set<string>
  /** Texts that failed once: one more failure makes them unreachable. */
  readonly suspects: Set<string>
}

export type CursorMapData = {
  version: 1
  layouts: { key: string; cells: string[]; moves: [string, CursorDir, string | null][]; unreachable: string[]; suspects?: string[] }[]
}

export interface CursorMap {
  /** The layout, or undefined when nothing was learned for it. */
  get(key: string): CursorLayout | undefined
  recordCell(key: string, rect: CellRect): void
  /** `to` null: the key was pressed and the cursor did not move. */
  recordMove(key: string, from: CellRect, dir: CursorDir, to: CellRect | null): void
  /** A navigation could not reach this text: the second time, it is unreachable. */
  markUnreachable(key: string, textKey: string): void
  toJSON(): CursorMapData
}

export const DIRS: readonly CursorDir[] = ['up', 'down', 'left', 'right']
const MAX_LAYOUTS = 64

export const cellId = (rect: CellRect) => `${rect.x},${rect.y},${rect.w},${rect.h}`

export const parseCellId = (id: string): CellRect | null => {
  const [x, y, w, h] = id.split(',').map(Number)
  if (![x, y, w, h].every(Number.isFinite)) return null
  return { x, y, w, h }
}

const emptyLayout = (): CursorLayout => ({ cells: new Map(), moves: new Map(), unreachable: new Set(), suspects: new Set() })

export const createCursorMap = (options: { data?: CursorMapData | null; onChange?: () => void } = {}): CursorMap => {
  // Insertion order is the use order: a used layout is moved to the end
  const layouts = new Map<string, CursorLayout>()
  const changed = () => options.onChange?.()

  const touch = (key: string): CursorLayout => {
    let layout = layouts.get(key)
    if (layout) layouts.delete(key)
    else layout = emptyLayout()
    layouts.set(key, layout)
    while (layouts.size > MAX_LAYOUTS) {
      const oldest = layouts.keys().next().value
      if (oldest === undefined) break
      layouts.delete(oldest)
    }
    return layout
  }

  const addCell = (layout: CursorLayout, rect: CellRect) => {
    const id = cellId(rect)
    if (layout.cells.has(id)) return false
    layout.cells.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h })
    return true
  }

  if (options.data?.version === 1) {
    for (const saved of options.data.layouts ?? []) {
      const layout = touch(saved.key)
      for (const id of saved.cells ?? []) {
        const rect = parseCellId(id)
        if (rect) addCell(layout, rect)
      }
      for (const [from, dir, to] of saved.moves ?? []) {
        if (!DIRS.includes(dir)) continue
        const moves = layout.moves.get(from) ?? {}
        moves[dir] = to
        layout.moves.set(from, moves)
      }
      for (const text of saved.unreachable ?? []) layout.unreachable.add(text)
      for (const text of saved.suspects ?? []) layout.suspects.add(text)
    }
  }

  return {
    get: (key) => layouts.get(key),
    recordCell: (key, rect) => {
      if (addCell(touch(key), rect)) changed()
    },
    recordMove: (key, from, dir, to) => {
      const layout = touch(key)
      addCell(layout, from)
      if (to) addCell(layout, to)
      const fromId = cellId(from)
      const toId = to ? cellId(to) : null
      const moves = layout.moves.get(fromId) ?? {}
      if (moves[dir] === toId) return
      moves[dir] = toId
      layout.moves.set(fromId, moves)
      changed()
    },
    markUnreachable: (key, textKey) => {
      const layout = touch(key)
      if (layout.unreachable.has(textKey)) return
      if (layout.suspects.delete(textKey)) layout.unreachable.add(textKey)
      else layout.suspects.add(textKey)
      changed()
    },
    toJSON: () => ({
      version: 1,
      layouts: [...layouts.entries()].map(([key, layout]) => ({
        key,
        cells: [...layout.cells.keys()],
        moves: [...layout.moves.entries()].flatMap(([from, moves]) =>
          DIRS.filter((dir) => moves[dir] !== undefined).map((dir): [string, CursorDir, string | null] => [from, dir, moves[dir] ?? null]),
        ),
        unreachable: [...layout.unreachable],
        suspects: [...layout.suspects],
      })),
    }),
  }
}

/** Whether a move landed on the wrong side (Up landing lower...): a wrap, not a move on this screen. */
export const wentBackwards = (from: CellRect, dir: CursorDir, to: CellRect): boolean => {
  if (dir === 'up') return to.y > from.y
  if (dir === 'down') return to.y < from.y
  if (dir === 'left') return to.x > from.x
  return to.x < from.x
}

// A move not learned yet costs a hair more than a learned one: learned moves only break ties (guesses are
// right on the M8 grids, and a wrong one is learned and replanned)
const GUESS_COST = 1.01

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)

/**
 * Where a key not learned yet probably goes: Up/Down to the nearest cell above/below that shares
 * columns with this one, Left/Right to the nearest cell of the same row. Null when there is none.
 */
export const guessMove = (layout: CursorLayout, from: CellRect, dir: CursorDir): string | null => {
  const cx = from.x + from.w / 2
  const cy = from.y + from.h / 2
  let best: { id: string; along: number; across: number } | null = null
  for (const [id, cell] of layout.cells) {
    const ox = cell.x + cell.w / 2 - cx
    const oy = cell.y + cell.h / 2 - cy
    let along: number
    let across: number
    if (dir === 'up' || dir === 'down') {
      along = dir === 'down' ? oy : -oy
      across = Math.abs(ox)
      if (overlap(from.x, from.x + from.w, cell.x, cell.x + cell.w) <= 0) continue
    } else {
      along = dir === 'right' ? ox : -ox
      across = Math.abs(oy)
      if (overlap(from.y, from.y + from.h, cell.y, cell.y + cell.h) < Math.min(from.h, cell.h) / 2) continue
    }
    if (along < Math.min(from.h, cell.h) / 2) continue
    if (!best || along < best.along - 0.5 || (Math.abs(along - best.along) <= 0.5 && across < best.across)) best = { id, along, across }
  }
  return best?.id ?? null
}

/**
 * Cheapest key sequence from `fromId` to a cell that `isGoal` accepts, over the learned moves and,
 * for keys not learned yet from a cell, the move `guessMove` expects (marked `guessed`). Moves
 * listed in `skip` (`"<cellId>:<dir>"`) or refused by `forbid` are not used, learned or guessed,
 * nor are learned moves that went backwards (a phrase wrapping to the next one). Null when no path exists.
 */
export const findPath = (
  layout: CursorLayout,
  fromId: string,
  isGoal: (id: string) => boolean,
  skip: ReadonlySet<string> = new Set(),
  forbid: (rect: CellRect, dir: CursorDir) => boolean = () => false,
): { dir: CursorDir; to: string; guessed: boolean }[] | null => {
  if (isGoal(fromId)) return []
  const cost = new Map<string, number>([[fromId, 0]])
  const previous = new Map<string, { from: string; dir: CursorDir; guessed: boolean }>()
  const done = new Set<string>()
  const open = new Set([fromId])
  while (open.size > 0) {
    let id = ''
    let lowest = Number.POSITIVE_INFINITY
    for (const candidate of open) {
      const c = cost.get(candidate) ?? Number.POSITIVE_INFINITY
      if (c < lowest) {
        lowest = c
        id = candidate
      }
    }
    open.delete(id)
    if (done.has(id)) continue
    done.add(id)
    if (isGoal(id)) {
      const path: { dir: CursorDir; to: string; guessed: boolean }[] = []
      for (let at = id; at !== fromId; ) {
        const step = previous.get(at) as { from: string; dir: CursorDir; guessed: boolean }
        path.unshift({ dir: step.dir, to: at, guessed: step.guessed })
        at = step.from
      }
      return path
    }
    const rect = layout.cells.get(id)
    const moves = layout.moves.get(id) ?? {}
    for (const dir of DIRS) {
      if (skip.has(`${id}:${dir}`) || (rect && forbid(rect, dir))) continue
      const learned = moves[dir]
      if (learned === null) continue
      const guessed = learned === undefined
      const to = guessed ? (rect ? guessMove(layout, rect, dir) : null) : learned
      if (!to || done.has(to)) continue
      const toRect = layout.cells.get(to)
      if (!guessed && rect && toRect && wentBackwards(rect, dir, toRect)) continue
      const next = lowest + (guessed ? GUESS_COST : 1)
      if (next < (cost.get(to) ?? Number.POSITIVE_INFINITY)) {
        cost.set(to, next)
        previous.set(to, { from: id, dir, guessed })
        open.add(to)
      }
    }
  }
  return null
}
