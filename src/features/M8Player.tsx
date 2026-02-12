import { css, cx } from '@linaria/core'
import { type FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { style } from '../app/style/style'
import type { ConnectedBus } from './connection/connection'
import { pressKeys } from './connection/keys'
import type { KeyCommand, SystemCommand } from './connection/protocol'
import { useViewNavigator } from './macros/useViewNavigator'
import { M8Screen } from './rendering/M8Screen'
import { registerViewExtractor } from './state/viewExtractor'
import { M8Body } from './rendering/M8Body'
import { useBackgroundColor } from './state/viewStore'
import { rgbToHex } from '../utils/colorTools'
import { useSettingsContext } from '../features/settings/settings'

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

      &.opt {
        fill: ${style.colors.teal.primary} !important;
      }
      &.edit {
        fill: ${style.colors.ochre.primary} !important;
      }
      &.shift {
        fill: ${style.colors.raspberry[500]} !important;
      }
      &.play {
        fill: ${style.colors.lime.primary} !important;
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
  // screen ref
  const screenRef = useRef<HTMLDivElement | null>(null)
  // M8 body ref (as parent for the screen)
  const parentRef = useRef<HTMLDivElement | null>(null)

  const [bgColor] = useBackgroundColor()
  const screenColor = rgbToHex(bgColor ?? { r: 0, g: 0, b: 0 })

  const [keysPressed, setKeysPressed] = useState(0)
  const { navigateTo } = useViewNavigator(bus)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <on model change to get correct refs>
  useLayoutEffect(() => {
    const screenEdge = screenEdgeRef.current
    const screen = screenRef.current
    const parent = parentRef.current

    if (!screenEdge || !screen || !parent) return

    const updatePosition = () => {
      const screenEdgeBox = screenEdge.getBoundingClientRect()
      const parentBox = parent.getBoundingClientRect()

      const top = screenEdgeBox.top - parentBox.top + 1
      const left = screenEdgeBox.left - parentBox.left + 4
      const bottom = parentBox.bottom - screenEdgeBox.bottom - 1
      const right = parentBox.right - screenEdgeBox.right - 4

      const style = screen.style
      style.position = 'absolute'
      style.top = `${top}px`
      style.left = `${left}px`
      style.bottom = `${bottom}px`
      style.right = `${right}px`
      style.width = `${screenEdgeBox.width - 8}px`
      style.height = `${screenEdgeBox.height - 8}px`
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

      // TODO : get screen size from centralized place
      let sw = 480
      let sh = 320
      if (model === 1) {
        sw = 320
        sh = 240
      }

      // Map to 480x320 grid using element-relative fractions
      const gx = Math.round(((ev.clientX - screenRect.left) / screenRect.width) * sw)
      const gy = Math.round(((ev.clientY - screenRect.top) / screenRect.height) * sh)
      console.log('screen click → grid', { gx, gy })
      navigateTo({ x: gx, y: gy })
      ev.stopPropagation()
      ev.preventDefault()
    },
    [navigateTo, model],
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

  const onClick = useCallback(
    (keys: Parameters<typeof pressKeys>[0]) => {
      bus?.commands.sendKeys(pressKeys(keys))

      // TODO : make toggle button on click
      // meanwhile send no key pressed
      bus?.commands.sendKeys(0)
    },
    [bus],
  )

  return (
    <div ref={parentRef} className={cx(containerClass, fullView && 'M8-full-view')}>
      {settings.showM8Body ? (
        <M8Body
          model={model}
          strokeColor={strokeColor}
          screenColor={screenColor}
          onClick={onClick}
          keysPressed={keysPressed}
          screenEdgeRef={screenEdgeRef}
        />
      ) : (
        <div
          // When body is hidden, provide a placeholder element to anchor the screen overlay
          ref={screenEdgeRef as unknown as React.Ref<HTMLDivElement>}
          style={{ width: '100%', height: '66vh' }}
        />
      )}

      <div ref={screenRef} className={screen} onClick={onScreenClick}>
        <M8Screen bus={bus} onClick={onScreenClick} />
      </div>
    </div>
  )
}

export const M8Player: FC<{
  bus?: ConnectedBus
  fullView?: boolean
}> = ({ bus, fullView, ...props }) => {
  return <FullM8Player {...props} strokeColor={style.themeColors.text.default} bus={bus} fullView={fullView} />
}
