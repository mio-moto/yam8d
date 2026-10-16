import { useCallback, useState } from 'react'
import { connectWithRetry } from '../../packages/m8-sdk/src/engine/connectWithRetry'
import type { ConnectedBus } from '../../packages/m8-sdk/src/engine/connection'
import { device } from './connection/device'
import { getM8Engine } from './engine'

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

            // Start the engine before the screen asks the M8 for its first full frame
            getM8Engine(connectedBus)
            setBus(connectedBus)
            await res.audio.connect()
        })()
    }, [])

    return { bus, connect }
}
