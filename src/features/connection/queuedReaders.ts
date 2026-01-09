export type SlipState = 'read' | 'escape' | 'error'

export const createSlipParser = () => {
    const buffer = new Uint8Array(1024)
    const view = new DataView(buffer.buffer)
    let dataLength = 0
    let state: SlipState = 'read'

    const finalizePacket = (): DataView | undefined => {
        if (dataLength <= 0) {
            dataLength = 0
            return undefined
        }
        const out = new Uint8Array(dataLength)
        out.set(buffer.subarray(0, dataLength))
        const dv = new DataView(out.buffer)
        dataLength = 0
        return dv
    }

    const pushByte = (byte: number) => {
        if (dataLength >= buffer.length) {
            // overflow safeguard: drop packet and reset
            dataLength = 0
            state = 'error'
            return
        }
        view.setUint8(dataLength++, byte)
    }

    const feed = (byte: number): DataView | undefined => {
        switch (state) {
            case 'read':
                switch (byte) {
                    case 0xc0:
                        return finalizePacket()
                    case 0xdb:
                        state = 'escape'
                        return undefined
                    default:
                        pushByte(byte)
                        return undefined
                }
            case 'escape':
                switch (byte) {
                    case 0xdc: // escaped 0xc0
                        pushByte(0xc0)
                        state = 'read'
                        return undefined
                    case 0xdd: // escaped 0xdb
                        pushByte(0xdb)
                        state = 'read'
                        return undefined
                    default:
                        state = 'error'
                        return undefined
                }
            case 'error':
                if (byte === 0xc0) {
                    // reset on end marker
                    state = 'read'
                    dataLength = 0
                }
                return undefined
        }
    }

    return { feed }
}

// USB reader with SLIP framing -> queued DataViews
export const queuedUsbReader = (device: USBDevice) => {
    const parser = createSlipParser()
    const messages: DataView[] = []
    let terminated = false
    let resolver: ((value: { terminated: true } | { terminated: false; data: DataView }) => void) | undefined

    const pump = async () => {
        try {
            while (true) {
                const result = await device.transferIn(3, 512)
                if (result.status === 'stall') {
                    terminated = true
                    if (resolver && messages.length === 0) {
                        resolver({ terminated: true })
                        resolver = undefined
                    }
                    break
                }
                const data = result.data
                if (!data) continue
                for (let i = 0; i < data.byteLength; i++) {
                    const maybe = parser.feed(data.getUint8(i))
                    if (maybe) {
                        messages.push(maybe)
                        if (resolver) {
                            const msg = messages.shift()
                            if (msg) {
                                resolver({ terminated: false, data: msg })
                                resolver = undefined
                            }
                        }
                    }
                }
            }
        } catch (_e) {
            terminated = true
            if (resolver && messages.length === 0) {
                resolver({ terminated: true })
                resolver = undefined
            }
        }
    }

    pump()

    return async () => {
        if (terminated && messages.length === 0) {
            return { terminated: true as const }
        }
        if (messages.length > 0) {
            const msg = messages.shift()
            if (msg) {
                return { terminated: false as const, data: msg }
            }
        }
        return new Promise<{ terminated: true } | { terminated: false; data: DataView }>((resolve) => {
            resolver = resolve
        })
    }
}

// Serial reader with SLIP framing -> queued DataViews
export const queuedSerialReader = (reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>) => {
    const parser = createSlipParser()
    const messages: DataView[] = []
    let terminated = false
    let resolver: ((value: { terminated: true } | { terminated: false; data: DataView }) => void) | undefined

    const pump = async () => {
        try {
            while (true) {
                const { value, done } = await reader.read()
                if (done) {
                    terminated = true
                    if (resolver && messages.length === 0) {
                        resolver({ terminated: true })
                        resolver = undefined
                    }
                    break
                }
                if (!value) continue
                const chunk = value as unknown as Uint8Array
                for (let i = 0; i < chunk.byteLength; i++) {
                    const maybe = parser.feed(chunk[i])
                    if (maybe) {
                        messages.push(maybe)
                        if (resolver) {
                            const msg = messages.shift()
                            if (msg) {
                                resolver({ terminated: false, data: msg })
                                resolver = undefined
                            }
                        }
                    }
                }
            }
        } catch (_e) {
            terminated = true
            if (resolver && messages.length === 0) {
                resolver({ terminated: true })
                resolver = undefined
            }
        }
    }

    pump()

    return async () => {
        if (terminated && messages.length === 0) {
            return { terminated: true as const }
        }
        if (messages.length > 0) {
            const msg = messages.shift()
            if (msg) {
                return { terminated: false as const, data: msg }
            }
        }
        return new Promise<{ terminated: true } | { terminated: false; data: DataView }>((resolve) => {
            resolver = resolve
        })
    }
}
