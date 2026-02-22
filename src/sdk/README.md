# M8 SDK

SDK for creating iframe applications that interact with yam8d (YAM8D - Yet Another M8 Display).

## Overview

The M8 SDK enables bidirectional communication between the yam8d host application and iframe-based applications using `post-me` library for postMessage communication.

## Architecture

```
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

// Navigate to coordinates
await m8.navigateTo(10, 15);

// Set a value using edit+navigation keys
await m8.setValueToHex(0x3f);

// Subscribe to state changes
const unsubscribe = m8.onStateChange((state) => {
  console.log("New view:", state.viewName);
});

// Clean up
unsubscribe();
m8.disconnect();
```

## API Reference

### Host Methods (exposed to iframe)

| Method                             | Description                     | Returns            |
| ---------------------------------- | ------------------------------- | ------------------ |
| `navigateToView(viewName: string)` | Navigate to a view by name      | `Promise<boolean>` |
| `navigateTo(x: number, y: number)` | Navigate to grid coordinates    | `Promise<void>`    |
| `setValueToHex(hex: number)`       | Set value using edit+navigation | `Promise<boolean>` |
| `getState()`                       | Get full M8 state               | `Promise<M8State>` |
| `sendKeys(keys: number)`           | Send key combination            | `void`             |

### Client State (reactive)

| Property          | Type                               | Description                    |
| ----------------- | ---------------------------------- | ------------------------------ |
| `viewName`        | `string \| null`                   | Current view name (normalized) |
| `viewTitle`       | `string \| null`                   | Raw view title                 |
| `cursorPos`       | `{ x: number, y: number } \| null` | Cursor grid position           |
| `cursorRect`      | `{ x, y, w, h } \| null`           | Cursor rectangle (pixels)      |
| `textUnderCursor` | `string \| null`                   | Highlighted text under cursor  |
| `currentLine`     | `string \| null`                   | Full line at cursor            |
| `highlightColor`  | `RGB \| null`                      | Current highlight color        |
| `macroRunning`    | `boolean`                          | Whether a macro is executing   |

### Events (Host → Client)

| Event          | Payload                            | Description                |
| -------------- | ---------------------------------- | -------------------------- |
| `stateChanged` | `M8State`                          | Full state update          |
| `viewChanged`  | `{ viewName, viewTitle }`          | View changed               |
| `cursorMoved`  | `{ pos, rect }`                    | Cursor moved               |
| `textUpdated`  | `{ textUnderCursor, currentLine }` | Text changed               |
| `keyPressed`   | `{ keys }`                         | Key(s) pressed or released |

## setValueToHex Implementation

The `setValueToHex` method uses edit+navigation keys to change values:

- **edit+up/down**: Increments/decrements by 16 (0x10 in hex)
- **edit+left/right**: Increments/decrements by 1

Algorithm:

1. Read current value from text under cursor
2. Enter edit mode (send Edit key)
3. Calculate difference between current and target
4. Use optimal combination of large steps (±16) and fine adjustments (±1)
5. Exit edit mode

Example: Setting value from `0x05` to `0x3F`

- Difference: +58 (0x3A)
- Use 3× edit+down (+48) = `0x35`
- Use 10× edit+right (+10) = `0x3F`

## TypeScript Support

All types are exported:

```typescript
import type {
  M8State,
  M8Client,
  CursorPos,
  CursorRect,
  RGB,
  SystemInfos,
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
