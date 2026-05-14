export type MacroInputMap = Record<string, string>

export const defaultMacroInputMap: MacroInputMap = Object.freeze({
    F1: 'song',
    F2: 'chain',
    F3: 'phrase',
    F4: 'table',
    F5: 'instrumentpool',
    F6: 'inst',
    F7: 'instmods',
    F8: 'effectsettings',
    F9: 'project',
})

export const macroFunctionKeys = Object.freeze(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'])
export const macroDigitKeys = Object.freeze(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'])
