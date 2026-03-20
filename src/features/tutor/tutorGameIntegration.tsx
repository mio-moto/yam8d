import { css } from '@linaria/core'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import type { ConnectedBus } from '../connection/connection'
import { useSettingsContext } from '../settings/settings'
import { useM8SdkHost } from '../../sdk'

const tutorPanelClass = css`
  height: 93vh;
  width: -webkit-fill-available;

  > iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
`

export const TutorGameDisplay: FC<{ bus?: ConnectedBus }> = ({ bus }) => {
  const { settings } = useSettingsContext()
  const { iframeRef, isReady: sdkReady } = useM8SdkHost(bus, { debug: false })
  const [iframeSrc, setIframeSrc] = useState(settings.tutorGameHost)

  useEffect(() => {
    if (!sdkReady) {
      setIframeSrc(settings.tutorGameHost)
    }
  }, [sdkReady, settings.tutorGameHost])

  return (
    <div className={tutorPanelClass}>
      <iframe ref={iframeRef} src={iframeSrc} title="M8 Tutor Game" />
    </div>
  )
}
