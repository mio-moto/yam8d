import { css } from '@linaria/core'
import './App.css'
import { type FC, useCallback, useState } from 'react'
import { style } from './app/style/style'
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
import { ShortcutsDisplay } from './features/shortcuts/shortcutsIntegration'
import { TutorGameDisplay } from './features/tutor/tutorGameIntegration'
import { WelcomeSplash } from './features/WelcomeSplash'
import { BackgroundShaderEditor } from './features/rendering/BackgroundShaderEditor'
// import { StatusPanel } from './features/debug/StatusPanel'
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

        // Retry loop — the M8 Headless is slower to enumerate and may not be
        // immediately ready when the user clicks Connect.
        const maxAttempts = 3
        let bus: Awaited<ReturnType<typeof res.connection.connect>> | undefined
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            bus = await res.connection.connect()
            break
          } catch (err) {
            console.warn(`Connection attempt ${attempt}/${maxAttempts} failed:`, err)
            if (attempt < maxAttempts) {
              await new Promise<void>((resolve) => setTimeout(resolve, 1500))
            } else {
              console.error('Could not connect to M8 after all attempts:', err)
              return
            }
          }
        }
        if (!bus) return

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
      {!connectedBus && <WelcomeSplash onConnect={tryConnect} />}
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
          {settings.displayTutorGame && <TutorGameDisplay bus={connectedBus} />}
          {/* <SdkTest bus={connectedBus} /> */}
          {/* <StatusPanel /> */}
        </>
      )}
    </>
  )
}
