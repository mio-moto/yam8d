import type { M8State } from '../../types'
import type { M8Store } from '../store'

// The state exposed to SDK clients, read from the engine store
export const getCurrentState = (store: M8Store): M8State => {
  const macroStatus = store.get('macroStatus')

  return {
    viewName: store.get('viewName'),
    viewTitle: store.get('viewTitle'),
    minimapKey: store.get('minimapKey'),
    cursorPos: store.get('cursorPos'),
    cursorRect: store.get('cursorRect'),
    selectionMode: store.get('selectionMode'),
    highlightColor: store.get('highlightColor'),
    titleColor: store.get('titleColor'),
    backgroundColor: store.get('backgroundColor'),
    cursorColor: store.get('cursorColor'),
    textUnderCursor: store.get('textUnderCursor'),
    currentLine: store.get('currentLine'),
    deviceModel: store.get('deviceModel'),
    fontMode: store.get('fontMode'),
    systemInfo: store.get('systemInfo') as M8State['systemInfo'],
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
export const textGridToPixel = (store: M8Store, gridX: number, gridY: number): { x: number; y: number } => {
  const cellMetrics = store.get('cellMetrics')

  // Center of cell (gridX, gridY) in raw M8 protocol pixel space
  const pixelX = gridX * cellMetrics.cellW + cellMetrics.offX + cellMetrics.cellW / 2
  const pixelY = gridY * cellMetrics.cellH + cellMetrics.offY + cellMetrics.cellH / 2

  return { x: pixelX, y: pixelY }
}
