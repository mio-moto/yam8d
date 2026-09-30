import React, { useCallback, useEffect, useState } from 'react'
import {
    DEFAULT_SDK_TEST_URL,
    DEFAULT_SHORTCUTS_URL,
    defaultExternalApps,
    type ExternalAppConfig,
    mergeStoredExternalAppsWithDefaults,
    normalizeExternalApps,
} from '../externalApps/externalAppsConfig'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { defaultMacroInputMap, type MacroInputMap } from '../macros/defaultMacroInputMap'
import { defaultKeyMap } from '../virtualKeyboard/defaultKeyMap'
import { DEFAULT_CUSTOM_BACKGROUND_SHADER } from '../rendering/defaultSpectrumShader'

const SETTINGS = 'M8settings'
const CORRUPT_SETTINGS_BACKUP = 'M8settings.corruptBackup'
const EXTERNAL_APPS_DEFAULTS_VERSION_KEY = 'M8settings.externalAppsDefaultsVersion'
const EXTERNAL_APPS_DEFAULTS_VERSION = '2'

export const DEFAULT_ZOOM_VIEW_KEY = 'KeyV'

const normalizeSettings = (settings: Settings): Settings => {
    const normalizedExternalApps = normalizeExternalApps(settings)
    const settingsWithExternalApps = {
        ...settings,
        ...normalizedExternalApps,
    }

    if (!settings.backgroundShader && settings.showBackgroundShaderEditor) {
        return {
            ...settingsWithExternalApps,
            showBackgroundShaderEditor: false,
        }
    }

    return settingsWithExternalApps
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
    displayExternalApps: boolean
    externalApps: ExternalAppConfig[]
    activeExternalAppId: string | null
    shortcutsHost: string
    sdkTestHost: string
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
    videoTextureUrl: string
    vjMode: boolean
    vjNumpadAssignments: Record<string, string | null>
    inputMap: typeof defaultInputMap
    keyMap: typeof defaultKeyMap
    macroInputMap: MacroInputMap
    /** KeyboardEvent.code of the shortcut toggling fullM8View ('' = unassigned) */
    zoomViewKey: string
}

export type SettingsContextValue = {
    settings: Settings
    updateSettingValue: <K extends keyof Settings>(settingName: K, value: Settings[K]) => void
}

const defaultSettings: Settings = {
    fullM8View: true,
    virtualKeyboard: true,
    displayExternalApps: false,
    externalApps: defaultExternalApps(DEFAULT_SHORTCUTS_URL, DEFAULT_SDK_TEST_URL),
    activeExternalAppId: 'm8-shortcuts',
    shortcutsHost: DEFAULT_SHORTCUTS_URL,
    sdkTestHost: DEFAULT_SDK_TEST_URL,
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
    videoTextureUrl: '',
    vjMode: false,
    vjNumpadAssignments: {},

    inputMap: defaultInputMap,
    keyMap: defaultKeyMap,
    macroInputMap: defaultMacroInputMap,
    zoomViewKey: DEFAULT_ZOOM_VIEW_KEY,
}

// Stored settings as an object, or null when the value is not a JSON object
const parseStoredSettings = (raw: string): Partial<Settings> | null => {
    try {
        const parsed: unknown = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Partial<Settings>) : null
    } catch {
        return null
    }
}

const loadInitialSettings = (): Settings => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return defaultSettings
    }

    const raw = window.localStorage.getItem(SETTINGS)
    const storedSettings = raw ? parseStoredSettings(raw) : null
    if (!storedSettings) {
        if (raw) {
            // Unreadable settings must not crash the app: start from defaults, keeping the old value aside
            console.warn('[settings] Stored settings are unreadable, falling back to defaults')
            window.localStorage.setItem(CORRUPT_SETTINGS_BACKUP, raw)
        }
        window.localStorage.setItem(SETTINGS, JSON.stringify(defaultSettings))
        window.localStorage.setItem(EXTERNAL_APPS_DEFAULTS_VERSION_KEY, EXTERNAL_APPS_DEFAULTS_VERSION)
        return defaultSettings
    }

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
    if (window.localStorage.getItem(EXTERNAL_APPS_DEFAULTS_VERSION_KEY) !== EXTERNAL_APPS_DEFAULTS_VERSION) {
        const storedApps = Array.isArray(normalizedStoredSettings.externalApps) ? normalizedStoredSettings.externalApps : []
        normalizedStoredSettings.externalApps = mergeStoredExternalAppsWithDefaults(storedApps)
        window.localStorage.setItem(EXTERNAL_APPS_DEFAULTS_VERSION_KEY, EXTERNAL_APPS_DEFAULTS_VERSION)
    }
    const initialSettings = normalizeSettings({ ...defaultSettings, ...normalizedStoredSettings })
    window.localStorage.setItem(SETTINGS, JSON.stringify(initialSettings))
    return initialSettings
}

const SettingsContext = React.createContext<SettingsContextValue>({
    settings: defaultSettings,
    updateSettingValue: () => { },
})

const persistSettings = (settings: Settings) => {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SETTINGS, JSON.stringify(settings))
    }
}

export const SettingsProvider = ({ children }: { children?: React.ReactNode }) => {
    const [settingsContextValues, setSettingsContextValues] = useState<Settings>(() => loadInitialSettings())
    const updateSettingValue = useCallback(
        <K extends keyof Settings>(settingName: K, value: Settings[K]) => {
            setSettingsContextValues((prev) => normalizeSettings({ ...prev, [settingName]: value }))
        },
        [],
    )

    // Persist after the state commits, so the updater above stays free of side effects
    useEffect(() => {
        persistSettings(settingsContextValues)
    }, [settingsContextValues])

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
