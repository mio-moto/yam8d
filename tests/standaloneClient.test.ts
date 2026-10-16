import { afterEach, describe, expect, it } from 'bun:test'
import { createM8Client, YAM8D_FRAME_NAME } from '../packages/m8-sdk/src/client'

// The SDK client without yam8d: mode detection, and a standalone session over a fake Web
// Serial port that speaks the M8 display protocol (SLIP framed).

const slip = (packet: number[]) => {
    const out: number[] = []
    for (const byte of packet) {
        if (byte === 0xc0) out.push(0xdb, 0xdc)
        else if (byte === 0xdb) out.push(0xdb, 0xdd)
        else out.push(byte)
    }
    out.push(0xc0)
    return new Uint8Array(out)
}

const u16 = (v: number) => [v & 0xff, v >> 8]

const makeFakeSerialPort = () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const written: number[][] = []
    const state = { opened: false, closed: false }
    const port = {
        getInfo: () => ({ usbVendorId: 0x16c0 }),
        open: async () => {
            state.opened = true
        },
        close: async () => {
            state.closed = true
        },
        readable: new ReadableStream<Uint8Array>({
            start(c) {
                controller = c
            },
        }),
        writable: new WritableStream<Uint8Array>({
            write(chunk) {
                written.push([...chunk])
            },
        }),
    }
    const send = (packet: number[]) => controller.enqueue(slip(packet))
    // M8 Model:02, firmware 6.5.0, small font
    const sendSystem = () => send([0xff, 3, 6, 5, 0, 0])
    const sendRow = (row: number, text: string) => {
        for (let i = 0; i < text.length; i++) {
            send([0xfd, text.charCodeAt(i), ...u16(i * 12), ...u16(row * 14), 255, 255, 255, 0, 0, 0])
        }
    }
    const unplug = () => controller.close()
    return { port, written, state, sendSystem, sendRow, unplug }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

const installSerial = (port: unknown) => {
    Object.defineProperty(navigator, 'serial', {
        configurable: true,
        value: { getPorts: async () => [port], requestPort: async () => port },
    })
}

const g = globalThis as unknown as { window?: unknown }

afterEach(() => {
    Reflect.deleteProperty(navigator, 'serial')
    Reflect.deleteProperty(navigator, 'mediaDevices')
    delete g.window
    delete (globalThis as { AudioContext?: unknown }).AudioContext
})

// Media devices with or without an input named M8, and an AudioContext that records its state
const installAudio = ({ withM8 }: { withM8: boolean }) => {
    const stopped: string[] = []
    const track = (id: string) => ({ id, stop: () => stopped.push(id), addEventListener: () => {} })
    const requests: unknown[] = []
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
            enumerateDevices: async () =>
                withM8 && requests.length > 0
                    ? [{ kind: 'audioinput', label: 'M8 (USB Audio)', deviceId: 'm8-in' }]
                    : [{ kind: 'audioinput', label: requests.length > 0 ? 'Built-in Microphone' : '', deviceId: 'mic' }],
            getUserMedia: async (constraints: { audio: { deviceId?: { exact: string } } }) => {
                requests.push(constraints)
                const id = constraints.audio.deviceId?.exact ?? 'default'
                const t = track(id)
                return { getTracks: () => [t], getAudioTracks: () => [t] }
            },
        },
    })
    const contexts: { closed: boolean }[] = []
    ;(globalThis as { AudioContext?: unknown }).AudioContext = class {
        state = 'running'
        closed = false
        destination = {}
        constructor() {
            contexts.push(this)
        }
        createMediaStreamSource() {
            return { connect: () => {} }
        }
        createMediaStreamDestination() {
            return { stream: { getAudioTracks: () => [] } }
        }
        async resume() {}
        async close() {
            this.closed = true
        }
    }
    return { stopped, requests, contexts }
}

