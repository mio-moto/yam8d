// let cocolo = 'color: grey'
// if (width > 3 || height > 3) cocolo = 'color: darkgrey'
// else if (width <= 3 && height <= 3 && color) cocolo = 'color: green'
// else if (width <= 3 && height <= 3) cocolo = 'color: #aaffaa'
// console.log(`%cmessage`, cocolo, type, x, y, width, height, color)

import type { ConnectedBus } from "../connection/connection";
import type { RectCommand } from "../connection/protocol";



export function rectLogger(bus?: ConnectedBus | null) {
    // Sampling state: buffer RectCommand data for a 3s window
    let samplingActive = false
    // Buffer of plain, serializable rect snapshots
    let sampleBuffer: Array<{
        type: number
        x: number
        y: number
        width: number
        height: number
        color?: { r: number; g: number; b: number }
        ts: number
    }> = []
    let sampleTimer: ReturnType<typeof setTimeout> | null = null
    let sampleStartTs = 0

    const formatFileTimestamp = (ts: number) => {
        const d = new Date(ts)
        const pad = (n: number) => n.toString().padStart(2, '0')
        const yyyy = d.getFullYear()
        const mm = pad(d.getMonth() + 1)
        const dd = pad(d.getDate())
        const hh = pad(d.getHours())
        const mi = pad(d.getMinutes())
        const ss = pad(d.getSeconds())
        return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
    }

    const downloadJson = (filename: string, data: unknown) => {
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch {
            // Silent failure: avoid console noise
        }
    }

    const finishSample = () => {
        if (sampleTimer) {
            clearTimeout(sampleTimer)
            sampleTimer = null
        }

        const filename = `rect-sample-${formatFileTimestamp(sampleStartTs)}.json`
        // Only the RectCommand data, per request (no cocolo); flattened to plain objects
        const payload = sampleBuffer
        downloadJson(filename, payload)

        // Reset for potential future sampling windows
        samplingActive = false
        sampleBuffer = []
        sampleStartTs = 0
    }

    const rectHandler = (data: RectCommand) => {
        if (!data) return

        if (!samplingActive) {
            samplingActive = true
            sampleStartTs = Date.now()
            sampleBuffer = []
            sampleTimer = setTimeout(finishSample, 3000)
        }

        // Flatten RectCommand into serializable shape
        const { type, pos: { x, y }, size: { width, height }, color } = data
        const ts = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        sampleBuffer.push({ type, x, y, width, height, color, ts })
    }

    if (!bus) return () => { }

    bus.protocol.eventBus.on('rect', rectHandler)

    return () => {
        bus.protocol.eventBus.off('rect', rectHandler)
        if (sampleTimer) {
            clearTimeout(sampleTimer)
            sampleTimer = null
        }
        samplingActive = false
        sampleBuffer = []
        sampleStartTs = 0
    }
}