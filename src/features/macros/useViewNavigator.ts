//import { useMacroRunner } from './macroRunner'
import type { ConnectedBus } from '../connection/connection'
import { M8KeyMask } from '../connection/keys'
import { useCallback, useEffect, useRef } from 'react'
import { useCursor, useCursorRect, useSystemInfo } from '../state/viewStore'

type keyType = 'up' | 'down' | 'left' | 'right' | null

const map: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: M8KeyMask.Up,
    down: M8KeyMask.Down,
    left: M8KeyMask.Left,
    right: M8KeyMask.Right,
}

const opposite = (step: keyType): keyType => {
    switch (step) {
        case 'up': return 'down'
        case 'down': return 'up'
        case 'left': return 'right'
        case 'right': return 'left'
        default: return null
    }
}

// Comparaison lexicographique : dist, |dy|, |dx|
// (priorité à la bonne ligne avant la colonne)
const isBetterPoint = (
    a: { dist: number; absDx: number; absDy: number },
    b: { dist: number; absDx: number; absDy: number },
    eps = 1e-3,
) => {
    if (a.dist < b.dist - eps) return true
    if (a.dist > b.dist + eps) return false

    // dist ~ égales -> minimiser |dy|
    if (a.absDy < b.absDy) return true
    if (a.absDy > b.absDy) return false

    // puis minimiser |dx|
    if (a.absDx < b.absDx) return true
    if (a.absDx > b.absDx) return false

    return false
}

