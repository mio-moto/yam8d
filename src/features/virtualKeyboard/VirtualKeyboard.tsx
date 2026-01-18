import type { FC } from 'react'
import { dimHexColor } from '../../utils/colorTools'
import type { ConnectedBus } from '../connection/connection'
import { Piano } from './piano.svg'
import { useVirtualKeyboard } from './useVirtualKeyboard'
import './virtualKeyboard.css'
export const VirtualKeyboard: FC<{
    strokeColor: string
    bus?: ConnectedBus
}> = ({ strokeColor, bus, ...props }) => {
    const { octave, velocity } = useVirtualKeyboard(bus)
    const dimStrokeColor = dimHexColor(strokeColor, 0.4)
    const velFill = Math.round((velocity / 127) * 32)

    return (
        <div className="virtual-keyboard" {...props}>
            <div
                className="velocity"
                style={{
                    color: strokeColor,
                    borderColor: dimStrokeColor,
                    background: dimStrokeColor,
                }}
            >
                <div className="velocity-fill" style={{ height: `${velFill}px`, background: strokeColor }} />
            </div>
            {(() => {
                const octaveIds = Array.from({ length: 10 }, (_, i) => `octave-${i}`)
                return octaveIds.map((id, i) => <Piano key={id} strokeColor={i === octave ? strokeColor : dimStrokeColor} />)
            })()}
        </div>
    )
}
