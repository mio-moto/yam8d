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
        pos: { x, y },
        size: { width: 1, height: 1 },
      } as const
    // 1b: command | 2b: x | 2b: y | 1b: r | 1b: g | 1b: b
    case 8:
      return {
        pos: { x, y },
        size: { width: 1, height: 1 },
        color: { r: data.getUint8(5), g: data.getUint8(6), b: data.getUint8(7) },
      } as const
    // 1b: command | 2b: x | 2b: y | 2b: width | 2b: height
    case 9:
      return {
        pos: { x, y },
        size: { width: data.getUint16(5, littleEndian), height: data.getUint16(7, littleEndian) },
      } as const
    // 1b: command | 2b: x | 2b: y | 2b: width | 2b: height | 1b: r | 1b: g | 1b: b
    case 12:
      return {
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
}

export type CharacterCommand = ReturnType<typeof parseCharacterCommand>
const parseCharacterCommand = (data: DataView, length: number) => {
  if (length !== 12) {
    throw new Error(`Invalid length (${length}) of char command data`)
  }
  return {
    character: String.fromCharCode(data.getUint8(1)),
    pos: { x: data.getUint16(2, littleEndian), y: data.getUint16(4, littleEndian) },
    foreground: { r: data.getUint8(6), g: data.getUint8(7), b: data.getUint8(8) },
    background: { r: data.getUint8(9), g: data.getUint8(10), b: data.getUint8(11) },
  }
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
    throw new Error(`Invalid length (${length}) of wave command data`)
  }
  return {
    keys: data.getUint8(1),
  }
}

export type SystemCommand = ReturnType<typeof parseSystemCommand>
const device = ['Headless', 'Beta M8', 'M8 Model:01', 'M8 Model:02'] as const
const parseSystemCommand = (data: DataView, length: number) => {
  if (length !== 6) {
    throw new Error(`Invalid length (${length}) of wave command data`)
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
    any: (data: Uint8Array<ArrayBuffer>) => void
  }>()

  const data = new DataView(new Uint8Array(1024).buffer)
  let dataLength = 0
  let status: 'read' | 'escape' | 'error' = 'read'

  const dispatch = (data: DataView, dataLength: number) => {
    try {
      if (dataLength <= 0) {
        return
      }

      const buffer = new Uint8Array(dataLength - 1)
      for (let i = 1; i < length; i += 1) {
        buffer[i] = data.getUint8(i)
      }
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
    } catch (_e) {}
  }

  const readByte = (byte: number) => {
    switch (byte) {
      case 0xc0: // acknowledge?
        dispatch(data, dataLength)
        dataLength = 0
        break
      case 0xdb: // ?
        status = 'escape'
        break
      default:
        data.setUint8(dataLength++, byte)
        break
    }
  }
  const escapeByte = (byte: number) => {
    switch (byte) {
      case 0xdc: // padding?
        data.setUint8(dataLength++, 0xc0)
        status = 'read'
        break
      case 0xdd:
        data.setUint8(dataLength++, 0xdb)
        status = 'read'
        break
      default:
        status = 'error'
        console.warn(`Unexpected data byte received: ${byte.toString(16).padStart(2, '0')}`)
        break
    }
  }
  const errorByte = (byte: number) => {
    switch (byte) {
      case 0xc0:
        status = 'read'
        dataLength = 0
        break
    }
  }

  const parse = (data: DataView) => {
    for (let i = 0; i < data.byteLength; i += 1) {
      const byte = data.getUint8(i)
      switch (status) {
        case 'read':
          readByte(byte)
          break
        case 'escape':
          escapeByte(byte)
          break
        case 'error':
          errorByte(byte)
          break
      }
    }
  }

  return {
    eventBus,
    parse,
    dispatch,
    getSystemInfo: () => lastSystemInfo,
  }
}
