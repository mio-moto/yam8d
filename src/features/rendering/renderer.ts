import type { RectCommand, WaveCommand } from '../connection/protocol'
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

const screenLayout = 4;

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

export const renderer = (element: HTMLCanvasElement | null) => {
  if (!element) {
    return
  }

  const gl = element.getContext('webgl2', {
    preserveDrawingBuffer: false,
    alpha: false,
    antialias: false,
  })

  if (!gl) {
    return
  }

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

    const textTexture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, textTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    let textColorsUpdated = false
    let textCharsUpdated = false

    const fontImage = new Image()
    fontImage.addEventListener('load', () => {
      fontImage.width
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, textTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fontImage.width, fontImage.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, fontImage)
      queueFrame()
    })
    if (screenLayout === 4) {
      fontImage.src = Font4
    } else {
      fontImage.src = Font5
    }

    return {
      renderText: () => {
        gl.useProgram(textShader)
        gl.bindVertexArray(textVao)


        if (screenLayout === 4) {
          // TODO: program offsets are static
          gl.uniform2f(gl.getUniformLocation(textShader, "size"), 10.0, 10.0);
          gl.uniform2f(gl.getUniformLocation(textShader, "posScale"), 12.0, 14.0);
          gl.uniform2f(gl.getUniformLocation(textShader, "posOffset"), 0.0, 2.0);
          gl.uniform2f(gl.getUniformLocation(textShader, "posOffsetRow0"), 0.0, 0.0);
          gl.uniform1f(gl.getUniformLocation(textShader, 'rowOffset'), 0.0);
        } else {
          gl.uniform2f(gl.getUniformLocation(textShader, "size"), 12.0, 12.0);
          gl.uniform2f(gl.getUniformLocation(textShader, "posScale"), 15.0, 16.0);
          gl.uniform2f(gl.getUniformLocation(textShader, "posOffset"), 0.0, -2.0);
          gl.uniform2f(gl.getUniformLocation(textShader, "posOffsetRow0"), 0.0, 5.0);
          gl.uniform1f(gl.getUniformLocation(textShader, 'rowOffset'), -3.0);
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
        const i = y * 40 + x
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 480, 320, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
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
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rectCount)
        rectCount = 0
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
      gl.useProgram(blitShader)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const drawRect = ({ pos: { x, y }, size: { width, height }, color }: Exclude<RectCommand, undefined>) => {
      lastColor = color ?? lastColor
      const { r, g, b } = lastColor

      if (rectCount >= 1024) {
        renderRects()
      }

      if (x === 0 && y === 0 && width >= 480 && height >= 320) {
        background = { r: r / 255, g: g / 255, b: b / 255 }
        rectCount = 0
        rectsClear = true
      } else if (rectCount < 1024) {
        const i = rectCount
        rectShapes[i * 6 + 0] = x
        rectShapes[i * 6 + 1] = y > 0 ? y - 2 : y
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
    const colorUniform = gl.getUniformLocation(waveShader, 'colour')
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
        // biome-ignore lint/correctness/useHookAtTopLevel: ain't a hook
        gl.useProgram(waveShader)
        gl.uniform3fv(colorUniform, waveColor)
        gl.bindVertexArray(waveVao)

        if (waveUpdated) {
          gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, waveData)
          waveUpdated = false
        }
        gl.drawArrays(gl.POINTS, 0, 480)
      },
      drawWave: ({ color: { r, g, b }, wave }: WaveCommand) => {
        waveColor[0] = r / 255
        waveColor[1] = g / 255
        waveColor[2] = b / 255

        if (wave.length > 0) {
          waveData.fill(-1)
          waveData.set(wave, 480 - wave.length)
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

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.viewport(0, 0, 480, 320)
  element.width = 480
  element.height = 320

  return {
    text: textRenderer,
    rect: rectRenderer,
    wave: waveRenderer,
  }
}
