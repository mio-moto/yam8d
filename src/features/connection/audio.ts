export const audio = () => {
    const connect = async () => {
        const ctx = new AudioContext()

        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
            (x) => x.kind === 'audioinput' && x.label.includes('M8') && x.deviceId !== 'default' && x.deviceId !== 'communications',
        )
        if (devices.length > 1) {
            console.warn('Suspicious: More than one audio input found')
        }
        const device =
            devices.length <= 0
                ? await navigator.mediaDevices.getUserMedia({ audio: true })
                : await navigator.mediaDevices.getUserMedia({
                      audio: {
                          deviceId: { exact: devices[0].deviceId },
                          autoGainControl: false,
                          echoCancellation: false,
                          noiseSuppression: false,
                      },
                  })

        const source = ctx.createMediaStreamSource(device)
        source.connect(ctx.destination)
    }

    return {
        connect,
    }
}
