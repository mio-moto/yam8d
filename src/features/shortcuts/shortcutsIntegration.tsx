import type { FC } from "react"
import { useViewName } from "../state/viewStore"
import { css } from "@linaria/core"

const shortcuts = css`
position : fixed;
top : 0;
right : 0;
height : 100%;

> iframe {
 width:50vh;
 height: 100%;
 }
`

export const ShortcutsDisplay: FC = () => {
    const [title] = useViewName()
    return (
        <div className={shortcuts} >
            <iframe src={`https://miomoto.de/m8-shortcuts/#/${title}`}></iframe>
        </div>)
}