import React, { useCallback, useState } from 'react'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { defaultMacroInputMap, type MacroInputMap } from '../macros/defaultMacroInputMap'
import { defaultKeyMap } from '../virtualKeyboard/useVirtualKeyboard'
import DefaultCustomBackgroundShaderSource from '../rendering/shader/default_spectrum.frag?raw'

const SETTINGS = 'M8settings'
export const DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME = 'Spectrum Depth Demo'
export const DEFAULT_CUSTOM_BACKGROUND_SHADER = DefaultCustomBackgroundShaderSource

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

const defaultExternalApps = (shortcutsHost: string, tutorGameHost: string): ExternalAppConfig[] => [
    {
        id: 'm8-shortcuts',
        name: 'M8 Shortcuts',
        url: shortcutsHost,
        useUrlFallback: true,
    },
    {
        id: 'm8-tutor-game',
        name: 'M8 Tutor Game',
        url: tutorGameHost,
        useUrlFallback: false,
    },
]

const normalizeExternalApps = (settings: Settings): Pick<Settings, 'externalApps' | 'activeExternalAppId'> => {
    const fallbackApps = defaultExternalApps(settings.shortcutsHost, settings.tutorGameHost)
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
    externalApps: defaultExternalApps('https://m8-shortcuts-65mb.vercel.app/', 'http://localhost:5174/'),
    activeExternalAppId: 'm8-shortcuts',
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
    macroInputMap: defaultMacroInputMap,
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
