import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import { getM8InputStream, getM8OutputCaptureStream, M8_AUDIO_CAPTURE_CONSTRAINTS } from '../connection/audio'
import { fixWebmDuration } from './fixWebmDuration'
import { recordingStateAtom } from '../state/viewStore'

export type RecordingMode = 'canvas' | 'display'

type RecorderStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'error'

type StartRecordingOptions = {
  mode: RecordingMode
  canvas?: HTMLCanvasElement | null
  frameRate?: number
}

type DisplayMediaOptionsExperimental = DisplayMediaStreamOptions & {
  selfBrowserSurface?: 'include' | 'exclude'
  preferCurrentTab?: boolean
}

type RecorderResult = {
  blob: Blob
  url: string
  mimeType: string
  mode: RecordingMode
  fileName: string
}

const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp9',
  'video/webm',
] as const

const getSupportedMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

const createTimestamp = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
}

const mergeStreams = (videoStream: MediaStream, audioStream?: MediaStream | null) => {
  const tracks = [...videoStream.getVideoTracks()]
  if (audioStream) {
    tracks.push(...audioStream.getAudioTracks())
  }
  return new MediaStream(tracks)
}

const cloneAudioStream = (tracks: MediaStreamTrack[]) => new MediaStream(tracks.map((track) => track.clone()))

const hasMonoAudio = (tracks: MediaStreamTrack[]) => tracks.some((track) => track.getSettings().channelCount === 1)

const stopStream = (stream: MediaStream | null) => {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

const getFallbackM8InputStream = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Audio capture is not supported in this browser.')
  }

  return getM8InputStream()
}

const getCanvasRecordingAudioStream = async () => {
  return getM8OutputCaptureStream() ?? await getFallbackM8InputStream()
}

const getDisplayRecordingAudioStream = async (displayStream: MediaStream) => {
  const displayAudioTracks = displayStream.getAudioTracks()
  if (displayAudioTracks.length > 0) {
    if (hasMonoAudio(displayAudioTracks)) {
      return getM8OutputCaptureStream() ?? cloneAudioStream(displayAudioTracks)
    }

    return cloneAudioStream(displayAudioTracks)
  }

  return getM8OutputCaptureStream() ?? await getFallbackM8InputStream()
}

