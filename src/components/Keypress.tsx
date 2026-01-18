import { css, cx } from '@linaria/core'
import type { FC } from 'react'
import ButtonSprite from '#assets/sprites/button.svg'
import PressSprite from '#assets/sprites/button-press.svg'
import { style } from '../app/style/style'
import { Icon } from './Icon'

type KeyDown = 'up' | 'down' | 'left' | 'right' | 'edit' | 'opt' | 'shift' | 'play'

export type Key = KeyDown | `${KeyDown}-hold`

const keypressClass = css`
  display: inline-flex;
  position: relative;
  
  width: 28px;
  max-width: 28px;
  min-width: 28px;

  height: 24px;
  max-height: 24px;
  min-height: 24px;
  margin: 0 4px;

  zoom: 1.5;

  > .icon {
    position: absolute;
    width: 6px;
    height: 6px;

    color: ${style.themeColors.text.default};

    &.press {
      animation: 1.0s linear infinite both rotate-opacity;
      @keyframes rotate-opacity {
        49.999% { opacity: 1.0; }
        50% { opacity: 0.65; }
        74.999% { opacity: 0.65; }
        75% { opacity: 1.0; }
      }
    }
  }

  > .opt {
    left: 16px;
    top: 0;
    &.action { color: ${style.colors.teal.primary}; }
  }

  > .edit {
    left: 22px;
    top: 0;
    &.action { color: ${style.colors.ochre.primary}; }
  }

  > .up {
    left: 6px;
    top: 3px;
  }

  > .left {
    left: 0;
    top: 9px;
  }

  > .down {
    left: 6px;
    top: 9px;
  }

  > .right {
    left: 12px;
    top: 9px;
  }

  > .shift {
    left: 6px;
    top: 18px;
    &.action { color: ${style.colors.raspberry[500]}; }
  }

  > .play {
    left: 12px;
    top: 18px;
    &.action { color: ${style.colors.lime.primary}; }
  }
`

const has = (which: Key, keys: Key[] | Key) => {
    if (keys === which) {
        return true
    }

    if (Array.isArray(keys)) {
        return keys.some((x) => x.startsWith(which))
    }
    return keys.startsWith(which)
}

const isHold = (which: Key, keys: Key[] | Key) => {
    if (Array.isArray(keys)) {
        const element = keys.find((x) => x.startsWith(which))
        return element?.endsWith('hold')
    }
    return which.endsWith('hold')
}

export const Keypress: FC<{
    keys: Key[] | Key
}> = ({ keys }) => {
    return (
        <div className={cx(keypressClass, 'keypress')}>
            <Icon icon={ButtonSprite} className="left" />
            <Icon icon={ButtonSprite} className="right" />
            <Icon icon={ButtonSprite} className="up" />
            <Icon icon={ButtonSprite} className="down" />
            <Icon icon={ButtonSprite} className="edit" />
            <Icon icon={ButtonSprite} className="opt" />
            <Icon icon={ButtonSprite} className="shift" />
            <Icon icon={ButtonSprite} className="play" />

            {has('left', keys) && <Icon icon={PressSprite} className={cx('left', 'action', isHold('left', keys) ? 'hold' : 'press')} />}
            {has('right', keys) && <Icon icon={PressSprite} className={cx('right', 'action', isHold('right', keys) ? 'hold' : 'press')} />}
            {has('up', keys) && <Icon icon={PressSprite} className={cx('up', 'action', isHold('up', keys) ? 'hold' : 'press')} />}
            {has('down', keys) && <Icon icon={PressSprite} className={cx('down', 'action', isHold('down', keys) ? 'hold' : 'press')} />}
            {has('edit', keys) && <Icon icon={PressSprite} className={cx('edit', 'action', isHold('edit', keys) ? 'hold' : 'press')} />}
            {has('opt', keys) && <Icon icon={PressSprite} className={cx('opt', 'action', isHold('opt', keys) ? 'hold' : 'press')} />}
            {has('shift', keys) && <Icon icon={PressSprite} className={cx('shift', 'action', isHold('shift', keys) ? 'hold' : 'press')} />}
            {has('play', keys) && <Icon icon={PressSprite} className={cx('play', 'action', isHold('play', keys) ? 'hold' : 'press')} />}
        </div>
    )
}
