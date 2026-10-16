// Plays a sequence of key frames on the M8, one frame per key echo: the next frame is sent
// when the M8 echoes the previous one. An unexpected echo (someone else pressed a key)
// cancels the macro. Progress is published in the store's macroStatus.

import type { EngineBus } from './bus'
import type { KeyCommand } from './protocol'
import type { M8Store } from './store'

export interface MacroRunner {
  /** Starts a sequence. While one is running, the new frames replace the remaining ones. */
  start(sequence: number[]): void
  cancel(reason?: string): void
  readonly running: boolean
  dispose(): void
}

export const createMacroRunner = ({
  bus,
  store,
  cancelOnKeydown = false,
}: {
  bus: EngineBus
  store: M8Store
  /** Cancel the running macro on any keydown in this window (yam8d does, for its keyboard input). */
  cancelOnKeydown?: boolean
}): MacroRunner => {
  let queue: number[] = []
  let lastSent: number | null = null
  let active = false

  const onKeyDown = () => {
    if (active) cancel('preempted by keyboard')
  }

  const activate = () => {
    if (active) return
    active = true
    bus.protocol.eventBus.on('key', onKeyEcho)
    if (cancelOnKeydown && typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown)
  }

  const deactivate = () => {
    if (!active) return
    active = false
    bus.protocol.eventBus.off('key', onKeyEcho)
    if (cancelOnKeydown && typeof window !== 'undefined') window.removeEventListener('keydown', onKeyDown)
  }

  function onKeyEcho(data: KeyCommand) {
    if (!active) return
    const echoed = data.keys
    // Preempt on unexpected echo (likely external input)
    if (lastSent !== null && echoed !== lastSent) {
      cancel('external key event')
      return
    }
    const next = queue.shift()
    if (next !== undefined) {
      lastSent = next
      bus.commands.sendKeys(next)
      const sent = (store.get('macroStatus').currentStep ?? 0) + 1
      store.set('macroStatus', { running: true, currentStep: sent, sequenceLength: queue.length + sent })
    } else {
      deactivate()
      lastSent = null
      store.set('macroStatus', { running: false })
    }
  }

  function cancel(_reason?: string) {
    if (!active && queue.length === 0 && !store.get('macroStatus').running) return
    queue = []
    lastSent = null
    deactivate()
    store.set('macroStatus', { running: false })
  }

  const start = (sequence: number[]) => {
    queue = Array.isArray(sequence) ? sequence.slice() : []
    if (queue.length === 0) return
    store.set('macroStatus', { running: true, currentStep: 0, sequenceLength: queue.length })
    // Already running: the next echo picks up the new frames
    if (active) return

    activate()
    const first = queue.shift() as number
    lastSent = first
    bus.commands.sendKeys(first)
  }

  return {
    start,
    cancel,
    get running() {
      return active
    },
    dispose: () => {
      queue = []
      lastSent = null
      deactivate()
    },
  }
}
