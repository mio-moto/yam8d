import { css } from '@linaria/core'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { useSettingsContext } from './settings'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { M8KeyMask } from '../connection/keys'
import { M8Body } from '../rendering/M8Body'
import { style } from '../../app/style/style'
import { defaultKeyMap } from '../virtualKeyboard/useVirtualKeyboard'
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
type KeyMapValue = Record<string, number | string>

// Virtual keyboard note layout (indices match defaultKeyMap)
const VK_NOTES = [
    { index: 0, name: 'C', isBlack: false },
    { index: 1, name: 'C#', isBlack: true },
    { index: 2, name: 'D', isBlack: false },
    { index: 3, name: 'D#', isBlack: true },
    { index: 4, name: 'E', isBlack: false },
    { index: 5, name: 'F', isBlack: false },
    { index: 6, name: 'F#', isBlack: true },
    { index: 7, name: 'G', isBlack: false },
    { index: 8, name: 'G#', isBlack: true },
    { index: 9, name: 'A', isBlack: false },
    { index: 10, name: 'A#', isBlack: true },
    { index: 11, name: 'B', isBlack: false },
    { index: 12, name: "C'", isBlack: false },
    { index: 13, name: "C#'", isBlack: true },
    { index: 14, name: "D'", isBlack: false },
    { index: 15, name: "D#'", isBlack: true },
    { index: 16, name: "E'", isBlack: false },
    { index: 17, name: "F'", isBlack: false },
] as const

// Virtual keyboard controls with direction for layout placement
const VK_CONTROLS = [
    { value: 'octDown', label: 'Oct−', icon: '←', side: 'oct' },
    { value: 'octUp', label: 'Oct+', icon: '→', side: 'oct' },
    { value: 'velUp', label: 'Vel+', icon: '↑', side: 'vel' },
    { value: 'velDown', label: 'Vel−', icon: '↓', side: 'vel' },
] as const

type VKControlValue = (typeof VK_CONTROLS)[number]['value']

// VK colors - distinct from all M8 button colors
const VK_OCT_COLOR = 'var(--navy-primary)'
const VK_VEL_COLOR = '#e69a2e'

// ids defined in public/pianoForSetup.svg (C0 .. E1)
const SETUP_PIANO_NOTE_IDS = [
    'C0', 'C#0', 'D0', 'D#0', 'E0', 'F0', 'F#0', 'G0', 'G#0', 'A0', 'A#0', 'B0', 'C1', 'C#1', 'D1', 'D#1', 'E1',
] as const

// Format a key code to a short readable label
function formatKey(code: string | null): string {
    if (!code) return ''
    return code
        .replace('Key', '')
        .replace('Digit', '')
        .replace('BracketLeft', '[')
        .replace('BracketRight', ']')
        .replace('Semicolon', ';')
        .replace('Quote', "'")
        .replace('ArrowUp', '↑')
        .replace('ArrowDown', '↓')
        .replace('ArrowLeft', '←')
        .replace('ArrowRight', '→')
        .replace('Space', '␣')
        .replace('Minus', '−')
        .replace('Equal', '=')
}

// ─── Interactive piano SVG ────────────────────────────────────────────────────

interface PianoSVGProps {
    assignedKeys: Map<number, string>   // noteIndex → keyCode
    selectedNote: number | null
    pressedNote: number | null
    onNoteClick: (index: number) => void
}

