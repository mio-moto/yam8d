import type { FC } from "react"

export const Piano: FC<{ strokeColor: string }> = ({ strokeColor = "#d0d0d0" }) => {


    return <>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 71 32" fill="none">

            <g fill={strokeColor}>
                <rect x="8" y="1" width="5" height="18" />
                <rect x="18" y="1" width="5" height="18" />
                <rect x="38" y="1" width="5" height="18" />
                <rect x="48" y="1" width="5" height="18" />
                <rect x="58" y="1" width="5" height="18" />
            </g>

            <g fill={strokeColor}>
                <rect x="10" y="21" width="1" height="11" />
                <rect x="20" y="21" width="1" height="11" />
                <rect x="30" y="1" width="1" height="30" />
                <rect x="40" y="21" width="1" height="11" />
                <rect x="50" y="21" width="1" height="11" />
                <rect x="60" y="21" width="1" height="11" />
            </g>

            <rect x="0.5" y="0.5" width="70" height="31" stroke={strokeColor} strokeWidth="1" />
        </svg>
    </>

}