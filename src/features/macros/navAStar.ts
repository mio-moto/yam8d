import { aStar, type Graph } from '../../utils/astar'
import { M8KeyMask } from '../connection/keys'
import type { Direction } from './m8Graph'

export const computePagePath = (graph: Graph, start: string, goal: string) => {
    return aStar(graph, start, goal)
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
