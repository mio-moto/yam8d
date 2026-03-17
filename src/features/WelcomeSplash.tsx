import { css } from '@linaria/core'
import { type FC, useEffect, useRef } from 'react'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { style } from '../app/style/style'
import { Model01, Model02 } from './rendering/M8Body'
import { Manual } from './manual/Manual'

// --- Styles ------------------------------------------------------------------

const splashContainerClass = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  min-height: 100vh;
  width: 100%;
`

/** Holds both SVG bodies + screen overlay + connect button */
const bodyStackClass = css`
  position: relative;
  width: 280px;
  height: 393px;
  animation: bodyJitter 8s linear infinite;
  @keyframes bodyJitter {
    0%    { transform: translate(0, 0); }
    34%   { transform: translate(0, 0); }
    36%   { transform: translate(2px, -1px); }
    38%   { transform: translate(-1px, 2px); }
    40%   { transform: translate(3px, 0px); }
    42%   { transform: translate(-2px, -1px); }
    44%   { transform: translate(0, 0); }
    57%   { transform: translate(0, 0); }
    57.8% { transform: translate(-4px, 2px); }
    58.6% { transform: translate(4px, -3px); }
    59.4% { transform: translate(-3px, 1px); }
    60.2% { transform: translate(5px, -2px); }
    61%   { transform: translate(-4px, 3px); }
    61.8% { transform: translate(3px, -1px); }
    62.6% { transform: translate(-2px, 2px); }
    63.4% { transform: translate(2px, -2px); }
    65%   { transform: translate(0, 0); }
    70%   { transform: translate(-2px, 0px); }
    72%   { transform: translate(0, 0); }
    100%  { transform: translate(0, 0); }
  }
`

const modelWrapperBaseClass = css`
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
  & > svg {
    height: 100%;
    width: auto;
    display: block;
  }
`

const model2WrapperClass = css`
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
  & > svg {
    height: 100%;
    width: auto;
    display: block;
  }
  animation:
    glitchReveal 8s linear infinite,
    chromAberr 8s linear infinite;
  @keyframes glitchReveal {
    0%    { clip-path: none; opacity: 0; }
    12%   { clip-path: none; opacity: 0; }
    14%   { clip-path: inset(40% 0 55% 0); opacity: 1; }
    16%   { clip-path: none; opacity: 0; }
    32%   { clip-path: none; opacity: 0; }
    34%   { clip-path: inset(10% 0 80% 0); opacity: 1; }
    35.5% { clip-path: inset(70% 0 10% 0); opacity: 1; }
    37%   { clip-path: none; opacity: 0.3; }
    40%   { clip-path: inset(20% 0 60% 0); opacity: 1; }
    41.5% { clip-path: inset(55% 0 25% 0); opacity: 1; }
    43%   { clip-path: inset(5% 0 85% 0); opacity: 1; }
    44.5% { clip-path: none; opacity: 0.2; }
    47%   { clip-path: inset(30% 0 40% 0); opacity: 1; }
    48.5% { clip-path: none; opacity: 0; }
    57%   { clip-path: inset(0% 0 90% 0); opacity: 1; }
    57.8% { clip-path: inset(85% 0 5% 0); opacity: 1; }
    58.6% { clip-path: inset(40% 0 40% 0); opacity: 1; }
    59.4% { clip-path: inset(10% 0 70% 0); opacity: 1; }
    60.2% { clip-path: inset(60% 0 15% 0); opacity: 1; }
    61%   { clip-path: inset(25% 0 30% 0); opacity: 1; }
    61.8% { clip-path: inset(75% 0 0%  0); opacity: 1; }
    62.6% { clip-path: inset(0%  0 50% 0); opacity: 1; }
    63.4% { clip-path: inset(50% 0 25% 0); opacity: 1; }
    64.2% { clip-path: none; opacity: 1; }
    65%   { clip-path: none; opacity: 0; }
    70%   { clip-path: inset(20% 0 60% 0); opacity: 1; }
    71.5% { clip-path: none; opacity: 0; }
    75%   { clip-path: inset(60% 0 30% 0); opacity: 0.7; }
    76.5% { clip-path: none; opacity: 0; }
    85%   { clip-path: inset(45% 0 45% 0); opacity: 0.5; }
    86.5% { clip-path: none; opacity: 0; }
    100%  { clip-path: none; opacity: 0; }
  }
  @keyframes chromAberr {
    0%    { filter: none; transform: translateX(-50%); }
    33%   { filter: none; transform: translateX(-50%); }
    36%   { filter: hue-rotate(60deg) saturate(2); transform: translateX(calc(-50% + 3px)); }
    38%   { filter: hue-rotate(-40deg) saturate(1.5); transform: translateX(calc(-50% - 2px)); }
    42%   { filter: hue-rotate(90deg) saturate(2.5); transform: translateX(calc(-50% + 4px)); }
    44%   { filter: none; transform: translateX(-50%); }
    57%   { filter: none; transform: translateX(-50%); }
    57.8% { filter: hue-rotate(120deg) saturate(3) brightness(1.3); transform: translateX(calc(-50% - 5px)); }
    58.6% { filter: hue-rotate(180deg) saturate(3) brightness(1.2); transform: translateX(calc(-50% + 5px)); }
    59.4% { filter: hue-rotate(-90deg) saturate(2.5) brightness(1.4); transform: translateX(calc(-50% - 4px)); }
    60.2% { filter: hue-rotate(200deg) saturate(3) brightness(1.1); transform: translateX(calc(-50% + 3px)); }
    61%   { filter: hue-rotate(-120deg) saturate(2) brightness(1.3); transform: translateX(calc(-50% - 6px)); }
    62%   { filter: hue-rotate(90deg) saturate(2.5); transform: translateX(calc(-50% + 2px)); }
    64%   { filter: none; transform: translateX(-50%); }
    70%   { filter: hue-rotate(30deg) saturate(1.5); transform: translateX(calc(-50% + 2px)); }
    72%   { filter: none; transform: translateX(-50%); }
    100%  { filter: none; transform: translateX(-50%); }
  }
