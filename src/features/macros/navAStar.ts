import { aStar, type Graph } from '../../utils/astar'
import { M8KeyMask } from '../connection/keys'
import type { Direction } from './m8Graph'

export const computePagePath = (graph: Graph, start: string, goal: string) => {
    return aStar(graph, start, goal)
}

export const computeViewPath = (from: { x: number; y: number }, to: { x: number; y: number }): Direction[] => {
    const dirs: Direction[] = []
    let cx = from.x
    let cy = from.y
    // Horizontal moves
    while (cx !== to.x) {
        if (to.x > cx) {
            dirs.push('right')
            cx += 1
        } else {
            dirs.push('left')
            cx -= 1
        }
    }
    // Vertical moves
    while (cy !== to.y) {
        if (to.y > cy) {
            dirs.push('down')
            cy += 1
        } else {
            dirs.push('up')
            cy -= 1
        }
    }
    return dirs
}

export const toKeyMasks = (directions: Direction[], opts?: { shift?: boolean }) => {
    const withShift = !!opts?.shift
    const s = M8KeyMask.Shift
    const map: Record<Direction, number> = {
        up: (withShift ? s : 0) | M8KeyMask.Up,
        down: (withShift ? s : 0) | M8KeyMask.Down,
        left: (withShift ? s : 0) | M8KeyMask.Left,
        right: (withShift ? s : 0) | M8KeyMask.Right,
    }
    const seq: number[] = []
    if (withShift) seq.push(s)
    for (const d of directions) {
        seq.push(map[d], withShift ? s : 0)
    }
    // final release
    seq.push(0)
    return seq
}
