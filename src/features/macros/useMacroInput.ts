import { useCallback, useEffect, useRef } from 'react'
import { aStar, type Graph } from '../../utils/astar'
import type { ConnectedBus } from '../connection/connection.ts'
import { M8KeyMask } from '../connection/keys.ts'
import type { CharacterCommand, KeyCommand } from '../connection/protocol.ts'
import { type Direction, M8_GRAPH } from './m8Graph'

export function getM8GraphAsMap(): Graph {
    const map: Graph = new Map()
    for (const [k, v] of Object.entries(M8_GRAPH)) {
        map.set(k, v.slice())
    }
    return map
}

// TODO: separate view astar navigation from macro key queues.
// TODO: generalise astar navigaton

export const useMacroInput = (connection?: ConnectedBus) => {
    const macro = useRef<number[]>([0])
    // TODO : the resolution is M8 Model dependent
    const SCREEN_W = 480
    const SCREEN_H = 320
    // Preallocate a fixed-size buffer
    const pageRaw = useRef<string[]>(Array(SCREEN_W * SCREEN_H).fill(''))
    const pageName = useRef<string>('')

    const stability = useRef<{ version: number; timer: ReturnType<typeof setTimeout> | null }>({ version: 0, timer: null })

    // TODO : the line height is M8 Model dependent
    const PAGENAME_ROW_INDEX = 3 * 14 // name on third row (0-based) * 14px height
    const MINIMAP_ROW_MIN = 18 * 14 // minimap starts on 18th row
    const MINIMAP_COL_MIN = 34 * 12 // and 34th character
    const STABILIZE_MS = 100

    const planAndSendPath = useCallback(
        (targetPage: string) => {
            const start = (pageName.current || '').toLowerCase()
            const goal = (targetPage || '').toLowerCase()
            if (!start || !goal) return

            const graph: Graph = getM8GraphAsMap()
            if (!graph.has(start) || !graph.has(goal)) {
                console.warn('Unknown start/goal in graph', { start, goal })
                return
            }
            const res = aStar(graph, start, goal)
            if (!res) {
                console.warn('No path found', { start, goal })
                return
            }

            const s = M8KeyMask.Shift
            const dirToMask: Record<Direction, number> = {
                up: M8KeyMask.Shift | M8KeyMask.Up,
                down: M8KeyMask.Shift | M8KeyMask.Down,
                left: M8KeyMask.Shift | M8KeyMask.Left,
                right: M8KeyMask.Shift | M8KeyMask.Right,
            }

            // Build macro: keep Shift held, pulse directions, then release
            const seq: number[] = [s]
            for (const d of res.directions) {
                seq.push(dirToMask[d], s)
            }
            //final release
            seq.push(0)
            macro.current = seq
            // Kick off macro execution
            connection?.commands.sendKeys(macro.current.shift() as number)
        },
        [connection],
    )

    const handleInput = useCallback(
        (ev: KeyboardEvent, _isDown: boolean) => {
            if (!ev || !ev.code) return
            if (ev.repeat) return

            switch (ev.code) {
                case 'F1':
                    planAndSendPath('songpsvpit')
                    ev.preventDefault()
                    break

                case 'F2':
                    planAndSendPath('chainspcvpit')
                    ev.preventDefault()
                    break

                case 'F3':
                    planAndSendPath('phrasesgpvit')
                    ev.preventDefault()
                    break

                case 'F4':
                    planAndSendPath('tablespimtv')
                    ev.preventDefault()
                    break

                case 'F5':
                    planAndSendPath('instrumentpoolsppmivit')
                    ev.preventDefault()
                    break

                case 'F6':
                    planAndSendPath('inst.spmivt')
                    ev.preventDefault()
                    break

                case 'F7':
                    planAndSendPath('mixersgpvxit')
                    ev.preventDefault()
                    break

                case 'F8':
                    planAndSendPath('effectsettingssgpvxit')
                    ev.preventDefault()
                    break

                case 'F9':
                    planAndSendPath('projectspcvpit')
                    ev.preventDefault()
                    break

                default:
                    break
            }
        },
        [planAndSendPath],
    )

    useEffect(() => {
        const textHandler = (data: CharacterCommand) => {
            // TODO: not that much happy with my pagename extraction. Should have a better convention like viewTitle.minimap
            if (data.pos.y === PAGENAME_ROW_INDEX || (data.pos.y >= MINIMAP_ROW_MIN && data.pos.x >= MINIMAP_COL_MIN)) {
                const x = data.pos.x
                const y = data.pos.y
                // index col first to have a vertical read of minimap
                const idx = y + x * SCREEN_H
                pageRaw.current[idx] = data.character

                const v = ++stability.current.version
                if (stability.current.timer) clearTimeout(stability.current.timer)
                stability.current.timer = setTimeout(() => {
                    if (stability.current.version === v) {
                        const raw = pageRaw.current.join('')
                        // oops, this regex remove the c in the minimap
                        const cleaned = raw.replace(/\s([0-9a-fA-F]+|[0-9a-fA-F]{2})\b/g, '').replace(/[ *]/g, '')
                        const page = cleaned.toLowerCase()
                        pageName.current = page
                        // I used this log to generate the M8Graph
                        console.log('page is', pageName.current)
                    }
                }, STABILIZE_MS)
            }
        }

        const keyHandler = (_data: KeyCommand) => {
            if (macro.current.length > 0) connection?.commands.sendKeys(macro.current.shift() as number)
        }

        const handleKeyDown = (ev: KeyboardEvent) => {
            handleInput(ev, true)
        }
        window.addEventListener('keydown', handleKeyDown)

        connection?.protocol.eventBus.on('text', textHandler)
        connection?.protocol.eventBus.on('key', keyHandler)

        return () => {
            connection?.protocol.eventBus.off('text', textHandler)
            connection?.protocol.eventBus.off('key', keyHandler)
            window.removeEventListener('keydown', handleKeyDown)

            if (stability.current.timer) {
                clearTimeout(stability.current.timer)
                stability.current.timer = null
            }
        }
    }, [connection, handleInput])
}
