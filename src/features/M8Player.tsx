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
  const screenEdgeRef = useRef<SVGPathElement | null>(null)

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
  }, [bus, buttonOpt, buttonEdit, buttonPlay, buttonUp, buttonRight, buttonShift, buttonLeft, buttonDown])

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
        xmlns="http://www.w3.org/2000/svg"
        xmlSpace="preserve"
        style={{
          fillRule: 'evenodd',
          clipRule: 'evenodd',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeMiterlimit: 10,
        }}
        viewBox="0 0 139 195"
        {...props}
      >
        <path
          d="M134.858 1a2.6 2.6 0 0 1 2.599 2.6v187.122a2.599 2.599 0 0 1-2.599 2.599H3.6a2.598 2.598 0 0 1-2.6-2.599V3.6A2.6 2.6 0 0 1 3.6 1h131.258Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          d="M28.243 165.56a.82.82 0 0 0-.82-.819H12.526a.818.818 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.897a.821.821 0 0 0 .82-.819v-.001ZM28.243 168.815a.82.82 0 0 0-.82-.819H12.526a.818.818 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.897a.821.821 0 0 0 .82-.819v-.001ZM28.243 172.092a.82.82 0 0 0-.82-.819H12.526a.821.821 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.897a.821.821 0 0 0 .82-.819v-.001ZM28.243 175.397a.82.82 0 0 0-.82-.819H12.526a.821.821 0 0 0-.819.819c0 .452.367.82.819.82h14.897a.821.821 0 0 0 .82-.82ZM28.243 178.677a.82.82 0 0 0-.82-.819H12.526a.821.821 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.897a.821.821 0 0 0 .82-.819v-.001ZM28.243 181.924a.82.82 0 0 0-.82-.819H12.526a.818.818 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.897a.821.821 0 0 0 .82-.819v-.001ZM126.94 165.56a.82.82 0 0 0-.819-.819h-14.898a.818.818 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.898a.822.822 0 0 0 .819-.819v-.001ZM126.94 168.815a.82.82 0 0 0-.819-.819h-14.898a.818.818 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.898a.822.822 0 0 0 .819-.819v-.001ZM126.94 172.092a.82.82 0 0 0-.819-.819h-14.898a.821.821 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.898a.822.822 0 0 0 .819-.819v-.001ZM126.94 175.397a.82.82 0 0 0-.819-.819h-14.898a.821.821 0 0 0-.819.819c0 .452.367.82.819.82h14.898a.822.822 0 0 0 .819-.82ZM126.94 178.677a.82.82 0 0 0-.819-.819h-14.898a.821.821 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.898a.822.822 0 0 0 .819-.819v-.001ZM126.94 181.924a.82.82 0 0 0-.819-.819h-14.898a.818.818 0 0 0-.819.819v.001a.82.82 0 0 0 .819.819h14.898a.822.822 0 0 0 .819-.819v-.001Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <circle
          cx={12.569}
          cy={97.115}
          r={0.894}
          style={{
            fill: 'none',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button-outline"
          d="M36.881 127.974a1.596 1.596 0 0 0 1.596-1.597v-21.319a2.404 2.404 0 0 1 2.404-2.404h23.067a2.404 2.404 0 0 1 2.404 2.404v21.319c0 .424.168.83.468 1.129.299.3.705.468 1.129.468h22.833a2.404 2.404 0 0 1 2.404 2.404v21.657a2.404 2.404 0 0 1-2.404 2.404H14.079a2.404 2.404 0 0 1-2.404-2.404v-21.657a2.404 2.404 0 0 1 2.404-2.404h22.802Zm90.012-29.675v21.511a2.424 2.424 0 0 1-2.425 2.425H74.641a2.423 2.423 0 0 1-2.425-2.425V98.299a2.424 2.424 0 0 1 2.425-2.425h49.827a2.425 2.425 0 0 1 2.425 2.425Zm-33.724 64.182v21.511a2.423 2.423 0 0 1-2.425 2.425H40.917a2.424 2.424 0 0 1-2.425-2.425v-21.511a2.425 2.425 0 0 1 2.425-2.425h49.827a2.424 2.424 0 0 1 2.425 2.425Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="screen-background"
          d="M126.894 13.008a2.112 2.112 0 0 0-2.112-2.112H13.788a2.112 2.112 0 0 0-2.112 2.112v74.605a2.114 2.114 0 0 0 2.112 2.112h110.994a2.11 2.11 0 0 0 2.112-2.112V13.008Z"
          style={{
            fill: '#000',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="logo"
          d="M19.938 107.676v1.363a.071.071 0 0 1-.072.071h-4.251a.07.07 0 0 1-.051-.021l-.759-.759a.074.074 0 0 1-.021-.051v-2.76c0-.039.031-.072.071-.072h2.855c.02 0 .037.009.051.021l2.156 2.157a.074.074 0 0 1 .021.051M24.798 106.278v2.76a.071.071 0 0 1-.071.072h-.517a.078.078 0 0 1-.051-.021l-1.422-1.423a.07.07 0 0 0-.05-.021h-.169c-.004 0-.009.004-.009.007v1.385a.071.071 0 0 1-.071.072h-.566a.078.078 0 0 1-.051-.021l-2.817-2.819a.074.074 0 0 1-.021-.051v-.701c0-.039.032-.071.071-.071h4.914c.02 0 .037.007.05.021l.76.761a.069.069 0 0 1 .021.049M19.323 112.452c.112 0 .163-.056.163-.163v-2.39c0-.107-.051-.163-.163-.163h-.59c-.119 0-.175.053-.227.127l-1.366 2.059h-.009l-1.362-2.059c-.051-.075-.108-.127-.227-.127h-.593c-.112 0-.168.056-.168.163v2.39c0 .107.056.163.168.163h.243c.112 0 .163-.056.163-.163v-2.043h.009l1.378 2.079c.051.076.107.127.227.127h.315c.123 0 .179-.051.23-.127l1.374-2.079h.007v2.043c0 .107.056.163.168.163h.259ZM20.736 112.452h3.342c.478 0 .721-.235.721-.713 0-.354-.172-.577-.53-.661.39-.06.521-.315.521-.645 0-.471-.227-.697-.78-.697h-3.207c-.542 0-.781.227-.781.697 0 .33.18.645.522.645-.358.083-.53.306-.53.661 0 .478.243.713.721.713m3.17-.458h-2.998c-.228 0-.34-.107-.34-.333 0-.232.127-.347.435-.347h2.807c.306 0 .434.115.434.347 0 .227-.112.333-.338.333m-.004-1.799c.227 0 .335.108.335.331 0 .218-.124.33-.418.33h-2.824c-.294 0-.418-.112-.418-.33 0-.223.108-.331.335-.331h2.991Z"
          style={{
            fillRule: 'nonzero',
            fill: strokeColor,
          }}
        />
        <path
          d="M44.996 189.527h1.472M45.732 188.056v1.47M44.996 188.527l.735-.472.735.472M73.085 188.056l.735.742-.735.731M79.411 156.166l.735.742-.735.731M23.942 156.166l-.735.742.735.731M51.873 100.823l.74-.735.731.735M51.841 156.282l.742.735.731-.735M107.406 124.281v1.472M106.671 124.592l1.472.849M106.671 125.442l1.472-.849"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.23px',
          }}
        />
        <path
          d="M79.686 124.271h.735v.734h-.735zM78.95 125.006h.735v.734h-.735z"
          style={{
            fill: 'none',
            stroke: strokeColor,
            strokeWidth: '.23px',
          }}
        />
        <path
          className="screen"
          d="M84.73 125.595c.374 0 .566-.192.566-.566 0-.374-.192-.566-.566-.566h-.53c-.374 0-.568.192-.568.566 0 .374.194.566.568.566h.53Zm-.527-.042c-.346 0-.52-.178-.52-.525 0-.348.174-.526.52-.526h.523c.346 0 .521.178.521.526 0 .347-.175.525-.521.525h-.523ZM87.075 125.173c.234 0 .355-.12.355-.355 0-.234-.121-.355-.355-.355h-1.18c-.007 0-.015.005-.015.013v1.106c0 .009.007.013.015.013h.021c.007 0 .012-.005.012-.013v-.408h1.147Zm-.004-.669c.208 0 .309.105.309.314 0 .207-.101.314-.309.314h-1.144v-.628h1.144ZM88.693 125.595c.009 0 .013-.005.013-.013v-1.079h.756c.009 0 .013-.005.013-.012v-.016c0-.007-.005-.012-.013-.012h-1.559c-.009 0-.013.005-.013.012v.016c0 .007.005.012.013.012h.755v1.079c0 .009.006.013.015.013h.02ZM78.233 188.96c.234 0 .355-.12.355-.355 0-.234-.121-.355-.355-.355h-1.18c-.009 0-.015.005-.015.013v1.106c0 .009.006.013.015.013h.02c.009 0 .013-.005.013-.013v-.408h1.147Zm-.004-.669c.207 0 .309.105.309.314 0 .207-.102.314-.309.314h-1.144v-.628h1.144ZM80.546 189.382c.007 0 .012-.005.012-.013v-.015c0-.009-.005-.013-.012-.013h-1.362v-1.079a.012.012 0 0 0-.012-.012h-.021c-.009 0-.015.005-.015.012v1.107c0 .009.006.013.015.013h1.395ZM82.774 189.382c.007 0 .011-.005.011-.01 0-.004-.002-.007-.006-.012l-.858-1.101c-.007-.009-.011-.01-.023-.01h-.023c-.013 0-.017.001-.023.01l-.859 1.101a.02.02 0 0 0-.005.012c0 .005.004.01.01.01h.018c.013 0 .018-.001.025-.01l.224-.289h1.238l.226.289c.007.009.012.01.026.01h.021Zm-.305-.341H81.3v-.004l.582-.748h.004l.583.748v.004ZM83.697 189.382c.009 0 .013-.005.013-.013v-.449l.809-.653.002-.007c0-.005-.002-.01-.01-.01h-.023c-.016 0-.021.001-.033.011l-.767.618-.766-.618c-.011-.01-.017-.011-.033-.011h-.027c-.006 0-.01.002-.01.007 0 .004 0 .007.004.01l.805.652v.45c0 .009.007.013.015.013h.021ZM51.002 189.382c.245 0 .371-.107.371-.319 0-.183-.093-.278-.276-.278h-.994c-.148 0-.221-.076-.221-.224 0-.178.103-.271.314-.271h1.113c.009 0 .013-.005.013-.012v-.016c0-.007-.005-.012-.013-.012h-1.117c-.238 0-.36.105-.36.311 0 .177.092.266.267.266h.995c.153 0 .228.082.228.237 0 .184-.107.277-.324.277h-1.153c-.009 0-.013.005-.013.013v.015c0 .009.005.013.013.013h1.156ZM53.532 189.382c.007 0 .012-.005.012-.013v-1.107a.012.012 0 0 0-.012-.012h-.021c-.009 0-.015.005-.015.012v.523h-1.489v-.523a.012.012 0 0 0-.012-.012h-.021c-.007 0-.015.005-.015.012v1.107c0 .009.007.013.015.013h.021c.007 0 .012-.005.012-.013v-.542h1.489v.542c0 .009.006.013.015.013h.021ZM54.218 189.382c.009 0 .013-.005.013-.013v-1.107c0-.007-.005-.012-.013-.012h-.02c-.009 0-.015.005-.015.012v1.107c0 .009.006.013.015.013h.02ZM56.094 188.845c.009 0 .013-.005.013-.013v-.015c0-.009-.005-.013-.013-.013h-1.177v-.514h1.392c.009 0 .013-.005.013-.013v-.015c0-.009-.005-.013-.013-.013h-1.426c-.009 0-.015.005-.015.013v1.107c0 .009.006.013.015.013h.02c.009 0 .013-.005.013-.013v-.523h1.177ZM57.554 189.382c.009 0 .013-.005.013-.013v-1.079h.756c.009 0 .013-.005.013-.012v-.016c0-.007-.005-.012-.013-.012h-1.559a.012.012 0 0 0-.012.012v.016c0 .007.005.012.012.012h.755v1.079c0 .009.006.013.015.013h.02ZM112.872 125.595c.009 0 .013-.005.013-.013v-.015c0-.009-.005-.013-.013-.013h-1.43v-.514h1.215a.013.013 0 0 0 .013-.013v-.015c0-.009-.006-.013-.013-.013h-1.215v-.495h1.43c.009 0 .013-.005.013-.012v-.016c0-.007-.005-.012-.013-.012h-1.464c-.009 0-.016.005-.016.012v1.107c0 .009.007.013.016.013h1.464ZM114.497 125.595c.374 0 .566-.192.566-.566 0-.374-.192-.566-.566-.566h-1.014c-.009 0-.015.005-.015.012v1.107c0 .009.006.013.015.013h1.014Zm-.004-1.092c.346 0 .52.178.52.526 0 .348-.175.525-.52.525h-.977v-1.051h.977ZM115.681 125.595c.009 0 .013-.005.013-.013v-1.107c0-.007-.005-.012-.013-.012h-.02c-.009 0-.015.005-.015.012v1.107c0 .009.006.013.015.013h.02ZM117.031 125.595c.009 0 .013-.005.013-.013v-1.079h.756a.012.012 0 0 0 .012-.012v-.016a.012.012 0 0 0-.012-.012h-1.559c-.009 0-.013.005-.013.012v.016c0 .007.005.012.013.012h.754v1.079c0 .009.007.013.016.013h.02Z"
          style={{
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.23px',
            strokeLinecap: 'butt',
          }}
        />
        <path
          className="button up"
          ref={setButtonUp}
          onClick={() => onClick({ up: true })}
          d="M65.542 106.196v19.372a2.596 2.596 0 0 1-2.596 2.596H42.068a2.595 2.595 0 0 1-2.595-2.596v-19.372a2.595 2.595 0 0 1 2.595-2.596h20.878a2.596 2.596 0 0 1 2.596 2.596Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button down"
          ref={setButtonDown}
          onClick={() => onClick({ down: true })}
          d="M65.466 131.516v19.374a2.596 2.596 0 0 1-2.596 2.596H41.992a2.596 2.596 0 0 1-2.596-2.596v-19.374a2.596 2.596 0 0 1 2.596-2.596H62.87a2.596 2.596 0 0 1 2.596 2.596Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button left"
          ref={setButtonLeft}
          onClick={() => onClick({ left: true })}
          d="M38.632 131.516v19.374a2.596 2.596 0 0 1-2.596 2.596H15.158a2.596 2.596 0 0 1-2.596-2.596v-19.374a2.596 2.596 0 0 1 2.596-2.596h20.878a2.596 2.596 0 0 1 2.596 2.596Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button right"
          ref={setButtonRight}
          onClick={() => onClick({ right: true })}
          d="M92.296 131.516v19.374a2.596 2.596 0 0 1-2.596 2.596H68.822a2.596 2.596 0 0 1-2.596-2.596v-19.374a2.596 2.596 0 0 1 2.596-2.596H89.7a2.596 2.596 0 0 1 2.596 2.596Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button opt"
          ref={setButtonOpt}
          onClick={() => onClick({ opt: true })}
          d="M99.178 99.416v19.374a2.596 2.596 0 0 1-2.596 2.596H75.704a2.596 2.596 0 0 1-2.596-2.596V99.416a2.595 2.595 0 0 1 2.596-2.595h20.878a2.595 2.595 0 0 1 2.596 2.595Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button edit"
          ref={setButtonEdit}
          onClick={() => onClick({ edit: true })}
          d="M126.009 99.416v19.374a2.596 2.596 0 0 1-2.596 2.596h-20.878a2.596 2.596 0 0 1-2.596-2.596V99.416a2.595 2.595 0 0 1 2.596-2.595h20.878a2.595 2.595 0 0 1 2.596 2.595Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button shift"
          ref={setButtonShift}
          onClick={() => onClick({ shift: true })}
          d="M65.466 163.551v19.374a2.595 2.595 0 0 1-2.596 2.595H41.992a2.595 2.595 0 0 1-2.596-2.595v-19.374a2.596 2.596 0 0 1 2.596-2.596H62.87a2.596 2.596 0 0 1 2.596 2.596Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="button play"
          ref={setButtonPlay}
          onClick={() => onClick({ play: true })}
          d="M92.296 163.551v19.374a2.595 2.595 0 0 1-2.596 2.595H68.822a2.595 2.595 0 0 1-2.596-2.595v-19.374a2.596 2.596 0 0 1 2.596-2.596H89.7a2.596 2.596 0 0 1 2.596 2.596Z"
          style={{
            fill: 'none',
            fillRule: 'nonzero',
            stroke: strokeColor,
            strokeWidth: '.3px',
          }}
        />
        <path
          className="screen"
          ref={screenEdgeRef}
          d="M11.996 12.103h115.2v76.8h-115.2z"
          style={{
            fill: '#ebebeb',
            fillOpacity: 0,
          }}
        />
      </svg>
    </div>
  )
}

export const M8Player: FC<{
  bus?: ConnectedBus
  fullView?: boolean
}> = ({ bus, ...props }) => {
  return <SvgComponent {...props} strokeColor={style.themeColors.text.default} bus={bus} />
}
