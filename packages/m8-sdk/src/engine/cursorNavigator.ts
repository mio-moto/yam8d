// Moves the M8 cursor to a point on the screen with arrow presses. The point is first turned into
// a goal cell (cursorTargets.ts: the nearest learned cursor cell or text run), so a click between
// cells goes to the nearest one. Each key is pressed alone and its effect checked on the cursor
// rectangle; what it did is learned (cursorMap.ts) per layout, and later moves follow the shortest
// learned path. Plain arrow presses made outside a navigation (the user's own) are learned too.
// A text the cursor cannot reach (a label) is remembered and the next nearest cell is tried; when
// nothing works the cursor goes to the learned cell nearest the click, checking each step. On the
// Song, Chain and Phrase grids the cells and moves are known (fixedGridLayout) and nothing is learned.

import type { EngineBus } from './bus'
import { type CellRect, type CursorDir, type CursorLayout, type CursorMap, cellId, createCursorMap, findPath, wentBackwards } from './cursorMap'
import {
  type CursorGoal,
  candidates,
  covers,
  coversX,
  coversY,
  cellHasText,
  fixedGridLayout,
  goalReached,
  type GridRows,
  gridRows,
  hasFixedGrid,
  layoutSignature,
  panelColumnFor,
  pickGoal,
  type Point,
  pointGoal,
  rectDistance,
  rowOf,
  snapToGrid,
} from './cursorTargets'
import { M8KeyMask } from './keys'
import type { KeyCommand } from './protocol'
import type { M8Store } from './store'

export type { Point } from './cursorTargets'

const keyMap: Record<CursorDir, number> = {
  up: M8KeyMask.Up,
  down: M8KeyMask.Down,
  left: M8KeyMask.Left,
  right: M8KeyMask.Right,
}
const DIRECTION_MASK = M8KeyMask.Up | M8KeyMask.Down | M8KeyMask.Left | M8KeyMask.Right
const MODIFIER_MASK = M8KeyMask.Edit | M8KeyMask.Opt | M8KeyMask.Shift | M8KeyMask.Play
// Never kept down during a move: Edit+arrow edits the value, Option+arrow pages, Shift+arrow changes view. The
// M8 does not always echo a release (an Edit that opens another view), so the last echo can still show one.
const NOT_HELD_MASK = DIRECTION_MASK | M8KeyMask.Edit | M8KeyMask.Opt | M8KeyMask.Shift

// Key presses per navigation, and how many of them may be tries of moves not learned yet
const MAX_STEPS = 48
const MAX_EXPLORE = 40
// Key presses allowed to go back to the closest cell after a goal turned out unreachable
const MAX_RETURN_STEPS = 16
// Text runs tried in turn when the nearest one is a label the cursor cannot reach
const MAX_GOALS = 4
// No cursor move this long after the key echo: probably blocked. It is only learned as blocked when the
// cursor still has not moved after the grace: a busy M8 (playing, redrawing) can answer late, and a key
// wrongly learned as blocked would hide the cells behind it.
const MOVE_TIMEOUT_MS = 150
const MOVE_GRACE_MS = 300
// A move drawn this long after the release of the user's own arrow press still belongs to it
const PASSIVE_SETTLE_MS = 200
const DEBUG_NAVIGATOR = false

const log = (message: string, data?: unknown) => {
  if (!DEBUG_NAVIGATOR) return
  if (data !== undefined) console.log(`[cursorNavigator] ${message}`, data)
  else console.log(`[cursorNavigator] ${message}`)
}

