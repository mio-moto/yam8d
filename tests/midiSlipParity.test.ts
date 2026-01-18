// @ts-nocheck
import { expect, test } from 'bun:test'
import { decode7BitPacked } from '../src/features/connection/connection'
import { protocol, type RectCommand } from '../src/features/connection/protocol'

// Encode 8-bit data into M8's 7-bit SysEx packing (groups of up to 7 bytes)
function encode7BitPacked(bytes: Uint8Array): Uint8Array {
    const out: number[] = []
    for (let i = 0; i < bytes.length; i += 7) {
        const group = bytes.subarray(i, Math.min(i + 7, bytes.length))
        let msb = 0
        const low7: number[] = []
        for (let j = 0; j < group.length; j++) {
            const b = group[j]
            msb |= (b >> 7) & 0x01 ? 1 << j : 0
            low7.push(b & 0x7f)
        }
        out.push(msb, ...low7)
    }
    return new Uint8Array(out)
}

function m8SysexWrap(payload: Uint8Array): Uint8Array {
    const header = new Uint8Array([0xf0, 0x00, 0x02, 0x61, 0x00])
    const packed = encode7BitPacked(payload)
    const end = 0xf7
    const out = new Uint8Array(header.length + packed.length + 1)
    out.set(header, 0)
    out.set(packed, header.length)
    out[out.length - 1] = end
    return out
}

function m8SysexUnwrapAndDecode(sysex: Uint8Array): Uint8Array | undefined {
    const header = [0xf0, 0x00, 0x02, 0x61, 0x00]
    if (sysex.length < header.length + 1) return undefined
    for (let i = 0; i < header.length; i++) {
        if (sysex[i] !== header[i]) return undefined
    }
    if (sysex[sysex.length - 1] !== 0xf7) return undefined
    const packed = sysex.subarray(header.length, sysex.length - 1)
    return decode7BitPacked(packed)
}

test('MIDI SysEx decode matches raw SLIP frame for rect (5 bytes)', () => {
    // Minimal rect command: 0xfe, x=0, y=0
    const raw = new Uint8Array([0xfe, 0x00, 0x00, 0x00, 0x00])

    // Prepare protocol and capture events
    const p1 = protocol()
    const p2 = protocol()
    const any1: Uint8Array[] = []
    const any2: Uint8Array[] = []
    const rects1: RectCommand[] = []
    const rects2: RectCommand[] = []
    p1.eventBus.on('any', (buf) => any1.push(buf))
    p1.eventBus.on('rect', (rc) => rects1.push(rc))
    p2.eventBus.on('any', (buf) => any2.push(buf))
    p2.eventBus.on('rect', (rc) => rects2.push(rc))

    // Dispatch raw (SLIP-style finalized frame)
    const dvRaw = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    p1.dispatch(dvRaw, raw.length)

    // Encode via SysEx, then decode back to payload as MIDI path would do
    const sysex = m8SysexWrap(raw)
    const decoded = m8SysexUnwrapAndDecode(sysex)
    expect(decoded).toBeDefined()
    if (!decoded) throw new Error('SysEx decode failed')
    const dvMidi = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength)
    p2.dispatch(dvMidi, decoded.length)

    // Compare emitted buffers and parsed rects
    expect(any1.length).toBe(1)
    expect(any2.length).toBe(1)
    expect([...any1[0]]).toEqual([...any2[0]])

    expect(rects1.length).toBe(1)
    expect(rects2.length).toBe(1)
    expect(rects1[0]).toEqual(rects2[0])
})

test('7-bit packing roundtrip for arbitrary payload', () => {
    const payload = new Uint8Array([0xfe, 0xff, 0x80, 0x7f, 0x01, 0x02, 0xaa, 0x55, 0x10])
    const sysex = m8SysexWrap(payload)
    const decoded = m8SysexUnwrapAndDecode(sysex)
    expect(decoded).toBeDefined()
    if (!decoded) throw new Error('SysEx decode failed')
    expect([...decoded]).toEqual([...payload])
})

