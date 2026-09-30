import { DEFAULT_CUSTOM_BACKGROUND_SHADER, DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME } from './defaultSpectrumShader'
import CyberPunkShaderSource from './shader/cyberpunk.frag?raw'
import FontAtlasGlitchShaderSource from './shader/font_atlas_glitch.frag?raw'
import VideoBackgroundShaderSource from './shader/video_background.frag?raw'
import type { SavedBackgroundShader, StoredShaderLibrary } from './shaderLibrary'

// Kept out of shaderLibrary.ts so the always-loaded consumers (VJ numpad, screen)
// don't pull the shader sources into the main bundle: only the editor imports this.

const DEFAULT_SPECTRUM_ID = 'default-spectrum-demo'

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
        name: 'Video Background',
        source: VideoBackgroundShaderSource,
        compositeM8Screen: false,
        videoUrl: '',
        updatedAt: 0,
    },
    {
        id: 'font-atlas-glitch',
        name: 'Font Atlas Glitch',
        source: FontAtlasGlitchShaderSource,
        compositeM8Screen: false,
        videoUrl: '',
        updatedAt: 0,
    },
    {
        id: DEFAULT_SPECTRUM_ID,
        name: DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME,
        source: DEFAULT_CUSTOM_BACKGROUND_SHADER,
        compositeM8Screen: true,
        videoUrl: '',
        updatedAt: 0,
    },
]

// The untouched built-in spectrum demo (updatedAt === 0) always follows the current default source
const refreshUntouchedSpectrumDemo = (shader: SavedBackgroundShader): SavedBackgroundShader =>
    shader.name === DEFAULT_CUSTOM_BACKGROUND_SHADER_NAME && shader.id === DEFAULT_SPECTRUM_ID && shader.updatedAt === 0
        ? { ...shader, source: DEFAULT_CUSTOM_BACKGROUND_SHADER }
        : shader

// Prepends the built-in shaders that the stored list lacks (matched by id or name)
const seedDefaultShaders = (savedShaders: SavedBackgroundShader[]): SavedBackgroundShader[] => {
    const savedIds = new Set(savedShaders.map((shader) => shader.id))
    const savedNames = new Set(savedShaders.map((shader) => shader.name))
    const missingDefaults = DEFAULT_SAVED_SHADERS.filter((shader) => !savedIds.has(shader.id) && !savedNames.has(shader.name))

    return missingDefaults.length > 0 ? [...missingDefaults, ...savedShaders] : savedShaders
}

/** The library the editor should work with: stored shaders plus any missing built-ins. */
export const withDefaultShaders = (stored: Extract<StoredShaderLibrary, { kind: 'missing' | 'ok' }>): SavedBackgroundShader[] =>
    stored.kind === 'missing' ? DEFAULT_SAVED_SHADERS : seedDefaultShaders(stored.shaders.map(refreshUntouchedSpectrumDemo))
