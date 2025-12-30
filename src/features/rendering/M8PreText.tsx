import { useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand } from '../connection/protocol'

// this rendering is pure html
// it uses the CharacterCommand sent by the bus.text
// for optimisation I created several layers of pre, one per color
// in each pre there one div per row (24 rows)
// The background color is sampled to take the most 

export const M8PreText = ({ bus }: { bus?: ConnectedBus | null }) => {

    const container = useRef<HTMLDivElement | null>(null)

    const rgbToHex = (rgb: { r: number; g: number; b: number }) =>
        `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

    // would have been cool but it seems that calling resetScreen breaks the connection
    // useEffect(() => {
    //     bus?.commands.resetScreen()
    // }, [])

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
        const bgAt: string[][] = []
        const bgCounts = new Map<string, number>()
        const bgCurrent = { value: '' as string }
        for (let y = 0; y < HEIGHT; y += 1) {
            const row: string[] = []
            for (let x = 0; x < WIDTH; x += 1) row.push('')
            colorAt.push(row)
            bgAt.push([...row])
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

            const idx_y = Math.floor(data.pos.y / 14)
            const idx_x = Math.floor(data.pos.x / 12)

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
                    prevLayer.rowStrings[idx_y] = row.slice(0, idx_x) + ' ' + row.slice(idx_x + 1)
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

            // Background: track most frequent background color and apply it
            const prevBgColor = bgAt[idx_y][idx_x]
            if (prevBgColor !== nextBgColor) {
                if (prevBgColor) {
                    const prevCount = (bgCounts.get(prevBgColor) ?? 0) - 1
                    if (prevCount > 0) bgCounts.set(prevBgColor, prevCount)
                    else bgCounts.delete(prevBgColor)
                }
                const nextCount = (bgCounts.get(nextBgColor) ?? 0) + 1
                bgCounts.set(nextBgColor, nextCount)
                bgAt[idx_y][idx_x] = nextBgColor

                // Recompute top background color (counts map is small)
                let topColor = bgCurrent.value
                let topCount = topColor ? (bgCounts.get(topColor) ?? 0) : -1
                bgCounts.forEach((count, color) => {
                    if (count > topCount) {
                        topCount = count
                        topColor = color
                    }
                })
                if (container.current && topColor && bgCurrent.value !== topColor) {
                    container.current.style.backgroundColor = topColor
                    bgCurrent.value = topColor
                }
            }
        }

        bus?.protocol.eventBus.on('text', handler)

        return () => {
            bus?.protocol.eventBus.off('text', handler)
        }
    }, [bus])

    return (
        <div className="element prescreen" ref={container} />
    )
}