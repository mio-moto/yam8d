import { createEventBus } from '../eventBus'

const littleEndian = true
export type RectCommand = ReturnType<typeof parseRectCommand>
const parseRectCommand = (data: DataView, length: number) => {
    const x = data.getUint16(1, littleEndian)
    const y = data.getUint16(3, littleEndian)
    switch (length) {
        // 1b: command | 2b: x | 2b: y
        case 5:
            return {
                type: 1,
                pos: { x, y },
                size: { width: 1, height: 1 },
            } as const
        // 1b: command | 2b: x | 2b: y | 1b: r | 1b: g | 1b: b
        case 8:
            return {
                type: 2,
                pos: { x, y },
                size: { width: 1, height: 1 },
                color: { r: data.getUint8(5), g: data.getUint8(6), b: data.getUint8(7) },
            } as const
        // 1b: command | 2b: x | 2b: y | 2b: width | 2b: height
        case 9:
            return {
                type: 3,
                pos: { x, y },
                size: { width: data.getUint16(5, littleEndian), height: data.getUint16(7, littleEndian) },
            } as const
        // 1b: command | 2b: x | 2b: y | 2b: width | 2b: height | 1b: r | 1b: g | 1b: b
        case 12:
            return {
                type: 4,
                pos: { x, y },
                size: { width: data.getUint16(5, littleEndian), height: data.getUint16(7, littleEndian) },
                color: { r: data.getUint8(9), g: data.getUint8(10), b: data.getUint8(11) },
            } as const
    }
    const bytes = []
    for (let i = 0; i < length; i += 1) {
        bytes.push(data.getUint8(i).toString(16).padStart(2, '0'.toUpperCase()))
    }
    console.error(`Invalid length (${length}) of rect command data: ${bytes.join(' ')}`)
    // throw new Error(`Invalid length (${length}) of rect command data`)
    // never undefined
    return {
        type: 0,
        pos: { x, y },
        size: { width: 0, height: 0 },
    } as const
}

export type CharacterCommand = ReturnType<typeof parseCharacterCommand>
const parseCharacterCommand = (data: DataView, length: number) => {
    if (length !== 12) {
        throw new Error(`Invalid length (${length}) of char command data`)
    }
    const char = {
        character: String.fromCharCode(data.getUint8(1)),
        pos: { x: data.getUint16(2, littleEndian), y: data.getUint16(4, littleEndian) },
        foreground: { r: data.getUint8(6), g: data.getUint8(7), b: data.getUint8(8) },
        background: { r: data.getUint8(9), g: data.getUint8(10), b: data.getUint8(11) },
    }
    return char
}

export type WaveCommand = ReturnType<typeof parseWaveCommand>
const parseWaveCommand = (data: DataView, length: number) => {
    if (length < 4 || length > 484) {
        throw new Error(`Invalid length (${length}) of wave command data`)
    }
    const wave: number[] = []
    for (let i = 4; i < length; i += 1) {
        wave.push(data.getUint8(i))
    }
    return {
        color: { r: data.getUint8(1), g: data.getUint8(2), b: data.getUint8(3) },
        wave,
    }
}

export type KeyCommand = ReturnType<typeof parseKeyCommand>
const parseKeyCommand = (data: DataView, length: number) => {
    if (length !== 3) {
        throw new Error(`Invalid length (${length}) of key command data`)
    }
    return {
        keys: data.getUint8(1),
    }
}

export type SystemCommand = ReturnType<typeof parseSystemCommand>
const device = ['Headless', 'Beta M8', 'M8 Model:01', 'M8 Model:02'] as const
const parseSystemCommand = (data: DataView, length: number) => {
    if (length !== 6) {
        throw new Error(`Invalid length (${length}) of system command data`)
    }

    return {
        model: device[data.getUint8(1)],
        version: `v${data.getUint8(2)}.${data.getUint8(3)}.${data.getUint8(4)}`,
        fontMode: data.getUint8(5) as 0 | 1 | 2,
    }
}

let lastSystemInfo: SystemCommand | undefined

export const protocol = () => {
    const eventBus = createEventBus<{
        rect: (data: RectCommand) => void
        text: (data: CharacterCommand) => void
        wave: (data: WaveCommand) => void
        key: (data: KeyCommand) => void
        system: (data: SystemCommand) => void
        any: (data: Uint8Array<ArrayBufferLike>) => void
    }>()

    const dispatch = (data: DataView, dataLength: number) => {
        try {
            if (dataLength <= 0) {
                return
            }

            const buffer = new Uint8Array(data.buffer, data.byteOffset, dataLength)
            eventBus.emit('any', buffer)

            switch (data.getUint8(0)) {
                case 0xfe: {
                    // draw rect
                    const command = parseRectCommand(data, dataLength)
                    if (command) {
                        eventBus.emit('rect', command)
                    }
                    break
                }
                case 0xfd: // draw character
                    eventBus.emit('text', parseCharacterCommand(data, dataLength))
                    break
                case 0xfc: // draw wave
                    eventBus.emit('wave', parseWaveCommand(data, dataLength))
                    break
                case 0xfb: // key events
                    eventBus.emit('key', parseKeyCommand(data, dataLength))
                    break
                case 0xff: { // system info
                    lastSystemInfo = parseSystemCommand(data, dataLength)
                    eventBus.emit('system', lastSystemInfo)
                    break
                }
                default:
                    console.warn(`Unknown byte 0x${data.getUint8(0).toString(16).padStart(2, '0')} as command`)
                    break
            }
        } catch (_e) { }
    }

    return {
        eventBus,
        dispatch,
        getSystemInfo: () => lastSystemInfo,
    }
}
