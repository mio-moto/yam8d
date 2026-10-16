// Connects to the M8 over Web Serial, WebUSB or Web MIDI (SysEx), reads its display
// stream into the protocol parser and sends key / note / program change commands.

import { protocol } from './protocol'
import { queuedSerialReader, queuedUsbReader } from './queuedReaders'

export type M8DeviceTransport = 'serial' | 'usb' | 'midi'

export interface M8ConnectOptions {
  /** Which browser API to use. 'auto' (default) picks Web Serial, then WebUSB, then Web MIDI, by availability. */
  transport?: M8DeviceTransport | 'auto'
  /**
   * false: only reuse a device the page was already granted, never open the browser's device
   * picker (which needs a user gesture). Rejects when there is none. Default true.
   */
  prompt?: boolean
}

const vendorId = 0x16c0
const productId = 0x048a
// the device processes frame by frame ingress messages - which means each button press needs to wait for ~5ms currently
// doubling the time is a good safe margin
const waitTime = 20

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

  const interval = setInterval(frameCheck, waitTime)

  return {
    stop: () => clearInterval(interval),
    resetScreen: () => {
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, 0x00, 0x44, 0xf7]))
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, 0x00, 0x45, 0x52, 0xf7]))
    },
    sendKeys: (keys: number) => {
      const press = keys
      const msb = 0 | (press & 0x80 ? 1 << 2 : 0)

      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msb, 0x00, 0x43, press & 0x7f, 0xf7]))
    },
    sendNoteOn: (note: number, velocity: number) => {
      velocity = Math.min(0x7f, Math.max(0x00, velocity))
      const msb = 0 | (note & 0x80 ? 1 << 2 : 0) | (velocity & 0x80 ? 1 << 3 : 0)
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msb, 0x00, 0x48, note & 0x7f, velocity & 0x7f, 0xf7]))
    },
    sendNoteOff: () => {
      const msb = 0 | (1 << 2)
      commands.push(new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00, msb, 0x48, 0x7f, 0xf7]))
    },
    sendProgramChange: (program: number, channel: number = 0) => {
      // MIDI Program Change: 0xC0-0xCF (C = 12 in decimal, shifted left 4 bits)
      // Program change message: status byte = 0xC0 + channel, data byte = program number (0-127)
      const safeChannel = Math.min(15, Math.max(0, channel))
      const safeProgram = Math.min(127, Math.max(0, program))
      const statusByte = 0xc0 | safeChannel
      commands.push(new Uint8Array([statusByte, safeProgram]))
    },
  }
}

