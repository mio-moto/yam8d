import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { useSettingsContext } from './settings'
import './menu.css'

export const Menu: FC = () => {
    const { settings, updateSettingValue } = useSettingsContext()
    const [opened, setOpened] = useState(false)
    const [hostDraft, setHostDraft] = useState(settings.shortcutsHost)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const hitboxRef = useRef<HTMLDivElement | null>(null)
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

    // Debounce persisting the host to settings
    useEffect(() => {
        const id = setTimeout(() => {
            if (hostDraft !== settings.shortcutsHost) {
                updateSettingValue('shortcutsHost', hostDraft)
            }
        }, 400)
        return () => clearTimeout(id)
    }, [hostDraft, settings.shortcutsHost, updateSettingValue])

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
            setOpened(false)
        }
        // Use capture to ensure we catch the event early across the page
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true)
        }
    }, [opened])
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
                    <>
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
                    </>
                )}

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
                    <div className="menu-item">
                        <span className="title">Shortcuts host</span>
                        <div>
                            <Input
                                value={hostDraft}
                                placeholder="http://localhost:5174"
                                onChange={(e) => setHostDraft((e.target as HTMLInputElement).value)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
