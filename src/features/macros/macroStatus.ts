import { atom, useAtom } from 'jotai'

// Macro execution status
export const macroStatusAtom = atom<{ running: boolean; currentStep?: number; sequenceLength?: number }>({ running: false })

export const useMacroStatus = () => useAtom(macroStatusAtom)
