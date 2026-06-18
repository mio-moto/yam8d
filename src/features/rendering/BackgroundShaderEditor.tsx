import { css } from '@linaria/core'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { style } from '../../app/style/style'
import { DEFAULT_CUSTOM_BACKGROUND_SHADER, DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME, useSettingsContext } from '../settings/settings'
import { ShaderCodeEditor } from './ShaderCodeEditor'
import FontAtlasGlitchShaderSource from './shader/font_atlas_glitch.frag?raw'
import VideoBackgroundShaderSource from './shader/video_background.frag?raw'
import CyberPunkShaderSource from './shader/cyberpunk.frag?raw'
import VertPostprocess from './shader/postprocess.vert?raw'

type SavedBackgroundShader = {
  id: string
  name: string
  source: string
  compositeM8Screen: boolean
  videoUrl?: string
  updatedAt: number
}

const STORAGE_KEY = 'M8savedBackgroundShaders'
const LEGACY_SAVED_SHADER_NAMES = new Set([DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME])
const UNSAVED_SHADER_ID = '__current-unsaved-shader__'
const FONT_ATLAS_GLITCH_SHADER_NAME = 'Font Atlas Glitch'
const VIDEO_BACKGROUND_SHADER_NAME = 'Video Background'
const DEFAULT_SAVED_SHADERS: SavedBackgroundShader[] = [
  {
    id: 'ym8d-cyberpunk',
    name: 'YAM8D - Shader Demo "CYBERPUNK DATASTREAM"',
    source: CyberPunkShaderSource,
    compositeM8Screen: false,
    videoUrl: '',
    updatedAt: 0,
  },
  {
    id: 'video-background',
    name: VIDEO_BACKGROUND_SHADER_NAME,
    source: VideoBackgroundShaderSource,
    compositeM8Screen: false,
    videoUrl: '',
    updatedAt: 0,
  },
  {
    id: 'font-atlas-glitch',
    name: FONT_ATLAS_GLITCH_SHADER_NAME,
    source: FontAtlasGlitchShaderSource,
    compositeM8Screen: false,
    videoUrl: '',
    updatedAt: 0,
  },
  {
    id: 'default-spectrum-demo',
    name: DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME,
    source: DEFAULT_CUSTOM_BACKGROUND_SHADER,
    compositeM8Screen: true,
    videoUrl: '',
    updatedAt: 0,
  },
]

type UnsavedShader = Pick<SavedBackgroundShader, 'source' | 'compositeM8Screen' | 'videoUrl'>

const containerClass = css`
  width: min(800px, 45vw);
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
  width: 100%;
  height: 100%;
  min-height: 0;
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
  margin-bottom: 0;
`

const hintClass = css`
  margin: 0;
  font-size: 13px;
  opacity: 0.75;
  line-height: 1.35;
`

const editorActionBarClass = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
`

const optionsClass = css`
  display: grid;
  gap: 8px;
  padding-top: 2px;
`

const optionRowClass = css`
  display: grid;
  grid-template-columns: auto minmax(0, max-content) auto;
  gap: 8px;
  align-items: center;
  // width: fit-content;
  max-width: 100%;
  justify-content: end;

  select {
    min-width: 130px;
  }
`

const libraryClass = css`
  display: grid;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid rgba(104, 133, 142, 0.45);
`

const librarySelectClass = css`
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr);
  gap: 10px;
  align-items: center;
`

const libraryActionsClass = css`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
`

const primaryButtonClass = css`
  --border-color: ${style.colors.teal.primary};
  color: ${style.colors.teal[100]};
`

const dangerButtonClass = css`
  --border-color: ${style.colors.raspberry[500]};

  &:hover {
    --border-color: ${style.colors.raspberry[300]};
    color: ${style.colors.raspberry[100]};
  }
`

const videoSectionClass = css`
  display: grid;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid rgba(104, 133, 142, 0.45);
