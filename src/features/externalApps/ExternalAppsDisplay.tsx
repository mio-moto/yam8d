import { css, cx } from '@linaria/core'
import type { FC, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { YAM8D_FRAME_NAME } from '../../../packages/m8-sdk/src/client'
import { useM8SdkHost } from '../../sdk'
import { isEdit, isOpt, isPlay, isShift } from '../../../packages/m8-sdk/src/engine/keys'
import type { ConnectedBus } from '../../../packages/m8-sdk/src/engine/connection'
import type { KeyCommand } from '../../../packages/m8-sdk/src/engine/protocol'
import { useSettingsContext } from '../settings/settings'
import { useViewName } from '../state/viewStore'

const MIN_PANE_WIDTH = 320
// Width left to the M8 pane and the root padding when the External Apps pane is dragged wide
const MIN_REMAINING_WIDTH = 300

const externalAppsClass = css`
  position: relative;
  box-sizing: border-box;
  height: var(--content-height);
  flex: 1 1 0;
  min-width: ${MIN_PANE_WIDTH}px;
  max-width: calc(100vw - ${MIN_REMAINING_WIDTH}px);
  display: flex;
  flex-direction: column;
  background: #111;

  &.sized {
    flex: 0 0 auto;
  }

  &.fullscreen {
    position: fixed;
    inset: 0;
    /* Below the menu (z-index 1000) so the menu stays reachable */
    z-index: 999;
    width: 100vw !important;
    max-width: none;
    height: 100vh;

    > .external-apps-toolbar {
      padding-left: 44px;
    }
  }

  /* The iframe would swallow pointer events while the edge is dragged */
  &.resizing > iframe {
    pointer-events: none;
  }

  > .splitter {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -8px;
    width: 8px;
    cursor: col-resize;
    touch-action: none;

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 3px;
      width: 2px;
      height: 40px;
      transform: translateY(-50%);
      border-radius: 1px;
      background: rgba(255, 255, 255, 0.18);
      transition: background 150ms ease, height 150ms ease;
    }

    &:hover::after,
    &.active::after {
      height: 100%;
      background: rgba(255, 255, 255, 0.4);
    }
  }

  > .external-apps-toolbar {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    background: rgb(42, 42, 42);
    border-bottom: 1px solid rgba(255, 255, 255, 0.18);

    > .title {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    > select {
      min-width: 180px;
      max-width: 320px;
      flex: 1;
      color: inherit;
      background: #1f1f1f;
      border: 1px solid rgba(255, 255, 255, 0.28);
      padding: 4px 8px;
    }

    > .status {
      color: rgba(255, 255, 255, 0.68);
      font-size: 0.85rem;
      white-space: nowrap;
    }

    > .fullscreen-toggle {
      margin-left: auto;
      display: inline-flex;
      padding: 4px;
      color: rgba(255, 255, 255, 0.68);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;

      &:hover {
        color: #fff;
        border-color: rgba(255, 255, 255, 0.28);
      }
    }
  }

  > iframe {
    flex: 1;
    width: 100%;
    border: none;
    background: #000;
  }

  > .empty {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
    color: rgba(255, 255, 255, 0.68);
    background: #111;
  }
`

const buildUrlFallback = (baseUrl: string, viewName: string | null, keyName: string): string => {
    const cleanBaseUrl = baseUrl.split('#')[0]
    const viewPath = encodeURIComponent(viewName ?? '')
    const keyParam = encodeURIComponent(keyName)
    return `${cleanBaseUrl}#/${viewPath}/?mode=min&key=${keyParam}`
}

const clampPaneWidth = (width: number): number =>
    Math.round(Math.max(MIN_PANE_WIDTH, Math.min(width, window.innerWidth - MIN_REMAINING_WIDTH)))

// Expand / collapse arrows, drawn with currentColor
const FullscreenIcon: FC<{ exit: boolean }> = ({ exit }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {exit ? (
            <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />
        ) : (
            <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />
        )}
    </svg>
)

export const ExternalAppsDisplay: FC<{ bus?: ConnectedBus }> = ({ bus }) => {
    const { settings, updateSettingValue } = useSettingsContext()
    const [viewName] = useViewName()
    const [keyName, setKeyName] = useState('')
    const prevMaskRef = useRef<number>(0)
    const activeKeyRef = useRef('')
    const activeApp = useMemo(
        () => settings.externalApps.find((app) => app.id === settings.activeExternalAppId) ?? settings.externalApps[0],
        [settings.activeExternalAppId, settings.externalApps],
    )
    const { iframeRef, isReady } = useM8SdkHost(bus, { debug: false })
    const [iframeSrc, setIframeSrc] = useState(activeApp?.url ?? '')
    const [fullscreen, setFullscreen] = useState(false)
    // Width while the splitter is dragged; saved to settings on release
    const [dragWidth, setDragWidth] = useState<number | null>(null)
    const dragRightRef = useRef(0)
    const paneRef = useRef<HTMLDivElement | null>(null)
    const paneWidth = dragWidth ?? settings.externalAppsWidth

    const onSplitterPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        const pane = paneRef.current
        if (!pane || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        const box = pane.getBoundingClientRect()
        dragRightRef.current = box.right
        setDragWidth(clampPaneWidth(box.width))
    }

    const onSplitterPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragWidth === null) return
        setDragWidth(clampPaneWidth(dragRightRef.current - event.clientX))
    }

    const onSplitterPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragWidth === null) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        updateSettingValue('externalAppsWidth', dragWidth)
        setDragWidth(null)
    }

    useEffect(() => {
        setIframeSrc(activeApp?.url ?? '')
    }, [activeApp?.url])

    useEffect(() => {
        if (!activeApp?.url || isReady) return

        setIframeSrc(activeApp.useUrlFallback
            ? buildUrlFallback(activeApp.url, viewName, keyName)
            : activeApp.url)
    }, [activeApp, isReady, keyName, viewName])

    useEffect(() => {
        if (!bus) return

        const stillPressed = (mask: number, name: string) => {
            if (!name) return false
            switch (name) {
                case 'opt':
                    return isOpt(mask)
                case 'shift':
                    return isShift(mask)
                case 'edit':
                    return isEdit(mask)
                case 'play':
                    return isPlay(mask)
                default:
                    return false
            }
        }

        const pickNewPress = (prev: number, cur: number): string => {
            if (!isOpt(prev) && isOpt(cur)) return 'opt'
            if (!isShift(prev) && isShift(cur)) return 'shift'
            if (!isEdit(prev) && isEdit(cur)) return 'edit'
            if (!isPlay(prev) && isPlay(cur)) return 'play'
            return ''
        }

        const onKey = (cmd: KeyCommand) => {
            const cur = cmd.keys ?? 0
            const prev = prevMaskRef.current ?? 0
            const currentActive = activeKeyRef.current

            if (currentActive) {
                if (stillPressed(cur, currentActive)) {
                    prevMaskRef.current = cur
                    return
                }
                activeKeyRef.current = ''
                setKeyName('')
                prevMaskRef.current = cur
                return
            }

            const newly = pickNewPress(prev, cur)
            if (newly) {
                activeKeyRef.current = newly
                setKeyName(newly)
            }

            prevMaskRef.current = cur
        }

        bus.protocol.eventBus.on('key', onKey)
        return () => {
            bus.protocol.eventBus.off('key', onKey)
        }
    }, [bus])

    return (
        <div
            ref={paneRef}
            className={cx(externalAppsClass, paneWidth > 0 && 'sized', fullscreen && 'fullscreen', dragWidth !== null && 'resizing')}
            style={paneWidth > 0 ? { width: paneWidth } : undefined}
        >
            {!fullscreen && (
                <div
                    className={cx('splitter', dragWidth !== null && 'active')}
                    title="Drag to resize, double-click to reset"
                    onPointerDown={onSplitterPointerDown}
                    onPointerMove={onSplitterPointerMove}
                    onPointerUp={onSplitterPointerUp}
                    onPointerCancel={onSplitterPointerUp}
                    onDoubleClick={() => updateSettingValue('externalAppsWidth', 0)}
                />
            )}
            <div className="external-apps-toolbar">
                <span className="title">External Apps</span>
                <select
                    value={activeApp?.id ?? ''}
                    onChange={(event) => updateSettingValue('activeExternalAppId', event.currentTarget.value)}
                    disabled={settings.externalApps.length === 0}
                    aria-label="Select external app"
                >
                    {settings.externalApps.map((app) => (
                        <option key={app.id} value={app.id}>
                            {app.name}
                        </option>
                    ))}
                </select>
                <span className="status">{isReady ? 'Connected' : 'Waiting'}</span>
                <button
                    type="button"
                    className="fullscreen-toggle"
                    onClick={() => setFullscreen((value) => !value)}
                    title={fullscreen ? 'Restore pane' : 'Fill the window'}
                    aria-label={fullscreen ? 'Restore pane' : 'Fill the window'}
                    aria-pressed={fullscreen}
                >
                    <FullscreenIcon exit={fullscreen} />
                </button>
            </div>

            {iframeSrc ? (
                <iframe ref={iframeRef} name={YAM8D_FRAME_NAME} src={iframeSrc} title={activeApp?.name ?? 'External App'} allow="midi" />
            ) : (
                <div className="empty">No external app configured.</div>
            )}
        </div>
    )
}
