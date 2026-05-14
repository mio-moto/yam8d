import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, type Completion, type CompletionContext, completionKeymap, snippetCompletion, startCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { linter, lintKeymap, type Diagnostic } from '@codemirror/lint'
import { EditorState, Prec } from '@codemirror/state'
import { crosshairCursor, drawSelection, dropCursor, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from '@codemirror/view'
import { css } from '@linaria/core'
import { tags } from '@lezer/highlight'
import { type FC, useEffect, useRef } from 'react'
import { style } from '../../app/style/style'

const shaderEditorClass = css`
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid rgba(104, 133, 142, 0.65);
  background: #050707;

  .cm-editor {
    height: 100%;
    background: #050707;
    color: ${style.colors.anthracite.primary};
    font-family: "Kode Mono", "Consolas", monospace;
    font-size: 12px;
  }

  .cm-scroller {
    font-family: "Kode Mono", "Consolas", monospace;
  }

  .cm-gutters {
    background: #0f0f0f;
    color: ${style.colors.anthracite[500]};
    border-right: 1px solid rgba(104, 133, 142, 0.45);
  }

  .cm-activeLine,
  .cm-activeLineGutter {
    background: rgba(46, 197, 230, 0.08);
  }

  .cm-cursor {
    border-left-color: ${style.colors.teal.primary};
  }

  .cm-selectionBackground,
  .cm-content ::selection {
    background: rgba(46, 197, 230, 0.24) !important;
  }

  .cm-tooltip {
    background: #141414;
    border: 1px solid #68858e;
    color: ${style.colors.anthracite.primary};
    font-family: "Kode Mono", "Consolas", monospace;
  }

  .cm-tooltip-autocomplete ul li[aria-selected] {
    background: #2e383c;
    color: ${style.colors.teal.primary};
  }

  .cm-diagnostic {
    font-family: "Kode Mono", "Consolas", monospace;
  }
`

const shaderTheme = EditorView.theme({
  '&.cm-focused': {
    outline: `1px solid ${style.colors.teal.primary}`,
  },
})

const shaderHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: style.colors.teal.primary },
  { tag: tags.string, color: style.colors.lime.primary },
  { tag: tags.number, color: style.colors.raspberry[500] },
  { tag: tags.comment, color: style.colors.anthracite[400] },
  { tag: tags.variableName, color: style.colors.anthracite.primary },
  { tag: tags.propertyName, color: style.colors.teal[300] },
  { tag: [tags.typeName, tags.standard(tags.typeName)], color: style.colors.ochre.primary },
  { tag: tags.definition(tags.variableName), color: style.colors.lime[200] },
  { tag: tags.function(tags.variableName), color: style.colors.lime.primary },
  { tag: tags.operator, color: style.colors.anthracite.primary },
])

const uniformCompletions: Completion[] = [
  { label: 'uTime', type: 'variable', detail: 'float - resets on shader switch' },
  { label: 'uGlobalTime', type: 'variable', detail: 'float - never resets' },
  { label: 'uResolution', type: 'variable', detail: 'vec2 - display resolution' },
  { label: 'uMouse', type: 'variable', detail: 'vec4 - x, y, down, _' },
  { label: 'uAudioLevel', type: 'variable', detail: 'float 0..1' },
  { label: 'uAudioSpectrum', type: 'variable', detail: 'sampler2D float' },
  { label: 'uAudioSpectrumBins', type: 'variable', detail: 'float' },
  { label: 'uFrameCount', type: 'variable', detail: 'int - resets on shader switch' },
  { label: 'uGlobalFrameCount', type: 'variable', detail: 'int - never resets' },
  { label: 'uPreviousFrame', type: 'variable', detail: 'sampler2D' },
  { label: 'uM8Screen', type: 'variable', detail: 'sampler2D - current M8 screen' },
]

const placeholder = (name: string) => `\${${name}}`

