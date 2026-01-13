import React, { useCallback, useState } from 'react'
import { defaultInputMap } from '../inputs/defaultInputMap'
import { M8KeyMask } from '../connection/keys'
import { defaultKeyMap } from '../virtualKeyboard/useVirtualKeyboard'

const SETTINGS = 'M8settings'

const defaultInputMap = {
  ArrowUp: M8KeyMask.Up,
  ArrowDown: M8KeyMask.Down,
  ArrowLeft: M8KeyMask.Left,
  ArrowRight: M8KeyMask.Right,
  ShiftLeft: M8KeyMask.Shift,
  Space: M8KeyMask.Play,
  KeyZ: M8KeyMask.Opt,
  KeyX: M8KeyMask.Edit,

  Gamepad12: M8KeyMask.Up,
  Gamepad64: M8KeyMask.Up,
  Gamepad13: M8KeyMask.Down,
  Gamepad65: M8KeyMask.Down,
  Gamepad14: M8KeyMask.Left,
  Gamepad66: M8KeyMask.Left,
  Gamepad15: M8KeyMask.Right,
  Gamepad67: M8KeyMask.Right,
  Gamepad8: M8KeyMask.Shift,
  Gamepad2: M8KeyMask.Shift,
  Gamepad5: M8KeyMask.Shift,
  Gamepad9: M8KeyMask.Play,
  Gamepad3: M8KeyMask.Play,
  Gamepad1: M8KeyMask.Opt,
  Gamepad0: M8KeyMask.Edit,
} as const

export type Settings = {
  fullM8View: boolean
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