export const useCanvasRecorder = () => {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecorderResult | null>(null)
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null)
  const setRecordingState = useSetAtom(recordingStateAtom)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const combinedStreamRef = useRef<MediaStream | null>(null)
  const videoStreamRef = useRef<MediaStream | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startTimeRef = useRef<number>(0)
  const pendingStopRef = useRef<{
    resolve: () => void
    reject: (reason?: unknown) => void
    mode: RecordingMode
    mimeType: string
  } | null>(null)

  const supportedMimeType = useMemo(getSupportedMimeType, [])

  const cleanupStreams = useCallback(() => {
    stopStream(combinedStreamRef.current)
    stopStream(videoStreamRef.current)
    stopStream(audioStreamRef.current)
    combinedStreamRef.current = null
    videoStreamRef.current = null
    audioStreamRef.current = null
  }, [])

  const clearResult = useCallback(() => {
    setResult((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.url)
      }
      return null
    })
  }, [])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve()
    }

    setStatus('stopping')

    return new Promise<void>((resolve, reject) => {
      pendingStopRef.current = {
        resolve,
        reject,
        mode: (recorder as MediaRecorder & { __mode?: RecordingMode }).__mode ?? 'canvas',
        mimeType: recorder.mimeType || supportedMimeType || 'video/webm',
      }
      recorder.stop()
    })
  }, [supportedMimeType])

  const startRecording = useCallback(async ({ mode, canvas, frameRate = 60 }: StartRecordingOptions) => {
    if (status === 'starting' || status === 'recording' || status === 'stopping') {
      return
    }

    if (!supportedMimeType && typeof MediaRecorder !== 'undefined') {
      setError('No supported recording format was found in this browser.')
      setStatus('error')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.')
      setStatus('error')
      return
    }

    if (mode === 'canvas' && !canvas) {
      setError('Canvas capture is unavailable.')
      setStatus('error')
      return
    }

    setStatus('starting')
    setError(null)
    clearResult()
    chunksRef.current = []
    setRecordingMode(mode)
    setRecordingState({ mode, isRecording: true })
    startTimeRef.current = Date.now()

    try {
      const canvasElement = canvas
      if (!canvasElement) return
      if (mode === 'canvas' && !canvasElement) {
        throw new Error('Canvas capture is unavailable.')
      }
      let videoStream: MediaStream
      if (mode === 'canvas') {
        videoStream = canvasElement.captureStream(frameRate)
      } else {
        const displayMediaOptions: DisplayMediaOptionsExperimental = {
          video: {
            frameRate: { ideal: frameRate, max: frameRate },
            displaySurface: 'browser',
          },
          selfBrowserSurface: 'include',
          preferCurrentTab: true,
          audio: M8_AUDIO_CAPTURE_CONSTRAINTS,
        }
        videoStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)
      }

      videoStreamRef.current = videoStream

      const audioStream = mode === 'canvas'
        ? await getCanvasRecordingAudioStream()
        : await getDisplayRecordingAudioStream(videoStream)
      audioStreamRef.current = audioStream

      const combinedStream = mergeStreams(videoStream, audioStream)
      combinedStreamRef.current = combinedStream

      const recorder = new MediaRecorder(
        combinedStream,
        supportedMimeType ? {
          mimeType: supportedMimeType,
          videoBitsPerSecond: 12_000_000,
          audioBitsPerSecond: 192_000,
        } : undefined,
      )

        ; (recorder as MediaRecorder & { __mode?: RecordingMode }).__mode = mode

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setError('Recording failed.')
        setStatus('error')
        setRecordingMode(null)
        setRecordingState({ mode: null, isRecording: false })
      }

      recorder.onstop = async () => {
        const pendingStop = pendingStopRef.current
        pendingStopRef.current = null

        try {
          const mimeType = pendingStop?.mimeType || recorder.mimeType || supportedMimeType || 'video/webm'
          const rawBlob = new Blob(chunksRef.current, { type: mimeType })
          const duration = startTimeRef.current ? Date.now() - startTimeRef.current : 0
          const blob = await fixWebmDuration(rawBlob, duration)
          const url = URL.createObjectURL(blob)
          const fileName = `yam8d-${pendingStop?.mode ?? mode}-${createTimestamp()}.webm`
          setResult({
            blob,
            url,
            mimeType,
            mode: pendingStop?.mode ?? mode,
            fileName,
          })
          setStatus('idle')
          setRecordingMode(null)
          setRecordingState({ mode: null, isRecording: false })
          cleanupStreams()
          recorderRef.current = null
          pendingStop?.resolve()
        } catch (stopError) {
          cleanupStreams()
          recorderRef.current = null
          setStatus('error')
          setRecordingMode(null)
          setRecordingState({ mode: null, isRecording: false })
          setError(stopError instanceof Error ? stopError.message : 'Failed to finalize recording.')
          pendingStop?.reject(stopError)
        }
      }

      recorderRef.current = recorder

      const videoTrack = videoStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          void stopRecording()
        }
      }

      recorder.start(1000)
      setStatus('recording')
    } catch (startError) {
      cleanupStreams()
      recorderRef.current = null
      setStatus('error')
      setRecordingMode(null)
      setRecordingState({ mode: null, isRecording: false })
      setError(startError instanceof Error ? startError.message : 'Unable to start recording.')
    }
  }, [cleanupStreams, clearResult, setRecordingState, status, stopRecording, supportedMimeType])

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      cleanupStreams()
      clearResult()
    }
  }, [cleanupStreams, clearResult])

  // Stop recording when Escape is pressed
  useEffect(() => {
    if (status !== 'recording') return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void stopRecording()
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [status, stopRecording])

  return {
    clearResult,
    error,
    isRecording: status === 'recording',
    recordingMode,
    result,
    startRecording,
    status,
    stopRecording,
    supportedMimeType,
  }
}
