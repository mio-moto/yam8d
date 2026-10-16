// The M8's USB audio: it shows up as an audio input ("M8" in its label). Playing it through
// the page lets you hear the M8 on the computer; the same graph gives a capture stream for
// recording.

export const M8_AUDIO_CAPTURE_CONSTRAINTS = {
  autoGainControl: false,
  channelCount: { ideal: 2 },
  echoCancellation: false,
  noiseSuppression: false,
} satisfies MediaTrackConstraints

const findM8Input = async (): Promise<MediaDeviceInfo | null> => {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (x) => x.kind === 'audioinput' && x.label.includes('M8') && x.deviceId !== 'default' && x.deviceId !== 'communications',
  )
  if (devices.length > 1) {
    console.warn('Suspicious: More than one M8 audio input found')
  }
  return devices[0] ?? null
}

/** The M8's audio input, or null (device labels are only visible once audio permission was given). */
export const getM8AudioInputDevice = async (): Promise<MediaDeviceInfo | null> => {
  if (!navigator.mediaDevices?.enumerateDevices) return null
  return findM8Input()
}

/**
 * A stream from the M8's audio input. Without a labelled M8 input yet, it asks for audio
 * permission first and looks again. Still none: `requireM8` rejects, otherwise the default
 * input is returned (yam8d's recorder relies on that fallback).
 */
export const getM8InputStream = async ({ requireM8 = false }: { requireM8?: boolean } = {}): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Audio capture is not supported in this browser')

  let device = await getM8AudioInputDevice()
  if (!device) {
    // Labels are hidden until the page has audio permission: get it, then look again
    const probe = await navigator.mediaDevices.getUserMedia({ audio: M8_AUDIO_CAPTURE_CONSTRAINTS })
    device = await getM8AudioInputDevice()
    if (!device) {
      if (!requireM8) return probe
      for (const track of probe.getTracks()) track.stop()
      throw new Error('No M8 audio input found (is the M8 connected over USB?)')
    }
    for (const track of probe.getTracks()) track.stop()
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...M8_AUDIO_CAPTURE_CONSTRAINTS,
      deviceId: { exact: device.deviceId },
    },
  })
}

export interface M8Audio {
  /** Starts playing the M8's audio input through the page's speakers. Idempotent. */
  connect(options?: { requireM8?: boolean }): Promise<void>
  disconnect(): Promise<void>
  readonly connected: boolean
  /** A copy of what is being played, for recording; null while not connected. */
  getOutputCaptureStream(): MediaStream | null
}

export const createM8Audio = (): M8Audio => {
  let ctx: AudioContext | null = null
  let input: MediaStream | null = null
  let output: MediaStream | null = null
  let connecting: Promise<void> | null = null

  // A context created after an await may start suspended: the next click or key resumes it
  const resumeOnGesture = (context: AudioContext) => {
    if (context.state !== 'suspended' || typeof window === 'undefined') return
    const resume = () => {
      void context.resume()
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  }

  const disconnect = async () => {
    for (const track of input?.getTracks() ?? []) track.stop()
    const context = ctx
    ctx = null
    input = null
    output = null
    await context?.close().catch(() => undefined)
  }

  const open = async (requireM8: boolean) => {
    const stream = await getM8InputStream({ requireM8 })
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const destination = context.createMediaStreamDestination()
    source.connect(context.destination)
    source.connect(destination)
    ctx = context
    input = stream
    output = destination.stream

    for (const track of stream.getAudioTracks()) {
      // Unplugged: release the graph
      track.addEventListener('ended', () => {
        if (input === stream) void disconnect()
      })
    }
    await context.resume().catch(() => undefined)
    resumeOnGesture(context)
  }

  return {
    connect: async ({ requireM8 = false } = {}) => {
      if (ctx) return
      connecting ??= open(requireM8).finally(() => {
        connecting = null
      })
      return connecting
    },
    disconnect,
    get connected() {
      return ctx !== null
    },
    getOutputCaptureStream: () => {
      const tracks = output?.getAudioTracks() ?? []
      if (tracks.length <= 0) return null
      return new MediaStream(tracks.map((track) => track.clone()))
    },
  }
}
