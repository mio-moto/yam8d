import { css } from '@linaria/core'
import { type FC, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { DEFAULT_CUSTOM_BACKGROUND_SHADER, DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME, useSettingsContext } from '../settings/settings'
import VertPostprocess from './shader/postprocess.vert?raw'

type SavedBackgroundShader = {
  id: string
  name: string
  source: string
  updatedAt: number
}

const STORAGE_KEY = 'M8savedBackgroundShaders'
const LEGACY_SAVED_SHADER_NAMES = new Set([DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME])

const containerClass = css`
  width: min(640px, 45vw);
  min-width: 380px;
  display: grid;
  height: 90vh;
  grid-template-rows: auto 1fr auto auto auto auto auto;
  gap: 10px;
  align-self: stretch;
  padding: 14px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  background: rgba(10, 10, 10, 0.5);
  text-align: left;
`

const sourceClass = css`
  width: 96%;
  height: 97%;
  min-height: 0;
  resize: none;
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

const hintClass = css`
  font-size: 13px;
  opacity: 0.75;
  line-height: 1.35;
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
  const [nameDraft, setNameDraft] = useState(DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME)
  const [sourceDraft, setSourceDraft] = useState(settings.customBackgroundShader)
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('')
  const [savedShaders, setSavedShaders] = useState<SavedBackgroundShader[]>([])

  useEffect(() => {
    setSourceDraft(settings.customBackgroundShader)
  }, [settings.customBackgroundShader])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const defaults: SavedBackgroundShader[] = [{
        id: 'default-spectrum-demo',
        name: DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME,
        source: DEFAULT_CUSTOM_BACKGROUND_SHADER,
        updatedAt: 0,
      }]
      setSavedShaders(defaults)
      setSelectedId(defaults[0].id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return
    }
    try {
      const parsed = JSON.parse(raw) as SavedBackgroundShader[]
      if (Array.isArray(parsed)) {
        const next = parsed.map((shader) =>
          LEGACY_SAVED_SHADER_NAMES.has(shader.name) && shader.id === 'default-spectrum-demo'
            ? { ...shader, source: DEFAULT_CUSTOM_BACKGROUND_SHADER }
            : shader,
        )
        const hasDefault = next.some((shader) => shader.name === DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME)
        const seeded = hasDefault ? next : [{
          id: 'default-spectrum-demo',
          name: DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME,
          source: DEFAULT_CUSTOM_BACKGROUND_SHADER,
          updatedAt: 0,
        }, ...next]
        setSavedShaders(seeded)
        if (seeded.length > 0) setSelectedId(seeded[0].id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
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
    updateSettingValue('backgroundShader', true)
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
      <textarea
        className={sourceClass}
        value={sourceDraft}
        onChange={(event) => setSourceDraft(event.target.value)}
        spellCheck={false}
      />
      <div className={hintClass}>
        Available uniforms: <code>uTime</code>, <code>uResolution</code>, <code>uMouse</code> (x, y, down, _), <code>uAudioLevel</code> (0..1), <code>uAudioSpectrum</code> (sampler2D float), <code>uAudioSpectrumBins</code>. Spectrum is log-remapped.
      </div>
      <div className={rowClass}>
        <span>Spectrum bands</span>
        <select
          className={selectClass}
          value={settings.backgroundShaderSpectrumBands}
          onChange={(event) => updateSettingValue('backgroundShaderSpectrumBands', Number.parseInt(event.target.value, 10) as 64 | 128 | 256)}
        >
          <option value="64">64</option>
          <option value="128">128</option>
          <option value="256">256</option>
        </select>
      </div>
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
