import type { RectCommand, WaveCommand } from '../connection/protocol'
import Font1 from './fonts/font1.png?url'
import Font2 from './fonts/font2.png?url'
import Font3 from './fonts/font3.png?url'
import Font4 from './fonts/font4.png?url'
import Font5 from './fonts/font5.png?url'
import FragBlit from './shader/blit.frag?raw'
import VertBlit from './shader/blit.vert?raw'
import FragRect from './shader/rect.frag?raw'
import VertRect from './shader/rect.vert?raw'
import FragText from './shader/text.frag?raw'
import VertText from './shader/text.vert?raw'
import FragWave from './shader/wave.frag?raw'
import VertWave from './shader/wave.vert?raw'

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
  rectOffset: -2,
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
  rectOffset: -2,
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
  rectOffset: -54,
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
    throw new Error('Failed to link')
  }
  return program
}

const buildProgram = (context: WebGL2RenderingContext, vert: string, frag: string) => {
  return linkProgram(context, compileShader(context, vert, context.VERTEX_SHADER), compileShader(context, frag, context.FRAGMENT_SHADER))
}

export const renderer = (element: HTMLCanvasElement | null, initialScreenLayout: ScreenLayout) => {
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

  const fontImage = new Image()
  fontImage.addEventListener('load', () => {
    fontImage.width
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, textTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fontImage.width, fontImage.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, fontImage)
    queueFrame()
  })

  const queueFrame = (() => {
    let isQueued = false
    return () => {
      if (!isQueued) {
        isQueued = true
        requestAnimationFrame(() => {
          rectRenderer.renderRects()
          textRenderer.renderText()
          waveRenderer.renderWave()
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
      renderText: () => {
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

    const renderRects = () => {
      const { width, height } = screenLayoutConfig[screenLayout].screen
      if (rectsClear) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, rectsFramebuffer)
        gl.clearColor(background.r, background.g, background.b, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        rectsClear = false
      }
      if (rectCount > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, rectsFramebuffer)
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hooke
        gl.useProgram(rectShader)
        gl.bindVertexArray(rectVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, rectShapeBuffer)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, rectShapes.subarray(0, rectCount * 6))
        gl.uniform2f(gl.getUniformLocation(rectShader, 'size'), width, height)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rectCount)
        rectCount = 0
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
      gl.useProgram(blitShader)
      gl.uniform2f(gl.getUniformLocation(blitShader, 'size'), width, height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const drawRect = ({ pos: { x, y }, size: { width, height }, color }: Exclude<RectCommand, undefined>) => {
      lastColor = color ?? lastColor
      const { r, g, b } = lastColor

      if (rectCount >= 1024) {
        renderRects()
      }

      const { rectOffset, screen } = screenLayoutConfig[screenLayout]

      if (x === 0 && y === 0 && width >= screen.width && height >= screen.height) {
        background = { r: r / 255, g: g / 255, b: b / 255 }
        rectCount = 0
        rectsClear = true
      } else if (rectCount < 1024) {
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

      queueFrame()
    }
    return {
      renderRects,
      drawRect,
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
      renderWave: () => {
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
    gl.viewport(0, 0, width, height)
    element.width = width
    element.height = height
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
  }
}
