import type { FC } from 'react'
import { css } from '@linaria/core'
import { useM8SdkHost } from '../sdk'
import type { ConnectedBus } from '../features/connection/connection'

const containerClass = css`
  height: 93vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;

  > .header {
    padding: 10px;
    background: #16213e;
    border-radius: 8px;
    
    h2 {
      margin: 0;
      font-size: 16px;
      color: #e94560;
    }
    
    .status {
      font-size: 12px;
      color: #888;
      margin-top: 5px;
    }
  }

  > iframe {
    flex: 1;
    width: 100%;
    border: 2px solid #16213e;
    border-radius: 8px;
    background: #1a1a2e;
  }
`

export const SdkTest: FC<{ bus?: ConnectedBus }> = ({ bus }) => {
  const { iframeRef, isReady } = useM8SdkHost(bus, { debug: true })

  return (
    <div className={containerClass}>
      <div className="header">
        <h2>🧪 SDK Test Panel</h2>
        <div className="status">
          Status: {isReady ? '✅ Client Connected' : '⏳ Waiting for client...'}
        </div>
      </div>
      <iframe
        ref={iframeRef}
        src="/sdk-test.html"
        title="M8 SDK Test"
      />
    </div>
  )
}
