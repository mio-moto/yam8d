import { useEffect, useRef } from 'react'
import { rgbToHex } from '../../utils/colorTools'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand } from '../connection/protocol'

// this rendering is pure html
// it uses the CharacterCommand sent by the bus.text
// for optimisation I created several layers of pre, one per color
// in each pre there one div per row (24 rows)
// The background color is sampled to take the most

export const M8PreText = ({ bus }: { bus?: ConnectedBus | null }) => {
    const container = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const WIDTH = 40
        const HEIGHT = 24

        type Layer = {
            rowStrings: string[]
            rowEls: HTMLDivElement[]
            pre: HTMLPreElement
            count: number
        }

        const fgLayers = new Map<string, Layer>()
        const colorAt: string[][] = []
        for (let y = 0; y < HEIGHT; y += 1) {
            const row: string[] = []
            for (let x = 0; x < WIDTH; x += 1) row.push('')
            colorAt.push(row)
        }

        const makeLayer = (color: string): Layer => {
            const pre = document.createElement('pre')
            pre.className = 'prescreen-layer'
            pre.style.color = color
            const rowStrings: string[] = []
            const rowEls: HTMLDivElement[] = []
            for (let y = 0; y < HEIGHT; y += 1) {
                const s = ' '.repeat(WIDTH)
                rowStrings.push(s)
                const div = document.createElement('div')
                div.textContent = s
                pre.appendChild(div)
                rowEls.push(div)
            }
            if (container.current) {
                container.current.appendChild(pre)
            }
            return { rowStrings, rowEls, pre, count: 0 }
        }

        const ensureFgLayer = (color: string): Layer => {
            let layer = fgLayers.get(color)
            if (layer) return layer
            layer = makeLayer(color)
            fgLayers.set(color, layer)
            return layer
        }

        // bus handler
        const handler = (data: CharacterCommand) => {
            if (!container.current) return

            const idx_x = Math.floor(data.pos.x / 12)
            const idx_y = Math.floor(data.pos.y / 14)

            if (idx_y < 0 || idx_x < 0 || idx_y >= HEIGHT || idx_x >= WIDTH) {
                // Out of bounds
                return
            }

            const nextChar = data.character
            const nextFgColor = rgbToHex(data.foreground)
            const nextBgColor = rgbToHex(data.background)

            const prevFgColor = colorAt[idx_y][idx_x]

            // clear previous char on its previous color layer
            if (prevFgColor) {
                const prevLayer = fgLayers.get(prevFgColor)
                if (prevLayer) {
                    const row = prevLayer.rowStrings[idx_y]
                    if (row[idx_x] !== ' ') {
                        prevLayer.count -= 1
                    }
                    prevLayer.rowStrings[idx_y] = `${row.slice(0, idx_x)} ${row.slice(idx_x + 1)}`
                    prevLayer.rowEls[idx_y].textContent = prevLayer.rowStrings[idx_y]
                    if (prevLayer.count <= 0) {
                        // prune empty layer
                        prevLayer.pre.remove()
                        fgLayers.delete(prevFgColor)
                    }
                }
            }

            // If space, just clear and remove colorAt
            if (nextChar === ' ') {
                colorAt[idx_y][idx_x] = ''
            } else {
                const layer = ensureFgLayer(nextFgColor)
                const row = layer.rowStrings[idx_y]
                if (row[idx_x] === ' ') {
                    layer.count += 1
                }
                layer.rowStrings[idx_y] = row.slice(0, idx_x) + nextChar + row.slice(idx_x + 1)
                layer.rowEls[idx_y].textContent = layer.rowStrings[idx_y]
                colorAt[idx_y][idx_x] = nextFgColor
            }

            // Simplified background: sample the background color at position 0,0
            // and apply it to the container whenever (0,0) changes.
            if (idx_x === 0 && idx_y === 3 && container.current) {
                container.current.style.backgroundColor = nextBgColor
            }
        }

        bus?.protocol.eventBus.on('text', handler)

        // works but no more event are received
        bus?.commands.resetScreen()

        return () => {
            bus?.protocol.eventBus.off('text', handler)
        }
    }, [bus])

    return <div className="element prescreen" ref={container} />
}