const PianoSVG: FC<PianoSVGProps> = ({ assignedKeys, selectedNote, pressedNote, onNoteClick }) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement | null>(null)

    useEffect(() => {
        let cancelled = false
        const handlers: Array<{ el: Element; fn: EventListener }> = []

        const load = async () => {
            const host = containerRef.current
            if (!host) return

            const response = await fetch('pianoForSetup.svg')
            const svgText = await response.text()
            if (cancelled) return

            const parser = new DOMParser()
            const doc = parser.parseFromString(svgText, 'image/svg+xml')
            const svg = doc.documentElement as unknown as SVGSVGElement

            svg.classList.add('vk-setup-piano-svg')
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

            SETUP_PIANO_NOTE_IDS.forEach((id, index) => {
                const key = svg.getElementById(id)
                if (!key) return

                const note = VK_NOTES[index]
                key.classList.add('vk-setup-key')
                key.classList.add(note?.isBlack ? 'is-black' : 'is-white')
                key.setAttribute('data-note-index', String(index))

                const clickHandler: EventListener = (ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    onNoteClick(index)
                }

                key.addEventListener('click', clickHandler)
                handlers.push({ el: key, fn: clickHandler })
            })

            host.replaceChildren(svg)
            svgRef.current = svg
        }

        load()

        return () => {
            cancelled = true
            handlers.forEach(({ el, fn }) => {
                el.removeEventListener('click', fn)
            })
        }
    }, [onNoteClick])

    useEffect(() => {
        const svg = svgRef.current
        if (!svg) return

        SETUP_PIANO_NOTE_IDS.forEach((id, index) => {
            const key = svg.getElementById(id)
            if (!key) return

            const assignedKeyCode = assignedKeys.get(index) ?? null
            key.classList.toggle('note-mapped', assignedKeyCode !== null)
            key.classList.toggle('selected', selectedNote === index)
            key.classList.toggle('pressed', pressedNote === index)
            key.setAttribute('data-key-label', assignedKeyCode ? formatKey(assignedKeyCode) : '')
        })
    }, [assignedKeys, selectedNote, pressedNote])

    return <div ref={containerRef} className="vk-setup-piano" />
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    font-size: 14px;
    color: ${style.themeColors.text.default};
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    border-left: 2px solid ${style.themeColors.line.focus};
`

const mainPanelClass = css`
    display: flex;
    flex-direction: row;
    gap: 16px;
    align-items: stretch;
`

const keyboardColumnClass = css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    }
`

const keyboardContainerClass = css`
    flex: 0 0 auto;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 10px;
    border: 1px solid ${style.themeColors.text.default};
    overflow: auto;

    svg {
        max-width: 100%;
        height: auto;
    }
`

const vkSectionClass = css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
`

const vkHeaderClass = css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    opacity: 0.78;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;

    svg {
        width: 24px;
        height: auto;
        flex-shrink: 0;
        opacity: 0.45;
    }
`

const vkPianoRowClass = css`
    display: flex;
    align-items: stretch;
    gap: 8px;

    > div[style] {
        max-width: 520px;
    }

    @media (max-width: 1000px) {
        flex-direction: column;
    }
`

const vkBtnsColClass = css`
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex-shrink: 0;
`

