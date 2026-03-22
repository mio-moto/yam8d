import { css } from '@linaria/core'
import { useAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { useSettingsContext } from '../settings/settings'
import { vjActiveKeyAtom } from '../state/viewStore'

const STORAGE_KEY = 'M8savedBackgroundShaders'

type SavedBackgroundShader = {
  id: string
  name: string
  source: string
  compositeM8Screen: boolean
  updatedAt: number
}

const loadSavedShaders = (): SavedBackgroundShader[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedBackgroundShader[]
  } catch {
    return []
  }
}

// Numpad layout: row-major, [key, col, row] — matches physical numpad
const NUMPAD_KEYS = [
  ['7', 0, 0], ['8', 1, 0], ['9', 2, 0],
  ['4', 0, 1], ['5', 1, 1], ['6', 2, 1],
  ['1', 0, 2], ['2', 1, 2], ['3', 2, 2],
  ['0', 1, 3],
] as const

const KEY_SIZE = 22
const KEY_GAP = 3
const PAD_X = 4
const PAD_Y = 4
const COLS = 3
const ROWS = 4
const SVG_W = COLS * KEY_SIZE + (COLS - 1) * KEY_GAP + PAD_X * 2
const SVG_H = ROWS * KEY_SIZE + (ROWS - 1) * KEY_GAP + PAD_Y * 2

const wrapperClass = css`
  position: absolute;
  bottom: 36px;
  right: 2px;
  user-select: none;
`

const svgClass = css`
  display: block;
  cursor: default;
`

const popoverClass = css`
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: rgba(19, 19, 19, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 4px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const popoverBtnClass = css`
  background: none;
  border: none;
  color: #f2f2f2;
  padding: 5px 8px;
  text-align: left;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`

const popoverClearClass = css`
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  padding: 5px 8px;
  text-align: left;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 2px;
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
`

export const VJNumpad = () => {
  const { settings, updateSettingValue } = useSettingsContext()
  const [activeKey] = useAtom(vjActiveKeyAtom)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [savedShaders, setSavedShaders] = useState<SavedBackgroundShader[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Reload saved shaders when the popover opens
  useEffect(() => {
    if (openKey !== null) {
      setSavedShaders(loadSavedShaders())
    }
  }, [openKey])

  // Close popover when clicking outside
  useEffect(() => {
    if (openKey === null) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpenKey(null)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [openKey])

  const assign = (key: string, shaderId: string) => {
    updateSettingValue('vjNumpadAssignments', {
      ...settings.vjNumpadAssignments,
      [key]: shaderId,
    })
    setOpenKey(null)
  }

  const clear = (key: string) => {
    const next = { ...settings.vjNumpadAssignments }
    delete next[key]
    updateSettingValue('vjNumpadAssignments', next)
    setOpenKey(null)
  }

  return (
    <div className={wrapperClass} ref={wrapperRef}>
      {openKey !== null && (
        <div className={popoverClass}>
          {savedShaders.length === 0 && (
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, padding: '5px 8px' }}>
              No saved shaders
            </span>
          )}
          {savedShaders.map((s) => (
            <button key={s.id} className={popoverBtnClass} onClick={() => assign(openKey, s.id)}>
              {s.name}
            </button>
          ))}
          {settings.vjNumpadAssignments[openKey] && (
            <button className={popoverClearClass} onClick={() => clear(openKey)}>
              Clear assignment
            </button>
          )}
        </div>
      )}

      <svg
        className={svgClass}
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        onClick={(e) => e.stopPropagation()}
      >
        {NUMPAD_KEYS.map(([key, col, row]) => {
          const x = PAD_X + col * (KEY_SIZE + KEY_GAP)
          const y = PAD_Y + row * (KEY_SIZE + KEY_GAP)
          const assignedId = settings.vjNumpadAssignments[key]
          const isAssigned = !!assignedId
          const isActive = activeKey === key

          const fill = isActive
            ? 'rgba(255,255,255,0.85)'
            : 'rgba(255,255,255,0.04)'
          const stroke = isActive
            ? 'rgba(255,255,255,0.9)'
            : isAssigned
            ? 'rgba(255,255,255,0.6)'
            : 'rgba(255,255,255,0.15)'
          const textColor = isActive ? '#111' : 'rgba(255,255,255,0.7)'

          return (
            <g
              key={key}
              style={{ cursor: 'pointer' }}
              onClick={() => setOpenKey(openKey === key ? null : key)}
            >
              <rect
                x={x}
                y={y}
                width={KEY_SIZE}
                height={KEY_SIZE}
                rx={3}
                fill={fill}
                stroke={stroke}
                strokeWidth={1}
              />
              <text
                x={x + KEY_SIZE / 2}
                y={y + KEY_SIZE / 2 + 4}
                textAnchor="middle"
                fontSize={10}
                fontFamily="monospace"
                fill={textColor}
                style={{ pointerEvents: 'none' }}
              >
                {key}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
