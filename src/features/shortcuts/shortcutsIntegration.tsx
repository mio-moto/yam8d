import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { useViewName } from "../state/viewStore"
import { css } from "@linaria/core"
import type { ConnectedBus } from "../connection/connection"
import type { KeyCommand } from "../connection/protocol"
import { isEdit, isOpt, isPlay, isShift } from "../connection/keys"
import { useSettingsContext } from "../settings/settings"

const shortcuts = css`
// position : fixed;
// top : 0;
// right : 0;
height : 93vh;
width: -webkit-fill-available;

> iframe {
 width:100%;
 height: 100%;
 border: none;
 }
`

export const ShortcutsDisplay: FC<{ bus?: ConnectedBus }> = ({ bus }) => {
    const [title] = useViewName()
    const { settings } = useSettingsContext()
    // key name to forward to iframe: '', 'opt', 'shift', 'edit', 'play'
    const [keyName, setKeyName] = useState<string>("")

    const prevMaskRef = useRef<number>(0)
    const activeKeyRef = useRef<string>("")

    useEffect(() => {
        if (!bus) return

        const stillPressed = (mask: number, name: string) => {
            if (!name) return false
            switch (name) {
                case "opt":
                    return isOpt(mask)
                case "shift":
                    return isShift(mask)
                case "edit":
                    return isEdit(mask)
                case "play":
                    return isPlay(mask)
                default:
                    return false
            }
        }

        const pickNewPress = (prev: number, cur: number): string => {
            // In case multiple keys are pressed in the same frame, prefer this stable order
            if (!isOpt(prev) && isOpt(cur)) return "opt"
            if (!isShift(prev) && isShift(cur)) return "shift"
            if (!isEdit(prev) && isEdit(cur)) return "edit"
            if (!isPlay(prev) && isPlay(cur)) return "play"
            return ""
        }

        const onKey = (cmd: KeyCommand) => {
            const cur = cmd.keys ?? 0
            const prev = prevMaskRef.current ?? 0

            // If we already have an active key, keep it until it is released
            const currentActive = activeKeyRef.current
            if (currentActive) {
                if (stillPressed(cur, currentActive)) {
                    prevMaskRef.current = cur
                    return
                }
                // Active key released → clear and wait for next new press
                activeKeyRef.current = ""
                setKeyName("")
                prevMaskRef.current = cur
                return
            }

            // No active key: select the first newly pressed among opt/shift/edit/play
            const newly = pickNewPress(prev, cur)
            if (newly) {
                activeKeyRef.current = newly
                setKeyName(newly)
            }

            prevMaskRef.current = cur
        }

        bus.protocol.eventBus.on("key", onKey)
        return () => {
            bus.protocol.eventBus.off("key", onKey)
        }
    }, [bus])

    return (
        <div className={shortcuts} >
            {/* <iframe src={`https://miomoto.de/m8-shortcuts/#/${title}`}></iframe> */}
            <iframe src={`${settings.shortcutsHost}#/${title ?? ""}/?mode=min&key=${keyName}`}></iframe>
        </div>)
}