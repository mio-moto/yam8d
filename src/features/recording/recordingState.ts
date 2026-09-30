import { atom } from 'jotai'

// Recording state: shared between RecordingControls, useCanvasRecorder, and Menu
// so the menu icon and record button can be hidden during full-tab recording.
export const recordingStateAtom = atom<{ mode: 'canvas' | 'display' | null; isRecording: boolean }>({
    mode: null,
    isRecording: false,
})
