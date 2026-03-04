import type { ConnectedBus } from '../connection/connection'
import { M8KeyMask } from '../connection/keys'
import { useCallback, useEffect, useRef } from 'react'
import { useCursor, useCursorRect } from '../state/viewStore'

type KeyType = 'up' | 'down' | 'left' | 'right'
type Axis = 'vertical' | 'horizontal'
type Point = { x: number; y: number }
type RectState = { rx: number; ry: number; rw: number; rh: number }
type KeyEventData = { keys: number }
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

const axisOfStep = (step: KeyType): Axis => {
    return step === 'up' || step === 'down' ? 'vertical' : 'horizontal'
}

const opposite = (step: KeyType): KeyType => {
    switch (step) {
        case 'up': return 'down'
        case 'down': return 'up'
        case 'left': return 'right'
        case 'right': return 'left'
    }
}

const sameRect = (a: RectState | null, b: RectState) => {
    if (!a) return false
    return a.rx === b.rx && a.ry === b.ry && a.rw === b.rw && a.rh === b.rh
}

export const useViewNavigator = (connection?: ConnectedBus) => {
    const [cursor] = useCursor()
    const [cursorRect] = useCursorRect()

    const cursorRectRef = useRef(cursorRect)
    const resolverRef = useRef<(() => void) | null>(null)
    const targetRef = useRef<Point | null>(null)
    const currentKeysMaskRef = useRef(0)
    const holdMaskRef = useRef(0)
    const waitingForKeyAckRef = useRef(false)

    const priorityRef = useRef<Axis>('vertical')
    const blockedAxisRef = useRef<{ vertical: boolean; horizontal: boolean }>({ vertical: false, horizontal: false })

    const lastIssuedStepRef = useRef<KeyType | null>(null)
    const lastCommandRectRef = useRef<RectState | null>(null)
    const awaitingMoveRef = useRef(false)

    const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const stepHistoryRef = useRef<KeyType[]>([])
    const samplesRef = useRef<PositionSample[]>([])
    const recentRectsRef = useRef<RectState[]>([])

    const log = useCallback((message: string, data?: unknown) => {
        if (!DEBUG_NAVIGATOR) return
        if (data !== undefined) {
            console.log(`[useViewNavigator] ${message}`, data)
            return
        }
        console.log(`[useViewNavigator] ${message}`)
    }, [])

    const clearMoveTimeout = useCallback(() => {
        if (moveTimeoutRef.current) {
            clearTimeout(moveTimeoutRef.current)
            moveTimeoutRef.current = null
        }
    }, [])

    const scheduleMoveTimeout = useCallback(() => {
        clearMoveTimeout()
        moveTimeoutRef.current = setTimeout(() => {
            log('move timeout fired', { timeoutMs: MOVE_TIMEOUT_MS, waitingForKeyAck: waitingForKeyAckRef.current })
            advanceRef.current?.('timeout')
        }, MOVE_TIMEOUT_MS)
    }, [clearMoveTimeout, log])

    const advanceRef = useRef<((reason: 'start' | 'rect' | 'timeout') => void) | null>(null)

    const resetState = useCallback(() => {
        targetRef.current = null
        priorityRef.current = 'vertical'
        blockedAxisRef.current = { vertical: false, horizontal: false }
        lastIssuedStepRef.current = null
        lastCommandRectRef.current = null
        awaitingMoveRef.current = false
        stepHistoryRef.current = []
        samplesRef.current = []
        recentRectsRef.current = []
        waitingForKeyAckRef.current = false
        holdMaskRef.current = currentKeysMaskRef.current & ~DIRECTION_MASK
        clearMoveTimeout()
    }, [clearMoveTimeout])

    const finish = useCallback(() => {
        clearMoveTimeout()
        if (resolverRef.current) {
            resolverRef.current()
            resolverRef.current = null
        }
        resetState()
    }, [clearMoveTimeout, resetState])

    const getRect = useCallback((): RectState | null => {
        const current = cursorRectRef.current
        if (!current) return null
        return {
            rx: current.x,
            ry: current.y,
            rw: current.w,
            rh: current.h,
        }
    }, [])

    const rectCenter = useCallback((rect: RectState): Point => {
        return { x: rect.rx + rect.rw / 2, y: rect.ry + rect.rh / 2 }
    }, [])

    const normalizeTarget = useCallback((target: Point, _rect: RectState): Point => {
        // Keep raw target coordinates as-is. In some layouts (ex: huge font),
        // reachable raw protocol coordinates can exceed nominal screen height.
        return target
    }, [])

    const isWithinX = useCallback((rect: RectState, target: Point) => {
        return target.x >= rect.rx - POSITION_EPSILON && target.x <= rect.rx + rect.rw + POSITION_EPSILON
    }, [])

    const isWithinY = useCallback((rect: RectState, target: Point) => {
        return target.y >= rect.ry - POSITION_EPSILON && target.y <= rect.ry + rect.rh + POSITION_EPSILON
    }, [])

    const distanceFromCenter = useCallback((rect: RectState, target: Point) => {
        const center = rectCenter(rect)
        const dx = center.x - target.x
        const dy = center.y - target.y
        return Math.sqrt(dx * dx + dy * dy)
    }, [rectCenter])

    const rememberSample = useCallback((rect: RectState, target: Point) => {
        const dist = distanceFromCenter(rect, target)
        const axisAligned = isWithinX(rect, target) || isWithinY(rect, target)
        samplesRef.current.push({
            rect,
            index: stepHistoryRef.current.length,
            dist,
            axisAligned,
        })

        recentRectsRef.current.push(rect)
        if (recentRectsRef.current.length > 4) {
            recentRectsRef.current.shift()
        }
    }, [distanceFromCenter, isWithinX, isWithinY])

    const getBestIndex = useCallback((preferAxisAligned: boolean) => {
        const samples = samplesRef.current
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

        return best?.index ?? stepHistoryRef.current.length
    }, [])

    const tapKeyWithMask = useCallback((step: KeyType) => {
        const baseline = holdMaskRef.current
        const directionBit = keyMap[step]
        const pressMask = baseline | directionBit
        connection?.commands.sendKeys(pressMask)
        connection?.commands.sendKeys(baseline)
    }, [connection])

    const rollbackToIndex = useCallback((index: number) => {
        const history = stepHistoryRef.current
        for (let i = history.length - 1; i >= index; i -= 1) {
            const back = opposite(history[i])
            tapKeyWithMask(back)
        }
    }, [tapKeyWithMask])

    const hasTwoPositionBounce = useCallback(() => {
        const recent = recentRectsRef.current
        const steps = stepHistoryRef.current
        if (recent.length < 3 || steps.length < 2) return false

        const last = recent[recent.length - 1]
        const prev = recent[recent.length - 2]
        const prev2 = recent[recent.length - 3]

        // Early bounce detection: A-B-A with opposite direction keys.
        const lastStep = steps[steps.length - 1]
        const prevStep = steps[steps.length - 2]
        if (sameRect(last, prev2) && !sameRect(last, prev) && opposite(prevStep) === lastStep) {
            return true
        }

        // Keep stricter ABAB fallback when more history is available.
        if (recent.length >= 4) {
            const a0 = recent[recent.length - 4]
            const b0 = recent[recent.length - 3]
            const a1 = recent[recent.length - 2]
            const b1 = recent[recent.length - 1]
            if (sameRect(a0, a1) && sameRect(b0, b1) && !sameRect(a0, b0)) {
                return true
            }
        }

        return false
    }, [])

    const stepForAxis = useCallback((axis: Axis, rect: RectState, target: Point): KeyType | null => {
        if (axis === 'vertical') {
            if (target.y < rect.ry - POSITION_EPSILON) return 'up'
            if (target.y > rect.ry + rect.rh + POSITION_EPSILON) return 'down'
            return null
        }

        if (target.x < rect.rx - POSITION_EPSILON) return 'left'
        if (target.x > rect.rx + rect.rw + POSITION_EPSILON) return 'right'
        return null
    }, [])

    const decideStep = useCallback((rect: RectState, target: Point): KeyType | null => {
        const withinX = isWithinX(rect, target)
        const withinY = isWithinY(rect, target)
        const blocked = blockedAxisRef.current

        if (withinX && withinY) return null

        if (withinX && !withinY) {
            if (blocked.vertical) return null
            return stepForAxis('vertical', rect, target)
        }
        if (withinY && !withinX) {
            if (blocked.horizontal) return null
            return stepForAxis('horizontal', rect, target)
        }

        const firstAxis = priorityRef.current
        const secondAxis: Axis = firstAxis === 'vertical' ? 'horizontal' : 'vertical'

        const firstStep = blocked[firstAxis] ? null : stepForAxis(firstAxis, rect, target)
        if (firstStep) return firstStep

        const secondStep = blocked[secondAxis] ? null : stepForAxis(secondAxis, rect, target)
        return secondStep
    }, [isWithinX, isWithinY, stepForAxis])

    const sendStep = useCallback((step: KeyType, rectBefore: RectState) => {
        if (!step) return
        tapKeyWithMask(step)

        stepHistoryRef.current.push(step)
        lastIssuedStepRef.current = step
        lastCommandRectRef.current = rectBefore
        awaitingMoveRef.current = true
        waitingForKeyAckRef.current = true
        log('step sent', { step, baselineMask: holdMaskRef.current, rectBefore })
    }, [log, tapKeyWithMask])

    const advance = useCallback((reason: 'start' | 'rect' | 'timeout') => {
        if (!targetRef.current || !connection) return

        const rect = getRect()
        if (!rect) return

        const target = normalizeTarget(targetRef.current, rect)
        log('advance', { reason, rect, target, priority: priorityRef.current, blocked: blockedAxisRef.current })

        if (samplesRef.current.length === 0 || !sameRect(samplesRef.current[samplesRef.current.length - 1].rect, rect)) {
            rememberSample(rect, target)
        }

        if (hasTwoPositionBounce()) {
            log('bounce detected, rollback to best aligned sample')
            const bestIndex = getBestIndex(true)
            rollbackToIndex(bestIndex)
            finish()
            return
        }

        const withinX = isWithinX(rect, target)
        const withinY = isWithinY(rect, target)

        if (withinX && withinY) {
            log('target reached inside cursor bounds', { rect, target })
            finish()
            return
        }

        if (stepHistoryRef.current.length >= MAX_STEPS) {
            log('max steps reached, rollback to best aligned sample')
            const bestIndex = getBestIndex(true)
            rollbackToIndex(bestIndex)
            finish()
            return
        }

        if (awaitingMoveRef.current && lastIssuedStepRef.current && lastCommandRectRef.current) {
            const moved = !sameRect(lastCommandRectRef.current, rect)

            if (moved) {
                awaitingMoveRef.current = false
                waitingForKeyAckRef.current = false
                blockedAxisRef.current[axisOfStep(lastIssuedStepRef.current)] = false
                log('cursor moved after command', { lastStep: lastIssuedStepRef.current, rect })
            } else if (reason === 'timeout') {
                const blockedAxis = axisOfStep(lastIssuedStepRef.current)
                blockedAxisRef.current[blockedAxis] = true
                priorityRef.current = blockedAxis === 'vertical' ? 'horizontal' : 'vertical'
                awaitingMoveRef.current = false
                waitingForKeyAckRef.current = false
                log('move timeout: axis blocked and priority switched', {
                    blockedAxis,
                    newPriority: priorityRef.current,
                    lastStep: lastIssuedStepRef.current,
                    target,
                    rect,
                })
            } else {
                return
            }
        }

        const nextStep = decideStep(rect, target)

        if (!nextStep) {
            if (reason === 'timeout') {
                log('no viable next step after timeout, keeping current position and stopping')
                finish()
                return
            }
            log('no viable next step, stopping at best position')
            const bestIndex = getBestIndex(true)
            rollbackToIndex(bestIndex)
            finish()
            return
        }

        priorityRef.current = axisOfStep(nextStep)
        sendStep(nextStep, rect)

        scheduleMoveTimeout()
    }, [
        connection,
        decideStep,
        finish,
        getBestIndex,
        getRect,
        hasTwoPositionBounce,
        isWithinX,
        isWithinY,
        normalizeTarget,
        rememberSample,
        rollbackToIndex,
        scheduleMoveTimeout,
        sendStep,
        log,
    ])

    advanceRef.current = advance

    useEffect(() => {
        cursorRectRef.current = cursorRect
        if (targetRef.current) {
            advance('rect')
        }
    }, [advance, cursorRect])

    useEffect(() => {
        if (!connection) return

        const onKey = (data: KeyEventData) => {
            currentKeysMaskRef.current = data.keys ?? 0
            if (!targetRef.current) {
                holdMaskRef.current = currentKeysMaskRef.current & ~DIRECTION_MASK
            }
            if (targetRef.current && waitingForKeyAckRef.current) {
                waitingForKeyAckRef.current = false
                log('key event ack received', { keys: data.keys })
                if (awaitingMoveRef.current) {
                    log('restarting timeout from key ack')
                    scheduleMoveTimeout()
                }
            }
        }

        connection.protocol.eventBus.on('key', onKey)
        return () => {
            connection.protocol.eventBus.off('key', onKey)
        }
    }, [connection, log, scheduleMoveTimeout])

    useEffect(() => {
        return () => {
            clearMoveTimeout()
        }
    }, [clearMoveTimeout])

    const navigateTo = useCallback((target: Point): Promise<void> => {
        return new Promise((resolve) => {
            if (!cursor || !connection) {
                resolve()
                return
            }

            if (resolverRef.current) {
                resolverRef.current()
                resolverRef.current = null
            }

            resetState()
            resolverRef.current = resolve
            targetRef.current = target
            log('navigateTo start', { target })

            const rect = getRect()
            if (!rect) {
                log('navigateTo aborted: no cursor rect')
                finish()
                return
            }

            const normalized = normalizeTarget(target, rect)
            rememberSample(rect, normalized)
            advance('start')
        })
    }, [advance, connection, cursor, finish, getRect, normalizeTarget, rememberSample, resetState, log])

    return { navigateTo }
}