`

const videoRowClass = css`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
`

const videoInputClass = css`
  width: 100%;
  padding: 6px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font: inherit;
  font-size: 12px;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
`

const videoHintClass = css`
  font-size: 11px;
  opacity: 0.7;
  color: ${style.colors.raspberry[300]};
  margin: 0;
  line-height: 1.35;
`

const helpButtonClass = css`
  width: 18px;
  height: 18px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  border: 1px solid ${style.colors.anthracite[500]};
  border-radius: 50%;
  background: transparent;
  color: ${style.colors.anthracite[300]};
  cursor: help;
  font: inherit;
  font-size: 11px;
  line-height: 1;

  &:hover {
    border-color: ${style.colors.teal.primary};
    color: ${style.colors.teal[100]};
  }
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

const createUniqueShaderName = (requestedName: string, savedShaders: SavedBackgroundShader[]): string => {
  const baseName = requestedName.trim()
  const fallbackName = baseName || `Shader ${savedShaders.length + 1}`
  const existingNames = new Set(savedShaders.map((shader) => shader.name))
  if (!existingNames.has(fallbackName)) return fallbackName

  let copyIndex = 1
  let candidate = `${fallbackName} copy`
  while (existingNames.has(candidate)) {
    copyIndex += 1
    candidate = `${fallbackName} copy ${copyIndex}`
  }
  return candidate
}

const findMatchingSavedShader = (
  savedShaders: SavedBackgroundShader[],
  source: string,
  compositeM8Screen: boolean,
): SavedBackgroundShader | null =>
  savedShaders.find((shader) => shader.source === source && (shader.compositeM8Screen ?? true) === compositeM8Screen) ?? null

const isYouTubeUrl = (url: string): boolean =>
  /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(url)

const videoUrlHint = (url: string): string | null => {
  if (!url) return null
  if (isYouTubeUrl(url))
    return 'YouTube URLs cannot be used as WebGL textures due to browser CORS restrictions. Use a direct MP4/WebM URL instead.'
  return null
}

const seedDefaultShaders = (savedShaders: SavedBackgroundShader[]): SavedBackgroundShader[] => {
  const savedIds = new Set(savedShaders.map((shader) => shader.id))
  const savedNames = new Set(savedShaders.map((shader) => shader.name))
  const missingDefaults = DEFAULT_SAVED_SHADERS.filter((shader) => !savedIds.has(shader.id) && !savedNames.has(shader.name))

  return missingDefaults.length > 0 ? [...missingDefaults, ...savedShaders] : savedShaders
}

