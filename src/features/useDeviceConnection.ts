import { useCallback, useState } from 'react'
import { connectWithRetry } from './connection/connectWithRetry'
import type { ConnectedBus } from './connection/connection'
import { device } from './connection/device'

/** Connects to the M8 (USB / serial / MIDI) on demand and exposes the resulting bus. */
export const useDeviceConnection = () => {
    const [bus, setBus] = useState<ConnectedBus>()

    const connect = useCallback(() => {
        const res = device()

        void (async () => {
            if (!res.connection.browserSupport) {
                console.error('No usb / serial support detected.')
                return
            }

            const { connect: connectDevice } = res.connection
            const connectedBus = await connectWithRetry(() => connectDevice())
            if (!connectedBus) return

            setBus(connectedBus)
            await res.audio.connect()
        })()
    }, [])

    return { bus, connect }
}
