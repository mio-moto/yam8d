import { pressKeys } from './keys'
import { protocol } from './protocol'

const vendorId = 0x16c0
const productId = 0x048a
// the device processes frame by frame ingress messages - which means each button press needs to wait for ~5ms currently
// doubling the time is a good safe margin
const waitTime = 50

const usbWriter = (device: USBDevice) => (data: Uint8Array<ArrayBuffer>) => device.transferOut(3, data)
const serialWriter = (writer: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>) => (data: Uint8Array<ArrayBuffer>) => writer.write(data)

const midiCommands = (output: MIDIOutput) => {
  const commands: Uint8Array<ArrayBuffer>[] = []
  const frameCheck = () => {
    const command = commands.shift()
    if (command) {
      output.send(command)
    }
  }

  setInterval(frameCheck, waitTime)

  return {
    resetScreen: () => {
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, 0x00, 0x44, 0xf7]))
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, 0x00, 0x45, 0x52, 0xf7]))
    },
    sendKeys: (keys: Parameters<typeof pressKeys>[0]) => {
      const press = pressKeys(keys)
      const msb = 0 | (press & 0x80 ? 1 << 2 : 0)

      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msb, 0x00, 0x43, press & 0x7f, 0xf7]))
      const release = pressKeys({})
      const msbRelease = 0 | (press & 0x80 ? 1 << 2 : 0)
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msbRelease, 0x00, 0x43, release & 0x7f, 0xf7]))
    },
    sendNoteOn: (note: number, velocity: number) => {
      velocity = Math.min(0x7f, Math.max(0x00), velocity)
      const msb = 0 | (note & 0x80 ? 1 << 2 : 0) | (velocity & 0x80 ? 1 << 3 : 0)
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msb, 0x00, 0x48, note & 0x7f, velocity & 0x7f, 0xf7]))
    },
    sendNoteOff: () => {
      const msb = 0 | (1 << 2)
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msb, 0x48, 0x7f, 0xf7]))
    },
  }
}

const commands = (writer: ReturnType<typeof usbWriter> | ReturnType<typeof serialWriter>) => {
  const commands: Uint8Array<ArrayBuffer>[] = []

  const frameCheck = () => {
    const command = commands.shift()
    if (command) {
      writer(command)
    }
  }

  setInterval(frameCheck, waitTime)

  return {
    resetScreen: async () => {
      commands.push(new Uint8Array([0x44]))
      commands.push(new Uint8Array([0x45, 0x52]))
    },
    sendKeys: async (keys: Parameters<typeof pressKeys>[0]) => {
      commands.push(new Uint8Array([0x43, pressKeys(keys)]))
      commands.push(new Uint8Array([0x43, 0x00]))
    },
    sendNoteOn: async (note: number, velocity: number) => {
      commands.push(new Uint8Array([0x48, note, velocity]))
    },
    sendNoteOff: async () => {
      commands.push(new Uint8Array([0x48, 255]))
    },
  }
}

const usbReader = (device: USBDevice) => async () => {
  const result = await device.transferIn(3, 512)
  result.status
  return {
    terminated: result.status === 'stall',
    data: result.data,
  }
}

const serialReader = (reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>) => async () => {
  const data = await reader.read()
  return {
    terminated: data.done,
    data: data.value ? new DataView(data.value.buffer) : undefined,
  }
}

const M8_SYSEX_HEADER = [0xf0, 0x00, 0x02, 0x61, 0x00]
const SYSEX_END = 0xf7

function isM8Sysex(data: Uint8Array<ArrayBuffer>) {
  if (data.length < 5) return false
  for (let i = 0; i < M8_SYSEX_HEADER.length; i++) {
    if (data[i] !== M8_SYSEX_HEADER[i]) return false
  }
  return true
}

export function decode7BitPacked(data: Uint8Array): Uint8Array {
  const out: number[] = []

  let i = 0
  while (i < data.length) {
    const msbByte = data[i++]
    if (i >= data.length) break // truncated group, bail

    const remaining = data.length - i
    const groupLen = Math.min(7, remaining)

    for (let bit = 0; bit < groupLen; bit++) {
      const low7 = data[i++] // 0x00–0x7F
      const msb = (msbByte >> bit) & 0x01
      out.push((msb << 7) | low7) // reattach MSB -> full 8-bit
    }
  }

  return new Uint8Array(out)
}

function decodeM8Sysex(encoded: Uint8Array<ArrayBuffer>) {
  if (!isM8Sysex(encoded)) return undefined

  if (encoded[encoded.length - 1] !== SYSEX_END) {
    console.log('Unterminated SysEx')
    return undefined
  }
  const locs = [...encoded].map((x, i) => (x === SYSEX_END ? `${i}` : undefined)).filter((x) => !!x)
  if (locs.length > 1) {
    console.warn(encoded)
  }
  const packed = encoded.slice(M8_SYSEX_HEADER.length, encoded.length - 1)
  return decode7BitPacked(packed)
}

