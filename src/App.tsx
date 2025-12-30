import { css } from '@linaria/core'
import './App.css'
import { type FC, useCallback, useEffect, useState } from 'react'
import { Button } from './components/Button'
import type { ConnectedBus } from './features/connection/connection'
import { device } from './features/connection/device'
import { M8Player } from './features/M8Player'
import { SettingsProvider } from './features/settings/settings'
import { useM8Input } from './features/inputs/M8input'

const appClass = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: stretch;
  align-items: stretch;

  gap: 32px;

  > ._buttons {
    display: flex;
  }
`

export const App: FC = () => {
  const [connectedBus, setConnectedBus] = useState<ConnectedBus>()

  const tryConnect = useCallback(() => {
    const res = device()

      ; (async () => {
        if (!res.connection.browserSupport) {
          console.error('No usb / serial support detected.')
          return
        }
        setConnectedBus(await res.connection.connect())
        await res.audio.connect()
      })()
  }, [])

  useM8Input(connectedBus)

  // State to track checkbox status
  const [isFullview, setIsFullview] = useState(true)
  const [isWGLRendering, setWGLRendering] = useState(true)


  // Handle checkbox change
  const handleFullviewCheckboxChange = (event: any) => {
    setIsFullview(event.target.checked);
  };
  const handleWGLCheckboxChange = (event: any) => {
    setWGLRendering(event.target.checked);
  };
  return (
    <SettingsProvider>
      <div className={appClass}>
        {!connectedBus && <Button onClick={tryConnect}>Connect</Button>}
        {connectedBus &&
          <>
            {/* TODO: create a menu component, the code below is just for test purpose */}
            <div className='menu'>
              <label>
                <input
                  type="checkbox"
                  checked={isFullview}
                  onChange={handleFullviewCheckboxChange}
                />
                Full M8 view
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={isWGLRendering}
                  onChange={handleWGLCheckboxChange}
                />
                Web GL
              </label>
            </div>
            <M8Player bus={connectedBus} fullView={isFullview} WGLRendering={isWGLRendering} />
          </>
        }
      </div>
    </SettingsProvider>

  )
}
