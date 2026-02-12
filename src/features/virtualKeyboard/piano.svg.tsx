import type { FC } from 'react'

export const Piano: FC<{ strokeColor: string }> = ({ strokeColor = '#d0d0d0' }) => {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 21" fill="none">
            <g fill={strokeColor}>
                <rect x="6" y="0" width="5" height="10" />
                <rect x="14" y="0" width="5" height="10" />
                <rect x="30" y="0" width="5" height="10" />
                <rect x="38" y="0" width="5" height="10" />
                <rect x="46" y="0" width="5" height="10" />
            </g>

            <g fill={strokeColor}>
                <rect x="8" y="14" width="0.75" height="7" />
                <rect x="16" y="14" width="0.75" height="7" />
                <rect x="24" y="0" width="0.75" height="21" />
                <rect x="32" y="14" width="0.75" height="7" />
                <rect x="40" y="14" width="0.75" height="7" />
                <rect x="48" y="14" width="0.75" height="7" />
            </g>

            <rect x="0.5" y="0.5" width="56" height="20" stroke={strokeColor} strokeWidth="1" />
        </svg>
    )
}
