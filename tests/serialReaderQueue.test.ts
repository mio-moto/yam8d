// @ts-nocheck
import { expect, test } from 'bun:test'
import { queuedSerialReader } from '../src/features/connection/queuedReaders'

class FakeReader {
    private chunks: Uint8Array[]
    private idx = 0
    constructor(chunks: number[][]) {
        this.chunks = chunks.map((c) => new Uint8Array(c))
    }
    async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
        if (this.idx >= this.chunks.length) {
            return { value: undefined, done: true }
        }
        const value = this.chunks[this.idx++]
        return { value: value, done: false }
    }
}

test('Serial queue emits parsed packets', async () => {
    const fake = new FakeReader([[0xfe], [0x00, 0xc0, 0xff], [0xc0]]) as unknown as ReadableStreamDefaultReader<Uint8Array>

    const reader = queuedSerialReader(fake)

    const r1 = await reader()
    expect(r1.terminated).toBe(false)
    expect(r1.data?.getUint8(0)).toBe(0xfe)
    expect(r1.data?.getUint8(1)).toBe(0x00)

    const r2 = await reader()
    expect(r2.terminated).toBe(false)
    expect(r2.data?.getUint8(0)).toBe(0xff)

    const r3 = await reader()
    expect(r3.terminated).toBe(true)
})
