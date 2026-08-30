import React, { useCallback, useState } from 'react'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { defaultMacroInputMap, type MacroInputMap } from '../macros/defaultMacroInputMap'
import { defaultKeyMap } from '../virtualKeyboard/useVirtualKeyboard'
import DefaultCustomBackgroundShaderSource from '../rendering/shader/default_spectrum.frag?raw'

const SETTINGS = 'M8settings'
const EXTERNAL_APPS_DEFAULTS_VERSION_KEY = 'M8settings.externalAppsDefaultsVersion'
const EXTERNAL_APPS_DEFAULTS_VERSION = '1'
export const DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME = 'Spectrum Depth Demo'
export const DEFAULT_CUSTOM_BACKGROUND_SHADER = DefaultCustomBackgroundShaderSource

export const DEFAULT_SHORTCUTS_URL = 'https://m8-shortcuts-65mb.vercel.app/' //'https://miomoto.de/m8-shortcuts/'
export const DEFAULT_SDK_TEST_URL = 'sdk-test.html'
export const DEFAULT_GROOVE_EXTRACTOR_URL = 'https://groove.matterwarlox.com/'
export const DEFAULT_SCALE_DIVINATOR_URL = 'https://scale.matterwarlox.com/'

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

export type ExternalAppConfig = {
    id: string
    name: string
    url: string
    useUrlFallback: boolean
}

const defaultExternalApps = (shortcutsHost: string, sdkTestHost: string): ExternalAppConfig[] => [
    {
        id: 'm8-shortcuts',
        name: 'M8 Shortcuts',
        url: shortcutsHost,
        useUrlFallback: true,
    },
    {
        id: 'm8-sdk-test',
        name: 'M8 SDK Test',
        url: sdkTestHost,
        useUrlFallback: false,
    },
    {
        id: 'm8-groove-extractor',
        name: 'M8 Groove Extractor',
        url: DEFAULT_GROOVE_EXTRACTOR_URL,
        useUrlFallback: false,
    },
    {
        id: 'm8-scale-divinator',
        name: 'M8 Scale Divinator',
        url: DEFAULT_SCALE_DIVINATOR_URL,
        useUrlFallback: false,
    },
]

/**
 * Appends default external apps that are missing from the stored list,
 * deduplicating by URL (case-insensitive) so user-customized lists keep
 * their own entries and only receive the new defaults.
 */
const mergeStoredExternalAppsWithDefaults = (storedApps: ExternalAppConfig[]): ExternalAppConfig[] => {
    const knownUrls = new Set(
        storedApps
            .map((app) => (app && typeof app.url === 'string' ? app.url.trim().toLowerCase() : ''))
            .filter((url) => url !== ''),
    )
    const missingDefaults = defaultExternalApps(DEFAULT_SHORTCUTS_URL, DEFAULT_SDK_TEST_URL).filter(
        (app) => !knownUrls.has(app.url.toLowerCase()),
    )
    return [...storedApps, ...missingDefaults]
}

const normalizeExternalApps = (settings: Settings): Pick<Settings, 'externalApps' | 'activeExternalAppId'> => {
    const fallbackApps = defaultExternalApps(settings.shortcutsHost, settings.sdkTestHost)
    const sourceApps = Array.isArray(settings.externalApps) && settings.externalApps.length > 0
        ? settings.externalApps
        : fallbackApps
    const usedIds = new Set<string>()
    const externalApps = sourceApps
        .map((app, index): ExternalAppConfig | null => {
            if (!app || typeof app.name !== 'string' || typeof app.url !== 'string') {
                return null
            }

            const idBase = typeof app.id === 'string' && app.id.trim()
                ? app.id.trim()
                : `external-app-${index + 1}`
            let id = idBase
            let suffix = 2
            while (usedIds.has(id)) {
                id = `${idBase}-${suffix}`
                suffix += 1
            }
            usedIds.add(id)

            return {
                id,
                name: app.name.trim() || `External App ${index + 1}`,
                url: app.url.trim(),
                useUrlFallback: typeof app.useUrlFallback === 'boolean'
                    ? app.useUrlFallback
                    : id === 'm8-shortcuts',
            }
        })
        .filter((app): app is ExternalAppConfig => app !== null)

    const normalizedApps = externalApps.length > 0 ? externalApps : fallbackApps
    const activeExternalAppId = normalizedApps.some((app) => app.id === settings.activeExternalAppId)
        ? settings.activeExternalAppId
        : normalizedApps[0]?.id ?? null

    return {
        externalApps: normalizedApps,
        activeExternalAppId,
    }
}

export type Settings = {
    fullM8View: boolean
    virtualKeyboard: boolean
    displayExternalApps: boolean
    externalApps: ExternalAppConfig[]
    activeExternalAppId: string | null
    displayShortcuts: boolean
    displayTutorGame: boolean
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
    displayShortcuts: false,
    displayTutorGame: false,
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
}

const loadInitialSettings = (): Settings => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return defaultSettings
    }

    const raw = window.localStorage.getItem(SETTINGS)
    if (!raw) {
        window.localStorage.setItem(SETTINGS, JSON.stringify(defaultSettings))
        window.localStorage.setItem(EXTERNAL_APPS_DEFAULTS_VERSION_KEY, EXTERNAL_APPS_DEFAULTS_VERSION)
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
