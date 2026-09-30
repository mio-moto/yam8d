import { getDefaultStore } from 'jotai'
import {
    viewNameAtom,
    viewTitleAtom,
    minimapKeyAtom,
    cursorPosAtom,
    cursorRectAtom,
    selectionModeAtom,
    highlightColorAtom,
    textUnderCursorAtom,
    currentLineAtom,
    titleColorAtom,
    backgroundColorAtom,
    macroStatusAtom,
    deviceModelAtom,
    fontModeAtom,
    systemInfoAtom,
    cellMetricsAtom,
} from '../../features/state/viewStore'
import type { M8State } from '../types'

// Helper to get current state from all atoms
export const getCurrentState = (): M8State => {
    const store = getDefaultStore()
    const macroStatus = store.get(macroStatusAtom)

    return {
        viewName: store.get(viewNameAtom),
        viewTitle: store.get(viewTitleAtom),
        minimapKey: store.get(minimapKeyAtom),
        cursorPos: store.get(cursorPosAtom),
        cursorRect: store.get(cursorRectAtom),
        selectionMode: store.get(selectionModeAtom),
        highlightColor: store.get(highlightColorAtom),
        titleColor: store.get(titleColorAtom),
        backgroundColor: store.get(backgroundColorAtom),
        textUnderCursor: store.get(textUnderCursorAtom),
        currentLine: store.get(currentLineAtom),
        deviceModel: store.get(deviceModelAtom),
        fontMode: store.get(fontModeAtom),
        systemInfo: store.get(systemInfoAtom),
        macroRunning: macroStatus.running,
        macroCurrentStep: macroStatus.currentStep,
        macroSequenceLength: macroStatus.sequenceLength,
    }
}

// Convert text grid coordinates to pixel coordinates
// Text grid: x (0-39), y (0-23) - independent of font size
// Pixel: depends on current cell metrics (cellW, cellH, offX, offY)
// Send the center of the target cell so M8 places the cursor exactly there.
// gx extraction in viewExtractor uses Math.round to absorb the cursor border
// overhang, so no additional x compensation is needed here.
export const textGridToPixel = (gridX: number, gridY: number): { x: number; y: number } => {
    const cellMetrics = getDefaultStore().get(cellMetricsAtom)

    // Center of cell (gridX, gridY) in raw M8 protocol pixel space
    const pixelX = gridX * cellMetrics.cellW + cellMetrics.offX + cellMetrics.cellW / 2
    const pixelY = gridY * cellMetrics.cellH + cellMetrics.offY + cellMetrics.cellH / 2

    return { x: pixelX, y: pixelY }
}
