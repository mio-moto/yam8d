/**
 * theme.ts
 *
 * The device theme: the 13 colours of the Theme View (System Settings > EDIT THEME),
 * read off its screen, and the few colours any screen shows on its own.
 */

import type { M8Screen, M8State, RGB } from './types'

export type M8ThemeRole =
  | 'background'
  | 'textEmpty'
  | 'textInfo'
  | 'textDefault'
  | 'textValue'
  | 'textTitles'
  | 'playMarkers'
  | 'cursor'
  | 'selection'
  | 'scopeSlider'
  | 'meterLow'
  | 'meterMid'
  | 'meterPeak'

/** The Theme View rows, top to bottom, with the label the device shows. */
export const M8_THEME_ROLES: readonly { role: M8ThemeRole; label: string }[] = [
  { role: 'background', label: 'BACKGROUND' },
  { role: 'textEmpty', label: 'TEXT:EMPTY' },
  { role: 'textInfo', label: 'TEXT:INFO' },
  { role: 'textDefault', label: 'TEXT:DEFAULT' },
  { role: 'textValue', label: 'TEXT:VALUE' },
  { role: 'textTitles', label: 'TEXT:TITLES' },
  { role: 'playMarkers', label: 'PLAY MARKERS' },
  { role: 'cursor', label: 'CURSOR' },
  { role: 'selection', label: 'SELECTION' },
  { role: 'scopeSlider', label: 'SCOPE/SLIDER' },
  { role: 'meterLow', label: 'METER LOW' },
  { role: 'meterMid', label: 'METER MID' },
  { role: 'meterPeak', label: 'METER PEAK' },
]

/** View name the SDK reports on the Theme View (title "THEME SETTINGS"). */
export const M8_THEME_VIEW = 'themesettings'

export interface M8Theme {
  /** Every theme colour as '#rrggbb'. */
  colors: Record<M8ThemeRole, string>
  /** Colour model the Theme View was showing. HSV values are converted to RGB (H, S and V read as 00-FF). */
  mode: 'rgb' | 'hsv'
  /** THEME NAME, or null when unnamed. */
  name: string | null
}

const squash = (s: string): string => s.replace(/\s+/g, '').toUpperCase()

const hex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

const rgbToHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`

/** HSV with every channel 0-255 (the Theme View shows them as hex bytes). */
const hsvToHex = (h: number, s: number, v: number): string => {
  const hue = (h / 256) * 6
  const sat = s / 255
  const val = v / 255
  const i = Math.floor(hue) % 6
  const f = hue - Math.floor(hue)
  const p = val * (1 - sat)
  const q = val * (1 - f * sat)
  const t = val * (1 - (1 - f) * sat)
  const [r, g, b] = [
    [val, t, p],
    [q, val, p],
    [p, val, t],
    [p, q, val],
    [t, p, val],
    [val, p, q],
  ][i]
  return rgbToHex(r * 255, g * 255, b * 255)
}

const ROLE_BY_LABEL = new Map(M8_THEME_ROLES.map(({ role, label }) => [squash(label), role]))

/**
 * Reads the theme off the Theme View screen (from getScreen()). Returns null unless
 * all 13 colour rows are found, so a half-drawn screen is never taken for a theme.
 *
 * @example
 * ```ts
 * if (m8.state.viewName === M8_THEME_VIEW) {
 *   const theme = parseThemeScreen(await m8.getScreen())
 *   theme?.colors.textValue // '#ffffff'
 * }
 * ```
 */
export function parseThemeScreen(screen: M8Screen): M8Theme | null {
  let mode: M8Theme['mode'] = 'rgb'
  let name: string | null = null
  const colors: Partial<Record<M8ThemeRole, string>> = {}

  for (const raw of screen.lines) {
    const line = raw.replace(/[{}]/g, '0')
    const header = /^\s*MODE\s+([A-Z])\s+([A-Z])\s+([A-Z])\b/i.exec(line)
    if (header) {
      mode = squash(header.slice(1).join('')) === 'HSV' ? 'hsv' : 'rgb'
      continue
    }
    const named = /^\s*THEME\s+NAME\s+(\S.*?)\s*$/i.exec(line)
    if (named) {
      // The track panel can share the row on the right: the name ends at the first wide gap.
      const text = named[1].split(/\s{2,}/)[0]
      name = /^-+$/.test(text) ? null : text
      continue
    }
    const row = /^\s*([A-Z][A-Z:/. ]*?)\s+([0-9A-F]{2})\s+([0-9A-F]{2})\s+([0-9A-F]{2})(?:\s|$)/i.exec(line)
    if (!row) continue
    const role = ROLE_BY_LABEL.get(squash(row[1]))
    if (!role || colors[role]) continue
    const [a, b, c] = row.slice(2, 5).map((v) => parseInt(v, 16))
    colors[role] = mode === 'hsv' ? hsvToHex(a, b, c) : rgbToHex(a, b, c)
  }

  if (M8_THEME_ROLES.some(({ role }) => !colors[role])) return null
  return { colors: colors as Record<M8ThemeRole, string>, mode, name }
}

const rgbHex = (c: RGB | null | undefined): string | undefined => (c ? rgbToHex(c.r, c.g, c.b) : undefined)

/**
 * The theme colours any screen gives away without opening the Theme View: the
 * background and the title colour. (The cursor rectangle is animated on the device, so
 * `state.cursorColor` is not the theme's CURSOR colour.)
 */
export function observeThemeColors(state: M8State): Partial<Record<M8ThemeRole, string>> {
  const out: Partial<Record<M8ThemeRole, string>> = {}
  const background = rgbHex(state.backgroundColor)
  const titles = rgbHex(state.titleColor)
  if (background) out.background = background
  if (titles) out.textTitles = titles
  return out
}
