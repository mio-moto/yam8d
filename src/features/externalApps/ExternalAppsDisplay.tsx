import { css } from '@linaria/core'
import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useM8SdkHost } from '../../sdk'
import { isEdit, isOpt, isPlay, isShift } from '../connection/keys'
import type { ConnectedBus } from '../connection/connection'
import type { KeyCommand } from '../connection/protocol'
import { useSettingsContext } from '../settings/settings'
import { useViewName } from '../state/viewStore'

const externalAppsClass = css`
  height: 93vh;
  width: -webkit-fill-available;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  background: #111;

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
        <div className={externalAppsClass}>
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
            </div>

            {iframeSrc ? (
                <iframe ref={iframeRef} src={iframeSrc} title={activeApp?.name ?? 'External App'} />
            ) : (
                <div className="empty">No external app configured.</div>
            )}
        </div>
    )
}
