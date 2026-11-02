// MIDI clock and transport from the M8's USB MIDI output, for SDK clients that follow the
// song while it plays. The M8 sends them when Project > MIDI Settings > SYNC OUT includes
// CLOCK / TRANSPORT / SPP (a per-song setting). Independent of React.

import type { M8TransportEvent } from '../../types'

/** Clock ticks per sixteenth note at 24 PPQ: one phrase step with the default groove. */
const TICKS_PER_STEP = 6

export type MidiTransport = {
  /** Opens the M8 MIDI input (asks for Web MIDI permission the first time). */
  enable: () => Promise<{ ok: boolean; error?: string }>
  disable: () => void
}

export const createMidiTransport = (emit: (event: M8TransportEvent) => void): MidiTransport => {
  let input: MIDIInput | null = null
  let ticks = 0
  let lastTickAt: number | null = null
  let msPerTick: number | null = null

  const epoch = (timeStamp: number) => performance.timeOrigin + timeStamp

  const onMessage = (e: MIDIMessageEvent) => {
    const data = e.data
    if (!data || data.length === 0) return
    const at = epoch(e.timeStamp)
    switch (data[0]) {
      case 0xf8: {
        // Clock: estimate the tick length, report once per step.
        if (lastTickAt != null) {
          const gap = at - lastTickAt
          if (gap > 0 && gap < 200) msPerTick = msPerTick == null ? gap : msPerTick * 0.9 + gap * 0.1
        }
        lastTickAt = at
        // The M8 can send clock without transport (SYNC OUT = CLOCK) and keeps it running
        // while stopped: the count is a monotonic time base, never reset.
        ticks += 1
        if (ticks % TICKS_PER_STEP === 0) emit({ kind: 'clock', ticks, at, msPerTick })
        return
      }
      case 0xfa:
        emit({ kind: 'start', ticks, at, msPerTick })
        return
      case 0xfb:
        emit({ kind: 'continue', ticks, at, msPerTick })
        return
      case 0xfc:
        emit({ kind: 'stop', ticks, at, msPerTick })
        return
      case 0xf2: {
        // Song Position Pointer: sixteenths since the song start.
        const spp = (data[1] ?? 0) | ((data[2] ?? 0) << 7)
        emit({ kind: 'position', ticks, at, msPerTick, spp })
        return
      }
    }
  }

  type Result = { ok: boolean; error?: string }

  let pending: Promise<Result> | null = null
  /** Counts disables, so an open that one overtook adds no listener. */
  let generation = 0

  const open = async (): Promise<Result> => {
    const started = generation
    if (!('requestMIDIAccess' in navigator)) return { ok: false, error: 'Web MIDI is not available in this browser' }
    try {
      const access = await navigator.requestMIDIAccess()
      const m8 = [...access.inputs.values()].find((i) => i.name === 'M8')
      if (!m8) return { ok: false, error: 'no MIDI input named M8' }
      await m8.open()
      // A call that was disabled meanwhile must not leave a listener behind.
      if (generation !== started) return { ok: false, error: 'disabled' }
      m8.addEventListener('midimessage', onMessage)
      input = m8
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // Calls that come while the input is still opening share its answer: Chrome gives every
  // requestMIDIAccess() its own MIDIInput objects, so two opens would each add the listener and
  // count every message twice (the tick count then runs at twice the clock).
  return {
    enable: () => {
      if (input) return Promise.resolve({ ok: true })
      if (pending) return pending
      const opening = open()
      pending = opening
      void opening.then((result) => {
        // A failure is not kept: the next call tries again.
        if (pending === opening && !result.ok) pending = null
      })
      return opening
    },
    disable: () => {
      generation += 1
      pending = null
      input?.removeEventListener('midimessage', onMessage)
      input = null
    },
  }
}