const commands = (writer: ReturnType<typeof usbWriter> | ReturnType<typeof serialWriter>) => {
  const commands: Uint8Array<ArrayBuffer>[] = []

  const frameCheck = () => {
    const command = commands.shift()
    if (command) {
      void Promise.resolve(writer(command)).catch(() => {
        // The device went away; the reader reports the termination.
      })
    }
  }

  const interval = setInterval(frameCheck, waitTime)

  return {
    stop: () => clearInterval(interval),
    resetScreen: async () => {
      commands.push(new Uint8Array([0x44]))
      commands.push(new Uint8Array([0x45, 0x52]))
    },
    sendKeys: (keys: number) => {
      const press = keys
      commands.push(new Uint8Array([0x43, press]))
    },
    sendNoteOn: async (note: number, velocity: number) => {
      commands.push(new Uint8Array([0x4b, note, velocity]))
    },
    sendNoteOff: async () => {
      commands.push(new Uint8Array([0x4b, 255]))
    },
    sendProgramChange: async (program: number, _channel: number = 0) => {
      // USB/Serial: Use 0x4c prefix for program change (similar to 0x4b for note on/off)
      const safeProgram = Math.min(127, Math.max(0, program))
      commands.push(new Uint8Array([0x4c, safeProgram]))
    },
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

function decodeM8Sysex(encoded: Uint8Array<ArrayBuffer>): Uint8Array | undefined {
  if (!isM8Sysex(encoded)) {
    console.log('not M8Sysex')
    return undefined
  }

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

const midiReader = (input: MIDIInput) => {
  const messages: DataView[] = []

  // Pending buffer of raw MIDI bytes across events to safely reassemble SysEx
  let pending = new Uint8Array(0) as unknown as Uint8Array<ArrayBufferLike>

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

  // Find the first occurrence of the M8 SysEx header in a buffer
  const findHeaderIndex = (buf: Uint8Array<ArrayBufferLike>, start = 0): number => {
    const header = M8_SYSEX_HEADER
    for (let i = start; i <= buf.length - header.length; i++) {
      let match = true
      for (let j = 0; j < header.length; j++) {
        if (buf[i + j] !== header[j]) {
          match = false
          break
        }
      }
      if (match) return i
    }
    return -1
  }

  const appendBytes = (a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> => {
    const merged = new Uint8Array(a.length + b.length) as unknown as Uint8Array<ArrayBufferLike>
    merged.set(a, 0)
    merged.set(b, a.length)
    return merged
  }

  const processChunk = (chunk: Uint8Array<ArrayBufferLike>) => {
    // Accumulate incoming bytes
    pending = appendBytes(pending, chunk)

    while (true) {
      // Align to header if present; if not, keep a short tail to catch split headers
      let hdrIdx = findHeaderIndex(pending, 0)
      if (hdrIdx === -1) {
        // Keep only the last header.length - 1 bytes in case the header is split across chunks
        if (pending.length > M8_SYSEX_HEADER.length - 1) {
          pending = pending.slice(pending.length - (M8_SYSEX_HEADER.length - 1))
        }
        break
      }

      // Drop any leading noise before header
      if (hdrIdx > 0) {
        pending = pending.slice(hdrIdx)
        hdrIdx = 0
      }

      // Look for SysEx end after header
      const endIdx = pending.indexOf(SYSEX_END, M8_SYSEX_HEADER.length)
      if (endIdx === -1) {
        // Need more bytes
        break
      }

      // Extract a single, complete M8 SysEx message [header ... 0xF7]
      const oneMessage = pending.slice(0, endIdx + 1)
      const decoded = decodeM8Sysex(oneMessage)
      if (decoded) {
        messages.push(new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength))
      }

      // Remove processed message and continue scanning in case of concatenated messages
      pending = pending.slice(endIdx + 1)
    }
  }

  const handler = (evt: MIDIMessageEvent) => {
    if (!evt.data || evt.data.length === 0) return
    // Process all bytes; this handles split and concatenated SysEx packets
    processChunk(evt.data as unknown as Uint8Array<ArrayBufferLike>)

    if (resolver && messages.length > 0) {
      const message = messages.shift()
      if (message) {
        resolver({
          terminated: false,
          data: message,
        })
        resolver = undefined
      }
    }
  }

  input.addEventListener('midimessage', handler)

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    input.removeEventListener('midimessage', handler)
    input.removeEventListener('statechange', onStateChange)
    if (resolver) {
      resolver({ terminated: true })
      resolver = undefined
    }
  }
  const onStateChange = () => {
    if (input.state === 'disconnected') stop()
  }
  input.addEventListener('statechange', onStateChange)

  const read = async () => {
    if (stopped || input.state === 'disconnected') {
      return { terminated: true }
    }

    if (messages.length > 0) {
      return {
        terminated: false,
        data: messages.shift(),
      }
    }
    return new Promise<{ terminated: true } | { terminated: false; data: DataView }>((resolve) => {
      resolver = resolve
    })
  }

  return { read, stop }
}

type ReadFn = () => Promise<{ terminated: boolean; data?: DataView }>

/** Pumps packets into the protocol handler; resolves once the reader terminates. */
const beginRead = async (read: ReadFn, handler: ReturnType<typeof protocol>) => {
  while (true) {
    const { terminated, data } = await read()
    if (data) {
      handler.dispatch(data, data.byteLength)
    }
    if (terminated) {
      break
    }
  }
}

const transportLabel: Record<M8DeviceTransport, string> = { serial: 'Web Serial', usb: 'WebUSB', midi: 'Web MIDI' }

export const connection = () => {
  const webMidiAvailable = 'requestMIDIAccess' in navigator
  const webSerialAvailable = 'serial' in navigator
  const webUsbAvailable = 'usb' in navigator
  if (!webMidiAvailable && !webSerialAvailable && !webUsbAvailable) {
    return {
      browserSupport: false,
    } as const
  }

  const usbConnect = async (prompt: boolean) => {
    const devices = (await navigator.usb.getDevices()).filter((d) => d /* d.vendorId === vendorId  && d.productId === productId */)
    // TODO: check out what happens with two devices attached
    if (devices.length > 1) {
      console.warn('Suspicious: there is more than one device, are multiple devices connected?')
    }
    if (devices.length <= 0 && !prompt) {
      throw new Error('No M8 USB device was granted to this page yet')
    }
    const device =
      devices.length <= 0
        ? await navigator.usb.requestDevice({
            filters: [{ vendorId: vendorId, productId: productId }],
          })
        : (devices.find((d) => d.vendorId === vendorId) ?? devices[0])

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
      //new Uint8Array([0x80, 0x25, 0x00, 0x00, 0x00, 0x00, 0x08]),
    )

    const deviceCommands = commands(usbWriter(device))
    return {
      transport: 'usb' as M8DeviceTransport,
      commands: deviceCommands,
      reader: queuedUsbReader(device),
      close: async () => {
        deviceCommands.stop()
        await device.close()
      },
    }
  }

  const serialConnect = async (prompt: boolean) => {
    const ports = (await navigator.serial.getPorts()).filter(() => {
      // const info = x.getInfo()
      return true // info.usbVendorId === vendorId // && info.usbProductId === productId
    })
    if (ports.length > 1) {
      console.warn('Suspicious: there are more than one port, when expecting just one.')
    }
    if (ports.length <= 0 && !prompt) {
      throw new Error('No M8 serial port was granted to this page yet')
    }

    const port =
      ports.length <= 0
        ? await navigator.serial.requestPort({ filters: [{ usbVendorId: vendorId /*, usbProductId: productId */ }] })
        : (ports.find((p) => p.getInfo().usbVendorId === vendorId) ?? ports[0])

    await port.open({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferSize: 4096,
    })

    if (!port.readable || !port.writable) {
      throw new Error("Ports should've been read/writeable, but apparently they're not")
    }

    const writer = port.writable.getWriter()
    const rawReader = port.readable.getReader()
    const portCommands = commands(serialWriter(writer))
    return {
      transport: 'serial' as M8DeviceTransport,
      commands: portCommands,
      reader: queuedSerialReader(rawReader),
      close: async () => {
        portCommands.stop()
        await rawReader.cancel().catch(() => undefined)
        rawReader.releaseLock()
        writer.releaseLock()
        await port.close()
      },
    }
  }

  const midiConnect = async (prompt: boolean) => {
    if (!prompt) {
      const permission = await navigator.permissions?.query({ name: 'midi', sysex: true } as unknown as PermissionDescriptor).catch(() => null)
      if (permission?.state !== 'granted') {
        throw new Error('Web MIDI SysEx access was not granted to this page yet')
      }
    }
    const access = await navigator.requestMIDIAccess({ sysex: true })

    // Disconnect any existing M8 connections first
    const disconnectM8Devices = (devices: MIDIPort[]) => {
      devices.forEach((device) => {
        // Check if device is M8 and open, then close it
        if (device.name === 'M8' && device.state === 'connected') {
          device.close()
          console.log(`Disconnected existing M8: ${device.name} (${device.id})`)
        }
      })
    }

    // Disconnect existing M8 inputs and outputs
    disconnectM8Devices([...access.inputs.values()])
    disconnectM8Devices([...access.outputs.values()])

    // Find M8 devices with better error handling
    const inputs = [...access.inputs.values()].filter((input) => input.name === 'M8')
    const outputs = [...access.outputs.values()].filter((output) => output.name === 'M8')

    if (inputs.length === 0 || outputs.length === 0) {
      throw new Error('M8 device not found. Please ensure your M8 is connected and powered on.')
    }

    // Handle multiple devices with clearer messaging
    if (inputs.length > 1) {
      console.warn(`Multiple M8 inputs detected. Using first device: ${inputs[0].name}`)
    }
    if (outputs.length > 1) {
      console.warn(`Multiple M8 outputs detected. Using first device: ${outputs[0].name}`)
    }

    const input = inputs[0]
    const output = outputs[0]

    // Check if devices are already open
    if (input.connection === 'open') {
      console.log('M8 input is already open')
    } else {
      await input.open()
    }

    if (output.connection === 'open') {
      console.log('M8 output is already open')
    } else {
      await output.open()
    }

    // Optional: Log connection info
    console.log(`Connected to M8 - Input: ${input.id}, Output: ${output.id}`)

    const outputCommands = midiCommands(output)
    const reader = midiReader(input)
    return {
      transport: 'midi' as M8DeviceTransport,
      commands: outputCommands,
      reader: reader.read,
      close: async () => {
        outputCommands.stop()
        reader.stop()
        await input.close()
        await output.close()
      },
    }
  }

  const available: Record<M8DeviceTransport, boolean> = { serial: webSerialAvailable, usb: webUsbAvailable, midi: webMidiAvailable }

  const connect = async ({ transport = 'auto', prompt = true }: M8ConnectOptions = {}) => {
    const chosen: M8DeviceTransport = transport !== 'auto' ? transport : webSerialAvailable ? 'serial' : webUsbAvailable ? 'usb' : 'midi'
    if (!available[chosen]) {
      throw new Error(`This browser does not support ${transportLabel[chosen]}`)
    }
    const connection = await (chosen === 'serial' ? serialConnect(prompt) : chosen === 'usb' ? usbConnect(prompt) : midiConnect(prompt))
    // resetScreen is intentionally NOT called here — it must be called by the
    // screen component AFTER it has registered its event listeners, so the
    // M8's initial screen dump is not lost before anyone is listening.
    const protocolHandler = protocol()
    let closing = false
    const closed = beginRead(connection.reader as ReadFn, protocolHandler)
    return {
      transport: connection.transport,
      commands: connection.commands,
      reader: connection.reader,
      protocol: protocolHandler,
      /** Resolves when the device stops sending (unplugged, or close() was called). */
      closed,
      /** Releases the device so another page (or yam8d) can open it. */
      close: async () => {
        if (closing) return closed
        closing = true
        await connection.close().catch((error: unknown) => console.warn('[M8] close failed:', error))
        await closed
      },
    }
  }

  return {
    browserSupport: true,
    available,
    connect,
  } as const
}

export type ConnectedBus = Awaited<ReturnType<Exclude<ReturnType<typeof connection>['connect'], undefined>>>
