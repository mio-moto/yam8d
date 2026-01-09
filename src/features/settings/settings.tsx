import React, { useCallback, useState } from 'react'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { defaultKeyMap } from '../virtualKeyboard/useVirtualKeyboard'

const SETTINGS = 'M8settings'

export type Settings = {
  fullM8View: boolean
  webGLRendering: boolean
  virtualKeyboard: boolean
  inputMap: typeof defaultInputMap
  keyMap: typeof defaultKeyMap
}

export type SettingsContextValue = {
  settings: Settings
  updateSettingValue: <K extends keyof Settings>(settingName: K, value: Settings[K]) => void
}

const defaultSettings: Settings = {
  fullM8View: true,
  webGLRendering: true,
  virtualKeyboard: true,

  inputMap: defaultInputMap,
  keyMap: defaultKeyMap,
}

if (!localStorage[SETTINGS]) localStorage[SETTINGS] = JSON.stringify(defaultSettings)

const storedSettings: Partial<Settings> = JSON.parse(localStorage[SETTINGS] ?? '{}')
const initialSettings: Settings = { ...defaultSettings, ...storedSettings }

const SettingsContext = React.createContext<SettingsContextValue>({
  settings: defaultSettings,
  updateSettingValue: () => {},
})

export const SettingsProvider = ({ children }: { children?: React.ReactNode }) => {
  const [settingsContextValues, setSettingsContextValues] = useState<Settings>(initialSettings)
  const updateSettingValue = useCallback(
    <K extends keyof Settings>(settingName: K, value: Settings[K]) => {
      const newSettingsValues: Settings = {
        ...settingsContextValues,
        [settingName]: value,
      }
      localStorage[SETTINGS] = JSON.stringify(newSettingsValues)
      setSettingsContextValues(newSettingsValues)
    },
    [settingsContextValues],
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
