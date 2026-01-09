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

export const rgbToHex = (rgb: { r: number; g: number; b: number }) => `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
