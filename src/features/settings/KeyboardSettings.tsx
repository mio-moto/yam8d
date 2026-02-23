import { css } from '@linaria/core'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { useSettingsContext } from './settings'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { M8KeyMask } from '../connection/keys'
import { M8Body } from '../rendering/M8Body'
import { style } from '../../app/style/style'
import './keyboardSettings.css'

const M8_BUTTONS = [
    { name: 'Up', mask: M8KeyMask.Up, cssClass: 'up' },
    { name: 'Down', mask: M8KeyMask.Down, cssClass: 'down' },
    { name: 'Left', mask: M8KeyMask.Left, cssClass: 'left' },
    { name: 'Right', mask: M8KeyMask.Right, cssClass: 'right' },
    { name: 'Shift', mask: M8KeyMask.Shift, cssClass: 'shift' },
    { name: 'Play', mask: M8KeyMask.Play, cssClass: 'play' },
    { name: 'Opt', mask: M8KeyMask.Opt, cssClass: 'opt' },
    { name: 'Edit', mask: M8KeyMask.Edit, cssClass: 'edit' },
] as const

type M8ButtonName = (typeof M8_BUTTONS)[number]['name']
type InputMapValue = Record<string, number>

const containerClass = css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: ${style.themeColors.background.default};
    color: ${style.themeColors.text.default};
    min-width: 700px;
    max-width: 90vw;
    max-height: 90vh;
    overflow: auto;
`

const headerClass = css`
    display: flex;
    justify-content: space-between;
    align-items: center;
`

const closeButtonClass = css`
    background: transparent;
    border: none;
    color: ${style.themeColors.text.default};
    font-size: 24px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
    opacity: 0.7;

    &:hover {
        opacity: 1;
    }
`

const instructionClass = css`
    font-size: 18px;
    color: ${style.themeColors.text.default};
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    border-left: 3px solid ${style.themeColors.line.focus};
`

const mainPanelClass = css`
    display: flex;
    flex-direction: row;
    gap: 16px;
    align-items: flex-start;
`

const m8PanelClass = css`
    flex-shrink: 0;
    width: 420px;

    svg {
        stroke-width: 0.4px !important;
        
        .button {
            fill: ${style.themeColors.text.disabled};
            fill-opacity: 0.15;
            transition: 0.2s ease fill-opacity;
            cursor: pointer;
            pointer-events: all;

            &:hover {
                fill-opacity: 0.4;
            }
            &.press {
                fill-opacity: 1;
                transition: none;
            }
        }
        .button-outline {
            opacity: 0.15;
        }
        .logo {
            //opacity: 0;
        }
        .screen-background {
            //opacity: 0;
        }
    }
`

const keyboardContainerClass = css`
    flex: 1;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 16px;
    border: 1px solid ${style.themeColors.text.default};
    overflow: auto;

    svg {
        max-width: 100%;
        height: auto;
    }
`

const actionsClass = css`
    display: flex;
    gap: 12px;
    justify-content: flex-end;
