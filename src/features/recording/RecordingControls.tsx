import { css } from '@linaria/core'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useCanvasRecorder, type RecordingMode } from './useCanvasRecorder'

const wrapperClass = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  justify-content: flex-end;
  position: absolute;
  bottom: 2px;
  right:2px;
`

const panelClass = css`
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.03);
  position: relative;
`

const iconButtonClass = css`
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
`

const modePopoverClass = css`
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(19, 19, 19, 0.96);
  z-index: 5;
  width:250px;
`

const modeButtonClass = css`
  min-width: 132px;
  justify-content: flex-start;
  gap: 8px;
  border: none;
`

const srOnlyClass = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const recordIcon = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="black"/></svg>')}`
const stopIcon = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" fill="black"/></svg>')}`
const downloadIcon = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 4h2v8h3l-4 5-4-5h3zM5 19h14v2H5z" fill="black"/></svg>')}`
const closeIcon = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3z" fill="black"/></svg>')}`
const canvasIcon = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" fill="none" stroke="black" stroke-width="2"/><path d="M8 20h8" stroke="black" stroke-width="2"/></svg>')}`
const displayIcon = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2" fill="none" stroke="black" stroke-width="2"/><path d="M8 20h8M12 18v2" stroke="black" stroke-width="2"/></svg>')}`

type RecordingControlsProps = {
  getCanvas: () => HTMLCanvasElement | null
}

export const RecordingControls = ({ getCanvas }: RecordingControlsProps) => {
  const [mode, setMode] = useState<RecordingMode>('canvas')
  const [isModeOpen, setIsModeOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const { startRecording, stopRecording, result, status, error, isRecording, supportedMimeType, clearResult } = useCanvasRecorder()

  useEffect(() => {
    if (!isModeOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsModeOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [isModeOpen])

  useEffect(() => {
    if (status === 'recording' || status === 'stopping' || result) {
      setIsModeOpen(false)
    }
  }, [result, status])

  const handleRecordClick = () => {
    if (!supportedMimeType || status === 'starting' || status === 'stopping') {
      return
    }
    setIsModeOpen((current) => !current)
  }

  const handleModeSelect = (nextMode: RecordingMode) => {
    setMode(nextMode)
    setIsModeOpen(false)
    void startRecording({ mode: nextMode, canvas: getCanvas() })
  }

  return (
    <div className={wrapperClass} ref={rootRef} title={error ?? undefined}>
      <div className={panelClass}>
        {!result && !isRecording ? (
          <>
            <Button
              className={iconButtonClass}
              style={{ color: 'red' }}
              onClick={handleRecordClick}
              disabled={status === 'starting' || status === 'stopping' || !supportedMimeType}
              title={error || `Record (${mode === 'canvas' ? 'screen only' : 'full tab/window'})`}
            >
              <Icon icon={recordIcon} size="s" />
              <span className={srOnlyClass} >Record</span>
            </Button>
            {isModeOpen && (
              <div className={modePopoverClass}>
                <Button className={modeButtonClass} selected={mode === 'canvas'} onClick={() => handleModeSelect('canvas')} title="Record screen only">
                  <Icon icon={canvasIcon} size="s" />
                  M8 Screen only
                </Button>
                <Button className={modeButtonClass} selected={mode === 'display'} onClick={() => handleModeSelect('display')} title="Record full tab/window">
                  <Icon icon={displayIcon} size="s" />
                  Full tab/window
                </Button>
              </div>
            )}
          </>
        ) : isRecording ? (
          <Button className={iconButtonClass}
            style={{ color: 'red' }}
            onClick={() => void stopRecording()}
            disabled={status === 'stopping'}
            title="Stop recording">
            <Icon icon={stopIcon} size="s" />
            <span className={srOnlyClass}>Stop</span>
          </Button>
        ) : result ? (
          <>
            <a href={result.url} download={result.fileName}>
              <Button className={iconButtonClass} title="Download recording">
                <Icon icon={downloadIcon} size="s" />
                <span className={srOnlyClass}>Download</span>
              </Button>
            </a>
            <Button className={iconButtonClass} onClick={clearResult} title="Discard recording and go back">
              <Icon icon={closeIcon} size="s" />
              <span className={srOnlyClass}>Reset</span>
            </Button>
          </>
        ) : (
          <Button className={iconButtonClass} disabled title={error || 'Recording unavailable'}>
            <Icon icon={recordIcon} size="s" />
            <span className={srOnlyClass}>Record unavailable</span>
          </Button>
        )}
      </div>
    </div>
  )
}