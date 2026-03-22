import { css, cx } from '@linaria/core'
import { type FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { style } from '../app/style/style'
import type { ConnectedBus } from './connection/connection'
import { pressKeys } from './connection/keys'
import type { KeyCommand, SystemCommand } from './connection/protocol'
import { useViewNavigator } from './macros/useViewNavigator'
import { M8Screen, canUseOffscreenCanvas } from './rendering/M8Screen'
import { M8PreText } from './rendering/M8PreText'
import { registerViewExtractor } from './state/viewExtractor'
import { M8Body } from './rendering/M8Body'
import { useBackgroundColor, useSystemInfo } from './state/viewStore'
import { rgbToHex } from '../utils/colorTools'
import { useSettingsContext } from '../features/settings/settings'
import { RecordingControls } from './recording/RecordingControls'
import { VJNumpad } from './rendering/VJNumpad'

// import { useCursorRect } from './state/viewStore'
// import { rectLogger } from './debug/rectAnalyserLogger'

const containerClass = css`
  z-index: 0;
  position: relative;
  flex: 1;
  justify-self: stretch;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  isolation: isolate;

  /* these are for animation */
  max-height: 300vh; /* fake height just to have a final value */
  transition: max-height 400ms ease; /* to animate on max-height change */

  padding: 0 32px;

  > h1 {
    margin: 0;
  }

  > .element {
    font-family: monospace;
    font-variant-numeric: tabular-nums lining-nums;
    text-transform: full-width;
    font-size: 13px;
    font-weight: 700;
    position: absolute;
    z-index: -1;
    letter-spacing: 7px;
  }

  > .description {
    min-height: 60px;
    padding-bottom: 32px;
  }

  > svg {
    max-height: 100vw;
    shape-rendering: geometricprecision; /* i've change it because optimizeQuality doesn't exist */

    .button {
      fill: ${style.themeColors.text.disabled} !important;
      transition: 0.25s ease fill-opacity;

      cursor: pointer;
      pointer-events: all;

      fill-opacity: 0;
      //opacity: 0;

      &:hover {
        fill-opacity: 0.25;
      }

      &.press {
        fill-opacity: 1;
        transition: none;
        // transition-duration: 0;
      }
    }

    .screen {
      // fill: #000 !important;
      // fill-opacity: 1 !important;
      z-index: -2;
    }

    .screen-background {
      z-index: -2;
      //   fill-opacity: 0 !important;
    }

    .logo,
    .button-outline {
      opacity: 0;
    }

    .M8-full-view {
      max-height: 88vh;
    }
    :not(.M8-full-view) {
      max-height: 300vh;
    }
  }
`

const screen = css`
  //   z-index: -1;
  //   left:-1px;
  container-type: inline-size;
  display: flex;
`

const FullM8Player: FC<{
  strokeColor: string
  bus?: ConnectedBus
  fullView?: boolean
}> = ({ strokeColor, bus, fullView = true }) => {
  const [model, setModel] = useState<1 | 2>(2)
  const { settings } = useSettingsContext()

  const screenEdgeRef = useRef<SVGRectElement | null>(null)
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // screen ref
  const screenRef = useRef<HTMLDivElement | null>(null)
  // M8 body ref (as parent for the screen)
  const parentRef = useRef<HTMLDivElement | null>(null)

  const [sys] = useSystemInfo()

  const [bgColor] = useBackgroundColor()
  const screenColor = rgbToHex(bgColor ?? { r: 0, g: 0, b: 0 })

  const [keysPressed, setKeysPressed] = useState(0)
  const { navigateTo } = useViewNavigator(bus)
  const keysPressedRef = useRef(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <on model change to get correct refs>
  useLayoutEffect(() => {
    const screenEdge = screenEdgeRef.current
    const screen = screenRef.current
    const parent = parentRef.current

    if (!screenEdge || !screen || !parent) return

    const updatePosition = () => {
      const screenEdgeBox = screenEdge.getBoundingClientRect()
      const parentBox = parent.getBoundingClientRect()

      const top = screenEdgeBox.top - parentBox.top //+ 1
      const left = screenEdgeBox.left - parentBox.left //+ 4
      const bottom = parentBox.bottom - screenEdgeBox.bottom //- 1
      const right = parentBox.right - screenEdgeBox.right //- 4

      const style = screen.style
      style.position = 'absolute'
      style.top = `${Math.ceil(top)}px`
      style.left = `${Math.ceil(left)}px`
      style.bottom = `${Math.floor(bottom)}px`
      style.right = `${Math.floor(right)}px`
      style.width = `${Math.floor(screenEdgeBox.width) - 1 /*- 8*/}px`
      style.height = `${Math.floor(screenEdgeBox.height) - 1 /* - 8*/}px`
    }

    updatePosition()

    const resizeObs = new ResizeObserver(updatePosition)
    resizeObs.observe(parent)

    return () => {
      resizeObs.disconnect()
    }
  }, [model, screenEdgeRef.current, settings.showM8Body])

  const onScreenClick = useCallback(
    (ev: React.MouseEvent<HTMLElement>) => {
      const screen = ev.target as HTMLElement
      if (!screen) return
      const screenRect = screen.getBoundingClientRect()

      const sw = sys?.screenWidth ?? 480
      const sh = sys?.screenHeight ?? 320
      const offX = (sys?.offX ?? 0)
      const offY = (sys?.offY ?? 0) - (sys?.rectOffset ?? 0)

      const gx = Math.round(((ev.clientX - screenRect.left) / screenRect.width) * sw) + offX
      const gy = Math.round(((ev.clientY - screenRect.top) / screenRect.height) * sh) + offY
      console.log('screen click → grid', { gx, gy })
      navigateTo({ x: gx, y: gy })
      ev.stopPropagation()
      ev.preventDefault()
    },
    [navigateTo, sys],
  )

  useEffect(() => {
    if (!bus) {
      return
    }

    const onKey = (keyCommand: KeyCommand) => {
      const key = keyCommand.keys
      setKeysPressed(key)
    }

    const onSystemCommand = (sys: SystemCommand) => {
      if (sys) {
        setModel(sys.model === 'M8 Model:02' ? 2 : 1)
      }
    }

    bus.protocol.eventBus.on('system', onSystemCommand)

    bus.protocol.eventBus.on('key', onKey)

    return () => {
      bus.protocol.eventBus.off('key', onKey)
    }
  }, [bus])

  useEffect(() => {
    keysPressedRef.current = keysPressed
  }, [keysPressed])

  // Register global view/cursor extractor once when bus is present
  useEffect(() => {
    if (!bus) return
    const unregisterVE = registerViewExtractor(bus)
    //const unregisterRectLogger = rectLogger(bus)

    return () => {
      unregisterVE()
      //unregisterRectLogger()
    }
  }, [bus])

  const onMouseDown = useCallback(
    (keys: Parameters<typeof pressKeys>[0]) => {
      const mask = pressKeys(keys)
      if (!mask) return

      const next = keysPressedRef.current | mask
      bus?.commands.sendKeys(next)
    },
    [bus],
  )

  const onMouseUp = useCallback(
    (keys: Parameters<typeof pressKeys>[0]) => {
      const mask = pressKeys(keys)
      if (!mask) return

      const next = keysPressedRef.current & ~mask
      bus?.commands.sendKeys(next)
    },
    [bus],
  )

  return (
    <>
      {settings.vjMode && settings.backgroundShader && <VJNumpad />}
      <RecordingControls getCanvas={() => screenCanvasRef.current} />
      <div ref={parentRef} className={cx(containerClass, fullView && 'M8-full-view')}>
        {settings.showM8Body ? (
          <M8Body
            model={model}
            strokeColor={strokeColor}
            screenColor={screenColor}
            onClick={() => { }}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            keysPressed={keysPressed}
            screenEdgeRef={screenEdgeRef}
          />
        ) : (
          <div
            // When body is hidden, provide a placeholder element to anchor the screen overlay
            ref={screenEdgeRef as unknown as React.Ref<HTMLDivElement>}
            style={{ width: '100%', height: '88vh' }}
          />
        )}

        <div ref={screenRef} className={screen} onClick={onScreenClick}>
          {canUseOffscreenCanvas
            ? <M8Screen ref={screenCanvasRef} bus={bus} onClick={onScreenClick} />
            : <M8PreText bus={bus} />}
        </div>
      </div>
    </>
  )

}

export const M8Player: FC<{
  bus?: ConnectedBus
  fullView?: boolean
}> = ({ bus, fullView, ...props }) => {
  return <FullM8Player {...props} strokeColor={style.themeColors.text.default} bus={bus} fullView={fullView} />
}
