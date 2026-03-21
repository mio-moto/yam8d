import type { CharacterCommand, RectCommand, WaveCommand, SystemCommand } from '../connection/protocol'
import { renderer, type BackgroundShader, type ScreenLayout } from './renderer'

export type DrawCommand =
  | { type: 'drawText'; data: CharacterCommand }
  | { type: 'drawRect'; data: RectCommand }
  | { type: 'drawWave'; data: WaveCommand }

export type WorkerInMessage =
  | DrawCommand
  | { type: 'batch'; commands: DrawCommand[] }
  | { type: 'init'; canvas: OffscreenCanvas; screenLayout: ScreenLayout; smoothRendering: boolean }
  | { type: 'setScreenLayout'; layout: ScreenLayout }
  | { type: 'resize'; width: number; height: number }
  | { type: 'setSmoothRendering'; enabled: boolean }
  | { type: 'setSmoothParams'; blur: number; threshold: number; smoothness: number }
  | { type: 'setBackgroundShader'; shader: BackgroundShader }
  | { type: 'setAudioSpectrumBands'; bands: 64 | 128 | 256 }
  | { type: 'setCustomBackgroundShader'; source: string }
  | { type: 'setCompositeM8Screen'; value: boolean }
  | { type: 'setMouseState'; x: number; y: number; down: number }
  | { type: 'audioData'; level: number; spectrum: Float32Array | null }
  // system info from bus — drives setScreenLayout on reconnect
  | { type: 'system'; data: SystemCommand }

export type WorkerOutMessage = { type: 'shaderError'; error: string | null; usesAudio: boolean }

let render: ReturnType<typeof renderer>

const processDrawCommand = (msg: DrawCommand) => {
  switch (msg.type) {
    case 'drawText': {
      render?.text.drawText({
        char: msg.data.character,
        pos: { x: Math.floor(msg.data.pos.x), y: Math.floor(msg.data.pos.y) },
        color: msg.data.foreground,
      })
      break
    }
    case 'drawRect': {
      render?.rect.drawRect(msg.data)
      break
    }
    case 'drawWave': {
      render?.wave.drawWave(msg.data)
      break
    }
  }
}

self.addEventListener('message', (rawEvent: Event) => {
  const event = rawEvent as MessageEvent<WorkerInMessage>
  const msg = event.data
  switch (msg.type) {
    case 'init': {
      render = renderer(msg.canvas, msg.screenLayout, msg.smoothRendering)
      break
    }
    case 'drawText':
    case 'drawRect':
    case 'drawWave': {
      processDrawCommand(msg)
      break
    }
    case 'batch': {
      for (const cmd of msg.commands) processDrawCommand(cmd)
      break
    }
    case 'setScreenLayout': {
      render?.setScreenLayout(msg.layout)
      break
    }
    case 'resize': {
      render?.resize(msg.width, msg.height)
      break
    }
    case 'setSmoothRendering': {
      render?.setSmoothRendering(msg.enabled)
      break
    }
    case 'setSmoothParams': {
      render?.setSmoothParams(msg.blur, msg.threshold, msg.smoothness)
      break
    }
    case 'setBackgroundShader': {
      render?.setBackgroundShader(msg.shader)
      break
    }
    case 'setAudioSpectrumBands': {
      render?.setAudioSpectrumBands(msg.bands)
      break
    }
    case 'setCustomBackgroundShader': {
      const result = render?.setCustomBackgroundShader(msg.source) ?? { error: null, usesAudio: false }
      // biome-ignore lint/suspicious/noExplicitAny: postMessage from worker to main — no targetOrigin needed
      ;(self as any).postMessage({ type: 'shaderError', error: result.error, usesAudio: result.usesAudio } satisfies WorkerOutMessage)
      break
    }
    case 'setCompositeM8Screen': {
      render?.setCompositeM8Screen(msg.value)
      break
    }
    case 'setMouseState': {
      render?.setMouseState(msg.x, msg.y, msg.down)
      break
    }
    case 'audioData': {
      render?.setAudioData(msg.level, msg.spectrum)
      break
    }
    case 'system': {
      // handled by M8Screen, not forwarded to here — included for completeness
      break
    }
  }
})
