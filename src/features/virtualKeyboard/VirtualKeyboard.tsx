import { type FC, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type ConnectedBus } from '../connection/connection'
import { useVirtualKeyboard } from './useVirtualKeyboard'
import { Piano } from './piano.svg'
import { dimHexColor } from '../../utils/colorTools'
import './virtualKeyboard.css'
export const VirtualKeyboard: FC<{
    strokeColor: string
    bus?: ConnectedBus
}> = ({ strokeColor, bus, ...props }) => {

    const { octave, velocity } = useVirtualKeyboard(bus)
    const dimStrokeColor = dimHexColor(strokeColor, 0.4)
    const velFill = Math.round((velocity / 127) * 32)

    return <>
        <div className="virtual-keyboard" {...props}>
            <div
                className="velocity"
                style={{
                    color: strokeColor,
                    borderColor: dimStrokeColor,
                    background: dimStrokeColor
                }}
            >
                <div
                    className="velocity-fill"
                    style={{ height: velFill + 'px', background: strokeColor }}
                />
            </div>
            {Array.from({ length: 10 }, (_, i) => (
                <Piano key={i} strokeColor={i === octave ? strokeColor : dimStrokeColor} />
            ))}
        </div>
    </>
}