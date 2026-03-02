import type { RectCommand, WaveCommand } from '../connection/protocol'
import Font1 from './fonts/font1.png?url'
import Font2 from './fonts/font2.png?url'
import Font3 from './fonts/font3.png?url'
import Font4 from './fonts/font4.png?url'
import Font5 from './fonts/font5.png?url'
import FragBlit from './shader/blit.frag?raw'
import VertBlit from './shader/blit.vert?raw'
import FragBlurH from './shader/blur_h.frag?raw'
import FragBlurVThreshold from './shader/blur_v_threshold.frag?raw'
import VertPostprocess from './shader/postprocess.vert?raw'
import FragRect from './shader/rect.frag?raw'
import VertRect from './shader/rect.vert?raw'
import FragSdfDist from './shader/sdf_dist.frag?raw'
import FragSdfJfa from './shader/sdf_jfa.frag?raw'
import FragSdfSeed from './shader/sdf_seed.frag?raw'
import FragText from './shader/text.frag?raw'
import VertText from './shader/text.vert?raw'
import FragWave from './shader/wave.frag?raw'
import VertWave from './shader/wave.vert?raw'
import FragApollonian from './shader/apollonian.frag?raw'
import FragPlasma from './shader/plasma.frag?raw'

export type BackgroundShader = 'none' | 'apollonian' | 'plasma'

export type ScreenLayout = 1 | 2 | 3 | 4 | 5
type ScreenConfig = {
  rectOffset: number
  programType: 1 | 2
  font: {
    url: string
    sizeX: number
    sizeY: number
    spacingX: number
    spacingY: number
    offsetX: number
    offsetY: number
    rowOffset: number
    row0Offset: number
  }
  screen: {
    width: number
    height: number
  }
}

const v1Screen = {
  width: 320,
  height: 240,
} as const

const v2Screen = {
  width: 480,
  height: 320,
} as const

// M8:01 small font
const screenLayout1Config = {
  rectOffset: 0,
  programType: 1,
  font: {
    url: Font1,
    sizeX: 5.0,
    sizeY: 7.0,
    spacingX: 8.0,
    spacingY: 10.0,
    offsetX: 0.0,
    offsetY: 0.0,
    rowOffset: 0.0,
    row0Offset: 0.0,
  },
  screen: v1Screen,
} as const satisfies ScreenConfig
// M8:01 large font
const screenLayout2Config = {
  rectOffset: -40,
  programType: 1,
  font: {
    url: Font2,
    sizeX: 8.0,
    sizeY: 9.0,
    spacingX: 10.0,
    spacingY: 12.0,
    offsetX: 0.0,
    offsetY: 0.0,
    rowOffset: -3.0,
    row0Offset: 5.0,
  },
  screen: v1Screen,
} as const satisfies ScreenConfig
// M8:02 small font
const screenLayout3Config = {
  rectOffset: 1,
  programType: 2,
  font: {
    url: Font3,
    sizeX: 9.0,
    sizeY: 9.0,
    spacingX: 12,
    spacingY: 14,
    offsetX: 0.0,
    offsetY: 3.0,
    rowOffset: 0.0,
    row0Offset: 0.0,
  },
  screen: v2Screen,
} as const satisfies ScreenConfig
// M8:02 large font
const screenLayout4Config = {
  rectOffset: 1,
  programType: 2,
  font: {
    url: Font4,
    sizeX: 10.0,
    sizeY: 10.0,
    spacingX: 12.0,
    spacingY: 14.0,
    offsetX: 0.0,
    offsetY: 2.0,
    rowOffset: 0.0,
    row0Offset: 0.0,
  },
  screen: v2Screen,
} as const satisfies ScreenConfig
// M8:02 large font, no scope
const screenLayout5Config = {
  rectOffset: -45,
  programType: 2,
  font: {
    url: Font5,
    sizeX: 12,
    sizeY: 12,
    spacingX: 15,
    spacingY: 16,
    offsetX: 0.0,
    offsetY: 5.0,
    rowOffset: -3.0,
    row0Offset: 5.0,
  },
  screen: v2Screen,
} as const satisfies ScreenConfig

const screenLayoutConfig: Record<ScreenLayout, ScreenConfig> = {
  1: screenLayout1Config,
  2: screenLayout2Config,
  3: screenLayout3Config,
  4: screenLayout4Config,
  5: screenLayout5Config,
} as const