const sameRect = (a: CellRect | null, b: CellRect | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

const singleDirection = (keys: number): CursorDir | null => {
  if (keys & MODIFIER_MASK) return null
  const dirs = (Object.keys(keyMap) as CursorDir[]).filter((dir) => keys & keyMap[dir])
  return dirs.length === 1 ? dirs[0] : null
}

export interface CursorNavigator {
  /**
   * Moves the cursor to the cell at or nearest to `target` (M8 pixel coordinates). Resolves true
   * when it got there, false when it stopped on the closest cell it could reach (or was cancelled).
   */
  navigateTo(target: Point): Promise<boolean>
  dispose(): void
}

export interface CursorNavigatorDeps {
  bus: EngineBus
  store: M8Store
  /** The screen text (one string per row, columns kept), used to find the cells near a click. */
  getScreenLines?: () => string[]
  /** Where the learned layouts are kept; a new empty map by default. */
  cursorMap?: CursorMap
}

type PendingMove = {
  from: CellRect
  dir: CursorDir
  /** Cell the map expects (undefined: no expectation). */
  expected: string | null | undefined
  /** The expectation is a guess, not a learned move: a miss is only learned, not distrusted. */
  guessed: boolean
  /** The first timeout passed: waiting the grace before learning the key as blocked. */
  graced?: boolean
}

type Run = {
  point: Point
  /** First and last numbered rows on grid views: the cursor never leaves them. */
  grid: GridRows | null
  /** The known grid of a Song, Chain or Phrase view, planned over instead of the learned layout. */
  fixed: CursorLayout | null
  goal: CursorGoal
  goals: number
  phase: 'seek' | 'return'
  viewName: string | null
  /** Null while nothing may be learned (selection mode, unknown view). */
  layoutKey: string | null
  steps: number
  explored: number
  /** `"<cellId>:<dir>"` pressed in this phase. */
  tried: Set<string>
  /** Presses sent again after the M8 did not answer them (grid views). */
  retried: Set<string>
  /** Learned moves that did something else during this run. */
  distrust: Set<string>
  visited: Map<string, CellRect>
  /** Texts that failed in this navigation. */
  failedTexts: Set<string>
  pending: PendingMove | null
  resolve: (reached: boolean) => void
}

export const createCursorNavigator = ({
  bus,
  store,
  getScreenLines = () => [],
  cursorMap = createCursorMap(),
}: CursorNavigatorDeps): CursorNavigator => {
  let run: Run | null = null
  let currentKeysMask = 0
  let holdMask = 0
  let waitingForKeyAck = false
  let moveTimeout: ReturnType<typeof setTimeout> | null = null
  // The user's own arrow press being learned
  let passive: { dir: CursorDir; from: CellRect | null; layoutKey: string | null; releasedAt: number | null } | null = null

  const metrics = () => store.get('cellMetrics')
  const panelColumn = () => panelColumnFor(store.get('systemInfo')?.screenWidth ?? 480, metrics())

  // The cursor rectangle snapped to the character grid: the M8 draws the same cell a pixel or two
  // differently at times (x 332 w 28 h 16, then x 333 w 26 h 14), which must stay one cell
  const getRect = (): CellRect | null => {
    const current = store.get('cursorRect')
    return current ? snapToGrid(current, metrics()) : null
  }

  // Layouts are told apart by view, model, font mode and the row labels on screen
  const layoutKey = (): string | null => {
    const viewName = store.get('viewName')
    if (!viewName || store.get('selectionMode')) return null
    const system = store.get('systemInfo')
    return [
      viewName,
      system?.model ?? store.get('deviceModel') ?? '?',
      system?.fontMode ?? store.get('fontMode') ?? '?',
      layoutSignature(getScreenLines(), panelColumn()),
    ].join('|')
  }

  const clearMoveTimeout = () => {
    if (moveTimeout) {
      clearTimeout(moveTimeout)
      moveTimeout = null
    }
  }

  const scheduleMoveTimeout = (ms = MOVE_TIMEOUT_MS) => {
    clearMoveTimeout()
    moveTimeout = setTimeout(() => {
      moveTimeout = null
      log('move timeout fired', { waitingForKeyAck })
      advance('timeout')
    }, ms)
  }

  const finish = (reached: boolean) => {
    if (!run) return
    const { resolve } = run
    log('finish', { reached, goal: run.goal, rect: getRect() })
    run = null
    clearMoveTimeout()
    waitingForKeyAck = false
    holdMask = currentKeysMask & ~NOT_HELD_MASK
    resolve(reached)
  }

  const tap = (dir: CursorDir) => {
    bus.commands.sendKeys(holdMask | keyMap[dir])
    bus.commands.sendKeys(holdMask)
  }

  const isGoalCell = (r: Run, id: string, rect: CellRect | undefined) => {
    if (r.goal.kind === 'cell') return id === r.goal.id
    return !!rect && goalReached(r.goal, rect, metrics())
  }

  // Arrow keys that bring the cursor closer to the goal on an axis it does not cover yet, vertical first
  // (vertical moves keep the column on the M8's grid views).
  const towardGoal = (rect: CellRect, goal: CursorGoal): CursorDir[] => {
    const dirs: CursorDir[] = []
    const cy = rect.y + rect.h / 2
    const cx = rect.x + rect.w / 2
    if (!coversY(rect, goal.rect, metrics())) dirs.push(goal.rect.y + goal.rect.h / 2 < cy ? 'up' : 'down')
    if (!coversX(rect, goal.rect, metrics())) dirs.push(goal.rect.x + goal.rect.w / 2 < cx ? 'left' : 'right')
    return dirs
  }

  type Move = { dir: CursorDir; expected: string | null | undefined; guessed: boolean }

  // Up on a grid's first row or Down on its last would scroll or change the phrase or chain shown
  const leavesGrid = (r: Run, rect: CellRect, dir: CursorDir) => {
    if (!r.grid) return false
    const row = rowOf(rect, metrics())
    return (dir === 'up' && row <= r.grid.first) || (dir === 'down' && row >= r.grid.last)
  }

  const planLayout = (r: Run) => r.fixed ?? (r.layoutKey ? cursorMap.get(r.layoutKey) : undefined)

  const chooseMove = (r: Run, rect: CellRect): Move | null => {
    const id = cellId(rect)
    const layout = planLayout(r)

    if (layout) {
      const path = findPath(
        layout,
        id,
        (cell) => isGoalCell(r, cell, layout.cells.get(cell)),
        r.distrust,
        (cell, dir) => leavesGrid(r, cell, dir),
      )
      const first = path?.[0]
      if (first && !(first.guessed && (r.explored >= MAX_EXPLORE || r.tried.has(`${id}:${first.dir}`)))) {
        return { dir: first.dir, expected: first.to, guessed: first.guessed }
      }
    }

    const known = layout?.moves.get(id) ?? {}
    const here = rectDistance(rect, r.goal.rect)
    // A key learned as blocked is tried again when nothing else is left: it may have been a late answer
    let retry: Move | null = null
    for (const dir of towardGoal(rect, r.goal)) {
      const move = `${id}:${dir}`
      if (r.tried.has(move) || leavesGrid(r, rect, dir)) continue
      const to = r.distrust.has(move) ? undefined : known[dir]
      if (to === null) {
        retry ??= { dir, expected: null, guessed: false }
        continue
      }
      if (to !== undefined) {
        // Learned, but no learned path goes on from it: take it only when it gets closer
        const toRect = layout?.cells.get(to)
        if (toRect && !wentBackwards(rect, dir, toRect) && rectDistance(toRect, r.goal.rect) < here) return { dir, expected: to, guessed: false }
        continue
      }
      if (r.explored >= MAX_EXPLORE) return null
      return { dir, expected: undefined, guessed: true }
    }
    return retry
  }

  const press = (r: Run, rect: CellRect, move: Move) => {
    tap(move.dir)
    r.steps += 1
    if (move.guessed) r.explored += 1
    r.tried.add(`${cellId(rect)}:${move.dir}`)
    r.pending = { from: rect, dir: move.dir, expected: move.expected, guessed: move.guessed }
    waitingForKeyAck = true
    log('step sent', { dir: move.dir, expected: move.expected, rect })
    scheduleMoveTimeout()
  }

  // The goal cannot be reached: go back to the visited cell closest to it, then stop
  const giveUp = (r: Run, rect: CellRect, localMinimum: boolean) => {
    if (r.phase === 'seek') {
      // On another part of the same text (two cells drawn as one run): that is the field
      if (r.goal.kind === 'text' && covers(rect, r.goal.run, metrics())) {
        finish(true)
        return
      }
      if (localMinimum && r.goal.kind === 'text' && r.layoutKey) {
        // Not reachable from here: on the goal's row, the texts past the cursor on the goal's side as well
        // (labels under or beside values); the whole row when the cursor is next to it and the key toward
        // it is blocked (a header); else only the goal (on views where Up/Down jump columns, a row can be
        // passed by). Marked once, they are only skipped for this navigation; a second failure in another
        // one makes them unreachable.
        const { row, run } = r.goal
        const onRow = coversY(rect, run, metrics())
        const leftOfCursor = run.x + run.w / 2 < rect.x + rect.w / 2
        const cursorRow = rowOf(rect, metrics())
        const towardRow = row < cursorRow ? 'up' : 'down'
        const blockedNextToRow = Math.abs(row - cursorRow) === 1 && planLayout(r)?.moves.get(cellId(rect))?.[towardRow] === null
        const keys =
          onRow || blockedNextToRow
            ? candidates(planLayout(r), getScreenLines(), metrics(), panelColumn(), r.grid)
                .runs.filter((text) => text.row === row)
                .filter((text) => !onRow || (leftOfCursor ? text.rect.x + text.rect.w <= rect.x + 3 : text.rect.x >= rect.x + rect.w - 3))
                .map((text) => text.key)
            : []
        if (!keys.includes(r.goal.key)) keys.push(r.goal.key)
        for (const key of keys) {
          r.failedTexts.add(key)
          if (!r.grid) cursorMap.markUnreachable(r.layoutKey, key)
        }
        const next = pickGoal(r.point, planLayout(r), getScreenLines(), metrics(), panelColumn(), r.grid, r.failedTexts, true)
        if (r.goals < MAX_GOALS && next.kind !== 'point' && next.rect !== r.goal.rect) {
          log('text not reachable, trying the next nearest cell', { from: r.goal, to: next })
          r.goal = next
          r.goals += 1
          r.explored = 0
          r.tried.clear()
          step(r)
          return
        }
      }
      // Out of goals: the learned cell nearest the click, else the visited cell nearest the goal
      const clicked = { x: r.point.x, y: r.point.y, w: 1, h: 1 }
      const known = candidates(planLayout(r), getScreenLines(), metrics(), panelColumn(), r.grid).cells
      let best = rect
      if (known.length > 0) {
        for (const cell of known) if (rectDistance(cell.rect, clicked) < rectDistance(best, clicked) - 1e-6) best = cell.rect
      } else {
        for (const cell of r.visited.values()) if (rectDistance(cell, r.goal.rect) < rectDistance(best, r.goal.rect) - 1e-6) best = cell
      }
      if (!sameRect(best, rect)) {
        log('goal not reached, going to the closest cell', { goal: r.goal, best })
        r.phase = 'return'
        r.goal = { kind: 'cell', id: cellId(best), rect: best }
        r.steps = 0
        r.explored = 0
        r.tried.clear()
        step(r)
        return
      }
    }
    finish(false)
  }

  function step(r: Run) {
    const rect = getRect()
    if (!rect) {
      finish(false)
      return
    }
    if (goalReached(r.goal, rect, metrics())) {
      finish(r.phase === 'seek')
      return
    }
    if (r.steps >= (r.phase === 'seek' ? MAX_STEPS : MAX_RETURN_STEPS)) {
      giveUp(r, rect, false)
      return
    }
    const move = chooseMove(r, rect)
    if (!move) {
      giveUp(r, rect, r.explored < MAX_EXPLORE)
      return
    }
    press(r, rect, move)
  }

  // A pressed key moved the cursor to `to`, or did not move it (`to` null)
  const settle = (r: Run, pending: PendingMove, to: CellRect | null) => {
    r.pending = null
    clearMoveTimeout()
    waitingForKeyAck = false
    const key = layoutKey()
    if (r.layoutKey && key === r.layoutKey && !r.fixed) cursorMap.recordMove(r.layoutKey, pending.from, pending.dir, to)
    const toId = to ? cellId(to) : null
    if (!pending.guessed && pending.expected !== undefined && toId !== pending.expected) {
      log('learned move did something else', { pending, to })
      r.distrust.add(`${cellId(pending.from)}:${pending.dir}`)
    }
    if (to) r.visited.set(cellId(to), to)
  }

  function advance(reason: 'rect' | 'timeout') {
    const r = run
    if (!r) return
    const rect = getRect()
    if (!rect) {
      finish(false)
      return
    }
    if (r.pending) {
      if (!sameRect(r.pending.from, rect)) settle(r, r.pending, rect)
      else if (reason === 'timeout' && !r.pending.graced) {
        r.pending.graced = true
        scheduleMoveTimeout(MOVE_GRACE_MS)
        return
      } else if (reason === 'timeout') {
        // The M8 drops keys pressed right after a view change, and on a grid view no key is ever blocked
        // inside the rows: press once more before the key is learned as blocked.
        const move = `${cellId(r.pending.from)}:${r.pending.dir}`
        if (r.grid && !r.retried.has(move)) {
          log('no move after the grace, pressing again', { move })
          r.retried.add(move)
          r.tried.delete(move)
          r.pending = null
          waitingForKeyAck = false
        } else settle(r, r.pending, null)
      } else return
    }
    // A plain arrow never changes the view; if it did (a dialog), stop
    if (store.get('viewName') !== r.viewName) {
      finish(false)
      return
    }
    step(r)
  }

  const onKey = (data: KeyCommand) => {
    currentKeysMask = data.keys ?? 0
    if (run) {
      passive = null
      if (waitingForKeyAck) {
        waitingForKeyAck = false
        if (run.pending) scheduleMoveTimeout()
      }
      return
    }
    holdMask = currentKeysMask & ~NOT_HELD_MASK
    const dir = singleDirection(currentKeysMask)
    if (dir) {
      if (!passive || passive.dir !== dir || passive.releasedAt !== null) passive = { dir, from: getRect(), layoutKey: layoutKey(), releasedAt: null }
    } else if (currentKeysMask === 0 && passive) {
      passive.releasedAt ??= Date.now()
    } else {
      passive = null
    }
  }

  const onRect = () => {
    if (run) {
      advance('rect')
      return
    }
    const rect = getRect()
    const key = layoutKey()
    // Nothing to learn on the known grids
    if (!rect || !key || hasFixedGrid(store.get('viewName'))) {
      passive = null
      return
    }
    // Only moves made by an arrow are learned: a rectangle drawn while the view changes can be the old view's
    const p = passive
    if (p?.from && p.layoutKey === key && (p.releasedAt === null || Date.now() - p.releasedAt <= PASSIVE_SETTLE_MS)) {
      const lines = getScreenLines()
      if (!sameRect(p.from, rect) && cellHasText(p.from, lines, metrics()) && cellHasText(rect, lines, metrics())) {
        cursorMap.recordMove(key, p.from, p.dir, rect)
      }
      // Auto-repeat goes on from here
      p.from = rect
    } else {
      passive = null
    }
  }

  bus.protocol.eventBus.on('key', onKey)
  const unsubscribeRect = store.sub('cursorRect', onRect)

  return {
    navigateTo: (point: Point): Promise<boolean> =>
      new Promise((resolve) => {
        const rect = getRect()
        if (!store.get('cursorPos') || !rect) {
          resolve(false)
          return
        }

        // A move still on its way belongs to the previous navigation: wait for it before planning
        const carried = run?.pending ?? null
        if (run) {
          const previous = run
          run = null
          previous.resolve(false)
        }

        const key = layoutKey()
        const lines = getScreenLines()
        const grid = gridRows(store.get('viewName'), lines)
        // The known grid, unless the cursor is on none of its cells (another model or firmware): then it is learned
        const known = key ? fixedGridLayout(store.get('viewName'), grid, metrics()) : null
        const fixed = known?.cells.has(cellId(rect)) ? known : null
        const layout = fixed ?? (key ? cursorMap.get(key) : undefined)
        const goal = store.get('selectionMode') ? pointGoal(point) : pickGoal(point, layout, lines, metrics(), panelColumn(), grid)
        if (key && !fixed && cellHasText(rect, lines, metrics())) cursorMap.recordCell(key, rect)
        if (!carried) holdMask = currentKeysMask & ~NOT_HELD_MASK
        passive = null
        log('navigateTo start', { point, goal })

        const r: Run = {
          point,
          grid,
          fixed,
          goal,
          goals: 1,
          phase: 'seek',
          viewName: store.get('viewName'),
          layoutKey: key,
          steps: 0,
          explored: 0,
          tried: new Set(),
          retried: new Set(),
          distrust: new Set(),
          visited: new Map([[cellId(rect), rect]]),
          failedTexts: new Set(),
          pending: carried ? { ...carried, expected: undefined, guessed: true } : null,
          resolve,
        }
        run = r
        if (carried) {
          if (!moveTimeout) scheduleMoveTimeout()
          return
        }
        step(r)
      }),
    dispose: () => {
      finish(false)
      bus.protocol.eventBus.off('key', onKey)
      unsubscribeRect()
    },
  }
}
