import { useEffect } from 'react'
import { useSettingsContext } from '../settings/settings'
import { shouldIgnoreAppKeyboardEvent } from './inputGate'

/** Toggles the "Zoom View" (fullM8View) setting with the key set in the keyboard settings. */
export const useZoomViewShortcut = () => {
    const { settings, updateSettingValue } = useSettingsContext()
    const { zoomViewKey, fullM8View } = settings

    useEffect(() => {
        if (!zoomViewKey) return

        const handleKeyDown = (ev: KeyboardEvent) => {
            if (ev.code !== zoomViewKey || ev.repeat) return
            if (ev.ctrlKey || ev.metaKey || ev.altKey) return
            if (shouldIgnoreAppKeyboardEvent(ev)) return

            updateSettingValue('fullM8View', !fullM8View)
            ev.preventDefault()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [zoomViewKey, fullM8View, updateSettingValue])
}