describe('standalone client over Web Serial', () => {
    it('reopens a granted port, follows the screen and sends keys', async () => {
        const fake = makeFakeSerialPort()
        installSerial(fake.port)

        const client = await createM8Client({ mode: 'standalone' })
        expect(client.mode).toBe('standalone')
        expect(client.isConnected).toBe(true)
        expect(client.deviceTransport).toBe('serial')
        expect(fake.state.opened).toBe(true)

        const views: (string | null)[] = []
        client.onViewChange((name) => views.push(name))

        fake.sendSystem()
        fake.sendRow(3, 'SONG')
        fake.sendRow(6, '00 01 -- --')
        await tick(80)

        expect(views.at(-1)).toBe('song')
        expect(client.state.viewName).toBe('song')
        expect(client.state.deviceModel).toBe('M8 Model:02')
        const screen = await client.getScreen()
        expect(screen.lines[6]).toBe('00 01 -- --')

        // The engine asked for a full redraw when it started listening
        expect(fake.written).toContainEqual([0x44])

        await client.sendKeyPress(['down'])
        await tick(60)
        expect(fake.written).toContainEqual([0x43, 0x20])
        expect(fake.written.at(-1)).toEqual([0x43, 0])

        const connection: boolean[] = []
        client.onConnectionChange((c) => connection.push(c))
        await client.disconnectDevice()
        expect(fake.state.closed).toBe(true)
        expect(client.isConnected).toBe(false)
        expect(connection).toEqual([false])
        await expect(client.getScreen()).rejects.toThrow('connectDevice')
    })

    it('waits for connectDevice() when autoConnect is off, and notices an unplug', async () => {
        const fake = makeFakeSerialPort()
        installSerial(fake.port)

        const client = await createM8Client({ mode: 'standalone', autoConnect: false })
        expect(client.isConnected).toBe(false)
        expect(fake.state.opened).toBe(false)

        await client.connectDevice({ transport: 'serial' })
        expect(client.isConnected).toBe(true)

        const connection: boolean[] = []
        client.onConnectionChange((c) => connection.push(c))
        fake.unplug()
        await tick(10)
        expect(client.isConnected).toBe(false)
        expect(connection).toEqual([false])
        client.disconnect()
    })

    it('stays disconnected without a granted device or browser support', async () => {
        const client = await createM8Client({ mode: 'standalone' })
        expect(client.mode).toBe('standalone')
        expect(client.isConnected).toBe(false)
        await expect(client.connectDevice()).rejects.toThrow()
    })
})

describe('standalone audio', () => {
    it('plays the M8 input once permission reveals it, and stops it with the device', async () => {
        const fake = makeFakeSerialPort()
        installSerial(fake.port)
        const audio = installAudio({ withM8: true })

        const client = await createM8Client({ mode: 'standalone', autoConnect: false })
        await client.connectDevice({ audio: true })
        expect(client.isConnected).toBe(true)
        expect(client.isAudioConnected).toBe(true)
        // Permission probe on the default input, then the M8 input itself
        expect(audio.requests.at(-1)).toMatchObject({ audio: { deviceId: { exact: 'm8-in' } } })
        expect(audio.stopped).toContain('default')

        await client.disconnectDevice()
        expect(client.isAudioConnected).toBe(false)
        expect(audio.stopped).toContain('m8-in')
        expect(audio.contexts[0].closed).toBe(true)
    })

    it('never plays another input than the M8, and keeps the device connected', async () => {
        const fake = makeFakeSerialPort()
        installSerial(fake.port)
        const audio = installAudio({ withM8: false })

        const client = await createM8Client({ mode: 'standalone', autoConnect: false })
        await client.connectDevice({ audio: true })
        expect(client.isConnected).toBe(true)
        expect(client.isAudioConnected).toBe(false)
        expect(audio.contexts.length).toBe(0)
        expect(audio.stopped).toContain('default')
        await expect(client.connectAudio()).rejects.toThrow('No M8 audio input')
        client.disconnect()
    })
})

describe('mode detection', () => {
    const fakeWindow = (name: string) => {
        const listeners = new Set<unknown>()
        return {
            listeners,
            window: {
                name,
                parent: { postMessage: () => {} },
                addEventListener: (_type: string, listener: unknown) => listeners.add(listener),
                removeEventListener: (_type: string, listener: unknown) => listeners.delete(listener),
            },
        }
    }

    it('runs standalone in a top-level page', async () => {
        const client = await createM8Client({ autoConnect: false })
        expect(client.mode).toBe('standalone')
    })

    it('falls back to standalone when no host answers in an unmarked iframe', async () => {
        const fake = fakeWindow('')
        g.window = fake.window
        const client = await createM8Client({ handshakeTimeoutMs: 30, autoConnect: false })
        expect(client.mode).toBe('standalone')
        // The abandoned handshake no longer listens for messages
        expect(fake.listeners.size).toBe(0)
    })

    it('waits for yam8d in an iframe yam8d marked', async () => {
        const fake = fakeWindow(YAM8D_FRAME_NAME)
        g.window = fake.window
        let settled = false
        void createM8Client({ handshakeTimeoutMs: 30, autoConnect: false }).then(() => {
            settled = true
        })
        await tick(100)
        expect(settled).toBe(false)
        expect(fake.listeners.size).toBe(1)
    })
})
