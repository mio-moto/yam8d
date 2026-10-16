// Moves the M8 cursor to a point on the screen with arrow presses, watching the cursor
// rectangle after each step. A blocked axis (no movement before the timeout) switches to the
// other one; bounces and dead ends roll back to the closest position seen.

import type { EngineBus } from './bus'
import { M8KeyMask } from './keys'
import type { KeyCommand } from './protocol'
import type { M8Store } from './store'

type KeyType = 'up' | 'down' | 'left' | 'right'
type Axis = 'vertical' | 'horizontal'
export type Point = { x: number; y: number }
type RectState = { rx: number; ry: number; rw: number; rh: number }
type PositionSample = {
  rect: RectState
  index: number
  dist: number
  axisAligned: boolean
}

const keyMap: Record<KeyType, number> = {
  up: M8KeyMask.Up,
  down: M8KeyMask.Down,
  left: M8KeyMask.Left,
  right: M8KeyMask.Right,
}
const DIRECTION_MASK = M8KeyMask.Up | M8KeyMask.Down | M8KeyMask.Left | M8KeyMask.Right

const MAX_STEPS = 24
const MOVE_TIMEOUT_MS = 150
const POSITION_EPSILON = 0.1
const DEBUG_NAVIGATOR = false

const axisOfStep = (step: KeyType): Axis => (step === 'up' || step === 'down' ? 'vertical' : 'horizontal')

const opposite = (step: KeyType): KeyType => {
  switch (step) {
    case 'up':
      return 'down'
    case 'down':
      return 'up'
    case 'left':
      return 'right'
    case 'right':
      return 'left'
  }
}

const sameRect = (a: RectState | null, b: RectState) => {
  if (!a) return false
  return a.rx === b.rx && a.ry === b.ry && a.rw === b.rw && a.rh === b.rh
}

const rectCenter = (rect: RectState): Point => ({ x: rect.rx + rect.rw / 2, y: rect.ry + rect.rh / 2 })

const isWithinX = (rect: RectState, target: Point) => target.x >= rect.rx - POSITION_EPSILON && target.x <= rect.rx + rect.rw + POSITION_EPSILON

const isWithinY = (rect: RectState, target: Point) => target.y >= rect.ry - POSITION_EPSILON && target.y <= rect.ry + rect.rh + POSITION_EPSILON

const distanceFromCenter = (rect: RectState, target: Point) => {
  const center = rectCenter(rect)
  const dx = center.x - target.x
  const dy = center.y - target.y
  return Math.sqrt(dx * dx + dy * dy)
}

const stepForAxis = (axis: Axis, rect: RectState, target: Point): KeyType | null => {
  if (axis === 'vertical') {
    if (target.y < rect.ry - POSITION_EPSILON) return 'up'
    if (target.y > rect.ry + rect.rh + POSITION_EPSILON) return 'down'
    return null
  }
  if (target.x < rect.rx - POSITION_EPSILON) return 'left'
  if (target.x > rect.rx + rect.rw + POSITION_EPSILON) return 'right'
  return null
}

const log = (message: string, data?: unknown) => {
  if (!DEBUG_NAVIGATOR) return
  if (data !== undefined) console.log(`[cursorNavigator] ${message}`, data)
  else console.log(`[cursorNavigator] ${message}`)
}

export interface CursorNavigator {
  /** Moves the cursor towards `target` (M8 pixel coordinates). Resolves when it stops. */
  navigateTo(target: Point): Promise<void>
  dispose(): void
}