function parityTestForPayload(raw: Uint8Array, event: 'rect' | 'text' | 'wave' | 'key' | 'system') {
    const pRaw = protocol()
    const pMidi = protocol()
    const anyRaw: Uint8Array[] = []
    const anyMidi: Uint8Array[] = []
    const evRaw: unknown[] = []
    const evMidi: unknown[] = []
    pRaw.eventBus.on('any', (buf) => anyRaw.push(buf))
    pMidi.eventBus.on('any', (buf) => anyMidi.push(buf))
    pRaw.eventBus.on(event, (x) => evRaw.push(x))
    pMidi.eventBus.on(event, (x) => evMidi.push(x))

    const dvRaw = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const savedLog = console.log
    try {
        pRaw.dispatch(dvRaw, raw.length)

        const sysex = m8SysexWrap(raw)
        const decoded = m8SysexUnwrapAndDecode(sysex)
        expect(decoded).toBeDefined()
        if (!decoded) throw new Error('SysEx decode failed')
        const dvMidi = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength)
        pMidi.dispatch(dvMidi, decoded.length)
    } finally {
        console.log = savedLog
    }

    expect(anyRaw.length).toBe(1)
    expect(anyMidi.length).toBe(1)
    expect([...anyRaw[0]]).toEqual([...anyMidi[0]])
    expect(evRaw.length).toBe(1)
    expect(evMidi.length).toBe(1)
    expect(evRaw[0]).toEqual(evMidi[0])
}

test('Rect (12 bytes) with size and color parity', () => {
    // cmd 0xfe, x=5, y=9, w=64, h=32, rgb=10,20,30
    const raw = new Uint8Array([
        0xfe,
        0x05,
        0x00, // x
        0x09,
        0x00, // y
        0x40,
        0x00, // width 64
        0x20,
        0x00, // height 32
        10,
        20,
        30, // color
    ])
    parityTestForPayload(raw, 'rect')
})

test('Character (12 bytes) parity', () => {
    // cmd 0xfd, 'A', x=10, y=20, fg(1,2,3), bg(4,5,6)
    const raw = new Uint8Array([
        0xfd,
        65, // 'A'
        10,
        0, // x
        20,
        0, // y
        1,
        2,
        3, // fg
        4,
        5,
        6, // bg
    ])
    parityTestForPayload(raw, 'text')
})

test('Wave (color + payload) parity', () => {
    // cmd 0xfc, rgb(7,8,9), wave bytes include MSB values
    const wave = [0x00, 0x7f, 0x80, 0xff, 0x12, 0x34, 0xab, 0xcd, 0xee, 0x90, 0x01, 0x02]
    const raw = new Uint8Array([0xfc, 7, 8, 9, ...wave])
    parityTestForPayload(raw, 'wave')
})

test('Key (3 bytes) parity', () => {
    // cmd 0xfb, keys=0b10101010, filler=0x00
    const raw = new Uint8Array([0xfb, 0b10101010, 0x00])
    parityTestForPayload(raw, 'key')
})

test('System (6 bytes) parity', () => {
    // cmd 0xff, model=2, v=1.2.3, fontMode=1
    const raw = new Uint8Array([0xff, 2, 1, 2, 3, 1])
    parityTestForPayload(raw, 'system')
})

// Deterministic RNG for reproducible randomized parity tests
function mulberry32(seed: number) {
    let t = seed >>> 0
    return () => {
        t += 0x6d2b79f5
        let x = Math.imul(t ^ (t >>> 15), 1 | t)
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296
    }
}

function randomBytes(len: number, rnd: () => number): Uint8Array {
    const out = new Uint8Array(len)
    for (let i = 0; i < len; i++) out[i] = Math.floor(rnd() * 256)
    return out
}

test('Random parity: rect variants (5/8/9/12)', () => {
    const rnd = mulberry32(0xdeadbeef)
    const lens = [5, 8, 9, 12]
    for (let i = 0; i < 50; i++) {
        for (const L of lens) {
            const raw = randomBytes(L, rnd)
            raw[0] = 0xfe
            parityTestForPayload(raw, 'rect')
        }
    }
})

test('Random parity: text (12)', () => {
    const rnd = mulberry32(0x12345678)
    for (let i = 0; i < 50; i++) {
        const raw = randomBytes(12, rnd)
        raw[0] = 0xfd
        parityTestForPayload(raw, 'text')
    }
})

test('Random parity: wave (len 4..100)', () => {
    const rnd = mulberry32(0xabcdef01)
    for (let i = 0; i < 50; i++) {
        const len = 4 + Math.floor(rnd() * 97) // 4..100
        const raw = randomBytes(len, rnd)
        raw[0] = 0xfc
        parityTestForPayload(raw, 'wave')
    }
})

test('Random parity: key (3)', () => {
    const rnd = mulberry32(0x0badcafe)
    for (let i = 0; i < 50; i++) {
        const raw = randomBytes(3, rnd)
        raw[0] = 0xfb
        parityTestForPayload(raw, 'key')
    }
})

test('Random parity: system (6)', () => {
    const rnd = mulberry32(0xfeedface)
    for (let i = 0; i < 50; i++) {
        const raw = randomBytes(6, rnd)
        raw[0] = 0xff
        parityTestForPayload(raw, 'system')
    }
})
