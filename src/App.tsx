import { css } from '@linaria/core'
import './App.css'
import { type FC, lazy, Suspense } from 'react'
import { style } from './app/style/style'
import { useM8Input } from './features/inputs/useM8input'
import { useZoomViewShortcut } from './features/inputs/useZoomViewShortcut'
import { M8Player } from './features/M8Player'
import { useDeviceConnection } from './features/useDeviceConnection'
import { useMacroInput } from './features/macros/useMacroInput'
import { Menu } from './features/menu/menu'
import { useSettingsContext } from './features/settings/settings'
import { VirtualKeyboard } from './features/virtualKeyboard/VirtualKeyboard'
import { ExternalAppsDisplay } from './features/externalApps/ExternalAppsDisplay'
import { WelcomeSplash } from './features/WelcomeSplash'

const BackgroundShaderEditor = lazy(async () => {
  const module = await import('./features/rendering/BackgroundShaderEditor')
  return { default: module.BackgroundShaderEditor }
})

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

  const { bus: connectedBus, connect: tryConnect } = useDeviceConnection()

  useM8Input(connectedBus)
  useMacroInput(connectedBus)
  useZoomViewShortcut()

  return (
    <>
      {!connectedBus && <WelcomeSplash onConnect={tryConnect} />}
      {connectedBus && (
        <>
          <Menu />
          <div className={appClass}>
            {settings.virtualKeyboard && <VirtualKeyboard bus={connectedBus} strokeColor={style.themeColors.text.default}></VirtualKeyboard>}
            <div className={playerRowClass}>
              <M8Player bus={connectedBus} fullView={settings.fullM8View} />
            </div>
          </div>
          {settings.showBackgroundShaderEditor && (
            <Suspense fallback={null}>
              <BackgroundShaderEditor />
            </Suspense>
          )}
          {settings.displayExternalApps && <ExternalAppsDisplay bus={connectedBus} />}
        </>
      )}
    </>
  )
}
