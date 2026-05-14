let outputCaptureStream: MediaStream | null = null

export const M8_AUDIO_CAPTURE_CONSTRAINTS = {
    autoGainControl: false,
    channelCount: { ideal: 2 },
    echoCancellation: false,
    noiseSuppression: false,
} satisfies MediaTrackConstraints

export const getM8AudioInputDevice = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return null

    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (x) => x.kind === 'audioinput' && x.label.includes('M8') && x.deviceId !== 'default' && x.deviceId !== 'communications',
    )

    if (devices.length > 1) {
        console.warn('Suspicious: More than one M8 audio input found')
    }

    return devices[0] ?? null
}

export const getM8InputStream = async () => {
    const device = await getM8AudioInputDevice()
    if (!device) {
        return navigator.mediaDevices.getUserMedia({ audio: M8_AUDIO_CAPTURE_CONSTRAINTS })
    }

    return navigator.mediaDevices.getUserMedia({
        audio: {
            ...M8_AUDIO_CAPTURE_CONSTRAINTS,
            deviceId: { exact: device.deviceId },
        },
    })
}

export const getM8OutputCaptureStream = () => {
    const audioTracks = outputCaptureStream?.getAudioTracks() ?? []
    if (audioTracks.length <= 0) return null

    return new MediaStream(audioTracks.map((track) => track.clone()))
}

export const audio = () => {
    const connect = async () => {
        const ctx = new AudioContext()
        const device = await getM8InputStream()
        const source = ctx.createMediaStreamSource(device)
        const outputCaptureDestination = ctx.createMediaStreamDestination()

        source.connect(ctx.destination)
        source.connect(outputCaptureDestination)

        outputCaptureStream = outputCaptureDestination.stream

        for (const track of device.getAudioTracks()) {
            track.addEventListener('ended', () => {
                if (outputCaptureStream === outputCaptureDestination.stream) {
                    outputCaptureStream = null
                }
            })
        }
    }

    return {
        connect,
    }
}