export const useViewNavigator = (connection?: ConnectedBus) => {
    const [cursor] = useCursor()
    const [cursorRect] = useCursorRect()
    const [systemInfo] = useSystemInfo()

    const currentTarget = useRef<{ x: number; y: number } | null>(null)

    const safety = useRef(0)
    const MAX_STEPS = 20

    const lastStep = useRef<keyType>(null)
    const stepsHistory = useRef<keyType[]>([])

    const bestPoint = useRef<{ dist: number; absDx: number; absDy: number; index: number }>({
        dist: Infinity,
        absDx: Infinity,
        absDy: Infinity,
        index: 0,
    })

    const lastPoint = useRef<{ dist: number; absDx: number; absDy: number }>({
        dist: Infinity,
        absDx: Infinity,
        absDy: Infinity,
    })

    const priority = useRef<'vertical' | 'horizontal'>('vertical')
    const bounceVertical = useRef(0)
    const bounceHorizontal = useRef(0)

    const lastRect = useRef<{ rx: number; ry: number; rw: number; rh: number } | null>(null)

    const getRect = useCallback(() => {
        const rect = cursorRect
        const gridW = 1
        const gridH = 1
        const rx = rect ? Math.floor(rect.x / gridW) : 0

        // Apply rectOffset adjustment (same logic as renderer)
        const rectOffset = systemInfo?.rectOffset ?? 0
        const rawY = rect ? Math.floor(rect.y / gridH) : 0
        const ry = rawY > 0 ? rawY + rectOffset : rawY

        const rw = rect ? Math.floor(rect.w / gridW) : 480
        const rh = rect ? Math.ceil(rect.h / gridH) : 320
        return { rx, ry, rw, rh }
    }, [cursorRect, systemInfo])

    const distanceToRect = useCallback((
        r: { rx: number; ry: number; rw: number; rh: number },
        target: { x: number; y: number },
    ) => {
        const nearestX = Math.max(r.rx, Math.min(target.x, r.rx + r.rw))
        const nearestY = Math.max(r.ry, Math.min(target.y, r.ry + r.rh))
        const dx = nearestX - target.x
        const dy = nearestY - target.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        return { dist, dx, dy }
    }, [])

    const resetState = useCallback(() => {
        currentTarget.current = null
        safety.current = 0
        lastStep.current = null
        stepsHistory.current = []
        bestPoint.current = { dist: Infinity, absDx: Infinity, absDy: Infinity, index: 0 }
        lastPoint.current = { dist: Infinity, absDx: Infinity, absDy: Infinity }
        priority.current = 'vertical'
        bounceVertical.current = 0
        bounceHorizontal.current = 0
        lastRect.current = null
    }, [])

    const returnToBestPosition = useCallback(() => {
        const history = stepsHistory.current
        const bestIdx = bestPoint.current.index

        for (let i = history.length - 1; i > bestIdx; i -= 1) {
            const step = history[i]
            const opp = opposite(step)
            if (opp && connection) {
                connection.commands.sendKeys(map[opp])
                connection.commands.sendKeys(0)
            }
        }
    }, [connection])

    const decideStep = useCallback((target: { x: number; y: number }): keyType => {
        const { rx, ry, rw, rh } = getRect()

        let horizontal: keyType = null
        if (target.x < rx) horizontal = 'left'
        else if (target.x > rx + rw) horizontal = 'right'

        let vertical: keyType = null
        if (target.y < ry) vertical = 'up'
        else if (target.y > ry + rh) vertical = 'down'

        const p = priority.current

        if (p === 'vertical') {
            if (vertical) return vertical
            if (horizontal) return horizontal
        } else {
            if (horizontal) return horizontal
            if (vertical) return vertical
        }

        return null
    }, [getRect])

    useEffect(() => {
        if (!connection) return
        if (!currentTarget.current) return
        if (!cursorRect) return

        const target = currentTarget.current
        const rect = getRect()

        const prevRect = lastRect.current
        const didMove =
            !prevRect ||
            prevRect.rx !== rect.rx ||
            prevRect.ry !== rect.ry ||
            prevRect.rw !== rect.rw ||
            prevRect.rh !== rect.rh

        if (lastStep.current && !didMove) {
            if (lastStep.current === 'up' || lastStep.current === 'down') {
                priority.current = 'horizontal'
            } else {
                priority.current = 'vertical'
            }
        }

        lastRect.current = rect

        const { dist, dx, dy } = distanceToRect(rect, target)
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)
        const current = { dist, absDx, absDy }

        if (isBetterPoint(current, bestPoint.current)) {
            bestPoint.current = { ...current, index: stepsHistory.current.length }
        }
        lastPoint.current = current

        const inside =
            target.x >= rect.rx &&
            target.x <= rect.rx + rect.rw &&
            target.y >= rect.ry &&
            target.y <= rect.ry + rect.rh

        if (inside) {
            resetState()
            return
        }

        if (safety.current >= MAX_STEPS) {
            returnToBestPosition()
            resetState()
            return
        }

        const stepNow = decideStep(target)

        if (!stepNow) {
            returnToBestPosition()
            resetState()
            return
        }

        if (lastStep.current) {
            const opp = opposite(lastStep.current)
            if (opp && stepNow === opp) {
                const isVertical = stepNow === 'up' || stepNow === 'down'
                if (isVertical) {
                    bounceVertical.current += 1
                } else {
                    bounceHorizontal.current += 1
                }

                const havePerfectRow = bestPoint.current.absDy === 0

                if (bounceVertical.current >= 2 || bounceHorizontal.current >= 2) {
                    if (havePerfectRow || safety.current >= MAX_STEPS) {
                        returnToBestPosition()
                        resetState()
                        return
                    } else {
                        if (bounceVertical.current >= 2) {
                            priority.current = 'horizontal'
                            bounceVertical.current = 0
                        }
                        if (bounceHorizontal.current >= 2) {
                            priority.current = 'vertical'
                            bounceHorizontal.current = 0
                        }
                    }
                }
            }
        }

        // 7) Envoyer le step
        stepsHistory.current.push(stepNow)
        safety.current += 1
        lastStep.current = stepNow

        connection.commands.sendKeys(map[stepNow])
        connection.commands.sendKeys(0)
    }, [cursorRect, connection, getRect, distanceToRect, decideStep, resetState, returnToBestPosition])

    const navigateTo = (target: { x: number; y: number }) => {
        if (!cursor || !connection) return

        resetState()
        currentTarget.current = target

        const rect = getRect()
        lastRect.current = rect

        const { dist, dx, dy } = distanceToRect(rect, target)
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)
        const initial = { dist, absDx, absDy }

        bestPoint.current = { ...initial, index: 0 }
        lastPoint.current = initial

        const step = decideStep(target)
        if (!step) return

        stepsHistory.current.push(step)
        safety.current += 1
        lastStep.current = step

        connection.commands.sendKeys(map[step])
        connection.commands.sendKeys(0)
    }

    return { navigateTo }
}
