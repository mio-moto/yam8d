import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Modal } from '../../components/Modal'
import { useSettingsContext } from './settings'
import { KeyboardSettings } from './KeyboardSettings'
import { Manual } from '../manual/Manual'
import './menu.css'

export const Menu: FC = () => {
    const { settings, updateSettingValue } = useSettingsContext()
    const [opened, setOpened] = useState(false)
    const [hostDraft, setHostDraft] = useState(settings.shortcutsHost)
    const [tutorHostDraft, setTutorHostDraft] = useState(settings.tutorGameHost)
    const [keyboardSettingsOpen, setKeyboardSettingsOpen] = useState(false)
    const [manualOpen, setManualOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const hitboxRef = useRef<HTMLDivElement | null>(null)
    const keyboardModalRef = useRef<HTMLDialogElement | null>(null)
    const manualModalRef = useRef<HTMLDialogElement | null>(null)
    // Mark menu open on document body for global hooks to detect
    useEffect(() => {
        document.body.dataset.m8MenuOpen = opened ? 'true' : 'false'
        return () => {
            delete document.body.dataset.m8MenuOpen
        }
    }, [opened])

    // Keep local draft in sync if setting changes elsewhere
    useEffect(() => {
        setHostDraft(settings.shortcutsHost)
    }, [settings.shortcutsHost])

    useEffect(() => {
        setTutorHostDraft(settings.tutorGameHost)
    }, [settings.tutorGameHost])

    // Debounce persisting the host to settings
    useEffect(() => {
        const id = setTimeout(() => {
            if (hostDraft !== settings.shortcutsHost) {
                updateSettingValue('shortcutsHost', hostDraft)
            }
        }, 400)
        return () => clearTimeout(id)
    }, [hostDraft, settings.shortcutsHost, updateSettingValue])

    useEffect(() => {
        const id = setTimeout(() => {
            if (tutorHostDraft !== settings.tutorGameHost) {
                updateSettingValue('tutorGameHost', tutorHostDraft)
            }
        }, 400)
        return () => clearTimeout(id)
    }, [tutorHostDraft, settings.tutorGameHost, updateSettingValue])

    // Close menu when clicking anywhere outside the menu or the toggle hitbox
    useEffect(() => {
        if (!opened) return
        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null
            if (!target) return
            // If click is inside the menu or the hitbox, ignore
            if (menuRef.current?.contains(target) || hitboxRef.current?.contains(target)) {
                return
            }
            e.stopImmediatePropagation()
            e.preventDefault()
            setOpened(false)
        }
        // Use capture to ensure we catch the event early across the page
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true)
        }
    }, [opened])

    // Handle keyboard settings modal
    useEffect(() => {
        const modal = keyboardModalRef.current
        if (!modal) return

        const handleClose = () => setKeyboardSettingsOpen(false)
        const handleClick = (e: MouseEvent) => {
            // Close when clicking on backdrop
            if (e.target === modal) {
                setKeyboardSettingsOpen(false)
            }
        }

        modal.addEventListener('close', handleClose)
        modal.addEventListener('click', handleClick as EventListener)

        if (keyboardSettingsOpen) {
            modal.showModal()
        } else {
            modal.close()
        }

        return () => {
            modal.removeEventListener('close', handleClose)
            modal.removeEventListener('click', handleClick as EventListener)
        }
    }, [keyboardSettingsOpen])

    // Handle manual modal
    useEffect(() => {
        const modal = manualModalRef.current
        if (!modal) return

        const handleClose = () => setManualOpen(false)
        const handleClick = (e: MouseEvent) => {
            // Close when clicking on backdrop
            if (e.target === modal) {
                setManualOpen(false)
            }
        }

        modal.addEventListener('close', handleClose)
        modal.addEventListener('click', handleClick as EventListener)

        if (manualOpen) {
            modal.showModal()
        } else {
            modal.close()
        }

        return () => {
            modal.removeEventListener('close', handleClose)
            modal.removeEventListener('click', handleClick as EventListener)
        }
    }, [manualOpen])

    return (
        <>
            <div
                className="menu-hitbox"
                ref={hitboxRef}
                onClick={() => setOpened((o) => !o)}
                aria-label="Toggle menu"
                role="button"
            />
            <div className={opened ? 'menu opened' : 'menu closed'} ref={menuRef}>

                <div className="menu-section">
                    <span className="section-title">Tools</span>

                    <div className="menu-item">
                        <span className="title">Display shortcuts</span>
                        <div>
                            <Button selected={settings.displayShortcuts} onClick={() => updateSettingValue('displayShortcuts', true)}>
                                Yes
                            </Button>
                            <Button selected={!settings.displayShortcuts} onClick={() => updateSettingValue('displayShortcuts', false)}>
                                No
                            </Button>
                        </div>
                    </div>
                    {settings.displayShortcuts && (
                        <div className="menu-submenu">
                            <div className="menu-item">
                                <span className="title">Shortcuts host</span>
                                <div>
                                    <Input
                                        value={hostDraft}
                                        placeholder="https://miomoto.de/m8-shortcuts/"
                                        onChange={(e) => setHostDraft((e.target as HTMLInputElement).value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
{/* 
                    <div className="menu-item">
                        <span className="title">Display tutor game</span>
                        <div>
                            <Button selected={settings.displayTutorGame} onClick={() => updateSettingValue('displayTutorGame', true)}>
                                Yes
                            </Button>
                            <Button selected={!settings.displayTutorGame} onClick={() => updateSettingValue('displayTutorGame', false)}>
                                No
                            </Button>
                        </div>
                    </div>
                    {settings.displayTutorGame && (
                        <div className="menu-submenu">
                            <div className="menu-item">
                                <span className="title">Tutor host</span>
                                <div>
                                    <Input
                                        value={tutorHostDraft}
                                        placeholder="http://localhost:5174/"
                                        onChange={(e) => setTutorHostDraft((e.target as HTMLInputElement).value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    */}
                </div>

                <div className="menu-section">
                    <span className="section-title">Display</span>
                    <div className="menu-item">
                        <span className="title">Show M8 body</span>
                        <div>
                            <Button selected={settings.showM8Body} onClick={() => updateSettingValue('showM8Body', true)}>
                                Yes
                            </Button>
                            <Button selected={!settings.showM8Body} onClick={() => updateSettingValue('showM8Body', false)}>
                                No
                            </Button>
                        </div>
                    </div>
                    {settings.showM8Body && <div className="menu-submenu">
                        <div className="menu-item">
                            <span className="title">Zoom View</span>
                            <div>
                                <Button selected={!settings.fullM8View} onClick={() => updateSettingValue('fullM8View', false)}>
                                    Yes
                                </Button>
                                <Button selected={settings.fullM8View} onClick={() => updateSettingValue('fullM8View', true)}>
                                    No
                                </Button>
                            </div>
                        </div>
                    </div>
                    }
                </div>

                <div className="menu-section">
                    <span className="section-title">Rendering</span>
                    <div className="menu-item">
                        <span className="title">Smooth rendering</span>
                        <div>
                            <Button selected={settings.smoothRendering} onClick={() => updateSettingValue('smoothRendering', true)}>
                                Yes
                            </Button>
                            <Button selected={!settings.smoothRendering} onClick={() => updateSettingValue('smoothRendering', false)}>
                                No
                            </Button>
                        </div>
                    </div>
                    {settings.smoothRendering && (
                        <div className="menu-submenu">
                            <div className="menu-item">
                                <span className="title">Blur radius</span>
                                <div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="20"
                                        step="0.1"
                                        value={settings.smoothBlurRadius}
                                        onChange={(e) => updateSettingValue('smoothBlurRadius', Number.parseFloat(e.target.value))}
                                    />
                                    <span>{settings.smoothBlurRadius.toFixed(1)}</span>
                                </div>
                            </div>
                            <div className="menu-item">
                                <span className="title">Threshold</span>
                                <div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={settings.smoothThreshold}
                                        onChange={(e) => updateSettingValue('smoothThreshold', Number.parseFloat(e.target.value))}
                                    />
                                    <span>{settings.smoothThreshold.toFixed(2)}</span>
                                </div>
                            </div>
                            <div className="menu-item">
                                <span className="title">Smoothness</span>
                                <div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="0.5"
                                        step="0.01"
                                        value={settings.smoothSmoothness}
                                        onChange={(e) => updateSettingValue('smoothSmoothness', Number.parseFloat(e.target.value))}
                                    />
                                    <span>{settings.smoothSmoothness.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="menu-item">
                        <span className="title">Background shader</span>
                        <div>
                            <Button selected={settings.backgroundShader} onClick={() => updateSettingValue('backgroundShader', true)}>
                                Yes
                            </Button>
                            <Button selected={!settings.backgroundShader} onClick={() => updateSettingValue('backgroundShader', false)}>
                                No
                            </Button>
                        </div>
                    </div>
                    {settings.backgroundShader && (
                        <div className="menu-submenu">
                            <div className="menu-item">
                                <span className="title">Shader editor panel</span>
                                <div>
                                    <Button
                                        selected={settings.showBackgroundShaderEditor}
                                        onClick={() => updateSettingValue('showBackgroundShaderEditor', true)}
                                    >
                                        Open
                                    </Button>
                                    <Button
                                        selected={!settings.showBackgroundShaderEditor}
                                        onClick={() => updateSettingValue('showBackgroundShaderEditor', false)}
                                    >
                                        Close
                                    </Button>
                                </div>
                            </div>
                            <div className="menu-item">
                                <span className="title">VJ Mode</span>
                                <div>
                                    <Button selected={settings.vjMode} onClick={() => updateSettingValue('vjMode', true)}>
                                        On
                                    </Button>
                                    <Button selected={!settings.vjMode} onClick={() => updateSettingValue('vjMode', false)}>
                                        Off
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* kept for WebGL -> Canvas switch
        <div className="menu-item">
          <span className="title">Display mode</span>
          <div>
            <Button selected={settings.webGLRendering} onClick={() => updateSettingValue('webGLRendering', true)}>
              WebGL
            </Button>
            <Button selected={!settings.webGLRendering} onClick={() => updateSettingValue('webGLRendering', false)}>
              HTML
            </Button>
          </div>
        </div> */}

                <div className="menu-section">
                    <span className="section-title">Input</span>
                    <div className="menu-item">
                        <span className="title">Virtual midi keyboard</span>
                        <div>
                            <Button selected={settings.virtualKeyboard} onClick={() => updateSettingValue('virtualKeyboard', true)}>
                                Yes
                            </Button>
                            <Button selected={!settings.virtualKeyboard} onClick={() => updateSettingValue('virtualKeyboard', false)}>
                                No
                            </Button>
                        </div>
                    </div>
                    <div className="menu-item">
                        <span className="title">Keyboard mapping</span>
                        <div>
                            <Button onClick={() => setKeyboardSettingsOpen(true)}>Configure</Button>
                        </div>
                    </div>
                </div>

                <div className="menu-section">
                    <span className="section-title">Help</span>
                    <div className="menu-item">
                        <span className="title">Manual</span>
                        <div>
                            <Button onClick={() => setManualOpen(true)}>Open</Button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal ref={keyboardModalRef}>
                <KeyboardSettings />
            </Modal>

            <Modal ref={manualModalRef}>
                <Manual />
            </Modal>
        </>
    )
}