const glslCompletions: Completion[] = [
  { label: 'vec2', type: 'type' },
  { label: 'vec3', type: 'type' },
  { label: 'vec4', type: 'type' },
  { label: 'mat2', type: 'type' },
  { label: 'mat3', type: 'type' },
  { label: 'mat4', type: 'type' },
  { label: 'float', type: 'type' },
  { label: 'int', type: 'type' },
  { label: 'bool', type: 'type' },
  { label: 'sampler2D', type: 'type' },
  { label: 'uniform', type: 'keyword' },
  { label: 'precision', type: 'keyword' },
  { label: 'highp', type: 'keyword' },
  { label: 'mediump', type: 'keyword' },
  { label: 'lowp', type: 'keyword' },
  { label: 'out', type: 'keyword' },
  { label: 'in', type: 'keyword' },
  snippetCompletion(`texture(${placeholder('uM8Screen')}, ${placeholder('uv')})`, { label: 'texture', type: 'function' }),
  snippetCompletion(`mix(${placeholder('a')}, ${placeholder('b')}, ${placeholder('t')})`, { label: 'mix', type: 'function' }),
  snippetCompletion(`smoothstep(${placeholder('edge0')}, ${placeholder('edge1')}, ${placeholder('x')})`, { label: 'smoothstep', type: 'function' }),
  snippetCompletion(`clamp(${placeholder('x')}, ${placeholder('minVal')}, ${placeholder('maxVal')})`, { label: 'clamp', type: 'function' }),
  { label: 'fract', type: 'function' },
  { label: 'floor', type: 'function' },
  { label: 'sin', type: 'function' },
  { label: 'cos', type: 'function' },
  { label: 'tan', type: 'function' },
  { label: 'pow', type: 'function' },
  { label: 'sqrt', type: 'function' },
  { label: 'length', type: 'function' },
  { label: 'normalize', type: 'function' },
  { label: 'dot', type: 'function' },
  { label: 'cross', type: 'function' },
]

const shaderCompletions = [...uniformCompletions, ...glslCompletions]

const completeShader = (context: CompletionContext) => {
  const word = context.matchBefore(/[A-Za-z_][\w]*/)
  if (!word && !context.explicit) return null

  return {
    from: word?.from ?? context.pos,
    options: shaderCompletions,
    validFor: /^[A-Za-z_][\w]*$/,
  }
}

const createShaderDiagnostics = (source: string, validate?: (source: string) => string | null): Diagnostic[] => {
  if (!validate) return []
  const message = validate(source)
  if (!message) return []

  return [{
    from: 0,
    to: Math.min(source.length, 1),
    severity: 'error',
    message,
  }]
}

const stopAppKeyboardShortcuts = EditorView.domEventHandlers({
  keydown: (event) => {
    event.stopPropagation()
    return false
  },
  keyup: (event) => {
    event.stopPropagation()
    return false
  },
  keypress: (event) => {
    event.stopPropagation()
    return false
  },
})

const shaderEditorSetup = [
  lineNumbers(),
  foldGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  indentOnInput(),
  syntaxHighlighting(shaderHighlightStyle),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  Prec.high(keymap.of([
    { key: 'Ctrl-Space', run: startCompletion },
    { key: 'Tab', run: acceptCompletion },
    { key: 'Enter', run: acceptCompletion },
    ...completionKeymap,
  ])),
  keymap.of([
    indentWithTab,
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...lintKeymap,
  ]),
]

type ShaderCodeEditorProps = {
  value: string
  onChange: (value: string) => void
  validate?: (source: string) => string | null
}

export const ShaderCodeEditor: FC<ShaderCodeEditorProps> = ({ value, onChange, validate }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const validateRef = useRef(validate)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    validateRef.current = validate
  }, [validate])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          shaderEditorSetup,
          cpp(),
          autocompletion({ override: [completeShader] }),
          linter((editorView) => createShaderDiagnostics(editorView.state.doc.toString(), validateRef.current), { delay: 700 }),
          shaderTheme,
          stopAppKeyboardShortcuts,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue === value) return

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    })
  }, [value])

  return <div className={shaderEditorClass} ref={containerRef} />
}
