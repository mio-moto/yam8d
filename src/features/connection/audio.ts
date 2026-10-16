// yam8d's one M8 audio player (packages/m8-sdk/src/engine/audio.ts): started with the device,
// and the source of the recorder's audio.

import { createM8Audio } from '../../../packages/m8-sdk/src/engine/audio'

export { getM8AudioInputDevice, getM8InputStream, M8_AUDIO_CAPTURE_CONSTRAINTS } from '../../../packages/m8-sdk/src/engine/audio'

const m8Audio = createM8Audio()

export const getM8OutputCaptureStream = () => m8Audio.getOutputCaptureStream()

export const audio = () => ({
    connect: () => m8Audio.connect(),
})