export const createCursorNavigator = ({ bus, store }: { bus: EngineBus; store: M8Store }): CursorNavigator => {
  let resolver: (() => void) | null = null
  let target: Point | null = null
  let currentKeysMask = 0
  let holdMask = 0
  let waitingForKeyAck = false

  let priority: Axis = 'vertical'
  let blockedAxis: { vertical: boolean; horizontal: boolean } = { vertical: false, horizontal: false }

  let lastIssuedStep: KeyType | null = null
  let lastCommandRect: RectState | null = null
  let awaitingMove = false

  let moveTimeout: ReturnType<typeof setTimeout> | null = null

  let stepHistory: KeyType[] = []
  let samples: PositionSample[] = []
  let recentRects: RectState[] = []

  const clearMoveTimeout = () => {
    if (moveTimeout) {
      clearTimeout(moveTimeout)
      moveTimeout = null
    }
  }

  const scheduleMoveTimeout = () => {
    clearMoveTimeout()
    moveTimeout = setTimeout(() => {
      log('move timeout fired', { timeoutMs: MOVE_TIMEOUT_MS, waitingForKeyAck })
      advance('timeout')
    }, MOVE_TIMEOUT_MS)
  }

  const resetState = () => {
    target = null
    priority = 'vertical'
    blockedAxis = { vertical: false, horizontal: false }
    lastIssuedStep = null
    lastCommandRect = null
    awaitingMove = false
    stepHistory = []
    samples = []
    recentRects = []
    waitingForKeyAck = false
    holdMask = currentKeysMask & ~DIRECTION_MASK
    clearMoveTimeout()
  }

  const finish = () => {
    clearMoveTimeout()
    if (resolver) {
      resolver()
      resolver = null
    }
    resetState()
  }

  const getRect = (): RectState | null => {
    const current = store.get('cursorRect')
    if (!current) return null
    return { rx: current.x, ry: current.y, rw: current.w, rh: current.h }
  }

  const rememberSample = (rect: RectState, point: Point) => {
    const dist = distanceFromCenter(rect, point)
    const axisAligned = isWithinX(rect, point) || isWithinY(rect, point)
    samples.push({ rect, index: stepHistory.length, dist, axisAligned })

    recentRects.push(rect)
    if (recentRects.length > 4) recentRects.shift()
  }

  const getBestIndex = (preferAxisAligned: boolean) => {
    let best: PositionSample | null = null

    for (const sample of samples) {
      if (preferAxisAligned && !sample.axisAligned) continue
      if (!best || sample.dist < best.dist) best = sample
    }

    if (!best && preferAxisAligned) {
      for (const sample of samples) {
        if (!best || sample.dist < best.dist) best = sample
      }
    }

    return best?.index ?? stepHistory.length
  }

  const tapKeyWithMask = (step: KeyType) => {
    const baseline = holdMask
    const pressMask = baseline | keyMap[step]
    bus.commands.sendKeys(pressMask)
    bus.commands.sendKeys(baseline)
  }

  const rollbackToIndex = (index: number) => {
    for (let i = stepHistory.length - 1; i >= index; i -= 1) {
      tapKeyWithMask(opposite(stepHistory[i]))
    }
  }

  const hasTwoPositionBounce = () => {
    if (recentRects.length < 3 || stepHistory.length < 2) return false

    const last = recentRects[recentRects.length - 1]
    const prev = recentRects[recentRects.length - 2]
    const prev2 = recentRects[recentRects.length - 3]

    // Early bounce detection: A-B-A with opposite direction keys.
    const lastStep = stepHistory[stepHistory.length - 1]
    const prevStep = stepHistory[stepHistory.length - 2]
    if (sameRect(last, prev2) && !sameRect(last, prev) && opposite(prevStep) === lastStep) {
      return true
    }

    // Keep stricter ABAB fallback when more history is available.
    if (recentRects.length >= 4) {
      const a0 = recentRects[recentRects.length - 4]
      const b0 = recentRects[recentRects.length - 3]
      const a1 = recentRects[recentRects.length - 2]
      const b1 = recentRects[recentRects.length - 1]
      if (sameRect(a0, a1) && sameRect(b0, b1) && !sameRect(a0, b0)) {
        return true
      }
    }

    return false
  }

  const decideStep = (rect: RectState, point: Point): KeyType | null => {
    const withinX = isWithinX(rect, point)
    const withinY = isWithinY(rect, point)

    if (withinX && withinY) return null

    if (withinX && !withinY) {
      if (blockedAxis.vertical) return null
      return stepForAxis('vertical', rect, point)
    }
    if (withinY && !withinX) {
      if (blockedAxis.horizontal) return null
      return stepForAxis('horizontal', rect, point)
    }

    const firstAxis = priority
    const secondAxis: Axis = firstAxis === 'vertical' ? 'horizontal' : 'vertical'

    const firstStep = blockedAxis[firstAxis] ? null : stepForAxis(firstAxis, rect, point)
    if (firstStep) return firstStep

    return blockedAxis[secondAxis] ? null : stepForAxis(secondAxis, rect, point)
  }

  const sendStep = (step: KeyType, rectBefore: RectState) => {
    tapKeyWithMask(step)

    stepHistory.push(step)
    lastIssuedStep = step
    lastCommandRect = rectBefore
    awaitingMove = true
    waitingForKeyAck = true
    log('step sent', { step, baselineMask: holdMask, rectBefore })
  }

  function advance(reason: 'start' | 'rect' | 'timeout') {
    if (!target) return

    const rect = getRect()
    if (!rect) return

    // Raw target coordinates are used as-is: in some layouts (ex: huge font) they can exceed nominal screen height.
    const point = target
    log('advance', { reason, rect, target: point, priority, blocked: blockedAxis })

    if (samples.length === 0 || !sameRect(samples[samples.length - 1].rect, rect)) {
      rememberSample(rect, point)
    }

    if (hasTwoPositionBounce()) {
      log('bounce detected, rollback to best aligned sample')
      rollbackToIndex(getBestIndex(true))
      finish()
      return
    }

    if (isWithinX(rect, point) && isWithinY(rect, point)) {
      log('target reached inside cursor bounds', { rect, target: point })
      finish()
      return
    }

    if (stepHistory.length >= MAX_STEPS) {
      log('max steps reached, rollback to best aligned sample')
      rollbackToIndex(getBestIndex(true))
      finish()
      return
    }

    if (awaitingMove && lastIssuedStep && lastCommandRect) {
      const moved = !sameRect(lastCommandRect, rect)

      if (moved) {
        awaitingMove = false
        waitingForKeyAck = false
        blockedAxis[axisOfStep(lastIssuedStep)] = false
        log('cursor moved after command', { lastStep: lastIssuedStep, rect })
      } else if (reason === 'timeout') {
        const blocked = axisOfStep(lastIssuedStep)
        blockedAxis[blocked] = true
        priority = blocked === 'vertical' ? 'horizontal' : 'vertical'
        awaitingMove = false
        waitingForKeyAck = false
        log('move timeout: axis blocked and priority switched', {
          blockedAxis: blocked,
          newPriority: priority,
          lastStep: lastIssuedStep,
          target: point,
          rect,
        })
      } else {
        return
      }
    }

    const nextStep = decideStep(rect, point)

    if (!nextStep) {
      if (reason === 'timeout') {
        log('no viable next step after timeout, keeping current position and stopping')
        finish()
        return
      }
      log('no viable next step, stopping at best position')
      rollbackToIndex(getBestIndex(true))
      finish()
      return
    }

    priority = axisOfStep(nextStep)
    sendStep(nextStep, rect)
    scheduleMoveTimeout()
  }

  const onKey = (data: KeyCommand) => {
    currentKeysMask = data.keys ?? 0
    if (!target) {
      holdMask = currentKeysMask & ~DIRECTION_MASK
    }
    if (target && waitingForKeyAck) {
      waitingForKeyAck = false
      log('key event ack received', { keys: data.keys })
      if (awaitingMove) {
        log('restarting timeout from key ack')
        scheduleMoveTimeout()
      }
    }
  }

  bus.protocol.eventBus.on('key', onKey)
  const unsubscribeRect = store.sub('cursorRect', () => {
    if (target) advance('rect')
  })

  return {
    navigateTo: (point: Point): Promise<void> =>
      new Promise((resolve) => {
        if (!store.get('cursorPos')) {
          resolve()
          return
        }

        if (resolver) {
          resolver()
          resolver = null
        }

        resetState()
        resolver = resolve
        target = point
        log('navigateTo start', { target: point })

        const rect = getRect()
        if (!rect) {
          log('navigateTo aborted: no cursor rect')
          finish()
          return
        }

        rememberSample(rect, point)
        advance('start')
      }),
    dispose: () => {
      finish()
      bus.protocol.eventBus.off('key', onKey)
      unsubscribeRect()
    },
  }
}
