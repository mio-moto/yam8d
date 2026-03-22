import { forwardRef, type MouseEventHandler, useEffect, useImperativeHandle, useRef } from 'react'
import { useSetAtom } from 'jotai'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, SystemCommand, WaveCommand } from '../connection/protocol'
import { useSettingsContext } from '../settings/settings'
import { vjActiveKeyAtom } from '../state/viewStore'
import type { ScreenLayout } from './renderer'
import type { DrawCommand, WorkerInMessage, WorkerOutMessage } from './renderer.worker'

const VJ_NUMPAD_STORAGE_KEY = 'M8savedBackgroundShaders'
type VJSavedShader = { id: string; source: string; compositeM8Screen: boolean; name: string; updatedAt: number }

const loadVJShaderById = (id: string): VJSavedShader | null => {
    try {
        const raw = localStorage.getItem(VJ_NUMPAD_STORAGE_KEY)
        if (!raw) return null
        const list = JSON.parse(raw) as VJSavedShader[]
        return list.find((s) => s.id === id) ?? null
    } catch {
        return null
    }
}

const makeScreenLayout = ({ model, fontMode }: SystemCommand): ScreenLayout => {
    if (model === 'M8 Model:02') {
        return (fontMode + 3) as ScreenLayout
    }
    return (fontMode + 1) as ScreenLayout
}

export const canUseOffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'

