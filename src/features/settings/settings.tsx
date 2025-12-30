import React, { useCallback, useState } from "react";
const SETTINGS = 'M8settings'

const initialSettings: Record<string, any> = JSON.parse(localStorage[SETTINGS] ?? '{}')

const SettingsContext = React.createContext<{
    settingsContextValues: Record<string, any>,
    updateContextValues: (setting: string, value: any) => void
}>({
    settingsContextValues: initialSettings,
    updateContextValues: (setting: string, value: any) => { }
})

export const SettingsProvider = ({ children }: { children?: React.ReactNode }) => {

    const [settingsContextValues, setSettingsContextValues] = useState<Record<string, any>>(initialSettings)
    const updateContextValues = useCallback((settingName: string, value: any) => {
        const newSettingsValues = {
            ...settingsContextValues,
            settingName: value
        }
        localStorage[SETTINGS] = JSON.stringify(newSettingsValues)
        setSettingsContextValues(newSettingsValues)
    }, [])


    return <SettingsContext.Provider value={{ settingsContextValues, updateContextValues }}>
        {children}
    </SettingsContext.Provider>

}

/**
 * Simply call this as a hook to get the settings object like:
 * 
 * const settings = useSettingsContext()
 * 
 * @returns the settingsContext
 */
export const useSettingsContext = () => {
    const context = React.useContext(SettingsContext)
    if (context === undefined || context === null) {
        throw new Error(`useSettingsContext must be called within SettingsProvider`)
    }
    return context
}


