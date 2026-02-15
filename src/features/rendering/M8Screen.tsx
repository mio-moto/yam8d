import { type MouseEventHandler, useEffect, useRef } from 'react'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, SystemCommand, WaveCommand } from '../connection/protocol'
import { useSettingsContext } from '../settings/settings'
import { renderer, type ScreenLayout } from './renderer'

const makeScreenLayout = ({ model, fontMode }: SystemCommand): ScreenLayout => {
    if (model === 'M8 Model:02') {
        return (fontMode + 3) as ScreenLayout
    }
    return (fontMode + 1) as ScreenLayout
}

export const M8Screen = ({ bus, onClick }: { bus?: ConnectedBus | null; onClick?: MouseEventHandler<HTMLCanvasElement> | undefined | null }) => {
    const innerRef = useRef<HTMLCanvasElement | null>(null)
    const renderRef = useRef<ReturnType<typeof renderer>>(undefined)
    const { settings } = useSettingsContext()

    useEffect(() => {
        renderRef.current?.setSmoothRendering(settings.smoothRendering)
    }, [settings.smoothRendering])

    useEffect(() => {
        renderRef.current?.setSmoothParams(settings.smoothBlurRadius, settings.smoothThreshold, settings.smoothSmoothness)
    }, [settings.smoothBlurRadius, settings.smoothThreshold, settings.smoothSmoothness])

    useEffect(() => {
        if (!innerRef.current) {
            return
        }
        const systemInfo = bus?.protocol.getSystemInfo()
        const render = renderer(innerRef.current, systemInfo ? makeScreenLayout(systemInfo) : 5)
        renderRef.current = render
        const drawText = (data: CharacterCommand) => {
            render?.text.drawText({
                char: data.character,
                pos: {
                    x: Math.floor(data.pos.x),
                    y: Math.floor(data.pos.y),
                },
                color: data.foreground,
            })
        }

        const drawRect = (data: RectCommand) => {
            if (!data) {
                return
            }
            render?.rect.drawRect(data)
        }

        const drawWave = (data: WaveCommand) => {
            render?.wave.drawWave(data)
        }

        const updateRenderer = (data: SystemCommand) => {
            render?.setScreenLayout(makeScreenLayout(data))
        }

        bus?.protocol.eventBus.on('text', drawText)
        bus?.protocol.eventBus.on('rect', drawRect)
        bus?.protocol.eventBus.on('wave', drawWave)
        bus?.protocol.eventBus.on('system', updateRenderer)

        const canvas = innerRef.current
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                let width: number
                let height: number
                if (entry.devicePixelContentBoxSize) {
                    width = entry.devicePixelContentBoxSize[0].inlineSize
                    height = entry.devicePixelContentBoxSize[0].blockSize
                } else {
                    const dpr = window.devicePixelRatio || 1
                    width = Math.round(entry.contentRect.width * dpr)
                    height = Math.round(entry.contentRect.height * dpr)
                }
                if (width > 0 && height > 0) {
                    render?.resize(width, height)
                }
            }
        })
        observer.observe(canvas)

        return () => {
            observer.disconnect()
            bus?.protocol.eventBus.off('text', drawText)
            bus?.protocol.eventBus.off('rect', drawRect)
            bus?.protocol.eventBus.off('wave', drawWave)
            bus?.protocol.eventBus.off('system', updateRenderer)
        }
    }, [bus])

    return (
        <canvas
            className="element"
            onClick={onClick ?? undefined}
            ref={innerRef}
            style={{
                width: '100%',
                imageRendering: 'auto',
                height: 'auto',
                margin: 'auto',
                position: 'relative',
            }}
        ></canvas>
    )
}