export const M8Screen = forwardRef<HTMLCanvasElement, { bus?: ConnectedBus | null; onClick?: MouseEventHandler<HTMLCanvasElement> | undefined | null }>(function M8Screen({ bus, onClick }, ref) {
    const innerRef = useRef<HTMLCanvasElement | null>(null)
    const workerRef = useRef<Worker>(undefined)
    // Holds a pending worker-terminate timer so StrictMode double-mount can cancel it
    const terminateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    // Batch accumulator for draw commands — flushed via setTimeout(0) to coalesce
    // all commands arriving within the same JS macrotask into a single postMessage
    const pendingBatchRef = useRef<DrawCommand[]>([])
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const { settings } = useSettingsContext()

    // Audio capture refs (AudioContext lives on the main thread, not inside the worker)
    const micStateRef = useRef<'idle' | 'starting' | 'ready' | 'error'>('idle')
    const micContextRef = useRef<AudioContext | null>(null)
    const micAnalyserRef = useRef<AnalyserNode | null>(null)
    const micFreqDataRef = useRef<Float32Array<ArrayBuffer> | null>(null)
    const micTimeDomainRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
    const remappedSpectrumRef = useRef<Float32Array<ArrayBuffer> | null>(null)
    const usesAudioRef = useRef(false)
    const spectrumBandsRef = useRef<64 | 128 | 256>(128)

    useImperativeHandle(ref, () => innerRef.current as HTMLCanvasElement, [])

    // Worker setup — empty deps so OffscreenCanvas is transferred only once.
    // StrictMode calls cleanup + re-mounts synchronously; the deferred terminate in
    // cleanup is cancelled before it fires, so the worker survives that cycle.
    useEffect(() => {
        const canvas = innerRef.current
        if (!canvas || !canUseOffscreenCanvas) return

        // Cancel any pending termination scheduled by a StrictMode cleanup
        if (terminateTimerRef.current !== undefined) {
            clearTimeout(terminateTimerRef.current)
            terminateTimerRef.current = undefined
        }

        // Create the worker only if one doesn't already exist (first real mount)
        if (!workerRef.current) {
            const worker = new Worker(new URL('./renderer.worker.ts', import.meta.url), { type: 'module' })
            workerRef.current = worker

            const offscreen = canvas.transferControlToOffscreen()
            worker.postMessage(
                { type: 'init', canvas: offscreen, screenLayout: 5, smoothRendering: true } satisfies WorkerInMessage,
                [offscreen],
            )

            worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
                if (event.data.type === 'shaderError' && event.data.error) {
                    console.error('Custom background shader error:', event.data.error)
                }
            }
        }

        const worker = workerRef.current

        // Audio loop: captures mic FFT on the main thread and posts data to the worker
        // (AudioContext is not available in DedicatedWorkerGlobalScope)
        let audioLoopId: number | undefined

        const ensureMicInput = () => {
            if (micStateRef.current !== 'idle') return
            if (!navigator.mediaDevices?.getUserMedia) { micStateRef.current = 'error'; return }
            micStateRef.current = 'starting'
            navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
                .then((stream) => {
                    const ctx = new AudioContext()
                    const analyser = ctx.createAnalyser()
                    analyser.fftSize = 2048
                    analyser.minDecibels = -90
                    analyser.maxDecibels = -10
                    analyser.smoothingTimeConstant = 0.1
                    ctx.createMediaStreamSource(stream).connect(analyser)
                    micContextRef.current = ctx
                    micAnalyserRef.current = analyser
                    micFreqDataRef.current = new Float32Array(analyser.frequencyBinCount)
                    micTimeDomainRef.current = new Uint8Array(analyser.fftSize)
                    micStateRef.current = 'ready'
                })
                .catch(() => { micStateRef.current = 'error' })
        }

        const tickAudio = () => {
            if (!usesAudioRef.current || !workerRef.current) { audioLoopId = undefined; return }
            ensureMicInput()
            let level = 0
            let spectrum: Float32Array | null = null
            if (micStateRef.current === 'ready' && micAnalyserRef.current && micFreqDataRef.current && micTimeDomainRef.current) {
                const analyser = micAnalyserRef.current
                const freqData = micFreqDataRef.current
                const timeDomain = micTimeDomainRef.current
                analyser.getByteTimeDomainData(timeDomain)
                let sum = 0
                for (let i = 0; i < timeDomain.length; i++) { const s = (timeDomain[i] - 128) / 128; sum += s * s }
                level = Math.min(1, Math.sqrt(sum / timeDomain.length) * 2.5)
                analyser.getFloatFrequencyData(freqData)
                const sampleRate = micContextRef.current?.sampleRate ?? 44100
                const nyquist = sampleRate * 0.5
                const minHz = 20.0
                const minDb = analyser.minDecibels
                const maxDb = analyser.maxDecibels
                const bandCount = spectrumBandsRef.current
                if (!remappedSpectrumRef.current || remappedSpectrumRef.current.length !== bandCount) {
                    remappedSpectrumRef.current = new Float32Array(bandCount)
                }
                spectrum = remappedSpectrumRef.current
                for (let band = 0; band < bandCount; band++) {
                    const t0 = minHz * (nyquist / minHz) ** (band / bandCount)
                    const t1 = minHz * (nyquist / minHz) ** ((band + 1) / bandCount)
                    const s0 = Math.max(0, Math.floor((t0 / nyquist) * freqData.length))
                    const s1 = Math.min(freqData.length, Math.max(s0 + 1, Math.ceil((t1 / nyquist) * freqData.length)))
                    let peak = minDb
                    for (let i = s0; i < s1; i++) peak = Math.max(peak, freqData[i])
                    spectrum[band] = Math.min(1, Math.max(0, (peak - minDb) / (maxDb - minDb)))
                }
            }
            workerRef.current.postMessage({ type: 'audioData', level, spectrum } satisfies WorkerInMessage)
            audioLoopId = requestAnimationFrame(tickAudio)
        }

        // Update onmessage now that tickAudio is defined
        worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
            const msg = event.data
            if (msg.type === 'shaderError') {
                if (msg.error) console.error('Custom background shader error:', msg.error)
                usesAudioRef.current = msg.usesAudio
                if (msg.usesAudio && audioLoopId === undefined) {
                    audioLoopId = requestAnimationFrame(tickAudio)
                } else if (!msg.usesAudio && audioLoopId !== undefined) {
                    cancelAnimationFrame(audioLoopId)
                    audioLoopId = undefined
                }
            }
        }

        // Resize observer — forwards display pixel size to worker
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                let width: number
                let height: number
                if (entry.devicePixelContentBoxSize) {
                    width = entry.devicePixelContentBoxSize[0].inlineSize
                    height = entry.devicePixelContentBoxSize[0].blockSize
                } else {
                    const dpr = window.devicePixelRatio || 1
                    width = Math.round(entry.contentRect.width * dpr)
                    height = Math.round(entry.contentRect.height * dpr)
                }
                if (width > 0 && height > 0) {
                    worker.postMessage({ type: 'resize', width, height } satisfies WorkerInMessage)
                }
            }
        })
        observer.observe(canvas)

        // Forward pointer events so shaders can use uMouse
        let pointerDown = 0
        const sendMouse = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            const dpr = window.devicePixelRatio || 1
            const canvasW = rect.width * dpr
            const canvasH = rect.height * dpr
            const x = Math.max(0, Math.min(canvasW, ((e.clientX - rect.left) / rect.width) * canvasW))
            const y = Math.max(0, Math.min(canvasH, canvasH - ((e.clientY - rect.top) / rect.height) * canvasH))
            worker.postMessage({ type: 'setMouseState', x, y, down: pointerDown } satisfies WorkerInMessage)
        }
        const onPointerMove = (e: PointerEvent) => sendMouse(e)
        const onPointerDown = (e: PointerEvent) => { pointerDown = 1; sendMouse(e) }
        const onPointerUp = (e: PointerEvent) => { pointerDown = 0; sendMouse(e) }
        const onPointerLeave = () => { pointerDown = 0 }
        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerdown', onPointerDown)
        canvas.addEventListener('pointerup', onPointerUp)
        canvas.addEventListener('pointerleave', onPointerLeave)

        return () => {
            observer.disconnect()
            canvas.removeEventListener('pointermove', onPointerMove)
            canvas.removeEventListener('pointerdown', onPointerDown)
            canvas.removeEventListener('pointerup', onPointerUp)
            canvas.removeEventListener('pointerleave', onPointerLeave)
            // Stop audio loop and release AudioContext eagerly (unlike worker termination, no defer needed)
            if (audioLoopId !== undefined) { cancelAnimationFrame(audioLoopId); audioLoopId = undefined }
            usesAudioRef.current = false
            if (micContextRef.current) {
                void micContextRef.current.close()
                micContextRef.current = null
                micAnalyserRef.current = null
                micFreqDataRef.current = null
                micTimeDomainRef.current = null
            }
            micStateRef.current = 'idle'
            // Defer termination: if the effect re-fires immediately (StrictMode) the
            // next invocation will cancel this timer and reuse the worker.
            const w = workerRef.current
            terminateTimerRef.current = setTimeout(() => {
                w?.terminate()
                workerRef.current = undefined
                terminateTimerRef.current = undefined
            }, 0)
        }
    }, [])

    // Bus event routing — re-wires whenever the connection changes
    useEffect(() => {
        const worker = workerRef.current
        if (!worker) return

        const systemInfo = bus?.protocol.getSystemInfo()
        if (systemInfo) {
            worker.postMessage({ type: 'setScreenLayout', layout: makeScreenLayout(systemInfo) } satisfies WorkerInMessage)
        }

        const scheduleFlush = () => {
            if (flushTimerRef.current !== undefined) return
            flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = undefined
                const batch = pendingBatchRef.current.splice(0)
                if (batch.length > 0 && workerRef.current) {
                    workerRef.current.postMessage({ type: 'batch', commands: batch } satisfies WorkerInMessage)
                }
            }, 0)
        }

        const drawText = (data: CharacterCommand) => {
            pendingBatchRef.current.push({ type: 'drawText', data })
            scheduleFlush()
        }
        const drawRect = (data: RectCommand) => {
            pendingBatchRef.current.push({ type: 'drawRect', data })
            scheduleFlush()
        }
        const drawWave = (data: WaveCommand) => {
            pendingBatchRef.current.push({ type: 'drawWave', data })
            scheduleFlush()
        }
        const updateRenderer = (data: SystemCommand) => {
            worker.postMessage({ type: 'setScreenLayout', layout: makeScreenLayout(data) } satisfies WorkerInMessage)
        }

        bus?.protocol.eventBus.on('text', drawText)
        bus?.protocol.eventBus.on('rect', drawRect)
        bus?.protocol.eventBus.on('wave', drawWave)
        bus?.protocol.eventBus.on('system', updateRenderer)

        // Request a full screen redraw NOW that all listeners are wired.
        // Calling this here (rather than inside connect()) ensures the M8's
        // response arrives after the handlers above are registered.
        setTimeout(()=> bus?.commands.resetScreen() , 100)

        return () => {
            // Cancel any pending batch flush and discard buffered commands
            if (flushTimerRef.current !== undefined) {
                clearTimeout(flushTimerRef.current)
                flushTimerRef.current = undefined
            }
            pendingBatchRef.current = []
            bus?.protocol.eventBus.off('text', drawText)
            bus?.protocol.eventBus.off('rect', drawRect)
            bus?.protocol.eventBus.off('wave', drawWave)
            bus?.protocol.eventBus.off('system', updateRenderer)
        }
    }, [bus])

    useEffect(() => {
        workerRef.current?.postMessage({ type: 'setSmoothRendering', enabled: settings.smoothRendering } satisfies WorkerInMessage)
    }, [settings.smoothRendering])

    useEffect(() => {
        workerRef.current?.postMessage({ type: 'setSmoothParams', blur: settings.smoothBlurRadius, threshold: settings.smoothThreshold, smoothness: settings.smoothSmoothness } satisfies WorkerInMessage)
    }, [settings.smoothBlurRadius, settings.smoothThreshold, settings.smoothSmoothness])

    useEffect(() => {
        workerRef.current?.postMessage({ type: 'setCustomBackgroundShader', source: settings.customBackgroundShader } satisfies WorkerInMessage)
    }, [settings.customBackgroundShader])

    useEffect(() => {
        workerRef.current?.postMessage({ type: 'setBackgroundShader', shader: settings.backgroundShader } satisfies WorkerInMessage)
    }, [settings.backgroundShader])

    useEffect(() => {
        spectrumBandsRef.current = settings.backgroundShaderSpectrumBands
        remappedSpectrumRef.current = null // reallocate at new size next tick
        workerRef.current?.postMessage({ type: 'setAudioSpectrumBands', bands: settings.backgroundShaderSpectrumBands } satisfies WorkerInMessage)
    }, [settings.backgroundShaderSpectrumBands])

    useEffect(() => {
        workerRef.current?.postMessage({ type: 'setCompositeM8Screen', value: settings.backgroundShaderCompositeM8Screen } satisfies WorkerInMessage)
    }, [settings.backgroundShaderCompositeM8Screen])

    const setVjActiveKey = useSetAtom(vjActiveKeyAtom)

    // VJ mode: precompile all assigned shaders and handle numpad key switching
    useEffect(() => {
        if (!settings.vjMode) {
            setVjActiveKey(null)
            return
        }

        const worker = workerRef.current
        if (!worker) return

        // Precompile every assigned shader so switching is instant
        for (const shaderId of Object.values(settings.vjNumpadAssignments)) {
            if (!shaderId) continue
            const shader = loadVJShaderById(shaderId)
            if (shader) {
                worker.postMessage({ type: 'precompileVJShader', id: shaderId, source: shader.source } satisfies WorkerInMessage)
            }
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (!e.code.startsWith('Numpad')) return
            const key = e.code.replace('Numpad', '')
            if (!/^[0-9]$/.test(key)) return
            const shaderId = settings.vjNumpadAssignments[key]
            if (!shaderId) return
            const shader = loadVJShaderById(shaderId)
            if (!shader) return
            worker.postMessage({ type: 'activateVJShader', id: shaderId, compositeM8Screen: shader.compositeM8Screen } satisfies WorkerInMessage)
            setVjActiveKey(key)
            e.preventDefault()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [settings.vjMode, settings.vjNumpadAssignments, setVjActiveKey])

    return (
        <canvas
            className="element"
            onClick={onClick ?? undefined}
            ref={innerRef}
            style={{
                width: '100%',
                imageRendering: 'auto',
                height: '100%',
                margin: 'auto',
                position: 'relative',
                borderRadius:'15px'
            }}
        ></canvas>
    )
})
