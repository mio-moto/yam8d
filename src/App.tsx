import { css } from '@linaria/core'
import './App.css'
import { type FC, useCallback, useState } from 'react'
import { style } from './app/style/style'
import { Button } from './components/Button'
import type { ConnectedBus } from './features/connection/connection'
import { device } from './features/connection/device'
import type { SystemCommand } from './features/connection/protocol'
import { useM8Input } from './features/inputs/useM8input'
import { M801Player } from './features/M8-01Player'
import { M8Player } from './features/M8Player'
import { useMacroInput } from './features/macros/useMacroInput'
import { Menu } from './features/settings/menu'
import { useSettingsContext } from './features/settings/settings'
import { VirtualKeyboard } from './features/virtualKeyboard/VirtualKeyboard'

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
  const [model, setModel] = useState<1 | 2>(2)

  const tryConnect = useCallback(() => {
    const res = device()

    ;(async () => {
      if (!res.connection.browserSupport) {
        console.error('No usb / serial support detected.')
        return
      }
      const bus = await res.connection.connect()

      setConnectedBus(bus)
      const onSystemCommand = (sys: SystemCommand | undefined) => {
        if (sys) {
          setModel(sys.model === 'M8 Model:02' ? 2 : 1)
        }
      }
      bus.protocol.eventBus.on('system', onSystemCommand)
      onSystemCommand(bus.protocol.getSystemInfo())
      await res.audio.connect()
    })()
  }, [])

  useM8Input(connectedBus)
  useMacroInput(connectedBus)

  return (
    <div className={appClass}>
      <Menu />
      {!connectedBus && <Button onClick={tryConnect}>Connect</Button>}
      {connectedBus && (
        <>
          {settings.virtualKeyboard && <VirtualKeyboard bus={connectedBus} strokeColor={style.themeColors.text.default}></VirtualKeyboard>}
          {model === 1 && <M801Player bus={connectedBus} fullView={settings.fullM8View} />}
          {model === 2 && <M8Player bus={connectedBus} fullView={settings.fullM8View} />}
        </>
      )}
    </div>
  )
}