`

/**
 * Screen glow overlay — positioned to match Model02's screen rect
 * (x=11.676 y=10.896 w=115.218 h=78.829 in 139×195 viewBox → scaled to 280×393px container)
 * Left  ≈ 11.676/139 * 100 ≈ 8.4%
 * Top   ≈ 10.896/195 * 100 ≈ 5.6%
 * Width ≈ 115.218/139 * 100 ≈ 82.9%
 * Height≈ 78.829/195 * 100 ≈ 40.4%
 */
const screenGlowClass = css`
  position: absolute;
  left: 8.4%;
  top: 5.6%;
  width: 82.9%;
  height: 40.4%;
  border-radius: 3px;
  background: radial-gradient(
    ellipse at center,
    rgba(46, 197, 230, 0.45) 0%,
    rgba(46, 197, 230, 0.18) 60%,
    transparent 100%
  );
  pointer-events: none;
  animation: screenGlow 8s linear infinite;
  @keyframes screenGlow {
    0%    { opacity: 0.35; }
    12%   { opacity: 0.35; }
    14%   { opacity: 0.55; }
    16%   { opacity: 0.35; }
    33%   { opacity: 0.30; }
    50%   { opacity: 0.20; }
    57%   { opacity: 0.20; }
    62%   { opacity: 0.85; }
    65%   { opacity: 0.30; }
    75%   { opacity: 0.35; }
    100%  { opacity: 0.35; }
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: repeating-linear-gradient(
      180deg,
      transparent 0px,
      transparent 3px,
      rgba(0, 0, 0, 0.15) 3px,
      rgba(0, 0, 0, 0.15) 4px
    );
    pointer-events: none;
  }
`

/** Connect button centred over the M8 screen */
const connectOverlayClass = css`
  position: absolute;
  top: 25.8%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
`

const welcomeTextClass = css`
  text-align: center;
  max-width: 380px;
  color: ${style.themeColors.text.default};
  line-height: 1.65;
  font-size: 15px;
  margin: 0;
  & em {
    color: ${style.themeColors.text.important};
    font-style: normal;
  }
`

const manualRowClass = css`
  display: flex;
  justify-content: center;
`

// --- Component ---------------------------------------------------------------

export const WelcomeSplash: FC<{ onConnect: () => void }> = ({ onConnect }) => {
  const dummyRef1 = useRef<SVGRectElement>(null)
  const dummyRef2 = useRef<SVGRectElement>(null)
  const manualModalRef = useRef<HTMLDialogElement>(null)
  const noop = () => { }

  // Manual modal open/close
  const openManual = () => manualModalRef.current?.showModal()

  useEffect(() => {
    const modal = manualModalRef.current
    if (!modal) return
    const handleClick = (e: MouseEvent) => {
      if (e.target === modal) modal.close()
    }
    modal.addEventListener('click', handleClick as EventListener)
    return () => modal.removeEventListener('click', handleClick as EventListener)
  }, [])

  return (
    <div className={splashContainerClass}>
      <div className={bodyStackClass}>
        {/* Model 01 — base layer, always partially visible */}
        <div className={modelWrapperBaseClass}>
          <Model01
            strokeColor={style.themeColors.text.default}
            screenColor="transparent"
            onClick={noop}
            onMouseDown={noop}
            onMouseUp={noop}
            keysPressed={0}
            screenEdgeRef={dummyRef1}
          />
        </div>

        {/* Screen glow */}
        <div className={screenGlowClass} />

        {/* Model 02 — clips and glitches on top */}
        <div className={model2WrapperClass}>
          <Model02
            strokeColor={style.themeColors.text.important}
            screenColor="transparent"
            onClick={noop}
            onMouseDown={noop}
            onMouseUp={noop}
            keysPressed={0}
            screenEdgeRef={dummyRef2}
          />
        </div>

        {/* Connect button centred on the screen */}
        <div className={connectOverlayClass}>
          <Button onClick={onConnect}>Connect</Button>
        </div>
      </div>

      <p className={welcomeTextClass}>
        Welcome to <em>YAM8D</em>, the ultimate web display for your{' '}
        <em>Dirtywave M8</em>. Plug your M8 to your computer and click on{' '}
        <em>'Connect'</em>.
      </p>

      <div className={manualRowClass}>
        <Button onClick={openManual} style={{ fontSize: '13px', opacity: 0.7 }}>
          Manual
        </Button>
      </div>

      <Modal ref={manualModalRef}>
        <Manual />
      </Modal>
    </div>
  )
}
