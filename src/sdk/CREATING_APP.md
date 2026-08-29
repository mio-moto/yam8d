# Creating an Application with the M8 SDK

This guide explains how to create an iframe application that connects to an M8 host through the M8 SDK.

The SDK connection has two sides:

- The host application owns the iframe and exposes the M8 API.
- Your application uses `createM8Client` or `createM8ClientSync` from inside the iframe.

The client application must run inside the host iframe. If you open it directly in a browser tab, the SDK handshake cannot connect because `window.parent` is not the host.

## 1. Create the Client App

Create a regular web app. A React + Vite TypeScript app is a good default:

```bash
npm create vite@latest my-m8-app -- --template react-ts
cd my-m8-app
npm install
```

## 2. Install the SDK Client Package

Install the client package:

```bash
npm install @yam8d/m8-sdk
```

For local development before publishing, install it from this repository instead:

```bash
npm install ../yam8d/packages/m8-sdk
```

The package is client-only. Host-side integration is intentionally outside this guide.

## 3. Connect to the Host

Connect once when your app starts, then keep the client instance for state reads, event subscriptions, and commands.

```tsx
import { useEffect, useMemo, useState } from 'react'
import { createM8Client, type M8Client, type M8State } from '@yam8d/m8-sdk'

type ConnectionState = 'connecting' | 'connected' | 'failed'

export function useM8() {
  const [client, setClient] = useState<M8Client | null>(null)
  const [state, setState] = useState<M8State | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')

  useEffect(() => {
    let mounted = true
    let localClient: M8Client | null = null

    async function connect() {
      try {
        localClient = await createM8Client({ debug: false })
        if (!mounted) return

        setClient(localClient)
        setState(localClient.getState())
        setConnectionState('connected')

        const unsubscribe = localClient.onStateChange((nextState) => {
          setState(nextState)
        })

        return unsubscribe
      } catch {
        if (mounted) {
          setConnectionState('failed')
        }
      }
    }

    let unsubscribe: (() => void) | undefined
    void connect().then((cleanup) => {
      unsubscribe = cleanup
    })

    return () => {
      mounted = false
      unsubscribe?.()
      localClient?.disconnect()
    }
  }, [])

  return useMemo(
    () => ({ client, state, connectionState }),
    [client, state, connectionState],
  )
}
```

Use the hook from your UI:

```tsx
import { useM8 } from './useM8'

export function App() {
  const { client, state, connectionState } = useM8()

  if (connectionState === 'connecting') {
    return <main>Connecting to the host...</main>
  }

  if (connectionState === 'failed') {
    return <main>Open this app inside the host iframe to enable SDK features.</main>
  }

  return (
    <main>
      <p>Current view: {state?.viewName ?? 'unknown'}</p>
      <p>Cursor: {state?.cursorPos ? `${state.cursorPos.x}, ${state.cursorPos.y}` : 'unknown'}</p>

      <button type="button" onClick={() => client?.sendKeyPress(['play'])}>
        Play
      </button>
    </main>
  )
}
```

## 4. Subscribe to Specific Events

Use focused subscriptions when your UI only needs part of the state.

```ts
const offView = client.onViewChange((viewName, viewTitle) => {
  console.log('View changed:', viewName, viewTitle)
})

const offCursor = client.onCursorMove((pos, rect) => {
  console.log('Cursor moved:', pos, rect)
})

const offText = client.onTextUpdate((textUnderCursor, currentLine) => {
  console.log('Text:', textUnderCursor, currentLine)
})

const offKey = client.onKeyPress((keys) => {
  console.log('M8 key mask:', keys)
})

offView()
offCursor()
offText()
offKey()
```

Always call the returned unsubscribe functions when the component unmounts.

## 5. Send Commands to the Host

The client can ask the host to navigate, press keys, or edit values.

```ts
await client.navigateToView('phrase')
await client.navigateTo(10, 15)

await client.sendKeyPress(['opt', 'right'])
await client.sendKeyDown(['edit'])
await client.sendKeyUp()

await client.setValueToHex(0x3f)
await client.setValueToInt(63)
await client.setValueFloat(440.0)
await client.setNote('C#4')
await client.setValueToString('sine')
await client.browseFile('bassline')
```

Prefer high-level methods such as `setValueToHex`, `setNote`, and `browseFile` when they match the workflow. Use raw key presses for custom interactions.

## 6. Optional URL Fallback

Some hosts can provide a URL fallback for apps that do not connect with the SDK. This is useful for simple iframe apps that only need the current M8 view and the last highlighted modifier key.

When enabled by the host, the iframe URL may be rewritten while the SDK is not connected:

```text
<app-url>#/<view-name>/?mode=min&key=<key-name>
```

Example:

```text
https://example.com/m8-shortcuts/#/phrase/?mode=min&key=opt
```

The `key` value is usually empty or one of:

```text
opt
shift
edit
play
```

Once the SDK client connects, the host should stop updating the iframe URL so the app is not reloaded during an active SDK session.

Client apps can support both modes:

```ts
const [, viewName = ''] = window.location.hash.match(/^#\/([^/?]*)/) ?? []
const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
const mode = params.get('mode')
const key = params.get('key')
```

Treat this fallback as a compatibility layer, not as a replacement for the SDK. The SDK provides richer state, events, and commands without iframe reloads.

## 7. Run and Test

Start your iframe app:

```bash
npm run dev
```

Then open the app through the host iframe. The app should move from `connecting` to `connected` once the iframe handshake finishes.

When testing locally, check these points:

- The host iframe `src` matches the URL where your app is running.
- `post-me` is installed in the iframe app.
- The SDK code is loaded by the iframe app, not by a standalone browser tab.
- The iframe `src` is not repeatedly changed after the SDK connects.
- If URL fallback is enabled, the app can parse `#/<view-name>/?mode=min&key=<key-name>`.

## Production Checklist

- Build and deploy the iframe app.
- Use HTTPS for both the host and the iframe app when deployed.
- Disable debug logging unless you are troubleshooting.
- Clean up SDK subscriptions and call `disconnect()` on unmount.
- Provide a fallback UI for standalone mode or connection failure.
