# Creating an Application with the M8 SDK

This guide explains how to create an application that reads and drives an M8 through the M8 SDK (`@yam8d/m8-sdk` 0.5).

The client runs in one of two modes, with the same API:

- **Host mode**: the app runs in yam8d's External Apps iframe (named `yam8d-external-app`, exported as `YAM8D_FRAME_NAME`). yam8d owns the M8 and the client talks to it over `post-me`.
- **Standalone mode**: the app runs in its own tab. The client runs the same engine yam8d uses inside the page and connects to the M8 itself over Web Serial, WebUSB or Web MIDI. The first connection needs a user gesture.

`createM8Client()` picks the mode by itself (`client.mode`). In an iframe that yam8d did not name, it waits 3 s for a handshake, then goes standalone. Only one page can hold the M8, so disconnect it in yam8d before connecting from a standalone tab.

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

For local development before publishing, build the SDK in yam8d (`bun run build:sdk`), then install it from this repository instead:

```bash
npm install ../yam8d/packages/m8-sdk
```

The link points at the built `dist`, so run `build:sdk` again after SDK changes. Host-side integration is outside this guide (see [README.md](./README.md)).

## 3. Connect

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
    return <main>Could not start the M8 SDK.</main>
  }

  // Standalone: the browser's device picker only opens from a click
  if (client?.mode === 'standalone' && !client.isConnected) {
    return (
      <main>
        <button type="button" onClick={() => void client.connectDevice()}>
          Connect M8
        </button>
      </main>
    )
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

`onConnectionChange((connected) => ...)` tells when calls start or stop reaching an M8. That happens when the handshake completes, or in standalone mode when the device is connected, lost or released. Use it to re-render the hook above when the user connects a device.

## 5. Read the Screen and What the Cursor Is On

The client reads the screen without moving the cursor:

```ts
const screen = await client.getScreen()      // 24 text rows of 40 columns (column 0 is a margin)
const cells = await client.getScreenCells()  // the same, plus each cell's fg/bg colour
const snap = await client.captureSnapshot()  // state + semantic context + description + screen
```

It also explains the cell under the cursor:

```ts
client.describeContext()        // e.g. "Note (N): Note C-4 — Phrase View row 00"
client.describeContextParts()   // the same as tagged parts, to style yourself
client.getSemanticContext()     // the typed field, its row and its surroundings, as data
```

The pure parsers (`getSemanticContext`, `parseGridScreen`, `readPlayPositions`, `parseThemeScreen`, ...) are exported too, for screens you stored. See the [package README](../../packages/m8-sdk/README.md).

## 6. Follow Playback with MIDI Clock

With SYNC OUT set in the M8's MIDI Settings (stored per song), the client can receive its clock and transport:

```ts
const { ok, error } = await client.enableMidiTransport()
const off = client.onTransport((e) => {
  // e.kind: 'start' | 'stop' | 'continue' | 'clock' (once per sixteenth) | 'position' (e.spp)
})
```

The page that owns the device asks for Web MIDI permission: yam8d in host mode, your app in standalone mode. In standalone mode, enable it again after each new device connection.

## 7. Send Commands

The client can navigate, press keys, or edit values (through yam8d in host mode, directly in standalone mode).

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

## 8. Optional URL Fallback

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

## 9. Run and Test

Start your app:

```bash
npm run dev
```

In yam8d, add its URL under External Apps. The app should move from `connecting` to `connected` once the iframe handshake finishes. Opened in its own tab, it starts in standalone mode and shows the Connect M8 button. Disconnect the M8 in yam8d first.

When testing locally, check these points:

- The External App URL matches the URL where your app is running.
- `post-me` is installed in the app.
- The iframe `src` is not repeatedly changed after the SDK connects.
- Standalone: the browser is Chromium-based (`getDeviceSupport()` tells which device APIs exist), and no other page holds the M8.
- If URL fallback is enabled, the app can parse `#/<view-name>/?mode=min&key=<key-name>`.

## Production Checklist

- Build and deploy the app.
- Use HTTPS for both the host and the app when deployed. Web Serial, WebUSB and Web MIDI also need a secure context.
- Disable debug logging unless you are troubleshooting.
- Clean up SDK subscriptions and call `disconnect()` on unmount.
- Handle both modes: a Connect M8 button for standalone mode, and a message when no device is available.