`

function buildReverseMap(inputMap: InputMapValue): Map<string, M8ButtonName> {
    const reverseMap = new Map<string, M8ButtonName>()
    for (const [keyCode, mask] of Object.entries(inputMap)) {
        if (keyCode.startsWith('Gamepad')) continue
        const button = M8_BUTTONS.find((b) => b.mask === mask)
        if (button) {
            reverseMap.set(keyCode, button.name)
        }
    }
    return reverseMap
}

export const KeyboardSettings: FC = () => {
    const { settings, updateSettingValue } = useSettingsContext()
    const [selectedButton, setSelectedButton] = useState<M8ButtonName | null>(null)
    const [localInputMap, setLocalInputMap] = useState<InputMapValue>(() => ({ ...settings.inputMap }))
    const [hasChanges, setHasChanges] = useState(false)
    const [pressedKey, setPressedKey] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<HTMLDivElement>(null)
    const screenEdgeRef = useRef<SVGRectElement>(null)

    const reverseMap = buildReverseMap(localInputMap)

    useEffect(() => {
        if (!hasChanges) {
            setLocalInputMap({ ...settings.inputMap })
        }
    }, [settings.inputMap, hasChanges])

    // Handle keyboard keydown - map to M8 button or show visual feedback
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const keyCode = e.code

            // Ignore if target is an input element
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return
            }

            // If no M8 button is selected, show visual feedback (white) for the pressed key
            if (!selectedButton) {
                setPressedKey(keyCode)
                return
            }

            // M8 button is selected - assign this key to it
            const btnInfo = M8_BUTTONS.find((b) => b.name === selectedButton)
            if (!btnInfo) return

            const newMap: InputMapValue = { ...localInputMap }
            newMap[keyCode] = btnInfo.mask
            setLocalInputMap(newMap)
            setHasChanges(true)
            setSelectedButton(null)
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            setPressedKey((prev) => (prev === e.code ? null : prev))
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [selectedButton, localInputMap])

    // Apply CSS classes (opt, edit, shift, play, up, down, left, right) to keyboard SVG keys
    useEffect(() => {
        const svgContainer = svgRef.current
        if (!svgContainer) return

        const keyElements = svgContainer.querySelectorAll('[data-code]')
        const clickHandlers = new Map<Element, (e: Event) => void>()

        keyElements.forEach((el) => {
            const keyCode = el.getAttribute('data-code')
            if (!keyCode) return

            const buttonName = reverseMap.get(keyCode)
            const buttonInfo = buttonName ? M8_BUTTONS.find((b) => b.name === buttonName) : null

            // Replace inline colors with the same CSS classes used by M8Body buttons
            el.classList.remove('opt', 'edit', 'shift', 'play', 'up', 'down', 'left', 'right', 'has-mapping', 'pressed')
            if (buttonInfo) {
                el.classList.add(buttonInfo.cssClass)
                el.classList.add('has-mapping')
            }

            // Add pressed class for visual feedback
            if (pressedKey === keyCode) {
                el.classList.add('pressed')
            }

            ; (el as SVGElement).style.cursor = 'pointer'

            const handleClick = (e: Event) => {
                e.preventDefault()
                e.stopPropagation()

                // If key already has a mapping, unassign it
                if (buttonInfo && localInputMap[keyCode]) {
                    const newMap: InputMapValue = { ...localInputMap }
                    delete newMap[keyCode]
                    setLocalInputMap(newMap)
                    setHasChanges(true)
                    return
                }

                // Otherwise, assign to selected M8 button
                if (!selectedButton) return

                const btnInfo = M8_BUTTONS.find((b) => b.name === selectedButton)
                if (!btnInfo) return

                const newMap: InputMapValue = { ...localInputMap }
                newMap[keyCode] = btnInfo.mask
                setLocalInputMap(newMap)
                setHasChanges(true)
                setSelectedButton(null)
            }

            clickHandlers.set(el, handleClick)
            el.addEventListener('click', handleClick)
        })

        return () => {
            clickHandlers.forEach((handler, el) => {
                el.removeEventListener('click', handler)
            })
        }
    }, [reverseMap, selectedButton, localInputMap, pressedKey])

    // Toggle selection: click same button again to deselect
    const handleM8ButtonClick = useCallback((button: Record<string, boolean>) => {
        const key = Object.entries(button).find(([, v]) => v)?.[0]
        if (!key) return
        const btn = M8_BUTTONS.find((b) => b.cssClass === key)
        if (!btn) return
        setSelectedButton((prev) => (prev === btn.name ? null : btn.name))
    }, [])

    const selectedMask = M8_BUTTONS.find((b) => b.name === selectedButton)?.mask ?? 0

    const handleSave = () => {
        updateSettingValue('inputMap', localInputMap as typeof defaultInputMap)
        setHasChanges(false)
    }

    const handleReset = () => {
        setLocalInputMap({ ...defaultInputMap })
        setHasChanges(true)
    }

    const handleClose = () => {
        containerRef.current?.closest('dialog')?.close()
    }

    return (
        <div ref={containerRef} className={containerClass}>
            <div className={headerClass}>
                <h3 style={{ margin: 0 }}>Keyboard Mapping</h3>
                <button className={closeButtonClass} onClick={handleClose} aria-label="Close">
                    ×
                </button>
            </div>

            <div className={instructionClass}>
                {selectedButton
                    ? `Click a keyboard key to assign it to "${selectedButton}"`
                    : 'Click an M8 button to select it, then click a keyboard key to map it'}
            </div>

            <div className={mainPanelClass}>
                {/* M8Body for button selection — same visual as the main player */}
                <div className={m8PanelClass}>
                    <M8Body
                        model={2}
                        strokeColor={style.themeColors.text.default}
                        onClick={handleM8ButtonClick}
                        keysPressed={selectedMask}
                        screenEdgeRef={screenEdgeRef}
                    />
                </div>

                {/* Keyboard SVG — keys colored with the same CSS classes as M8Body buttons */}
                <div className={keyboardContainerClass} ref={svgRef}>
                    <img
                        src="/keyboard-annotated.svg"
                        alt="Keyboard"
                        style={{ width: '100%', maxWidth: '1000px' }}
                        onLoad={(e) => {
                            const img = e.target as HTMLImageElement
                            fetch(img.src)
                                .then((r) => r.text())
                                .then((svgContent) => {
                                    const parser = new DOMParser()
                                    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml')
                                    const svgElement = svgDoc.documentElement
                                    svgElement.style.maxWidth = '100%'
                                    svgElement.style.height = 'auto'
                                    img.replaceWith(svgElement)
                                })
                        }}
                    />
                </div>
            </div>

            <div className={actionsClass}>
                <Button onClick={handleReset}>Reset to Defaults</Button>
                <Button selected={hasChanges} onClick={handleSave} disabled={!hasChanges}>
                    Save
                </Button>
            </div>
        </div>
    )
}
