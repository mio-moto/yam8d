# M8 SDK

SDK for creating iframe applications that interact with yam8d (YAM8D - Yet Another M8 Display).

## Overview

The M8 SDK enables bidirectional communication between the yam8d host application and iframe-based applications using `post-me` library for postMessage communication.

## Architecture

```text
┌─────────────────┐         post-me           ┌─────────────────┐
│   yam8d Host    │  ═══════════════════════► │  iframe Client  │
│                 │   WindowMessenger         │                 │
│  useM8SdkHost   │ ◄═══════════════════════  │  M8Client       │
│                 │   Methods + Events        │                 │
└─────────────────┘                           └─────────────────┘
```

## Host-Side Usage (yam8d application)

```tsx
import { useM8SdkHost } from "./sdk";

function MyComponent({ bus }) {
  // The hook returns a ref to attach to the iframe
  const { iframeRef, isReady } = useM8SdkHost(bus, {
    debug: false, // Enable for verbose logging
  });

  return <iframe ref={iframeRef} src="https://your-iframe-app.com" />;
}
```

## Client-Side Usage (iframe application)

```typescript
import { createM8Client } from "m8-sdk";

// Create and connect the client
const m8 = await createM8Client({ debug: false });

// Access current state
console.log(m8.state.viewName);
console.log(m8.state.cursorPos);
console.log(m8.state.selectionMode);

// Navigate to coordinates
await m8.navigateTo(10, 15);

// Set a value using edit+navigation keys
await m8.setValueToHex(0x3f);
await m8.setValueToInt(63);
await m8.setNote("c#4");
await m8.setValueToString("sine", false);
await m8.setValueToString("cutoff", false, true); // search in full current line

// Press and release (automatic)
await m8.sendKeyPress(["opt", "right"]);

// Hold keys manually, then release
await m8.sendKeyDown(["edit"]);
// ... do something while key is held ...
await m8.sendKeyUp();

// Fetch a fresh snapshot of the state from the host
const freshState = await m8.fetchState();

// Subscribe to state changes
const unsubscribe = m8.onStateChange((state) => {
  console.log("New view:", state.viewName);
});

// Subscribe to specific events
const unsubView = m8.onViewChange((viewName, viewTitle) => { ... });
const unsubCursor = m8.onCursorMove((pos, rect) => { ... });
const unsubText = m8.onTextUpdate((textUnderCursor, currentLine) => { ... });
const unsubKey = m8.onKeyPress((keys) => { ... });

// Clean up
unsubscribe();
m8.disconnect();
```

### Synchronous factory (React / no top-level await)

```typescript
import { createM8ClientSync } from "m8-sdk";

const { client, connect } = createM8ClientSync({ debug: false });
// client is available immediately; connection is established on demand
await connect();
```

## API Reference

### Host Methods (exposed to iframe)

| Method                                                                              | Description                                        | Returns            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| `navigateToView(viewName: string)`                                                  | Navigate to a view by name                         | `Promise<boolean>` |
| `navigateTo(x: number, y: number)`                                                  | Navigate to text grid coordinates (0-39 x, 0-23 y) | `Promise<void>`    |
| `setValueToHex(targetHex: number)`                                                  | Set hex value (0-255) using edit+navigation keys   | `Promise<boolean>` |
| `setValueToInt(targetInt: number)`                                                  | Set decimal integer value using edit+navigation    | `Promise<boolean>` |
| `setNote(noteString: string)`                                                       | Set note value (e.g. `C#4`)                        | `Promise<boolean>` |
| `setValueToString(targetString, exact?, searchInCurrentLine?)`                      | Select a string value from a list                  | `Promise<boolean>` |
| `sendKeyPress(keys: M8KeyName[])`                                                   | Press and release a combination of keys            | `Promise<void>`    |
| `sendKeyDown(keys: M8KeyName[])`                                                    | Hold keys down (no automatic release)              | `Promise<void>`    |
| `sendKeyUp()`                                                                       | Release all keys                                   | `Promise<void>`    |
| `getState()`                                                                        | Get full M8 state snapshot                         | `Promise<M8State>` |

#### `M8KeyName`

Available key names for `sendKeyPress`:

```typescript
type M8KeyName = 'left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit'
```

### Client Methods

| Method                                                                           | Description                                        | Returns            |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| `navigateToView(viewName: string)`                                               | Navigate to a view by name                         | `Promise<boolean>` |
| `navigateTo(x: number, y: number)`                                               | Navigate to text grid coordinates                  | `Promise<void>`    |
| `setValueToHex(targetHex: number)`                                               | Set hex value (0-255)                              | `Promise<boolean>` |
| `setValueToInt(targetInt: number)`                                               | Set decimal integer value                          | `Promise<boolean>` |
| `setNote(noteString: string)`                                                    | Set note value                                     | `Promise<boolean>` |
| `setValueToString(targetString, exact?, searchInCurrentLine?)`                   | Select a string value from a list                  | `Promise<boolean>` |
| `sendKeyPress(keys: M8KeyName[])`                                                | Press and release a combination of keys            | `Promise<void>`    |
| `sendKeyDown(keys: M8KeyName[])`                                                 | Hold keys down (no automatic release)              | `Promise<void>`    |
| `sendKeyUp()`                                                                    | Release all keys                                   | `Promise<void>`    |
| `getState()`                                                                     | Return cached state synchronously                  | `M8State`          |
| `fetchState()`                                                                   | Fetch a fresh state snapshot from the host (async) | `Promise<M8State>` |
| `onStateChange(cb)`                                                              | Subscribe to full state updates                    | `() => void`       |
| `onViewChange(cb)`                                                               | Subscribe to view changes                          | `() => void`       |
| `onCursorMove(cb)`                                                               | Subscribe to cursor movements                      | `() => void`       |
| `onTextUpdate(cb)`                                                               | Subscribe to text changes under cursor             | `() => void`       |
| `onKeyPress(cb)`                                                                 | Subscribe to key events from M8                    | `() => void`       |
| `disconnect()`                                                                   | Disconnect from the host                           | `void`             |