const actionsClass = css`
    display: flex;
    gap: 12px;
    justify-content: flex-end;
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildReverseMap(inputMap: InputMapValue): Map<string, M8ButtonName> {
    const reverseMap = new Map<string, M8ButtonName>()
    for (const [keyCode, mask] of Object.entries(inputMap)) {
        if (keyCode.startsWith('Gamepad')) continue
        const button = M8_BUTTONS.find((b) => b.mask === mask)
        if (button) reverseMap.set(keyCode, button.name)
    }
    return reverseMap
}

function getVKCssClass(value: number | string): 'note-mapped' | 'oct-mapped' | 'vel-mapped' {
    if (typeof value === 'number') return 'note-mapped'
    if (value === 'octDown' || value === 'octUp') return 'oct-mapped'
    return 'vel-mapped'
}

function vkControlColor(side: 'oct' | 'vel'): string {
    return side === 'oct' ? VK_OCT_COLOR : VK_VEL_COLOR
}

// ─── Component ────────────────────────────────────────────────────────────────

export const KeyboardSettings: FC = () => {
    const { settings, updateSettingValue } = useSettingsContext()
    const [selectedButton, setSelectedButton] = useState<M8ButtonName | null>(null)
    const [localInputMap, setLocalInputMap] = useState<InputMapValue>(() => ({ ...settings.inputMap }))
    const [localKeyMap, setLocalKeyMap] = useState<KeyMapValue>(() => ({ ...settings.keyMap }))
    const [hasChanges, setHasChanges] = useState(false)
    const [pressedKey, setPressedKey] = useState<string | null>(null)
    const [selectedVKNote, setSelectedVKNote] = useState<number | null>(null)
    const [selectedVKControl, setSelectedVKControl] = useState<VKControlValue | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<HTMLDivElement>(null)
    const screenEdgeRef = useRef<SVGRectElement>(null)

    const reverseMap = buildReverseMap(localInputMap)

    const getVKControlKey = (ctrl: string): string | null => {
        for (const [k, v] of Object.entries(localKeyMap)) {
            if (v === ctrl) return k
        }
        return null
    }

    const pressedVKNote =
        pressedKey !== null && typeof localKeyMap[pressedKey] === 'number'
            ? (localKeyMap[pressedKey] as number)
            : null

    // Build a Map<noteIndex, keyCode> for the piano SVG
    const pianoAssignedKeys = new Map<number, string>()
    for (const [k, v] of Object.entries(localKeyMap)) {
        if (typeof v === 'number') pianoAssignedKeys.set(v, k)
    }

    useEffect(() => {
        if (!hasChanges) {
            setLocalInputMap({ ...settings.inputMap })
            setLocalKeyMap({ ...settings.keyMap })
        }
    }, [settings.inputMap, settings.keyMap, hasChanges])

    // Keyboard keydown: assign to whichever selection is active
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const keyCode = e.code
            if (e.repeat) return
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            if (selectedVKNote !== null) {
                const newMap: KeyMapValue = { ...localKeyMap }
                for (const [k, v] of Object.entries(newMap)) {
                    if (v === selectedVKNote) delete newMap[k]
                }
                newMap[keyCode] = selectedVKNote
                setLocalKeyMap(newMap)
                setHasChanges(true)
                setSelectedVKNote(null)
                return
            }

            if (selectedVKControl !== null) {
                const newMap: KeyMapValue = { ...localKeyMap }
                for (const [k, v] of Object.entries(newMap)) {
                    if (v === selectedVKControl) delete newMap[k]
                }
                newMap[keyCode] = selectedVKControl
                setLocalKeyMap(newMap)
                setHasChanges(true)
                setSelectedVKControl(null)
                return
            }

            if (selectedButton) {
                const btnInfo = M8_BUTTONS.find((b) => b.name === selectedButton)
                if (!btnInfo) return
                const newMap: InputMapValue = { ...localInputMap }
                newMap[keyCode] = btnInfo.mask
                setLocalInputMap(newMap)
                setHasChanges(true)
                setSelectedButton(null)
                return
            }

            setPressedKey(keyCode)
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
    }, [selectedButton, selectedVKNote, selectedVKControl, localInputMap, localKeyMap])

    // Apply CSS classes to the PC keyboard SVG keys
    useEffect(() => {
        const svgContainer = svgRef.current
        if (!svgContainer) return

        const keyElements = svgContainer.querySelectorAll('[data-code]')
        const clickHandlers = new Map<Element, (e: Event) => void>()

        const vkReverseMap = new Map<string, number | string>()
        for (const [k, v] of Object.entries(localKeyMap)) {
            vkReverseMap.set(k, v)
        }

        keyElements.forEach((el) => {
            const keyCode = el.getAttribute('data-code')
            if (!keyCode) return

            const buttonName = reverseMap.get(keyCode)
            const buttonInfo = buttonName ? M8_BUTTONS.find((b) => b.name === buttonName) : null
            const vkValue = vkReverseMap.get(keyCode)

            el.classList.remove(
                'opt', 'edit', 'shift', 'play', 'up', 'down', 'left', 'right',
                'has-mapping', 'pressed', 'note-mapped', 'oct-mapped', 'vel-mapped',
            )

            if (buttonInfo) {
                el.classList.add(buttonInfo.cssClass, 'has-mapping')
            } else if (vkValue !== undefined) {
                el.classList.add(getVKCssClass(vkValue), 'has-mapping')
            }

            if (pressedKey === keyCode) {
                el.classList.add('pressed')
            }

            ; (el as SVGElement).style.cursor = 'pointer'

            const handleClick = (e: Event) => {
                e.preventDefault()
                e.stopPropagation()

                // Unassign if nothing is selected and key has a VK mapping
                if (!selectedButton && !selectedVKNote && !selectedVKControl && vkValue !== undefined) {
                    const newMap: KeyMapValue = { ...localKeyMap }
                    delete newMap[keyCode]
                    setLocalKeyMap(newMap)
                    setHasChanges(true)
                    return
                }

                // Unassign if nothing selected and key has an M8 mapping
                if (!selectedButton && !selectedVKNote && !selectedVKControl && buttonInfo) {
                    const newMap: InputMapValue = { ...localInputMap }
                    delete newMap[keyCode]
                    setLocalInputMap(newMap)
                    setHasChanges(true)
                    return
                }

                // Assign VK note
                if (selectedVKNote !== null) {
                    const newMap: KeyMapValue = { ...localKeyMap }
                    for (const [k, v] of Object.entries(newMap)) {
                        if (v === selectedVKNote) delete newMap[k]
                    }
                    newMap[keyCode] = selectedVKNote
                    setLocalKeyMap(newMap)
                    setHasChanges(true)
                    setSelectedVKNote(null)
                    return
                }

                // Assign VK control
                if (selectedVKControl !== null) {
                    const newMap: KeyMapValue = { ...localKeyMap }
                    for (const [k, v] of Object.entries(newMap)) {
                        if (v === selectedVKControl) delete newMap[k]
                    }
                    newMap[keyCode] = selectedVKControl
                    setLocalKeyMap(newMap)
                    setHasChanges(true)
                    setSelectedVKControl(null)
                    return
                }

                // Assign M8 button
                if (selectedButton) {
                    const btnInfo = M8_BUTTONS.find((b) => b.name === selectedButton)
                    if (!btnInfo) return
                    const newMap: InputMapValue = { ...localInputMap }
                    newMap[keyCode] = btnInfo.mask
                    setLocalInputMap(newMap)
                    setHasChanges(true)
                    setSelectedButton(null)
                }
            }

            clickHandlers.set(el, handleClick)
            el.addEventListener('click', handleClick)
        })

        return () => {
            clickHandlers.forEach((handler, el) => {
                el.removeEventListener('click', handler)
            })
        }
    }, [reverseMap, selectedButton, selectedVKNote, selectedVKControl, localInputMap, localKeyMap, pressedKey])

    // M8 body button click — clears VK selections
    const handleM8ButtonClick = useCallback((button: Record<string, boolean>) => {
        const key = Object.entries(button).find(([, v]) => v)?.[0]
        if (!key) return
        const btn = M8_BUTTONS.find((b) => b.cssClass === key)
        if (!btn) return
        setSelectedVKNote(null)
        setSelectedVKControl(null)
        setSelectedButton((prev) => (prev === btn.name ? null : btn.name))
    }, [])

    // Piano key click — clears M8/control selections
    const handlePianoKeyClick = useCallback((noteIndex: number) => {
        setSelectedButton(null)
        setSelectedVKControl(null)
        setSelectedVKNote((prev) => (prev === noteIndex ? null : noteIndex))
    }, [])

    // VK control button click — clears M8/note selections
    const handleVKControlClick = useCallback((ctrl: VKControlValue) => {
        setSelectedButton(null)
        setSelectedVKNote(null)
        setSelectedVKControl((prev) => (prev === ctrl ? null : ctrl))
    }, [])

    const selectedMask = M8_BUTTONS.find((b) => b.name === selectedButton)?.mask ?? 0

    const handleSave = () => {
        updateSettingValue('inputMap', localInputMap as typeof defaultInputMap)
        updateSettingValue('keyMap', { ...localKeyMap } as typeof defaultKeyMap)
        setHasChanges(false)
    }

    const handleReset = () => {
        setLocalInputMap({ ...defaultInputMap })
        setLocalKeyMap({ ...defaultKeyMap })
        setHasChanges(true)
    }

    const handleClose = () => {
        containerRef.current?.closest('dialog')?.close()
    }

    // Instruction text based on active selection
    const instruction = (() => {
        if (selectedButton) {
            return `Press a key or click the keyboard to assign it to M8 "${selectedButton}"`
        }
        if (selectedVKNote !== null) {
            const note = VK_NOTES.find((n) => n.index === selectedVKNote)
            return `Press a key or click the keyboard to assign it to note "${note?.name}"`
        }
        if (selectedVKControl !== null) {
            const ctrl = VK_CONTROLS.find((c) => c.value === selectedVKControl)
            return `Press a key or click the keyboard to assign it to "${ctrl?.label}"`
        }
        return 'Click an M8 button or a piano note/control, then press or click a keyboard key to map it'
    })()

    const octControls = VK_CONTROLS.filter((c) => c.side === 'oct')
    const velControls = VK_CONTROLS.filter((c) => c.side === 'vel')

    return (
        <div ref={containerRef} className={containerClass}>
            <div className={headerClass}>
                <h3 style={{ margin: 0 }}>Keyboard Mapping</h3>
                <button className={closeButtonClass} onClick={handleClose} aria-label="Close">
                    ×
                </button>
            </div>

            <div className={instructionClass}>{instruction}</div>

            {/* M8 body + PC keyboard */}
            <div className={mainPanelClass}>
                <div className={m8PanelClass}>
                    <M8Body
                        model={2}
                        strokeColor={style.themeColors.text.default}
                        onClick={handleM8ButtonClick}
                        keysPressed={selectedMask}
                        screenEdgeRef={screenEdgeRef}
                    />
                </div>
                <div className={keyboardColumnClass}>
                    <div className={keyboardContainerClass} ref={svgRef}>
                        <img
                            src="keyboard-annotated.svg"
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
                                        svgElement.style.width = '100%'
                                        img.replaceWith(svgElement)
                                    })
                            }}
                        />
                    </div>

                    {/* Virtual keyboard section — below PC keyboard */}
                    <div className={vkSectionClass}>
                        <div className={vkHeaderClass}>
                            <img src="pianoForSetup.svg" alt="" style={{ width: '22px', opacity: 0.6 }} />
                            <span>Virtual Keyboard</span>
                        </div>

                        <div className={vkPianoRowClass}>
                            {/* Octave controls — left */}
                            <div className={vkBtnsColClass}>
                                {octControls.map((ctrl) => {
                                    const assignedKey = getVKControlKey(ctrl.value)
                                    const isSelected = selectedVKControl === ctrl.value
                                    const color = vkControlColor(ctrl.side)
                                    return (
                                        <button
                                            key={ctrl.value}
                                            onClick={() => handleVKControlClick(ctrl.value)}
                                            title={assignedKey ? `${ctrl.label} → ${formatKey(assignedKey)}` : ctrl.label}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '2px',
                                                padding: '5px 8px',
                                                minWidth: '50px',
                                                background: assignedKey
                                                    ? color
                                                    : isSelected
                                                        ? 'rgba(255,255,255,0.14)'
                                                        : 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${isSelected ? style.themeColors.line.focus : 'rgba(255,255,255,0.2)'}`,
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: style.themeColors.text.default,
                                                outline: isSelected ? `1px solid ${style.themeColors.line.focus}` : 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: '10px', fontWeight: 600 }}>{ctrl.label}</span>
                                            <span style={{ fontSize: '10px', opacity: 0.75 }}>{assignedKey ? formatKey(assignedKey) : '—'}</span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Interactive piano SVG */}
                            <div style={{ flex: 1 }}>
                                <PianoSVG
                                    assignedKeys={pianoAssignedKeys}
                                    selectedNote={selectedVKNote}
                                    pressedNote={pressedVKNote}
                                    onNoteClick={handlePianoKeyClick}
                                />
                            </div>

                            {/* Velocity controls — right */}
                            <div className={vkBtnsColClass}>
                                {velControls.map((ctrl) => {
                                    const assignedKey = getVKControlKey(ctrl.value)
                                    const isSelected = selectedVKControl === ctrl.value
                                    const color = vkControlColor(ctrl.side)
                                    return (
                                        <button
                                            key={ctrl.value}
                                            onClick={() => handleVKControlClick(ctrl.value)}
                                            title={assignedKey ? `${ctrl.label} → ${formatKey(assignedKey)}` : ctrl.label}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '2px',
                                                padding: '5px 8px',
                                                minWidth: '50px',
                                                background: assignedKey
                                                    ? color
                                                    : isSelected
                                                        ? 'rgba(255,255,255,0.14)'
                                                        : 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${isSelected ? style.themeColors.line.focus : 'rgba(255,255,255,0.2)'}`,
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: style.themeColors.text.default,
                                                outline: isSelected ? `1px solid ${style.themeColors.line.focus}` : 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: '10px', fontWeight: 600 }}>{ctrl.label}</span>
                                            <span style={{ fontSize: '10px', opacity: 0.75 }}>{assignedKey ? formatKey(assignedKey) : '—'}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
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



