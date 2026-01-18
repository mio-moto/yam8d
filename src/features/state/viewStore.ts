import { atom, useAtom } from 'jotai'

export interface CursorPos {
    x: number
    y: number
}
export interface CursorRect {
    x: number
    y: number
    w: number
    h: number
}
export interface RGB {
    r: number
    g: number
    b: number
}

// Current M8 view name (lowercased, cleaned)
export const viewNameAtom = atom<string | null>(null)
// Store raw title and minimap key separately for flexibility
export const viewTitleAtom = atom<string | null>(null)
export const minimapKeyAtom = atom<string | null>(null)

// Current cursor position in character grid coordinates (0..39, 0..23)
export const cursorPosAtom = atom<CursorPos | null>(null)
// Current cursor rectangle (position + size normalized to 480x320 space)
export const cursorRectAtom = atom<CursorRect | null>(null)

// Last detected highlight color (theme-dependent)
export const highlightColorAtom = atom<RGB | null>(null)

// Stabilized colors from the first character of the title row
export const titleColorAtom = atom<RGB | null>(null)
export const backgroundColorAtom = atom<RGB | null>(null)

// Macro execution status
export const macroStatusAtom = atom<{ running: boolean; currentStep?: number; sequenceLength?: number }>({ running: false })

// Device/system info
export const deviceModelAtom = atom<string | null>(null)
export const fontModeAtom = atom<number | null>(null)

// Cell metrics (model/font dependent); offsets approximate renderer uniforms
export const cellMetricsAtom = atom<{ cellW: number; cellH: number; offX: number; offY: number }>({ cellW: 12, cellH: 14, offX: 0, offY: 0 })

export const useViewName = () => useAtom(viewNameAtom)
export const useViewTitle = () => useAtom(viewTitleAtom)
export const useMinimapKey = () => useAtom(minimapKeyAtom)
export const useCursor = () => useAtom(cursorPosAtom)
export const useCursorRect = () => useAtom(cursorRectAtom)
export const useHighlightColor = () => useAtom(highlightColorAtom)
export const useTitleColor = () => useAtom(titleColorAtom)
export const useBackgroundColor = () => useAtom(backgroundColorAtom)
export const useMacroStatus = () => useAtom(macroStatusAtom)
export const useCellMetrics = () => useAtom(cellMetricsAtom)
export const useDeviceModel = () => useAtom(deviceModelAtom)
export const useFontMode = () => useAtom(fontModeAtom)
