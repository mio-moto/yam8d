export const midi = () => {
    const connect = async () => {
        const access = await navigator.requestMIDIAccess({ sysex: true })
        const inputs = [...access.inputs].filter(([_key, value]) => value.name === 'M8')
        const outputs = [...access.outputs].filter(([_key, value]) => value.name === 'M8')

        if (inputs.length <= 0 || outputs.length <= 0) {
            throw new Error('No input/outputs found')
        }

        if (inputs.length > 1 || outputs.length > 0) {
            console.warn('Suspicious: more than one m8 device found')
        }

        const input = inputs[0][1]
        const output = outputs[0][1]

        await input.open()
        await output.open()

        input.addEventListener('midimessage', (ev) => console.log([...(ev.data ?? [])].map((x) => x.toString(16).padStart(2, '0')).join(' ')))
        // output.send([0xf0, 0x00, 0x02, 0x61, 0x00, 0x00, 'D'.charCodeAt(0), 0xf7])
        // output.send([0xf0, 0x00, 0x02, 0x61, 0x00, 0x00, 'E'.charCodeAt(0), 0xf7])
    }

    return {
        connect,
    }
}
