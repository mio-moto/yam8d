import { useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, WaveCommand } from '../connection/protocol'
import { renderer } from './renderer'

// kronsilds: I split the M8Screen in 2 rendering:
// this one if for WebGL in canvas
// and the other one is for pure html using PRE
export const M8Screen = ({ bus }: { bus?: ConnectedBus | null }) => {
  const innerRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!innerRef.current) {
      return
    }
    const render = renderer(innerRef.current)
    const drawText = (data: CharacterCommand) => {
      render?.text.drawText({
        char: data.character,
        pos: {
          x: Math.floor(data.pos.x / 12),
          y: Math.floor(data.pos.y / 14),
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

    bus?.protocol.eventBus.on('text', drawText)
    bus?.protocol.eventBus.on('rect', drawRect)
    bus?.protocol.eventBus.on('wave', drawWave)

    // effectively reset the screen but brak the bus, no event are recieved anymore
    //bus?.commands.resetScreen()

    return () => {
      bus?.protocol.eventBus.off('text', drawText)
      bus?.protocol.eventBus.off('rect', drawRect)
      bus?.protocol.eventBus.off('wave', drawWave)
    }
  }, [bus])

  return <canvas className="element" ref={innerRef} style={{ width: '100%', imageRendering: 'pixelated' }}></canvas>
}
