// @ts-nocheck
import { expect, test } from 'bun:test'
import { createSlipParser } from '../src/features/connection/queuedReaders'

function feedAll(parser: ReturnType<typeof createSlipParser>, bytes: number[]) {
    const out: DataView[] = []
    for (const b of bytes) {
        const pkt = parser.feed(b)
        if (pkt) out.push(pkt)
    }
    return out
}

test('SLIP emits packet on END', () => {
    const p = createSlipParser()
    const packets = feedAll(p, [0xfe, 0x00, 0xc0])
    expect(packets.length).toBe(1)
    const dv = packets[0]
    expect(dv.byteLength).toBe(2)
    expect(dv.getUint8(0)).toBe(0xfe)
    expect(dv.getUint8(1)).toBe(0x00)
})

test('SLIP decodes escapes', () => {
    const p = createSlipParser()
    const packets = feedAll(p, [0xdb, 0xdc, 0xdb, 0xdd, 0xc0])
    expect(packets.length).toBe(1)
    const dv = packets[0]
    expect(dv.byteLength).toBe(2)
    expect(dv.getUint8(0)).toBe(0xc0)
    expect(dv.getUint8(1)).toBe(0xdb)
})

test('SLIP error reset on END', () => {
    const p = createSlipParser()
    const packets = feedAll(p, [0xdb, 0x00, 0xc0, 0x01, 0x02, 0xc0])
    expect(packets.length).toBe(1)
    const dv = packets[0]
    expect(dv.byteLength).toBe(2)
    expect(dv.getUint8(0)).toBe(0x01)
    expect(dv.getUint8(1)).toBe(0x02)
})