const midiReader = (output: MIDIInput) => {
  const messages: DataView[] = []

  let resolver:
    | ((
      value:
        | {
          terminated: true
        }
        | {
          terminated: false
          data: DataView
        },
    ) => void)
    | undefined

  const handler = (evt: MIDIMessageEvent) => {
    if (!evt.data) {
      return
    }
    console.log("message received:", evt)
    const message = decodeM8Sysex(evt.data)
    if (!message) {
      return
    }
    messages.push(new DataView(message.buffer.slice(0, message.buffer.byteLength)))
    if (resolver) {
      const message = messages.shift()
      if (message) {
        resolver({
          terminated: false,
          data: message,
        })
      }
    }
  }
  output.addEventListener('midimessage', handler)

  return async () => {
    if (output.state === 'disconnected') {
      return { terminated: true }
    }

    if (messages.length > 0) {
      return {
        terminated: false,
        data: messages.shift(),
      }
    }
    return new Promise<{ terminated: true } | { terminated: false; data: DataView }>((resolve, _reject) => {
      resolver = resolve
    })
  }
}

const beginRead = (
  read: ReturnType<typeof serialReader> | ReturnType<typeof usbReader> | ReturnType<typeof midiReader>,
  handler: ReturnType<typeof protocol>,
  asMidi: boolean,
) => {
  ; (async () => {
    while (true) {
      const { terminated, data } = await read()
      if (data) {
        if (asMidi) {
          handler.dispatch(data, data.byteLength)
        } else {
          handler.parse(data)
        }
      }
      if (terminated) {
        break
      }
    }
  })()
}

export const connection = () => {
  const webMidiAvailable = 'requestMIDIAccess' in navigator
  const webSerialAvailable = 'serial' in navigator
  const webUsbAvailable = 'usb' in navigator
  if (!webMidiAvailable && !webSerialAvailable && !webUsbAvailable) {
    return {
      browserSupport: false,
    } as const
  }

  const usbConnect = async () => {
    const devices = (await navigator.usb.getDevices()).filter((d) => d.vendorId === vendorId && d.productId === productId)
    // TODO: check out what happens with two devices attached
    if (devices.length > 1) {
      console.warn('Suspicious: there is more than one device, are multiple devices connected?')
    }
    const device =
      devices.length <= 0
        ? await navigator.usb.requestDevice({
          filters: [{ vendorId: vendorId, productId: productId }],
        })
        : devices[0]

    if (!device) {
      throw new Error('No devices found')
    }
    await device.open()
    await device.selectConfiguration(1)
    await device.claimInterface(1)
    await device.controlTransferOut({
      requestType: 'class',
      recipient: 'interface',
      request: 0x22,
      value: 0x03,
      index: 0x01,
    })
    await device.controlTransferOut(
      {
        requestType: 'class',
        recipient: 'interface',
        request: 0x20,
        value: 0x00,
        index: 0x01,
      },
      new Uint8Array([0x80, 0x25, 0x00, 0x00, 0x00, 0x00, 0x08]),
    )

    return { commands: commands(usbWriter(device)), reader: usbReader(device) }
  }

  const serialConnect = async () => {
    const ports = (await navigator.serial.getPorts()).filter((x) => {
      const info = x.getInfo()
      return info.usbVendorId === vendorId && info.usbProductId === productId
    })
    if (ports.length > 1) {
      console.warn('Suspicious: there are more than one port, when expecting just one.')
    }

    const port = ports.length <= 0 ? await navigator.serial.requestPort({ filters: [{ usbVendorId: vendorId, usbProductId: productId }] }) : ports[0]

    await port.open({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096,
    })

    if (!port.readable || !port.writable) {
      throw new Error("Ports should've been read/writeable, but apparently they're not")
    }

    return {
      commands: commands(serialWriter(port.writable.getWriter())),
      reader: serialReader(port.readable.getReader()),
    }
  }

  const midiConnect = async () => {
    const access = await navigator.requestMIDIAccess({ sysex: true })
    const inputs = [...access.inputs].map((x) => x[1]).filter((input) => input.name === 'M8')
    const outputs = [...access.outputs].map((x) => x[1]).filter((output) => output.name === 'M8')

    if (inputs.length <= 0 || outputs.length <= 0) {
      throw new Error('No input/outputs found')
    }

    if (inputs.length > 1 || outputs.length > 0) {
      console.warn('Suspicious: more than one m8 device found')
    }

    const input = inputs[0]
    const output = outputs[0]

    await input.open()
    await output.open()

    return {
      commands: midiCommands(output),
      reader: midiReader(input),
    }
  }

  const connect = async () => {
    // const connection = await (webMidiAvailable ? midiConnect() : webSerialAvailable ? serialConnect() : usbConnect())
    const connection = await (webSerialAvailable ? serialConnect() : webUsbAvailable ? usbConnect() : midiConnect())
    connection.commands.resetScreen()
    const protocolHandler = protocol()
    beginRead(connection.reader, protocolHandler, false)
    return {
      ...connection,
      protocol: protocolHandler,
    }
  }

  return {
    browserSupport: true,
    connect,
  } as const
}

export type ConnectedBus = Awaited<ReturnType<Exclude<ReturnType<typeof connection>['connect'], undefined>>>
