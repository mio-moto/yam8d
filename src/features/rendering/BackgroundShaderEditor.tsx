import { css } from '@linaria/core'
import { type FC, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { useSettingsContext } from '../settings/settings'
import VertPostprocess from './shader/postprocess.vert?raw'

type SavedBackgroundShader = {
  id: string
  name: string
  source: string
  updatedAt: number
}

const STORAGE_KEY = 'M8savedBackgroundShaders'

const containerClass = css`
  width: min(440px, 45vw);
  min-width: 280px;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto;
  gap: 10px;
  align-self: stretch;
  padding: 14px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  background: rgba(10, 10, 10, 0.5);
  text-align: left;
`

const sourceClass = css`
  width: 100%;
  min-height: 280px;
  resize: vertical;
  background: rgba(0, 0, 0, 0.5);
  color: #f2f2f2;
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 10px;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
`

const rowClass = css`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`

const inputClass = css`
  min-width: 130px;
  flex: 1 1 130px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
`

const selectClass = css`
  min-width: 160px;
  flex: 1 1 160px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
`

const statusClass = css`
  min-height: 18px;
  font-size: 12px;
  opacity: 0.9;
`

const validateFragmentShader = (fragmentSource: string): string | null => {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return 'WebGL2 is not available in this browser.'

  const compile = (source: string, type: GLenum) => {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Unable to create shader.')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'Shader compile error'
      gl.deleteShader(shader)
      throw new Error(log)
    }
    return shader
  }

  try {
    const vert = compile(VertPostprocess, gl.VERTEX_SHADER)
    const frag = compile(fragmentSource, gl.FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!program) throw new Error('Unable to create shader program.')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link error')
    }
    gl.deleteProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Shader compile failed'
  }
}

export const BackgroundShaderEditor: FC = () => {
  const { settings, updateSettingValue } = useSettingsContext()
  const [nameDraft, setNameDraft] = useState('My shader')
  const [sourceDraft, setSourceDraft] = useState(settings.customBackgroundShader)
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('')
  const [savedShaders, setSavedShaders] = useState<SavedBackgroundShader[]>([])

  useEffect(() => {
    setSourceDraft(settings.customBackgroundShader)
  }, [settings.customBackgroundShader])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as SavedBackgroundShader[]
      if (Array.isArray(parsed)) {
        setSavedShaders(parsed)
        if (parsed.length > 0) setSelectedId(parsed[0].id)
      }
    } catch {
      setSavedShaders([])
    }
  }, [])

  const saveShaders = (next: SavedBackgroundShader[]) => {
    setSavedShaders(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const selectedShader = useMemo(() => savedShaders.find((shader) => shader.id === selectedId) ?? null, [savedShaders, selectedId])

  const applyShader = () => {
    const validationError = validateFragmentShader(sourceDraft)
    if (validationError) {
      setStatus(`Compile failed: ${validationError}`)
      return
    }
    updateSettingValue('customBackgroundShader', sourceDraft)
    updateSettingValue('backgroundShader', 'custom')
    setStatus('Custom shader applied.')
  }

  const saveCurrent = () => {
    const now = Date.now()
    const trimmedName = nameDraft.trim() || `Shader ${savedShaders.length + 1}`
    const existing = savedShaders.find((shader) => shader.name === trimmedName)
    if (existing) {
      const next = savedShaders.map((shader) =>
        shader.id === existing.id ? { ...shader, source: sourceDraft, updatedAt: now } : shader,
      )
      saveShaders(next)
      setSelectedId(existing.id)
      setStatus(`Updated "${trimmedName}".`)
      return
    }
    const item: SavedBackgroundShader = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      source: sourceDraft,
      updatedAt: now,
    }
    const next = [item, ...savedShaders]
    saveShaders(next)
    setSelectedId(item.id)
    setStatus(`Saved "${trimmedName}".`)
  }

  const loadSelected = () => {
    if (!selectedShader) return
    setNameDraft(selectedShader.name)
    setSourceDraft(selectedShader.source)
    setStatus(`Loaded "${selectedShader.name}".`)
  }

  const deleteSelected = () => {
    if (!selectedShader) return
    const next = savedShaders.filter((shader) => shader.id !== selectedShader.id)
    saveShaders(next)
    setSelectedId(next[0]?.id ?? '')
    setStatus(`Deleted "${selectedShader.name}".`)
  }

  return (
    <aside className={containerClass}>
      <strong>Background Shader (WebGL2 fragment)</strong>
      <div className={rowClass}>
        <Button selected={settings.backgroundShader === 'none'} onClick={() => updateSettingValue('backgroundShader', 'none')}>
          None
        </Button>
        <Button selected={settings.backgroundShader === 'apollonian'} onClick={() => updateSettingValue('backgroundShader', 'apollonian')}>
          Apollonian
        </Button>
        <Button selected={settings.backgroundShader === 'plasma'} onClick={() => updateSettingValue('backgroundShader', 'plasma')}>
          Plasma
        </Button>
      </div>
      <textarea
        className={sourceClass}
        value={sourceDraft}
        onChange={(event) => setSourceDraft(event.target.value)}
        spellCheck={false}
      />
      <div className={rowClass}>
        <input className={inputClass} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Shader name" />
        <Button onClick={saveCurrent}>Save</Button>
        <Button onClick={applyShader}>Apply</Button>
      </div>
      <div className={rowClass}>
        <select className={selectClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {savedShaders.length === 0 && <option value="">No saved shaders</option>}
          {savedShaders.map((shader) => (
            <option key={shader.id} value={shader.id}>
              {shader.name}
            </option>
          ))}
        </select>
        <Button onClick={loadSelected} disabled={!selectedShader}>
          Load
        </Button>
        <Button onClick={deleteSelected} disabled={!selectedShader}>
          Delete
        </Button>
      </div>
      <div className={statusClass}>{status}</div>
    </aside>
  )
}