### Client State (`M8State`)

| Property               | Type                               | Description                          |
| ---------------------- | ---------------------------------- | ------------------------------------ |
| `viewName`             | `string \| null`                   | Current view name (normalized)       |
| `viewTitle`            | `string \| null`                   | Raw view title                       |
| `minimapKey`           | `string \| null`                   | Minimap key for the current view     |
| `cursorPos`            | `{ x: number, y: number } \| null` | Cursor text grid position            |
| `cursorRect`           | `{ x, y, w, h } \| null`           | Cursor rectangle (pixels)            |
| `selectionMode`        | `boolean`                          | Whether the cursor is in select mode |
| `textUnderCursor`      | `string \| null`                   | Highlighted text under cursor        |
| `currentLine`          | `string \| null`                   | Full line at cursor                  |
| `highlightColor`       | `RGB \| null`                      | Current highlight color              |
| `titleColor`           | `RGB \| null`                      | Title bar color                      |
| `backgroundColor`      | `RGB \| null`                      | Background color                     |
| `deviceModel`          | `string \| null`                   | M8 device model identifier           |
| `fontMode`             | `number \| null`                   | Current font mode                    |
| `systemInfo`           | `SystemInfos \| null`              | M8 system information                |
| `macroRunning`         | `boolean`                          | Whether a macro is executing         |
| `macroCurrentStep`     | `number \| undefined`              | Current step index of running macro  |
| `macroSequenceLength`  | `number \| undefined`              | Total steps in the running macro     |

### Events (Host → Client)

| Event          | Payload                                              | Description                |
| -------------- | ---------------------------------------------------- | -------------------------- |
| `stateChanged` | `M8State`                                            | Full state update          |
| `viewChanged`  | `{ viewName, viewTitle }`                            | View changed               |
| `cursorMoved`  | `{ pos, rect, selectionMode }`                       | Cursor moved               |
| `textUpdated`  | `{ textUnderCursor, currentLine }`                   | Text changed               |
| `keyPressed`   | `{ keys: number }`                                   | Key(s) pressed or released |

### Events (Client → Host)

| Event   | Payload               | Description                 |
| ------- | --------------------- | --------------------------- |
| `ready` | `undefined`           | Client connected and ready  |
| `error` | `{ message: string }` | Client-side error           |

## setValueToHex Implementation

The `setValueToHex` method uses edit+navigation keys to change values:

- **edit+up/down**: Increments/decrements by 16 (0x10 in hex)
- **edit+left/right**: Increments/decrements by 1

Algorithm:

1. Read current value from text under cursor
2. If current value is `--`, press Edit once to reveal the stored value
3. Enter edit mode (send Edit key)
4. Pre-calculate the optimal key sequence to reach the target
5. Send all key presses in rapid succession
6. If pre-calculation misses (e.g. due to clamping), fall back to iterative mode
7. Exit edit mode

Example: Setting value from `0x05` to `0x3F`

- Difference: +58 (0x3A)
- Use 3× edit+up (+48) = `0x35`
- Use 10× edit+right (+10) = `0x3F`

## setNote Implementation

The `setNote` method navigates the note field using semitone arithmetic:

- **edit+up/down**: Jump ±12 semitones (one octave)
- **edit+left/right**: Step ±1 semitone

Note format: `C-4`, `C#4`, `D#A` (octave is a hex digit, 0-F).

If the exact note is unreachable (e.g. scale quantization), the method stops at the closest available note.

## TypeScript Support

All types are exported:

```typescript
import type {
  M8State,
  M8Client,
  M8KeyName,
  CursorPos,
  CursorRect,
  RGB,
  SystemInfos,
  M8HostMethods,
  M8ClientMethods,
  M8HostEvents,
  M8ClientEvents,
  M8SdkConfig,
  NavigationTarget,
} from "./sdk";
```

## Security Considerations

- The SDK currently uses `remoteOrigin: '*'` for the iframe
- For production, specify allowed origins in the config:

  ```typescript
  useM8SdkHost(bus, {
    allowedOrigins: ["https://trusted-domain.com"],
  });
  ```

## Debug Mode

Enable debug mode to see all postMessage traffic:

```typescript
useM8SdkHost(bus, { debug: true });
// or
await createM8Client({ debug: true });
```
