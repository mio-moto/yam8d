// The part of a connected M8 bus the engine uses: protocol events in, key frames out.
// A ConnectedBus from connection.ts fits; tests pass a fake.

import type { createEventBus } from './eventBus'
import type { ProtocolEvents } from './protocol'

export type ProtocolEventBus = ReturnType<typeof createEventBus<ProtocolEvents>>

export interface EngineBus {
  protocol: { eventBus: ProtocolEventBus }
  commands: {
    sendKeys(keys: number): void
    /** Asks the M8 to redraw the whole screen. */
    resetScreen(): void
  }
}
