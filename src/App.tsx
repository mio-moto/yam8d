import { css } from '@linaria/core'
import './App.css'
import { type FC, useCallback, useState } from 'react'
import { style } from './app/style/style'
import { Button } from './components/Button'
// import { DebugMenu, DebugPortalContextProvider } from './components/DebugMenu'
import type { ConnectedBus } from './features/connection/connection'
import { device } from './features/connection/device'
import type { SystemCommand } from './features/connection/protocol'
import { useM8Input } from './features/inputs/useM8input'
import { M8Player } from './features/M8Player'
import { useMacroInput } from './features/macros/useMacroInput'
import { Menu } from './features/settings/menu'
import { useSettingsContext } from './features/settings/settings'
import { VirtualKeyboard } from './features/virtualKeyboard/VirtualKeyboard'
//import { ProgramChangeKeyboard } from './features/virtualKeyboard/ProgramChangeKeyboard'
// import { StatusPanel } from './features/debug/StatusPanel'
import { ShortcutsDisplay } from './features/shortcuts/shortcutsIntegration'
import { Manual } from './features/manual'
import { BackgroundShaderEditor } from './features/rendering/BackgroundShaderEditor'
// import { SdkTest } from './components/SdkTest'

const appClass = css`
    min-width: 38vw;
    max-width: 69vw;
    width: -webkit-fill-available;
  // display: flex;
  // flex-direction: column;
  // flex: 1;
  // justify-content: stretch;
  // align-items: stretch;

  // gap: 16px;

  // > ._buttons {
  //   display: flex;
  // }
`

const playerRowClass = css`
  display: flex;
  gap: 16px;
  align-items: stretch;
  justify-content: center;
`

export const App: FC = () => {
  const { settings } = useSettingsContext()

  const [connectedBus, setConnectedBus] = useState<ConnectedBus>()
  // const [model, setModel] = useState<1 | 2>(2)

  const tryConnect = useCallback(() => {
    const res = device()

      ; (async () => {
        if (!res.connection.browserSupport) {
          console.error('No usb / serial support detected.')
          return
        }
        const bus = await res.connection.connect()

        setConnectedBus(bus)
        const onSystemCommand = (sys: SystemCommand | undefined) => {
          if (sys) {
            // setModel(sys.model === 'M8 Model:02' ? 2 : 1)
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
    <>
      {!connectedBus && (<div style={{ display: 'grid', gap: '40px' }}>
        <Button onClick={tryConnect}>Connect</Button>
        <Manual></Manual>
      </div>)}
      {connectedBus && (
        <>
          <Menu />
          <div className={appClass}>
            {/* not ready <ProgramChangeKeyboard bus={connectedBus} strokeColor={style.themeColors.text.default} /> */}
            {settings.virtualKeyboard && <VirtualKeyboard bus={connectedBus} strokeColor={style.themeColors.text.default}></VirtualKeyboard>}
            <div className={playerRowClass}>
              <M8Player bus={connectedBus} fullView={settings.fullM8View} />
            </div>
          </div>
          {settings.showBackgroundShaderEditor && <BackgroundShaderEditor />}
          {settings.displayShortcuts && <ShortcutsDisplay bus={connectedBus} />}
          {/* <SdkTest bus={connectedBus} /> */}
          {/* <StatusPanel bus={connectedBus} /> */}
        </>
      )}
    </>
  )
}
