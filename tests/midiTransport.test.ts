// The MIDI clock reader: opening the M8's input twice at once must not count every message twice.

import { afterEach, expect, test } from 'bun:test'
import { createMidiTransport } from '../packages/m8-sdk/src/engine/host/midiTransport'
import type { M8TransportEvent } from '../packages/m8-sdk/src/types'

const realNavigator = globalThis.navigator

type Listener = (e: { data: Uint8Array; timeStamp: number }) => void

/** Web MIDI as Chrome gives it: every requestMIDIAccess() has input objects of its own. */
function fakeMidi() {
  const inputs: { listeners: Set<Listener> }[] = []
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      requestMIDIAccess: async () => {
        const listeners = new Set<Listener>()
        inputs.push({ listeners })
        const input = {
          name: 'M8',
          open: async () => {},
          addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
          removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
        }
        return { inputs: new Map([['0', input]]) }
      },
    },
    configurable: true,
  })
  /** Delivers one message to every input that listens, as the browser does. */
  const send = (data: number[], timeStamp: number) => {
    for (const input of inputs) for (const listener of input.listeners) listener({ data: new Uint8Array(data), timeStamp })
  }
  return { inputs, send }
}

afterEach(() =>
  Object.defineProperty(globalThis, 'navigator', {
    value: realNavigator,
    configurable: true,
  }),
)

test('calls that come while the input opens share it, and each message is counted once', async () => {
  const midi = fakeMidi()
  const events: M8TransportEvent[] = []
  const transport = createMidiTransport((event) => events.push(event))
  const results = await Promise.all([transport.enable(), transport.enable()])
  expect(results).toEqual([{ ok: true }, { ok: true }])
  expect(midi.inputs).toHaveLength(1)
  expect(midi.inputs[0].listeners.size).toBe(1)
  for (let pulse = 0; pulse < 12; pulse += 1) midi.send([0xf8], 100 + pulse * 20)
  midi.send([0xfb], 400)
  const clocks = events.filter((event) => event.kind === 'clock')
  expect(clocks.map((event) => event.ticks)).toEqual([6, 12])
  expect(events.filter((event) => event.kind === 'continue')).toHaveLength(1)
})

test('an input that is open already is not opened again', async () => {
  const midi = fakeMidi()
  const transport = createMidiTransport(() => {})
  await transport.enable()
  expect(await transport.enable()).toEqual({ ok: true })
  expect(midi.inputs).toHaveLength(1)
})

test('a disable during the opening leaves no listener, and enabling again works', async () => {
  const midi = fakeMidi()
  const transport = createMidiTransport(() => {})
  const first = transport.enable()
  transport.disable()
  expect((await first).ok).toBe(false)
  expect(midi.inputs[0].listeners.size).toBe(0)
  expect(await transport.enable()).toEqual({ ok: true })
  expect(midi.inputs[1].listeners.size).toBe(1)
})

test('a refusal is not kept: the next call asks again', async () => {
  let asked = 0
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      requestMIDIAccess: async () => {
        asked += 1
        return { inputs: new Map() }
      },
    },
    configurable: true,
  })
  const transport = createMidiTransport(() => {})
  expect(await transport.enable()).toEqual({ ok: false, error: 'no MIDI input named M8' })
  await transport.enable()
  expect(asked).toBe(2)
})
