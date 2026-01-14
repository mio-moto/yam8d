import { useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, SystemCommand, WaveCommand } from '../connection/protocol'
import { renderer, type ScreenLayout } from './renderer'

const makeScreenLayout = ({ model, fontMode }: SystemCommand): ScreenLayout => {
  if (model === 'M8 Model:01') {
    return (fontMode + 1) as ScreenLayout
  }
  return (fontMode + 3) as ScreenLayout
}

// kronsilds: I split the M8Screen in 2 rendering:
// this one if for WebGL in canvas
// and the other one is for pure html using PRE
export const M8Screen = ({ bus }: { bus?: ConnectedBus | null }) => {
  const innerRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!innerRef.current) {
      return
    }
    const systemInfo = bus?.protocol.getSystemInfo()
    const render = renderer(innerRef.current, systemInfo ? makeScreenLayout(systemInfo) : 5)
    const drawText = (data: CharacterCommand) => {
      render?.text.drawText({
        char: data.character,
        pos: {
          x: Math.floor(data.pos.x),
          y: Math.floor(data.pos.y),
        },
        color: data.foreground,
      })
    }

    const drawRect = (data: RectCommand) => {
      if (!data) {
        return
      }
      render?.rect.drawRect(data)
    }

    const drawWave = (data: WaveCommand) => {
      render?.wave.drawWave(data)
    }

    const updateRenderer = (data: SystemCommand) => {
      render?.setScreenLayout(makeScreenLayout(data))
    }

    bus?.protocol.eventBus.on('text', drawText)
    bus?.protocol.eventBus.on('rect', drawRect)
    bus?.protocol.eventBus.on('wave', drawWave)
    bus?.protocol.eventBus.on('system', updateRenderer)

    return () => {
      bus?.protocol.eventBus.off('text', drawText)
      bus?.protocol.eventBus.off('rect', drawRect)
      bus?.protocol.eventBus.off('wave', drawWave)
      bus?.protocol.eventBus.off('system', updateRenderer)
    }
  }, [bus])

  return <canvas className="element" ref={innerRef} style={{ width: '100%', imageRendering: 'pixelated' }}></canvas>
}
