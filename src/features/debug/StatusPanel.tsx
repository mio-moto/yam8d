import { css, cx } from '@linaria/core'
// import type { ConnectedBus } from '../connection/connection'
// import { useMacroRunner } from '../macros/macroRunner'
// import { useAutoViewGraph } from '../macros/autoViewGraph'
import { useCellMetrics, useCursor, useCursorRect, useDeviceModel, useFontMode, useMacroStatus, useViewTitle, useViewName } from '../state/viewStore'

const panelClass = css`
  position: absolute;
  top: 100px;
  font-family: monospace;
  display: grid;
  grid-template-columns: auto 1fr auto;
  row-gap: 8px;
  column-gap: 12px;
  color: white;
  font-size: 12px;
  align-items: center;
  text-align: left;

  > .label {
    opacity: 0.7;
  }
  > .value {
    font-weight: 600;
  }
  > .actions {
    width: 500px;
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  button {
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
  }
`

export const StatusPanel = (/*{ bus }: { bus?: ConnectedBus }*/) => {
  const [viewName] = useViewName()
  const [viewTitle] = useViewTitle()
  // const [minimapKey] = useMinimapKey()
  // const [titleFirstFg] = useTitleColor()
  // const [titleFirstBg] = useBackgroundColor()
  const [cursor] = useCursor()
  const [cursorRect] = useCursorRect()
  const [macro] = useMacroStatus()
  const [model] = useDeviceModel()
  const [fontMode] = useFontMode()
  const [metrics] = useCellMetrics()
  // const runner = useMacroRunner(bus)
  // const automaton = useAutoViewGraph(bus)

  return (
    <div className={cx('status-panel', panelClass)}>

      <span className="label">Title</span>
      <span className="value">{viewTitle ?? '—'}</span>
      <span />

      <span className="label">View id</span>
      <span className="value">{viewName ?? '—'}</span>
      <span />

      {/* <span className="label">Title FG</span>
      <span className="value">{titleFirstFg ? `${titleFirstFg.r}, ${titleFirstFg.g}, ${titleFirstFg.b}` : '—'}</span>
      <span />

      <span className="label">Title BG</span>
      <span className="value">{titleFirstBg ? `${titleFirstBg.r}, ${titleFirstBg.g}, ${titleFirstBg.b}` : '—'}</span>
      <span />

      <span className="label">Minimap</span>
      <span className="value">{minimapKey ?? '—'}</span>
      <span /> */}

      <span className="label">Cursor</span>
      <span className="value">{cursor ? `${cursor.x}, ${cursor.y}` : '—'}</span>
      <span />

      <span className="label">CursorRect</span>
      <span className="value">{cursorRect ? `${cursorRect.x}, ${cursorRect.y}, ${cursorRect.w}×${cursorRect.h}` : '—'}</span>
      <span />

      <span className="label">Macro</span>
      <span className="value">{macro.running ? `Running (${macro.currentStep ?? 0}/${macro.sequenceLength ?? 0})` : 'Idle'}</span>
      <span />

      {/* <span className="label">Explore</span>
      <span className="value">
        {automaton.status.running
          ? `Running (${automaton.status.mode === 'cursor' ? 'Cursor' : 'View'}${automaton.status.currentViewTitle ? `: ${automaton.status.currentViewTitle}` : ''}) — visited ${automaton.status.visitedCount}, edges ${automaton.status.edgesCount}, queue ${automaton.status.queueSize}`
          : `Idle (${automaton.status.mode === 'cursor' ? 'Cursor' : 'View'}${automaton.status.currentViewTitle ? `: ${automaton.status.currentViewTitle}` : ''})`}
      </span>
      <span /> */}

      <span className="label">Model</span>
      <span className="value">{model ?? '—'}</span>
      <span />

      <span className="label">FontMode</span>
      <span className="value">{fontMode ?? '—'}</span>
      <span />

      <span className="label">Cells</span>
      <span className="value">{`${metrics.cellW}×${metrics.cellH} (off ${metrics.offX}, ${metrics.offY})`}</span>
      <span />

      {/* <div className="actions">
        <button onClick={() => runner.cancel('user cancel')}>Cancel Macro</button>
        <button onClick={() => automaton.start()}>Start Explore</button>
        <button onClick={() => automaton.startCursor()}>Start Internal Cursor Explore</button>
        <button onClick={() => automaton.stop()}>Stop</button>
        <button onClick={() => automaton.downloadJson()}>Download JSON</button>
        <button onClick={() => automaton.downloadAllCursorJson()}>Download All Cursor Graphs</button>
      </div> */}
    </div>
  )
}
