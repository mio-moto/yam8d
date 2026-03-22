import React, { useCallback, useState } from 'react'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { defaultKeyMap } from '../virtualKeyboard/useVirtualKeyboard'
import DefaultCustomBackgroundShaderSource from '../rendering/shader/default_spectrum.frag?raw'

const SETTINGS = 'M8settings'
export const DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME = 'Spectrum Depth Demo'
export const DEFAULT_CUSTOM_BACKGROUND_SHADER = DefaultCustomBackgroundShaderSource

const normalizeSettings = (settings: Settings): Settings => {
    if (!settings.backgroundShader && settings.showBackgroundShaderEditor) {
        return {
            ...settings,
            showBackgroundShaderEditor: false,
        }
    }

    return settings
}

const normalizeBackgroundShaderValue = (value: unknown): boolean => {
    if (typeof value === 'boolean') {
        return value
    }

    if (typeof value === 'string') {
        return value === 'custom' || value === 'apollonian' || value === 'plasma'
    }

    return false
}

export type Settings = {
    fullM8View: boolean
    virtualKeyboard: boolean
    displayShortcuts: boolean
    displayTutorGame: boolean
    shortcutsHost: string
    tutorGameHost: string
    showM8Body: boolean
    smoothRendering: boolean
    smoothBlurRadius: number
    smoothThreshold: number
    smoothSmoothness: number
    backgroundShader: boolean
    customBackgroundShader: string
    backgroundShaderSpectrumBands: 64 | 128 | 256
    backgroundShaderCompositeM8Screen: boolean
    showBackgroundShaderEditor: boolean
    vjMode: boolean
    vjNumpadAssignments: Record<string, string | null>
    inputMap: typeof defaultInputMap
    keyMap: typeof defaultKeyMap
}

export type SettingsContextValue = {
    settings: Settings
    updateSettingValue: <K extends keyof Settings>(settingName: K, value: Settings[K]) => void
}

const defaultSettings: Settings = {
    fullM8View: true,
    virtualKeyboard: true,
    displayShortcuts: false,
    displayTutorGame: false,
    shortcutsHost: 'https://m8-shortcuts-65mb.vercel.app/', //'https://miomoto.de/m8-shortcuts/',
    tutorGameHost: 'http://localhost:5174/',
    showM8Body: true,
    smoothRendering: true,
    smoothBlurRadius: 5.6,
    smoothThreshold: 0.50,
    smoothSmoothness: 0.10,
    backgroundShader: false,
    customBackgroundShader: DEFAULT_CUSTOM_BACKGROUND_SHADER,
    backgroundShaderSpectrumBands: 128,
    backgroundShaderCompositeM8Screen: true,
    showBackgroundShaderEditor: false,
    vjMode: false,
    vjNumpadAssignments: {},

    inputMap: defaultInputMap,
    keyMap: defaultKeyMap,
}

const loadInitialSettings = (): Settings => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return defaultSettings
    }

    const raw = window.localStorage.getItem(SETTINGS)
    if (!raw) {
        window.localStorage.setItem(SETTINGS, JSON.stringify(defaultSettings))
        return defaultSettings
    }

    const storedSettings: Partial<Settings> = JSON.parse(raw)
    const normalizedStoredSettings: Partial<Settings> = {
        ...storedSettings,
        backgroundShader: normalizeBackgroundShaderValue(storedSettings.backgroundShader),
        backgroundShaderSpectrumBands: storedSettings.backgroundShaderSpectrumBands === 64 || storedSettings.backgroundShaderSpectrumBands === 128 || storedSettings.backgroundShaderSpectrumBands === 256
            ? storedSettings.backgroundShaderSpectrumBands
            : 128,
    }
    if (!normalizedStoredSettings.customBackgroundShader) {
        normalizedStoredSettings.customBackgroundShader = DEFAULT_CUSTOM_BACKGROUND_SHADER
    }
    const initialSettings = normalizeSettings({ ...defaultSettings, ...normalizedStoredSettings })
    window.localStorage.setItem(SETTINGS, JSON.stringify(initialSettings))
    return initialSettings
}

const SettingsContext = React.createContext<SettingsContextValue>({
    settings: defaultSettings,
    updateSettingValue: () => { },
})

export const SettingsProvider = ({ children }: { children?: React.ReactNode }) => {
    const [settingsContextValues, setSettingsContextValues] = useState<Settings>(() => loadInitialSettings())
    const updateSettingValue = useCallback(
        <K extends keyof Settings>(settingName: K, value: Settings[K]) => {
            setSettingsContextValues((prev) => {
                const newSettingsValues = normalizeSettings({
                    ...prev,
                    [settingName]: value,
                })
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem(SETTINGS, JSON.stringify(newSettingsValues))
                }
                return newSettingsValues
            })
        },
        [],
    )

    return <SettingsContext.Provider value={{ settings: settingsContextValues, updateSettingValue }}>{children}</SettingsContext.Provider>
}

/**
 * Simply call this as a hook to get the settings object like:
 *
 * const settings = useSettingsContext()
 *
 * @returns the settingsContext
 */
export const useSettingsContext = (): SettingsContextValue => {
    const context = React.useContext(SettingsContext)
    if (context === undefined || context === null) {
        throw new Error(`useSettingsContext must be called within SettingsProvider`)
    }
    return context
}