export const BackgroundShaderEditor: FC = () => {
  const { settings, updateSettingValue } = useSettingsContext()
  const [sourceDraft, setSourceDraft] = useState(settings.customBackgroundShader)
  const [compositeM8Draft, setCompositeM8Draft] = useState(settings.backgroundShaderCompositeM8Screen)
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState('')
  const [savedShaders, setSavedShaders] = useState<SavedBackgroundShader[]>([])
  const [unsavedShader, setUnsavedShader] = useState<UnsavedShader | null>(null)
  const [videoUrlDraft, setVideoUrlDraft] = useState(settings.videoTextureUrl)
  const initialSourceRef = useRef(settings.customBackgroundShader)
  const initialCompositeRef = useRef(settings.backgroundShaderCompositeM8Screen)
  const initialVideoUrlRef = useRef(settings.videoTextureUrl)

  useEffect(() => {
    setSourceDraft(settings.customBackgroundShader)
  }, [settings.customBackgroundShader])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const defaults = DEFAULT_SAVED_SHADERS
      const initialMatch = findMatchingSavedShader(defaults, initialSourceRef.current, initialCompositeRef.current)
      setSavedShaders(defaults)
      setUnsavedShader(initialMatch ? null : { source: initialSourceRef.current, compositeM8Screen: initialCompositeRef.current, videoUrl: initialVideoUrlRef.current })
      setSelectedId(initialMatch?.id ?? UNSAVED_SHADER_ID)
      if (initialMatch) setVideoUrlDraft(initialMatch.videoUrl ?? '')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      return
    }
    try {
      const parsed = JSON.parse(raw) as SavedBackgroundShader[]
      if (Array.isArray(parsed)) {
        const next = parsed.map((shader) =>
          LEGACY_SAVED_SHADER_NAMES.has(shader.name) && shader.id === 'default-spectrum-demo' && shader.updatedAt === 0
            ? { ...shader, source: DEFAULT_CUSTOM_BACKGROUND_SHADER }
            : shader,
        )
        const seeded = seedDefaultShaders(next)
        const initialMatch = findMatchingSavedShader(seeded, initialSourceRef.current, initialCompositeRef.current)
        setSavedShaders(seeded)
        setUnsavedShader(initialMatch ? null : { source: initialSourceRef.current, compositeM8Screen: initialCompositeRef.current, videoUrl: initialVideoUrlRef.current })
        setSelectedId(initialMatch?.id ?? UNSAVED_SHADER_ID)
        if (initialMatch) setVideoUrlDraft(initialMatch.videoUrl ?? '')
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

  const isUnsavedShaderSelected = selectedId === UNSAVED_SHADER_ID
  const selectedShader = useMemo(() => savedShaders.find((shader) => shader.id === selectedId) ?? null, [savedShaders, selectedId])
  const hasUnsavedChanges = !!selectedShader && (
    sourceDraft !== selectedShader.source ||
    compositeM8Draft !== (selectedShader.compositeM8Screen ?? true) ||
    videoUrlDraft !== (selectedShader.videoUrl ?? '')
  )
  const hasUnsavedShaderChanges = isUnsavedShaderSelected && !!unsavedShader && (
    sourceDraft !== unsavedShader.source ||
    compositeM8Draft !== unsavedShader.compositeM8Screen ||
    videoUrlDraft !== (unsavedShader.videoUrl ?? '')
  )
  const hasDraftChangesToDiscard = hasUnsavedChanges

  const preserveCurrentUnsavedShader = () => {
    if (!isUnsavedShaderSelected) return

    const matchingSavedShader = findMatchingSavedShader(savedShaders, sourceDraft, compositeM8Draft)
    if (matchingSavedShader) {
      setUnsavedShader(null)
      return
    }

    setUnsavedShader({ source: sourceDraft, compositeM8Screen: compositeM8Draft, videoUrl: videoUrlDraft })
  }

  const applyShader = (source = sourceDraft, compositeM8Screen = compositeM8Draft, successStatus = 'Custom shader applied.', videoUrl = videoUrlDraft) => {
    const validationError = validateFragmentShader(source)
    if (validationError) {
      setStatus(`Compile failed: ${validationError}`)
      return false
    }
    updateSettingValue('customBackgroundShader', source)
    updateSettingValue('backgroundShader', true)
    updateSettingValue('backgroundShaderCompositeM8Screen', compositeM8Screen)
    updateSettingValue('videoTextureUrl', videoUrl ?? '')
    setStatus(successStatus)
    return true
  }

  const saveChanges = () => {
    if (!selectedShader) {
      setStatus('Select a saved shader before saving changes.')
      return
    }
    const now = Date.now()
    const next = savedShaders.map((shader) =>
      shader.id === selectedShader.id ? { ...shader, source: sourceDraft, compositeM8Screen: compositeM8Draft, videoUrl: videoUrlDraft, updatedAt: now } : shader,
    )
    saveShaders(next)
    setStatus(`Updated "${selectedShader.name}".`)
  }

  const applyCompositeSetting = (nextComposite: boolean) => {
    setCompositeM8Draft(nextComposite)
    applyShader(sourceDraft, nextComposite, 'Composite setting applied.')
  }

  const applySpectrumBands = (nextBands: 64 | 128 | 256) => {
    updateSettingValue('backgroundShaderSpectrumBands', nextBands)
    applyShader(sourceDraft, compositeM8Draft, `Spectrum bands set to ${nextBands}. Custom shader applied.`)
  }

  const saveAsNew = () => {
    const requestedName = window.prompt('Save shader as', selectedShader?.name ?? DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME)
    if (requestedName === null) return

    const shaderName = createUniqueShaderName(requestedName, savedShaders)
    const now = Date.now()
    const item: SavedBackgroundShader = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: shaderName,
      source: sourceDraft,
      compositeM8Screen: compositeM8Draft,
      videoUrl: videoUrlDraft,
      updatedAt: now,
    }
    const next = [item, ...savedShaders]
    saveShaders(next)
    setSelectedId(item.id)
    setUnsavedShader((currentUnsavedShader) =>
      currentUnsavedShader?.source === sourceDraft && currentUnsavedShader.compositeM8Screen === compositeM8Draft && currentUnsavedShader.videoUrl === videoUrlDraft
        ? null
        : currentUnsavedShader,
    )
    setStatus(`Saved "${shaderName}".`)
  }

  const selectShader = (shaderId: string) => {
    if (shaderId === UNSAVED_SHADER_ID) {
      if (!unsavedShader) return
      if (hasDraftChangesToDiscard && !window.confirm('Discard unsaved shader changes?')) {
        return
      }
      const nextComposite = unsavedShader.compositeM8Screen
      const nextVideoUrl = unsavedShader.videoUrl ?? ''
      setSelectedId(UNSAVED_SHADER_ID)
      setSourceDraft(unsavedShader.source)
      setCompositeM8Draft(nextComposite)
      setVideoUrlDraft(nextVideoUrl)
      applyShader(unsavedShader.source, nextComposite, 'Loaded and applied current unsaved shader.', nextVideoUrl)
      return
    }

    const shader = savedShaders.find((item) => item.id === shaderId)
    if (!shader) return

    if (hasDraftChangesToDiscard && !window.confirm('Discard unsaved shader changes?')) {
      return
    }

    preserveCurrentUnsavedShader()
    const nextComposite = shader.compositeM8Screen ?? true
    const nextVideoUrl = shader.videoUrl ?? ''
    setSelectedId(shader.id)
    setSourceDraft(shader.source)
    setCompositeM8Draft(nextComposite)
    setVideoUrlDraft(nextVideoUrl)
    applyShader(shader.source, nextComposite, `Loaded and applied "${shader.name}".`, nextVideoUrl)
  }

  const deleteSelected = () => {
    if (!selectedShader) return
    if (!window.confirm(`Delete "${selectedShader.name}"?`)) return
    const next = savedShaders.filter((shader) => shader.id !== selectedShader.id)
    saveShaders(next)
    const nextSelected = next[0] ?? null
    setSelectedId(nextSelected?.id ?? '')
    if (nextSelected) {
      const nextComposite = nextSelected.compositeM8Screen ?? true
      const nextVideoUrl = nextSelected.videoUrl ?? ''
      setSourceDraft(nextSelected.source)
      setCompositeM8Draft(nextComposite)
      setVideoUrlDraft(nextVideoUrl)
      applyShader(nextSelected.source, nextComposite, `Deleted "${selectedShader.name}". Loaded and applied "${nextSelected.name}".`, nextVideoUrl)
      return
    }
    setStatus(`Deleted "${selectedShader.name}".`)
  }

  const loadVideoUrl = () => {
    const hint = videoUrlHint(videoUrlDraft)
    if (hint) { setStatus(hint); return }
    const trimmed = videoUrlDraft.trim()
    setVideoUrlDraft(trimmed)
    updateSettingValue('videoTextureUrl', trimmed)
    setStatus(trimmed ? 'Video URL applied.' : 'Video texture cleared.')
  }

  const clearVideoUrl = () => {
    setVideoUrlDraft('')
    updateSettingValue('videoTextureUrl', '')
    setStatus('Video texture cleared.')
  }

  return (
    <aside className={containerClass}>
      <strong>Background Shader (WebGL2 fragment)</strong>
      <div className={sourceClass}>
        <ShaderCodeEditor value={sourceDraft} onChange={setSourceDraft} validate={validateFragmentShader} />
      </div>
      <footer className={editorActionBarClass}>
        <p className={hintClass}>
          Type <code>u</code> to show the list of available uniforms.
        </p>
        <Button className={primaryButtonClass} onClick={() => applyShader()}>
          Apply
        </Button>
      </footer>
      <section className={optionsClass} aria-label="Shader options">
        <label className={optionRowClass}>
          <input
            type="checkbox"
            checked={compositeM8Draft}
            onChange={(event) => applyCompositeSetting(event.target.checked)}
          />
          <span>Composite M8 screen on top</span>
          <button
            className={helpButtonClass}
            type="button"
            title="Draws the M8 screen over the shader result. Disable it when the shader should fully replace the screen background."
            aria-label="Explain composite M8 screen on top"
          >
            ?
          </button>
        </label>
        <label className={optionRowClass}>
          <span>Spectrum bands</span>
          <select
            className={selectClass}
            value={settings.backgroundShaderSpectrumBands}
            onChange={(event) => applySpectrumBands(Number.parseInt(event.target.value, 10) as 64 | 128 | 256)}
          >
            <option value="64">64</option>
            <option value="128">128</option>
            <option value="256">256</option>
          </select>
          <button
            className={helpButtonClass}
            type="button"
            title="Controls how many audio spectrum bins are sent to the shader. Higher values give more detail but can cost more GPU work."
            aria-label="Explain spectrum bands"
          >
            ?
          </button>
        </label>
      </section>
      <section className={libraryClass} aria-label="Saved shaders">
        <label className={librarySelectClass}>
          <span>Saved shader</span>
          <select className={selectClass} value={selectedId} onChange={(event) => selectShader(event.target.value)}>
            {savedShaders.length === 0 && !unsavedShader && <option value="">No saved shaders</option>}
            {unsavedShader && (
              <option value={UNSAVED_SHADER_ID}>
                {hasUnsavedShaderChanges ? 'Current unsaved shader *' : 'Current unsaved shader'}
              </option>
            )}
            {savedShaders.map((shader) => (
              <option key={shader.id} value={shader.id}>
                {shader.name}
              </option>
            ))}
          </select>
        </label>
        <div className={libraryActionsClass}>
          <Button onClick={saveChanges} disabled={!selectedShader || !hasUnsavedChanges}>
            Save changes
          </Button>
          <Button onClick={saveAsNew}>Save as new</Button>
          <Button className={dangerButtonClass} onClick={deleteSelected} disabled={!selectedShader}>
            Delete
          </Button>
        </div>
      </section>
      <section className={videoSectionClass} aria-label="Video texture">
        <label className={librarySelectClass}>
          <span style={{ whiteSpace: 'nowrap' }}>Video URL <code style={{ fontSize: 10, opacity: 0.7 }}>uVideoTexture</code></span>
          <div className={videoRowClass}>
            <input
              className={videoInputClass}
              type="url"
              value={videoUrlDraft}
              onChange={(e) => setVideoUrlDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadVideoUrl() }}
              placeholder="https://example.com/video.mp4"
              spellCheck={false}
            />
            <Button className={primaryButtonClass} onClick={loadVideoUrl}>Load</Button>
          </div>
        </label>
        {videoUrlDraft && isYouTubeUrl(videoUrlDraft) && (
          <p className={videoHintClass}>
            YouTube URLs cannot be used as WebGL textures (browser CORS restriction).
            Use a direct MP4/WebM URL instead.
          </p>
        )}
        {settings.videoTextureUrl && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button className={dangerButtonClass} onClick={clearVideoUrl}>Clear video</Button>
          </div>
        )}
      </section>
      <p className={statusClass} role="status">{status}</p>
    </aside>
  )
}
