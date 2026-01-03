import { css } from '@linaria/core'
import './App.css'
import { type FC, useCallback, useState } from 'react'
import { Button } from './components/Button'
import type { ConnectedBus } from './features/connection/connection'
import { device } from './features/connection/device'
import { M8Player } from './features/M8Player'
import { useSettingsContext } from './features/settings/settings'
import { useM8Input } from './features/inputs/useM8input'
import { VirtualKeyboard } from './features/virtualKeyboard/VirtualKeyboard'
import { style } from './app/style/style'
import { Menu } from './features/settings/menu'
import { useMacroInput } from './features/macros/useMacroInput'

const appClass = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: stretch;
  align-items: stretch;

  gap: 16px;

  > ._buttons {
    display: flex;
  }
`

export const App: FC = () => {
  const { settings } = useSettingsContext()

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
  useMacroInput(connectedBus)

  return (
    <div className={appClass}>
      <Menu />
      {!connectedBus && <Button onClick={tryConnect}>Connect</Button>}
      {connectedBus &&
        <>

          {settings.virtualKeyboard && <VirtualKeyboard bus={connectedBus} strokeColor={style.themeColors.text.default}></VirtualKeyboard>}
          <M8Player bus={connectedBus} fullView={settings.fullM8View} WGLRendering={settings.webGLRendering} />
        </>
      }
    </div>
  )
}
