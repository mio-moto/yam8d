import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { useSettingsContext } from './settings'
import './menu.css'

export const Menu: FC = () => {
  const { settings, updateSettingValue } = useSettingsContext()
  const [opened, setOpened] = useState(false)
  return (
    <>
      <div className="menu-hitbox" onClick={() => setOpened((o) => !o)} aria-label="Toggle menu" role="button" />
      <div className={opened ? 'menu opened' : 'menu closed'}>
        <div className="menu-item">
          <span className="title">Zoom View</span>
          <div>
            <Button selected={settings.fullM8View} onClick={() => updateSettingValue('fullM8View', true)}>
              No
            </Button>
            <Button selected={!settings.fullM8View} onClick={() => updateSettingValue('fullM8View', false)}>
              Yes
            </Button>
          </div>
        </div>

        <div className="menu-item">
          <span className="title">Display mode</span>
          <div>
            <Button selected={settings.webGLRendering} onClick={() => updateSettingValue('webGLRendering', true)}>
              WebGL
            </Button>
            <Button selected={!settings.webGLRendering} onClick={() => updateSettingValue('webGLRendering', false)}>
              HTML
            </Button>
          </div>
        </div>

        <div className="menu-item">
          <span className="title">Virtual midi keyboard</span>
          <div>
            <Button selected={settings.virtualKeyboard} onClick={() => updateSettingValue('virtualKeyboard', true)}>
              Yes
            </Button>
            <Button selected={!settings.virtualKeyboard} onClick={() => updateSettingValue('virtualKeyboard', false)}>
              No
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
