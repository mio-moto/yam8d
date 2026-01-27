import type { RGB, HSL } from "../features/state/viewStore"

export const dimHexColor = (hex: string, factor = 0.6): string => {
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    if (!match) return hex
    const toDim = (h: string) => {
        const v = Math.round(parseInt(h, 16) * factor)
        return Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')
    }
    const r = toDim(match[1])
    const g = toDim(match[2])
    const b = toDim(match[3])
    return `#${r}${g}${b}`
}

export const rgbToHex = (rgb: RGB) => `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

// Helper function to convert RGB to HSL
export const rgbToHsl = (rgb: RGB): HSL => {
    const r = rgb.r / 255
    const g = rgb.g / 255
    const b = rgb.b / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2

    if (max === min) {
        return { h: 0, s: 0, l }
    }

    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    let h = 0
    switch (max) {
        case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6
            break
        case g:
            h = ((b - r) / d + 2) / 6
            break
        case b:
            h = ((r - g) / d + 4) / 6
            break
    }

    return { h: (h * 360) % 360, s, l }
}


export const hueMatches = (color: RGB | HSL, targetHue: number): boolean => {
    const hsl = ('r' in color && 'g' in color && 'b' in color) ? rgbToHsl(color as RGB) : (color as HSL)
    const hueDiff = Math.abs(hsl.h - targetHue)
    const circularDiff = Math.min(hueDiff, 360 - hueDiff)

    const matches = circularDiff <= 7
    //if (!matches) console.log('ça matche pas', circularDiff);

    return matches
}
