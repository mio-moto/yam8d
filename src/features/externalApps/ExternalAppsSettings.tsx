import { css } from '@linaria/core'
import { type FC, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import type { ExternalAppConfig } from '../settings/settings'
import { useSettingsContext } from '../settings/settings'

const externalAppsSettingsClass = css`
  width: min(860px, 86vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  color: inherit;
  background: rgb(48, 48, 48);

  > .header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;

    > h2 {
      margin: 0;
      font-size: 1.35rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
  }

  > .apps {
    display: grid;
    row-gap: 10px;
    overflow: auto;
    padding-right: 4px;
  }

  > .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.18);
  }
`

const externalAppRowClass = css`
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(240px, 1.3fr) auto auto auto;
  gap: 8px;
  align-items: center;

  > input {
    min-width: 0;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const externalAppsEqual = (left: ExternalAppConfig[], right: ExternalAppConfig[]) => JSON.stringify(left) === JSON.stringify(right)

const createExternalAppId = () => {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
        return window.crypto.randomUUID()
    }
    return `external-app-${Date.now()}`
}

export const ExternalAppsSettings: FC = () => {
    const { settings, updateSettingValue } = useSettingsContext()
    const [draftApps, setDraftApps] = useState<ExternalAppConfig[]>(settings.externalApps)
    const [activeDraftId, setActiveDraftId] = useState(settings.activeExternalAppId)
    const hasChanges = useMemo(
        () => !externalAppsEqual(draftApps, settings.externalApps) || activeDraftId !== settings.activeExternalAppId,
        [activeDraftId, draftApps, settings.activeExternalAppId, settings.externalApps],
    )

    useEffect(() => {
        setDraftApps((apps) => externalAppsEqual(apps, settings.externalApps) ? apps : settings.externalApps)
        setActiveDraftId(settings.activeExternalAppId)
    }, [settings.activeExternalAppId, settings.externalApps])

    const updateDraftApp = (id: string, patch: Partial<ExternalAppConfig>) => {
        setDraftApps((apps) => apps.map((app) => app.id === id ? { ...app, ...patch } : app))
    }

    const addApp = () => {
        const id = createExternalAppId()
        const nextApp: ExternalAppConfig = {
            id,
            name: 'New External App',
            url: '',
            useUrlFallback: false,
        }
        setDraftApps((apps) => [...apps, nextApp])
        setActiveDraftId(id)
    }

    const removeApp = (id: string) => {
        setDraftApps((apps) => apps.filter((app) => app.id !== id))
        setActiveDraftId((currentId) => currentId === id ? draftApps.find((app) => app.id !== id)?.id ?? null : currentId)
    }

    const setActiveApp = (id: string) => {
        setActiveDraftId(id)
    }

    const save = () => {
        updateSettingValue('externalApps', draftApps)
        updateSettingValue('activeExternalAppId', activeDraftId)
    }

    const reset = () => {
        setDraftApps(settings.externalApps)
        setActiveDraftId(settings.activeExternalAppId)
    }

    return (
        <div className={externalAppsSettingsClass}>
            <div className="header">
                <h2>External Apps Setup</h2>
                <Button onClick={addApp}>Add app</Button>
            </div>

            <div className="apps">
                {draftApps.map((app) => (
                    <div className={externalAppRowClass} key={app.id}>
                        <Input
                            value={app.name}
                            placeholder="Application name"
                            aria-label="External app name"
                            onChange={(event) => updateDraftApp(app.id, { name: (event.target as HTMLInputElement).value })}
                        />
                        <Input
                            value={app.url}
                            placeholder="https://example.com/"
                            aria-label="External app URL"
                            onChange={(event) => updateDraftApp(app.id, { url: (event.target as HTMLInputElement).value })}
                        />
                        <Button selected={activeDraftId === app.id} onClick={() => setActiveApp(app.id)}>
                            Active
                        </Button>
                        <Button
                            selected={app.useUrlFallback}
                            onClick={() => updateDraftApp(app.id, { useUrlFallback: !app.useUrlFallback })}
                        >
                            URL fallback
                        </Button>
                        <Button disabled={draftApps.length <= 1} onClick={() => removeApp(app.id)}>
                            Remove
                        </Button>
                    </div>
                ))}
            </div>

            <div className="actions">
                <Button onClick={reset} disabled={!hasChanges}>
                    Reset
                </Button>
                <Button selected={hasChanges} onClick={save} disabled={!hasChanges}>
                    Save
                </Button>
            </div>
        </div>
    )
}