const compileShader = (context: WebGL2RenderingContext, shaderText: string, type: GLenum) => {
  const shader = context.createShader(type)
  if (!shader) {
    throw new Error()
  }
  context.shaderSource(shader, shaderText)
  context.compileShader(shader)

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error(`Failed to compile shader: ${context.getShaderInfoLog(shader)}`)

  return shader
}

const linkProgram = (context: WebGL2RenderingContext, vert: WebGLShader, frag: WebGLShader) => {
  const program = context.createProgram()
  context.attachShader(program, vert)
  context.attachShader(program, frag)
  context.linkProgram(program)
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    throw new Error(`Failed to link: ${context.getProgramInfoLog(program)}`)
  }
  return program
}

const buildProgram = (context: WebGL2RenderingContext, vert: string, frag: string) => {
  return linkProgram(context, compileShader(context, vert, context.VERTEX_SHADER), compileShader(context, frag, context.FRAGMENT_SHADER))
}

export const renderer = (element: HTMLCanvasElement | null, initialScreenLayout: ScreenLayout, initialSmoothRendering = true) => {
  if (!element) {
    return
  }

  let screenLayout: ScreenLayout = initialScreenLayout

  const gl = element.getContext('webgl2', {
    preserveDrawingBuffer: false,
    alpha: false,
    antialias: false,
  })

  if (!gl) {
    return
  }
  const textTexture = gl.createTexture()
  let processedFontTexture: WebGLTexture | null = null
  let fontAtlasOrigW = 0
  let fontAtlasOrigH = 0
  // Processed atlas layout (set by processFont, used by renderText)
  let processedAtlasW = 0
  let processedAtlasH = 0
  let processedGlyphStride = 0
  let processedGlyphPad = 0
  let processedGlyphW = 0
  let processedGlyphH = 0
  let processedAtlasIsSdf = false
  let processedSdfPxRange = 8

  const fontImage = new Image()
  fontImage.addEventListener('load', () => {
    fontAtlasOrigW = fontImage.width
    fontAtlasOrigH = fontImage.height

    // Upload original font with NEAREST (kept as fallback reference)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, textTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fontImage)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    // Always generate processed atlas (SDF or blur+threshold)
    processFont()

    queueFrame()
  })

  let smoothRendering = initialSmoothRendering
  // Blur+threshold parameters for final glyph shaping when smoothRendering is on
  let smoothBlurRadius = 5.6
  let smoothThreshold = 0.50
  let smoothSmoothness = 0.10
  let displayWidth = screenLayoutConfig[screenLayout].screen.width
  let displayHeight = screenLayoutConfig[screenLayout].screen.height

  // Post-processing shaders
  const postprocessVert = compileShader(gl, VertPostprocess, gl.VERTEX_SHADER)
  const blurHProgram = linkProgram(gl, postprocessVert, compileShader(gl, FragBlurH, gl.FRAGMENT_SHADER))
  const blurVThresholdProgram = linkProgram(gl, postprocessVert, compileShader(gl, FragBlurVThreshold, gl.FRAGMENT_SHADER))

  const blurH_uScene = gl.getUniformLocation(blurHProgram, 'uScene')
  const blurH_uTexelSize = gl.getUniformLocation(blurHProgram, 'uTexelSize')
  const blurH_uBlurRadius = gl.getUniformLocation(blurHProgram, 'uBlurRadius')
  const blurH_uUvClamp = gl.getUniformLocation(blurHProgram, 'uUvClamp')
  const blurVT_uBlurred = gl.getUniformLocation(blurVThresholdProgram, 'uBlurred')
  const blurVT_uTexelSize = gl.getUniformLocation(blurVThresholdProgram, 'uTexelSize')
  const blurVT_uBlurRadius = gl.getUniformLocation(blurVThresholdProgram, 'uBlurRadius')
  const blurVT_uThreshold = gl.getUniformLocation(blurVThresholdProgram, 'uThreshold')
  const blurVT_uSmoothness = gl.getUniformLocation(blurVThresholdProgram, 'uSmoothness')

  const postprocessVao = gl.createVertexArray()
  const blurVT_uAlphaMode = gl.getUniformLocation(blurVThresholdProgram, 'uAlphaMode')

  // --- SDF font preprocessing programs ---
  const sdfSeedProgram = buildProgram(gl, VertPostprocess, FragSdfSeed)
  const sdfSeed_uGlyph = gl.getUniformLocation(sdfSeedProgram, 'uGlyph')
  const sdfSeed_uSize = gl.getUniformLocation(sdfSeedProgram, 'uSize')

  const sdfJfaProgram = buildProgram(gl, VertPostprocess, FragSdfJfa)
  const sdfJfa_uJFA = gl.getUniformLocation(sdfJfaProgram, 'uJFA')
  const sdfJfa_uTexelSize = gl.getUniformLocation(sdfJfaProgram, 'uTexelSize')
  const sdfJfa_uStep = gl.getUniformLocation(sdfJfaProgram, 'uStep')
  const sdfJfa_uSize = gl.getUniformLocation(sdfJfaProgram, 'uSize')

  const sdfDistProgram = buildProgram(gl, VertPostprocess, FragSdfDist)
  const sdfDist_uJFA = gl.getUniformLocation(sdfDistProgram, 'uJFA')
  const sdfDist_uGlyph = gl.getUniformLocation(sdfDistProgram, 'uGlyph')
  const sdfDist_uSize = gl.getUniformLocation(sdfDistProgram, 'uSize')
  const sdfDist_uSpread = gl.getUniformLocation(sdfDistProgram, 'uSpread')

  // --- Background shaders ---
  let backgroundShader: BackgroundShader = 'none'
  let backgroundStartTime = performance.now() / 1000

  const apollonianProgram = buildProgram(gl, VertPostprocess, FragApollonian)
  const apollonian_uTime = gl.getUniformLocation(apollonianProgram, 'uTime')
  const apollonian_uResolution = gl.getUniformLocation(apollonianProgram, 'uResolution')

  const plasmaProgram = buildProgram(gl, VertPostprocess, FragPlasma)
  const plasma_uTime = gl.getUniformLocation(plasmaProgram, 'uTime')
  const plasma_uResolution = gl.getUniformLocation(plasmaProgram, 'uResolution')

  const renderBackground = () => {
    if (backgroundShader === 'none') return
    gl.disable(gl.BLEND)
    gl.bindVertexArray(postprocessVao)
    if (backgroundShader === 'apollonian') {
      // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
      gl.useProgram(apollonianProgram)
      gl.uniform1f(apollonian_uTime, performance.now() / 1000 - backgroundStartTime)
      gl.uniform2f(apollonian_uResolution, displayWidth, displayHeight)
    } else if (backgroundShader === 'plasma') {
      // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
      gl.useProgram(plasmaProgram)
      gl.uniform1f(plasma_uTime, performance.now() / 1000 - backgroundStartTime)
      gl.uniform2f(plasma_uResolution, displayWidth, displayHeight)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.enable(gl.BLEND)
  }

  // ---------------------------------------------------------------------------
  // Unified font atlas pipeline (per-glyph):
  //   1. Extract padded glyph from source
  //   2. Build SDF from original upscaled glyph
  //   3. If smoothRendering: apply final blur+threshold shaping on SDF
  //   4. Blit glyph centre to output atlas
  //
  // JFA positions encoded as (pixel_coord / 255) in RGBA8 — no float FBO needed.
  // Max scaled glyph dim ≤ 255 px (worst case ~208 px at scale=8).
  // ---------------------------------------------------------------------------
  const processFont = () => {
    if (!fontAtlasOrigW || !fontAtlasOrigH) return

    const scale = 8
    const glyphW = screenLayoutConfig[screenLayout].font.sizeX
    const glyphH = fontAtlasOrigH
    const numGlyphs = Math.round(fontAtlasOrigW / glyphW)

    // SDF spread in scaled pixels
    const sdfSpread = Math.max(4, Math.min(40, Math.round(smoothBlurRadius * 2)))

    // Padding: must cover both blur kernel and SDF spread
    const sdfPad = Math.ceil(sdfSpread / scale) + 2
    const blurPad = smoothRendering ? 6 : 0
    const pad = Math.max(sdfPad, blurPad)

    // Output atlas dimensions
    // Extra per-slot padding in the final atlas to reduce cross-glyph sampling at small scales.
    const atlasPad = 4
    const glyphScaledW = glyphW * scale
    const glyphScaledH = glyphH * scale
    const slotW = glyphScaledW + 2 * atlasPad
    const slotH = glyphScaledH + 2 * atlasPad
    const atlasW = numGlyphs * slotW
    const atlasH = slotH

    // Padded glyph dimensions (for processing)
    const paddedW = glyphW + 2 * pad
    const paddedH = glyphH + 2 * pad
    const scaledW = paddedW * scale
    const scaledH = paddedH * scale
    const padPx = pad * scale

    // Output atlas texture
    if (processedFontTexture) gl.deleteTexture(processedFontTexture)
    processedFontTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE8)
    gl.bindTexture(gl.TEXTURE_2D, processedFontTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlasW, atlasH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const atlasFbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, atlasFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, processedFontTexture, 0)

    // Store atlas layout
    processedAtlasW = atlasW
    processedAtlasH = atlasH
    processedGlyphStride = slotW
    processedGlyphPad = atlasPad
    processedGlyphW = glyphScaledW
    processedGlyphH = glyphScaledH
    processedAtlasIsSdf = !smoothRendering
    processedSdfPxRange = sdfSpread

    // 2D canvas for glyph extraction
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = paddedW
    cropCanvas.height = paddedH
    const cropCtx = cropCanvas.getContext('2d')
    if (!cropCtx) return

    // Per-glyph input texture (bilinear; upscaled implicitly by viewport)
    const glyphTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, glyphTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // --- Blur textures (only allocated when smoothRendering) ---
    let hblurTex: WebGLTexture | null = null
    let hblurFbo: WebGLFramebuffer | null = null
    let blurResultTex: WebGLTexture | null = null
    let blurResultFbo: WebGLFramebuffer | null = null

    if (smoothRendering) {
      hblurTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE5)
      gl.bindTexture(gl.TEXTURE_2D, hblurTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, scaledW, scaledH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      hblurFbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, hblurFbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hblurTex, 0)

      blurResultTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE6)
      gl.bindTexture(gl.TEXTURE_2D, blurResultTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, scaledW, scaledH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      blurResultFbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurResultFbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurResultTex, 0)
    }

    // --- JFA ping-pong textures: RGBA8, NEAREST (exact integer coord encoding) ---
    const jfaTex0 = gl.createTexture()
    const jfaFbo0 = gl.createFramebuffer()
    const jfaTex1 = gl.createTexture()
    const jfaFbo1 = gl.createFramebuffer()
    for (const [tex, fbo, unit] of [
      [jfaTex0, jfaFbo0, 7],
      [jfaTex1, jfaFbo1, 9],
    ] as [WebGLTexture | null, WebGLFramebuffer | null, number][]) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, scaledW, scaledH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    }

    // SDF result texture
    const sdfTex = gl.createTexture()
    const sdfFbo = gl.createFramebuffer()
    gl.activeTexture(gl.TEXTURE10)
    gl.bindTexture(gl.TEXTURE_2D, sdfTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, scaledW, scaledH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, sdfFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sdfTex, 0)

    const numPasses = Math.ceil(Math.log2(Math.max(scaledW, scaledH)))
    const jfaUnits = [7, 9]
    const jfaTextures = [jfaTex0, jfaTex1]
    const jfaFbos = [jfaFbo0, jfaFbo1]

    gl.disable(gl.BLEND)
    gl.bindVertexArray(postprocessVao)

    for (let g = 0; g < numGlyphs; g++) {
      // Extract padded glyph via 2D canvas (glyph centred in padded area)
      cropCtx.clearRect(0, 0, paddedW, paddedH)
      cropCtx.drawImage(fontImage, g * glyphW, 0, glyphW, glyphH, pad, pad, glyphW, glyphH)
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, glyphTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cropCanvas)

      gl.viewport(0, 0, scaledW, scaledH)

      // --- SDF seed: classify inside/outside from binary glyph ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, jfaFbo0)
      // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
      gl.useProgram(sdfSeedProgram)
      gl.uniform1i(sdfSeed_uGlyph, 4)
      gl.uniform2f(sdfSeed_uSize, scaledW, scaledH)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // --- JFA passes: ping-pong ---
      let readIdx = 0
      for (let p = numPasses - 1; p >= 0; p--) {
        const writeIdx = 1 - readIdx
        gl.bindFramebuffer(gl.FRAMEBUFFER, jfaFbos[writeIdx])
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
        gl.useProgram(sdfJfaProgram)
        gl.activeTexture(gl.TEXTURE0 + jfaUnits[readIdx])
        gl.bindTexture(gl.TEXTURE_2D, jfaTextures[readIdx])
        gl.uniform1i(sdfJfa_uJFA, jfaUnits[readIdx])
        gl.uniform2f(sdfJfa_uTexelSize, 1.0 / scaledW, 1.0 / scaledH)
        gl.uniform1f(sdfJfa_uStep, Math.pow(2, p))
        gl.uniform2f(sdfJfa_uSize, scaledW, scaledH)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        readIdx = writeIdx
      }

      // --- Distance pass: JFA result + binary glyph → normalised SDF ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, sdfFbo)
      // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
      gl.useProgram(sdfDistProgram)
      gl.activeTexture(gl.TEXTURE0 + jfaUnits[readIdx])
      gl.bindTexture(gl.TEXTURE_2D, jfaTextures[readIdx])
      gl.uniform1i(sdfDist_uJFA, jfaUnits[readIdx])
      gl.uniform1i(sdfDist_uGlyph, 4)
      gl.uniform2f(sdfDist_uSize, scaledW, scaledH)
      gl.uniform1f(sdfDist_uSpread, sdfSpread)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (smoothRendering) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, hblurFbo)
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
        gl.useProgram(blurHProgram)
        gl.activeTexture(gl.TEXTURE10)
        gl.bindTexture(gl.TEXTURE_2D, sdfTex)
        gl.uniform1i(blurH_uScene, 10)
        gl.uniform2f(blurH_uTexelSize, 1.0 / scaledW, 1.0 / scaledH)
        gl.uniform1f(blurH_uBlurRadius, smoothBlurRadius)
        gl.uniform4f(blurH_uUvClamp, 0.0, 0.0, 1.0, 1.0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

        gl.bindFramebuffer(gl.FRAMEBUFFER, blurResultFbo)
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
        gl.useProgram(blurVThresholdProgram)
        gl.activeTexture(gl.TEXTURE5)
        gl.bindTexture(gl.TEXTURE_2D, hblurTex)
        gl.uniform1i(blurVT_uBlurred, 5)
        gl.uniform2f(blurVT_uTexelSize, 1.0 / scaledW, 1.0 / scaledH)
        gl.uniform1f(blurVT_uBlurRadius, smoothBlurRadius)
        gl.uniform1f(blurVT_uThreshold, smoothThreshold)
        gl.uniform1f(blurVT_uSmoothness, smoothSmoothness)
        gl.uniform1i(blurVT_uAlphaMode, 1)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }

      // --- Blit glyph centre (without padding) to atlas slot ---
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, smoothRendering ? blurResultFbo : sdfFbo)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, atlasFbo)
      const dstX = g * slotW + atlasPad
      const dstY = atlasPad
      gl.blitFramebuffer(
        padPx, padPx, padPx + glyphScaledW, padPx + glyphScaledH,
        dstX, dstY, dstX + glyphScaledW, dstY + glyphScaledH,
        gl.COLOR_BUFFER_BIT, gl.NEAREST,
      )
    }

    gl.enable(gl.BLEND)
    gl.deleteTexture(glyphTex)
    if (hblurTex) gl.deleteTexture(hblurTex)
    if (blurResultTex) gl.deleteTexture(blurResultTex)
    if (hblurFbo) gl.deleteFramebuffer(hblurFbo)
    if (blurResultFbo) gl.deleteFramebuffer(blurResultFbo)
    gl.deleteTexture(jfaTex0)
    gl.deleteTexture(jfaTex1)
    gl.deleteTexture(sdfTex)
    gl.deleteFramebuffer(jfaFbo0)
    gl.deleteFramebuffer(jfaFbo1)
    gl.deleteFramebuffer(sdfFbo)
    gl.deleteFramebuffer(atlasFbo)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const handleResize = (newWidth: number, newHeight: number) => {
    if (newWidth <= 0 || newHeight <= 0) return
    if (newWidth === displayWidth && newHeight === displayHeight) return

    console.log('resize huh', displayWidth, '->', newWidth, displayHeight, '->', newHeight)

    displayWidth = newWidth
    displayHeight = newHeight
    element.width = displayWidth
    element.height = displayHeight
    queueFrame()
  }

  const queueFrame = (() => {
    let isQueued = false
    return () => {
      if (!isQueued) {
        isQueued = true
        requestAnimationFrame(() => {
          // Guard against one-frame scale glitches when tab visibility/DPR/layout changes
          // are observed after RAF resumes.
          const dpr = window.devicePixelRatio || 1
          const expectedWidth = Math.max(1, Math.round(element.clientWidth * dpr))
          const expectedHeight = Math.max(1, Math.round(element.clientHeight * dpr))
          if ((expectedWidth !== displayWidth || expectedHeight !== displayHeight) && expectedWidth > 0 && expectedHeight > 0) {
            displayWidth = expectedWidth
            displayHeight = expectedHeight
            element.width = displayWidth
            element.height = displayHeight
            isQueued = false
            queueFrame()
            return
          }

          const { width: nativeW, height: nativeH } = screenLayoutConfig[screenLayout].screen

          // Always render directly to screen — no scene-level post-processing.
          // Rounded alpha atlas handles text quality; blur+threshold is baked per-glyph.

          // Step 0: Clear + background shader
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, displayWidth, displayHeight)
          gl.clearColor(0, 0, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          renderBackground()

          // Step 1: Rects at native res (into internal rectsFramebuffer)
          gl.viewport(0, 0, nativeW, nativeH)
          rectRenderer.renderRects(true)

          // Step 2: Blit rects to screen at display res
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, displayWidth, displayHeight)
          gl.bindVertexArray(postprocessVao)
          // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
          gl.useProgram(blurHProgram)
          gl.activeTexture(gl.TEXTURE0)
          gl.uniform1i(blurH_uScene, 0)
          gl.uniform2f(blurH_uTexelSize, 0, 0)
          gl.uniform1f(blurH_uBlurRadius, 0)
          gl.uniform4f(blurH_uUvClamp, 0.0, 0.0, 1.0, 1.0)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

          // Step 3: Text at display res with SDF processed font
          if (processedFontTexture) {
            gl.activeTexture(gl.TEXTURE1)
            gl.bindTexture(gl.TEXTURE_2D, processedFontTexture)
          }
          textRenderer.renderText(!!processedFontTexture)

          // Step 4: Waves at display res
          waveRenderer.renderWave(true)

          isQueued = false
        })
      }
    }
  })()

  const textRenderer = (() => {
    const textShader = buildProgram(gl, VertText, FragText)
    gl.useProgram(textShader)
    gl.uniform1i(gl.getUniformLocation(textShader, 'font'), 1)

    const textVao = gl.createVertexArray()
    gl.bindVertexArray(textVao)

    const textColors = new Uint8Array(40 * 24 * 3)
    const textColorsBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, textColorsBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, textColors, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.UNSIGNED_BYTE, true, 0, 0)
    gl.vertexAttribDivisor(0, 1)

    const textChars = new Uint8Array(40 * 24)
    const textCharsBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, textCharsBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, textChars, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 1, gl.UNSIGNED_BYTE, false, 0, 0)
    gl.vertexAttribDivisor(1, 1)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, textTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    let textColorsUpdated = false
    let textCharsUpdated = false

    return {
      renderText: (smooth = false) => {
        gl.useProgram(textShader)
        gl.bindVertexArray(textVao)

        const {
          font: { spacingX: posScaleX, spacingY: posScaleY, sizeX, sizeY, offsetX, offsetY, rowOffset, row0Offset },
          screen: { width, height },
        } = screenLayoutConfig[screenLayout]
        gl.uniform2f(gl.getUniformLocation(textShader, 'size'), sizeX, sizeY)
        gl.uniform2f(gl.getUniformLocation(textShader, 'spacing'), posScaleX, posScaleY)
        gl.uniform2f(gl.getUniformLocation(textShader, 'posOffset'), offsetX, offsetY)
        gl.uniform1f(gl.getUniformLocation(textShader, 'rowOffset'), rowOffset)
        gl.uniform2f(gl.getUniformLocation(textShader, 'posOffsetRow0'), 0.0, row0Offset)
        gl.uniform2f(gl.getUniformLocation(textShader, 'camSize'), width, height)
        gl.uniform1i(gl.getUniformLocation(textShader, 'useSmooth'), smooth ? 1 : 0)
        gl.uniform1i(gl.getUniformLocation(textShader, 'useSdf'), smooth && processedAtlasIsSdf ? 1 : 0)
        gl.uniform1f(gl.getUniformLocation(textShader, 'sdfThreshold'), 0.5)
        gl.uniform1f(gl.getUniformLocation(textShader, 'sdfSoftness'), 0.0)
        gl.uniform1f(gl.getUniformLocation(textShader, 'sdfPxRange'), processedSdfPxRange)
        if (smooth) {
          gl.uniform2f(gl.getUniformLocation(textShader, 'fontAtlasSize'), processedAtlasW, processedAtlasH)
          gl.uniform1f(gl.getUniformLocation(textShader, 'fontGlyphStride'), processedGlyphStride)
          gl.uniform1f(gl.getUniformLocation(textShader, 'fontGlyphPad'), processedGlyphPad)
          gl.uniform2f(gl.getUniformLocation(textShader, 'fontGlyphSize'), processedGlyphW, processedGlyphH)
        } else {
          gl.uniform2f(gl.getUniformLocation(textShader, 'fontAtlasSize'), fontAtlasOrigW, fontAtlasOrigH)
        }

        if (textColorsUpdated) {
          gl.bindBuffer(gl.ARRAY_BUFFER, textColorsBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, textColors)
          textColorsUpdated = false
        }

        if (textCharsUpdated) {
          gl.bindBuffer(gl.ARRAY_BUFFER, textCharsBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, textChars)
          textCharsUpdated = false
        }

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 40 * 24)
      },
      // TODO: various improvements based on the character command, may as well just take the command itself
      drawText: ({
        char,
        pos: { x, y },
        color: { r, g, b },
      }: {
        char: string
        pos: {
          x: number
          y: number
        }
        color: {
          r: number
          g: number
          b: number
        }
      }) => {
        const {
          font: { spacingX, spacingY },
        } = screenLayoutConfig[screenLayout]
        // const i = Math.floor(y / spacingX) * 40 + Math.floor(x * spacingY)
        const i = Math.floor(y / spacingY) * 40 + Math.floor(x / spacingX)
        if (i >= 960) {
          return
        }

        textChars[i] = char.charCodeAt(0) - 32
        textCharsUpdated = true
        textColors[i * 3 + 0] = r
        textColors[i * 3 + 1] = g
        textColors[i * 3 + 2] = b
        textColorsUpdated = true
        queueFrame()
      },
    }
  })()

  const rectRenderer = (() => {
    const rectShapes = new Uint16Array(1024 * 6)
    const rectColors = new Uint8Array(rectShapes.buffer, 8)
    const rectShader = buildProgram(gl, VertRect, FragRect)

    const rectVao = gl.createVertexArray()
    gl.bindVertexArray(rectVao)

    const rectShapeBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, rectShapeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, rectShapes, gl.STREAM_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.UNSIGNED_SHORT, false, 12, 0)
    gl.vertexAttribDivisor(0, 1)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, true, 12, 8)
    gl.vertexAttribDivisor(1, 1)

    const rectsTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, rectsTexture)
    const { width, height } = screenLayoutConfig[screenLayout].screen
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    const rectsFramebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, rectsFramebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rectsTexture, 0)

    const blitShader = buildProgram(gl, VertBlit, FragBlit)
    gl.useProgram(blitShader)
    gl.uniform1i(gl.getUniformLocation(blitShader, 'src'), 0)
    let rectsClear = true
    let background = {
      r: 0,
      g: 0,
      b: 0,
    }

    let lastColor = {
      r: 0,
      g: 0,
      b: 0,
    }

    let rectCount = 0

    const renderRects = (skipBlit = false) => {
      const { width, height } = screenLayoutConfig[screenLayout].screen
      if (rectsClear) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, rectsFramebuffer)
        gl.viewport(0, 0, width, height)
        // Make background transparent when any background shader is enabled so it shows through
        const alpha = backgroundShader !== 'none' ? 0.0 : 1.0
        gl.clearColor(background.r, background.g, background.b, alpha)
        gl.clear(gl.COLOR_BUFFER_BIT)
        rectsClear = false
      }
      if (rectCount > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, rectsFramebuffer)
        gl.viewport(0, 0, width, height)
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hooke
        gl.useProgram(rectShader)
        gl.bindVertexArray(rectVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, rectShapeBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, rectShapes.subarray(0, rectCount * 6))
        gl.uniform2f(gl.getUniformLocation(rectShader, 'size'), width, height)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rectCount)
        rectCount = 0
      }
      if (!skipBlit) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, displayWidth, displayHeight)
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
        gl.useProgram(blitShader)
        gl.uniform2f(gl.getUniformLocation(blitShader, 'size'), width, height)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
    }
    const drawRect = ({ pos: { x, y }, size: { width, height }, color }: Exclude<RectCommand, undefined>) => {
      lastColor = color ?? lastColor
      let { r, g, b } = lastColor

      if (rectCount >= 1024) {
        // Flush pending batch only into the native rect FBO.
        // Final screen presentation stays in queueFrame to keep passes synchronized.
        renderRects(true)
      }

      const { rectOffset, screen } = screenLayoutConfig[screenLayout]

      if (x === 0 && y === 0 && width >= screen.width && height >= screen.height) {
        // Full-screen rect - this is the background color
        background = { r: r / 255, g: g / 255, b: b / 255 }
        rectCount = 0
        rectsClear = true
      } else {
        // When background shader is enabled, make background-colored rects transparent
        const isBackgroundShader = backgroundShader !== 'none'
        const isBackgroundColor = r === Math.round(background.r * 255) && g === Math.round(background.g * 255) && b === Math.round(background.b * 255)
        if (isBackgroundShader && isBackgroundColor) {
          r = 0
          g = 0
          b = 0
        }

        if (rectCount < 1024) {
          const i = rectCount
          rectShapes[i * 6 + 0] = x
          rectShapes[i * 6 + 1] = y > 0 ? y + rectOffset : y
          rectShapes[i * 6 + 2] = width
          rectShapes[i * 6 + 3] = height
          rectColors[i * 12 + 0] = r
          rectColors[i * 12 + 1] = g
          rectColors[i * 12 + 2] = b
          rectCount++
        }
      }

      queueFrame()
    }
    return {
      renderRects,
      drawRect,
      resizeTexture: (width: number, height: number) => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, rectsTexture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      },
    }
  })()

  const waveRenderer = (() => {
    const waveData = new Uint8Array(484)
    const waveColor = new Float32Array([0.5, 1, 1])

    const waveShader = buildProgram(gl, VertWave, FragWave)
    const colorUniform = gl.getUniformLocation(waveShader, 'color')
    const waveVao = gl.createVertexArray()
    gl.bindVertexArray(waveVao)

    const glBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, waveData, gl.STREAM_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_BYTE, 1, 0)

    let waveUpdated = false
    return {
      renderWave: (smooth = false) => {
        if (!waveUpdated) {
          return
        }
        const {
          programType,
          screen: { width, height },
        } = screenLayoutConfig[screenLayout]
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
        gl.useProgram(waveShader)
        gl.uniform1i(gl.getUniformLocation(waveShader, 'programType'), programType)
        gl.uniform2f(gl.getUniformLocation(waveShader, 'size'), width, height)
        gl.uniform1f(gl.getUniformLocation(waveShader, 'pointScale'), smooth ? displayWidth / width : 1.0)
        gl.uniform3fv(colorUniform, waveColor)
        gl.bindVertexArray(waveVao)

        if (waveUpdated) {
          gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, waveData)
          waveUpdated = false
        }

        gl.drawArrays(gl.POINTS, 0, width)
      },
      drawWave: ({ color: { r, g, b }, wave }: WaveCommand) => {
        waveColor[0] = r / 255
        waveColor[1] = g / 255
        waveColor[2] = b / 255

        if (wave.length > 0) {
          const {
            screen: { width },
          } = screenLayoutConfig[screenLayout]
          waveData.fill(-1)
          waveData.set(wave, width - wave.length)
          waveUpdated = true
          queueFrame()
          return
        }
        if (waveUpdated) {
          waveUpdated = false
          queueFrame()
          return
        }
      },
    }
  })()

  const updateScreen = () => {
    const { width, height } = screenLayoutConfig[screenLayout].screen
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Canvas buffer always at display resolution
    element.width = displayWidth
    element.height = displayHeight

    // Resize rects FBO for new native resolution
    rectRenderer.resizeTexture(width, height)

    // Invalidate processed font (new font will be loaded)
    if (processedFontTexture) {
      gl.deleteTexture(processedFontTexture)
      processedFontTexture = null
    }

    gl.viewport(0, 0, width, height)
    fontImage.src = screenLayoutConfig[screenLayout].font.url
  }

  updateScreen()
  return {
    text: textRenderer,
    rect: rectRenderer,
    wave: waveRenderer,
    setScreenLayout: (newScreenLayout: ScreenLayout) => {
      screenLayout = newScreenLayout
      updateScreen()
    },
    resize: handleResize,
    setSmoothRendering: (enabled: boolean) => {
      if (smoothRendering !== enabled) {
        smoothRendering = enabled
        if (fontAtlasOrigW > 0) processFont()
        queueFrame()
      }
    },
    setSmoothParams: (blur: number, threshold: number, smoothness: number) => {
      const changed = blur !== smoothBlurRadius || threshold !== smoothThreshold || smoothness !== smoothSmoothness
      smoothBlurRadius = blur
      smoothThreshold = threshold
      smoothSmoothness = smoothness
      if (changed && fontAtlasOrigW > 0) processFont()
      queueFrame()
    },
    setBackgroundShader: (shader: BackgroundShader) => {
      backgroundShader = shader
      backgroundStartTime = performance.now() / 1000
      queueFrame()
    },
  }
}
