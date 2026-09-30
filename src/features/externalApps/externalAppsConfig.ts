// External apps (iframe tools shown next to the M8 display): config shape, built-in
// defaults and normalization of the user's list. Pure: persistence lives in settings.

export const DEFAULT_SHORTCUTS_URL = 'https://m8-shortcuts-65mb.vercel.app/' //'https://miomoto.de/m8-shortcuts/'
export const DEFAULT_SDK_TEST_URL = 'sdk-test.html'
const DEFAULT_CONT8XT_URL = 'cont8xt.html'
const DEFAULT_GROOVE_EXTRACTOR_URL = 'https://groove.matterwarlox.com/'
const DEFAULT_SCALE_DIVINATOR_URL = 'https://scale.matterwarlox.com/'

export type ExternalAppConfig = {
    id: string
    name: string
    url: string
    useUrlFallback: boolean
}

export const defaultExternalApps = (shortcutsHost: string, sdkTestHost: string): ExternalAppConfig[] => [
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
        id: 'm8-cont8xt',
        name: 'Cont8xt Notes',
        url: DEFAULT_CONT8XT_URL,
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
export const mergeStoredExternalAppsWithDefaults = (storedApps: ExternalAppConfig[]): ExternalAppConfig[] => {
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

export type ExternalAppsSettings = {
    externalApps: ExternalAppConfig[]
    activeExternalAppId: string | null
    shortcutsHost: string
    sdkTestHost: string
}

export const normalizeExternalApps = (settings: ExternalAppsSettings): Pick<ExternalAppsSettings, 'externalApps' | 'activeExternalAppId'> => {
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
