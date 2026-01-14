import { css, cx } from '@linaria/core'
import { type FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { style } from '../app/style/style'
import type { ConnectedBus } from './connection/connection'
import { isDown, isEdit, isLeft, isOpt, isPlay, isRight, isShift, isUp, pressKeys } from './connection/keys'
import type { KeyCommand } from './connection/protocol'
import { M8Screen } from './rendering/M8Screen'

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
  max-height:300vh; /* fake height just to have a final value */
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
        fill:  ${style.colors.teal.primary} !important;
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
      fill-opacity: 0 !important;
    }

    .logo, .button-outline {
      opacity: 0;
    }

    .M8-full-view {
      max-height:88vh;
    }
    :not(.M8-full-view) {
      max-height:300vh;
    }

  }
`

const screen = css`
  z-index: -1;
  left:-1px;
  container-type: inline-size;
`

const SvgComponent: FC<{
  strokeColor: string
  bus?: ConnectedBus
  fullView?: boolean
  WGLRendering?: boolean
}> = ({ strokeColor, bus, fullView = true, ...props }) => {
  const [buttonOpt, setButtonOpt] = useState<SVGPathElement | null>(null)
  const [buttonEdit, setButtonEdit] = useState<SVGPathElement | null>(null)
  const [buttonUp, setButtonUp] = useState<SVGPathElement | null>(null)
  const [buttonDown, setButtonDown] = useState<SVGPathElement | null>(null)
  const [buttonLeft, setButtonLeft] = useState<SVGPathElement | null>(null)
  const [buttonRight, setButtonRight] = useState<SVGPathElement | null>(null)
  const [buttonShift, setButtonShift] = useState<SVGPathElement | null>(null)
  const [buttonPlay, setButtonPlay] = useState<SVGPathElement | null>(null)

  // because change of state triggers re-rendreing, I've change it to a ref
  const screenEdgeRef = useRef<SVGRectElement | null>(null)

  // screen ref
  const screenRef = useRef<HTMLDivElement | null>(null)

  // M8 body ref (as parent for the screen)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const screenEdge = screenEdgeRef.current
    const screen = screenRef.current
    const parent = parentRef.current

    if (!screenEdge || !screen || !parent) return

    const updatePosition = () => {
      const screenBox = screenEdge.getBoundingClientRect()
      const parentBox = parent.getBoundingClientRect()

      const top = screenBox.top - parentBox.top
      const left = screenBox.left - parentBox.left
      const bottom = parentBox.bottom - screenBox.bottom
      const right = parentBox.right - screenBox.right

      const style = screen.style
      style.position = 'absolute'
      style.top = `${top}px`
      style.left = `${left}px`
      style.bottom = `${bottom}px`
      style.right = `${right}px`
      style.width = `${screenBox.width}px`
      style.height = `${screenBox.height}px`
    }

    updatePosition()

    const resizeObs = new ResizeObserver(updatePosition)
    resizeObs.observe(parent)

    return () => {
      resizeObs.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!bus) {
      return
    }

    const updateButtonClass = (element: SVGPathElement | null, status: boolean) => {
      if (!element) {
        return
      }
      if (!status) {
        element.classList.remove('press')
      } else {
        element.classList.add('press')
      }
    }

    const onKey = (keyCommand: KeyCommand) => {
      const key = keyCommand.keys
      updateButtonClass(buttonLeft, isLeft(key))
      updateButtonClass(buttonRight, isRight(key))
      updateButtonClass(buttonUp, isUp(key))
      updateButtonClass(buttonDown, isDown(key))
      updateButtonClass(buttonOpt, isOpt(key))
      updateButtonClass(buttonEdit, isEdit(key))
      updateButtonClass(buttonShift, isShift(key))
      updateButtonClass(buttonPlay, isPlay(key))
    }

    bus.protocol.eventBus.on('key', onKey)

    return () => {
      bus.protocol.eventBus.off('key', onKey)
    }
  }, [buttonOpt, buttonEdit, buttonPlay, buttonUp, buttonRight, buttonShift, buttonLeft, buttonDown, bus])

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
      <div ref={screenRef} className={screen}>
        <M8Screen bus={bus} />
      </div>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 119 164"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        xmlSpace="preserve"
        style={{
          fillRule: 'evenodd',
          clipRule: 'evenodd',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeMiterlimit: 10,
        }}
        {...props}
      >
        <rect
          x={0}
          y={0}
          width={118.427}
          height={163.498}
          style={{
            fill: 'none',
          }}
        />
        <path
          d="M99.94,0.897l12.551,0c2.636,0 4.773,2.136 4.773,4.772l0,22.58c-1.355,1.354 -2.449,1.83 -2.449,4.253l0,18.871c0,3.949 0.618,3.312 2.449,5.362l0,101.283c0,2.636 -2.137,4.772 -4.773,4.772l-107.03,0c-2.635,0 -4.771,-2.136 -4.771,-4.772l0,-101.283c1.831,-2.05 2.449,-1.413 2.449,-5.362l0,-18.871c0,-2.423 -1.095,-2.899 -2.449,-4.253l0,-22.58c0,-2.636 2.136,-4.772 4.771,-4.772l12.552,0c1.355,1.354 1.831,2.449 4.254,2.449l72.311,0c3.949,0 3.311,-0.619 5.362,-2.449Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
          }}
        />
        <path
          className="button opt"
          onClick={() => onClick({ opt: true })}
          ref={setButtonOpt}
          d="M83.699,78.442c0,-0.181 -0.148,-0.328 -0.329,-0.328l-20.657,0c-0.181,0 -0.328,0.147 -0.328,0.328l0,19.439c0,0.181 0.147,0.328 0.328,0.328l20.657,0c0.181,0 0.329,-0.147 0.329,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button up"
          onClick={() => onClick({ up: true })}
          ref={setButtonUp}
          d="M55.919,83.23c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button down"
          onClick={() => onClick({ down: true })}
          ref={setButtonDown}
          d="M55.919,105.278c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button shift"
          onClick={() => onClick({ shift: true })}
          ref={setButtonShift}
          d="M55.971,132.166c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button play"
          onClick={() => onClick({ play: true })}
          ref={setButtonPlay}
          d="M79.198,132.166c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button right"
          onClick={() => onClick({ right: true })}
          ref={setButtonRight}
          d="M79.198,105.278c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button left"
          onClick={() => onClick({ left: true })}
          ref={setButtonLeft}
          d="M32.692,105.304c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button edit"
          onClick={() => onClick({ edit: true })}
          ref={setButtonEdit}
          d="M106.885,78.442c0,-0.181 -0.147,-0.328 -0.328,-0.328l-20.657,0c-0.182,0 -0.329,0.147 -0.329,0.328l0,19.439c0,0.181 0.147,0.328 0.329,0.328l20.657,0c0.181,0 0.328,-0.147 0.328,-0.328l0,-19.439Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          d="M13.734,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M13.734,144.998c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,148.658c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M16.183,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M16.183,144.998c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M13.734,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M13.734,140.126c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,143.786c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M16.183,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M16.183,140.126c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,148.658c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M18.606,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,148.658c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M18.606,144.998c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M21.056,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,148.658c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M21.056,144.998c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,143.786c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M18.606,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,143.786c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M18.606,140.126c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M21.056,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,143.786c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M21.056,140.126c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,148.658c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M23.479,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M23.479,144.998c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,143.786c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M23.479,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M23.479,140.126c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M13.734,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,138.914c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M16.183,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M13.734,135.253c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M14.946,134.042c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M16.183,135.253c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,138.914c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,138.914c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M18.606,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,138.914c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M21.056,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M18.606,135.253c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M17.395,134.042c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M19.818,134.042c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M21.056,135.253c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M22.267,134.042c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,138.914c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M23.479,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M23.479,135.253c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M24.69,134.042c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,148.633c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M95.712,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M95.712,144.972c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,143.76c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M95.712,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M95.712,140.1c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,148.633c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M98.135,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M98.135,144.972c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,148.633c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,148.633c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M100.584,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M100.584,144.972c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,143.76c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M98.135,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M98.135,140.1c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,143.76c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,143.76c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M100.584,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M100.584,140.1c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M103.008,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,148.633c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M103.008,144.972c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,146.209c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M105.457,147.421c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M105.457,144.972c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M103.008,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,143.76c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M103.008,140.1c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,141.337c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M105.457,142.549c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M105.457,140.1c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,138.888c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M95.712,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M95.712,135.227c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M94.501,134.016c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,138.888c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M98.135,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,138.888c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,138.888c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M100.584,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M96.924,134.016c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M98.135,135.227c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M99.373,134.016c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M100.584,135.227c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M101.796,134.016c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,138.888c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M103.008,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,136.465c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M105.457,137.677c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M103.008,135.227c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M104.245,134.016c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.606,0.271 -0.606,0.606c0,0.335 0.272,0.606 0.606,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M105.457,135.227c0,-0.335 -0.272,-0.606 -0.606,-0.606c-0.334,0 -0.605,0.271 -0.605,0.606c0,0.335 0.271,0.606 0.605,0.606c0.334,0 0.606,-0.271 0.606,-0.606"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
            strokeLinecap: 'butt',
            strokeLinejoin: 'miter',
          }}
        />
        <path
          d="M106.273,15.422l-4.847,-4.869l-85.038,0l-4.869,4.881l0.042,54.795l4.84,4.836l85.037,0.037l4.835,-4.873l0,-54.807Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '0.3px',
          }}
        />
        <rect
          x={17.871}
          y={12.294}
          width={82.211}
          height={61.629}
          style={{
            fill: 'none',
            stroke: strokeColor,
            strokeWidth: '0.3px',
          }}
        />
        <text
          x="29.79px"
          y="7.89px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'A'}
          <tspan x="31.226px 32.746px 34.265px 35.118px " y="7.89px 7.89px 7.89px 7.89px ">
            {'UDIO'}
          </tspan>
        </text>
        <text
          x="55.908px"
          y="7.89px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'U'}
          <tspan x="57.555px 59.119px " y="7.89px 7.89px ">
            {'SB'}
          </tspan>
        </text>
        <text
          x="82.171px"
          y="7.89px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'M'}
          <tspan x="83.597px 84.186px 84.78px 86.039px " y="7.89px 7.89px 7.89px 7.89px ">
            {' IDI'}
          </tspan>
        </text>
        <text
          x="69.825px"
          y="101.584px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'O'}
          <tspan x="71.311px 72.63px 73.107px 74.343px 75.079px 76.564px " y="101.584px 101.584px 101.584px 101.584px 101.584px 101.584px ">
            {'P TION'}
          </tspan>
        </text>
        <text
          x="94.975px"
          y="101.584px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'E'}
          <tspan x="96.343px 97.794px 98.578px " y="101.584px 101.584px 101.584px ">
            {'DIT'}
          </tspan>
        </text>
        <text
          x="66.072px"
          y="155.371px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'P'}
          <tspan x="67.651px 69.065px 70.533px " y="155.371px 155.371px 155.371px ">
            {'LAY'}
          </tspan>
        </text>
        <text
          x="42.937px"
          y="155.37px"
          style={{
            fontFamily: "'ArialMT', 'Arial', sans-serif",
            fontSize: '1.5px',
            fill: strokeColor,
          }}
        >
          {'S'}
          <tspan x="44.37px 45.884px 46.733px 48.081px " y="155.37px 155.37px 155.37px 155.37px ">
            {'HIFT'}
          </tspan>
        </text>
        <path
          style={{ fill: strokeColor }}
          d="M66.298,100.896l0,-0.709l0.348,0l0,0.529l0.542,0l0,-0.529l-0.89,0l0,-0.361l1.238,0l0,1.237l-1.057,0l0,1.071l-1.237,0l0,-0.89l0.347,0l0,0.528l0.529,0l0,-0.528l-0.876,0l0,-0.348l1.056,0Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M40.468,155.809c0.008,0 0.015,-0.007 0.015,-0.015l0,-0.331c0,-0.009 -0.007,-0.016 -0.015,-0.016l-1.804,0c-0.008,0 -0.015,0.007 -0.015,0.016l0,0.331c0,0.008 0.007,0.015 0.015,0.015l1.804,0Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M68.32,127.148c-0.022,-0.022 -0.055,-0.027 -0.084,-0.015c-0.029,0.012 -0.047,0.041 -0.047,0.071l0,1.496c0,0.031 0.018,0.06 0.047,0.072c0.028,0.012 0.061,0.007 0.083,-0.014c0.217,-0.202 0.64,-0.597 0.797,-0.743c0.016,-0.015 0.025,-0.035 0.025,-0.057c0,-0.021 -0.009,-0.042 -0.024,-0.057l-0.797,-0.753Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M46.306,127.609c0.022,-0.022 0.028,-0.056 0.015,-0.084c-0.012,-0.029 -0.041,-0.047 -0.071,-0.047l-1.496,0c-0.031,0 -0.059,0.018 -0.071,0.046c-0.013,0.029 -0.007,0.062 0.014,0.084c0.201,0.217 0.596,0.64 0.742,0.797c0.015,0.016 0.035,0.025 0.057,0.025c0.021,0 0.042,-0.009 0.056,-0.024l0.754,-0.797Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M90.665,7.518c-0.022,0.022 -0.028,0.055 -0.015,0.084c0.012,0.029 0.041,0.047 0.071,0.047l1.497,0c0.03,0 0.058,-0.018 0.07,-0.047c0.013,-0.028 0.007,-0.061 -0.014,-0.083c-0.202,-0.217 -0.596,-0.64 -0.742,-0.797c-0.015,-0.016 -0.035,-0.025 -0.057,-0.025c-0.021,0 -0.042,0.009 -0.057,0.024l-0.753,0.797Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M78.018,6.906c0.022,-0.022 0.027,-0.055 0.015,-0.084c-0.012,-0.029 -0.041,-0.047 -0.071,-0.047l-1.496,0c-0.031,0 -0.059,0.018 -0.071,0.047c-0.013,0.028 -0.008,0.061 0.014,0.083c0.201,0.217 0.595,0.64 0.742,0.797c0.015,0.016 0.035,0.025 0.057,0.025c0.021,0 0.042,-0.009 0.057,-0.024l0.753,-0.797Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M25.535,7.518c-0.022,0.022 -0.027,0.055 -0.015,0.084c0.012,0.029 0.041,0.047 0.071,0.047l1.497,0c0.03,0 0.058,-0.018 0.07,-0.047c0.013,-0.028 0.008,-0.061 -0.014,-0.083c-0.201,-0.217 -0.595,-0.64 -0.742,-0.797c-0.015,-0.016 -0.035,-0.025 -0.057,-0.025c-0.021,0 -0.042,0.009 -0.057,0.024l-0.753,0.797Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M41.399,6.829c0.021,-0.023 0.027,-0.056 0.014,-0.084c-0.011,-0.029 -0.04,-0.047 -0.07,-0.047l-1.496,0c-0.032,0 -0.06,0.018 -0.071,0.046c-0.013,0.029 -0.008,0.062 0.013,0.084c0.202,0.217 0.596,0.64 0.743,0.797c0.015,0.016 0.035,0.025 0.057,0.025c0.021,0 0.042,-0.009 0.057,-0.025l0.753,-0.796Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M63.027,153.723c-0.022,-0.02 -0.054,-0.026 -0.081,-0.014c-0.028,0.011 -0.046,0.038 -0.046,0.068l0,1.895c0,0.03 0.018,0.057 0.046,0.069c0.027,0.012 0.059,0.006 0.08,-0.014l1.006,-0.94c0.015,-0.014 0.024,-0.034 0.024,-0.055c0.001,-0.021 -0.008,-0.04 -0.023,-0.055l-1.006,-0.954Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M39.401,153.858c0.016,-0.01 0.03,-0.016 0.048,-0.016l0.234,0c0.019,0 0.035,0.007 0.048,0.016l0.719,0.421c0.03,0.017 0.042,0.056 0.024,0.086c-0.033,0.057 -0.084,0.146 -0.118,0.203c-0.017,0.031 -0.056,0.041 -0.086,0.024l-0.524,-0.302l0,0.873c0,0.036 -0.028,0.064 -0.063,0.064l-0.234,0c-0.036,0 -0.064,-0.028 -0.064,-0.064l0,-0.875l-0.525,0.304c-0.03,0.017 -0.069,0.007 -0.086,-0.024c-0.033,-0.057 -0.084,-0.146 -0.118,-0.203c-0.017,-0.03 -0.007,-0.069 0.024,-0.086l0.721,-0.421Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M91.463,100.667l-0.675,-0.39c-0.031,-0.017 -0.07,-0.008 -0.087,0.023c-0.034,0.057 -0.085,0.146 -0.118,0.203c-0.018,0.03 -0.007,0.07 0.024,0.087l0.675,0.39l-0.675,0.39c-0.031,0.017 -0.042,0.057 -0.024,0.087c0.033,0.057 0.084,0.146 0.118,0.203c0.017,0.031 0.056,0.04 0.087,0.023l0.675,-0.39l0,0.78c0,0.036 0.028,0.064 0.064,0.064l0.234,0c0.035,0 0.064,-0.028 0.064,-0.064l0,-0.78l0.675,0.39c0.031,0.017 0.07,0.008 0.088,-0.023c0.032,-0.057 0.083,-0.146 0.116,-0.203c0.018,-0.03 0.008,-0.07 -0.023,-0.087l-0.676,-0.39l0.676,-0.39c0.031,-0.017 0.041,-0.057 0.023,-0.087c-0.033,-0.057 -0.084,-0.146 -0.116,-0.203c-0.018,-0.031 -0.057,-0.04 -0.088,-0.023l-0.675,0.39l0,-0.78c0,-0.036 -0.029,-0.064 -0.064,-0.064l-0.234,0c-0.036,0 -0.064,0.028 -0.064,0.064l0,0.78Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M22.502,128.758c0.023,0.022 0.056,0.028 0.084,0.015c0.029,-0.012 0.047,-0.041 0.047,-0.071l0,-1.496c0,-0.031 -0.018,-0.06 -0.046,-0.072c-0.029,-0.012 -0.062,-0.007 -0.084,0.014c-0.217,0.202 -0.64,0.597 -0.797,0.743c-0.016,0.015 -0.025,0.035 -0.025,0.057c0,0.021 0.009,0.042 0.025,0.057l0.796,0.753Z"
        />
        <path
          style={{ fill: strokeColor }}
          d="M44.698,80.279c-0.022,0.022 -0.028,0.055 -0.015,0.084c0.012,0.029 0.041,0.047 0.071,0.047l1.496,0c0.031,0 0.059,-0.018 0.071,-0.047c0.013,-0.028 0.007,-0.061 -0.014,-0.083c-0.202,-0.217 -0.596,-0.64 -0.742,-0.797c-0.015,-0.016 -0.035,-0.025 -0.057,-0.025c-0.021,0 -0.042,0.009 -0.057,0.024l-0.753,0.797Z"
        />
        <rect className="screen" ref={screenEdgeRef} x={19.902} y={14.481} width={69.283} height={51.962} opacity={0} />
      </svg>
    </div>
  )
}

export const M801Player: FC<{
  bus?: ConnectedBus
  fullView?: boolean
  WGLRendering?: boolean
}> = ({ bus, ...props }) => {
  return <SvgComponent {...props} strokeColor={style.themeColors.text.default} bus={bus} />
}
