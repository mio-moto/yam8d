# @yam8d/m8-sdk

Client SDK for iframe applications that communicate with an M8 tracker host via [yam8d](https://github.com/mio-moto/yam8d).

> **License:** MIT — © kronsilds

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Factory functions](#factory-functions)
- [M8Client](#m8client)
  - [Properties](#properties)
  - [Navigation](#navigation)
  - [Value setters](#value-setters)
  - [Key input](#key-input)
  - [State](#state)
  - [Event subscriptions](#event-subscriptions)
  - [Semantic context](#semantic-context-on-the-client)
  - [Lifecycle](#lifecycle)
- [Standalone semantic context functions](#standalone-semantic-context-functions)
- [Types reference](#types-reference)
  - [M8State](#m8state)
  - [CursorPos / CursorRect / RGB / SystemInfos](#cursorpos--cursorrect--rgb--systeminfos)
  - [M8SemanticContext](#m8semanticcontext)
  - [M8ParsedRow](#m8parsedrow)
  - [M8ActiveField / M8ParsedField](#m8activefield--m8parsedfield)
  - [M8FieldType](#m8fieldtype)
  - [M8KeyName](#m8keyname)
  - [M8SdkConfig](#m8sdkconfig)
- [Host events](#host-events)
- [Supported views](#supported-views)
- [Notes](#notes)

---

## Install

```bash
npm install @yam8d/m8-sdk
```

For local development before publishing:

```bash
npm install ../yam8d/packages/m8-sdk
```

> The app **must run inside the yam8d host iframe**. Opening it directly in a standalone browser tab will fail the SDK handshake.

---

## Quick start

```ts
import { createM8Client } from '@yam8d/m8-sdk'

const m8 = await createM8Client()

console.log(m8.state.viewName) // e.g. 'song'

await m8.sendKeyPress(['right'])

const off = m8.onStateChange((state) => {
  console.log(state.cursorPos)
})

off()         // unsubscribe
m8.disconnect()
```

---

## Factory functions

### `createM8Client(config?): Promise<M8Client>`

Creates and connects an `M8Client` in one step using top-level `await`.

```ts
const m8 = await createM8Client({ debug: true })
```

### `createM8ClientSync(config?): { client: M8Client; connect: () => Promise<void> }`

Returns a client instance and a deferred `connect()` call. Useful in React or other frameworks where top-level `await` is inconvenient.

```ts
import { createM8ClientSync } from '@yam8d/m8-sdk'

const { client: m8, connect } = createM8ClientSync()

useEffect(() => {
  connect().then(() => console.log('connected'))
  return () => m8.disconnect()
}, [])
```

---

## M8Client

### Properties

| Property | Type | Description |
|---|---|---|
| `state` | `M8State` | Last known full device state (updated on every host event). |
| `isConnected` | `boolean` | Whether the SDK handshake has completed. |

---

### Navigation

#### `navigateToView(viewName: string): Promise<boolean>`

Asks the host to navigate to a named view (e.g. `'song'`, `'phrase'`). Returns `true` on success.

```ts
await m8.navigateToView('phrase')
```

#### `navigateTo(x: number, y: number): Promise<void>`

Moves the cursor to the given character-grid position.

```ts
await m8.navigateTo(3, 5)
```

---

### Value setters

All setters act on the field currently under the cursor.

#### `setValueToHex(targetHex: number): Promise<boolean>`

Sets the current field to the given hex integer (e.g. `0x0A`). Returns `true` if the value was successfully applied.

#### `setValueToInt(targetInt: number): Promise<boolean>`

Sets the current field to the given decimal integer. Returns `true` on success.

#### `setValueFloat(targetFloat: number): Promise<boolean>`

Sets a float parameter parsed from the whole line, e.g. `TUNE 440.00 G` or `GAIN 05.25 -19.75 -15.00`
(multiple floats per line are supported; the cursor's highlight selects which one is edited).
Works with the cursor on a single digit group (`440` / `00`) or spanning the whole float (`19.75`,
with the sign usually excluded from the highlight). With whole-float focus, edit+up/down moves the
integer part and edit+left/right the decimal part; with group focus the SDK relocates the cursor
between the groups for the fastest path. Negative values are supported and step sizes are measured
per field from the device.
Returns `true` when the displayed value matches.

#### `setNote(noteString: string): Promise<boolean>`

Sets a note field using M8 note format, e.g. `'C-4'`, `'A#3'`, `'OFF'`. Returns `true` on success.

#### `setValueToString(targetString: string, exact?: boolean, searchInCurrentLine?: boolean): Promise<boolean>`

Sets the current field by navigating to match `targetString`.

- `exact` (default `true`): require an exact string match.
- `searchInCurrentLine` (default `false`): restrict the search to the current row.

Returns `true` if the target was reached.

#### `browseFile(targetText: string, exact?: boolean): Promise<boolean>`

Navigates a file-browse dialog to an entry matching `targetText`. Returns `true` on success.

---

### Key input

#### `sendKeyPress(keys: M8KeyName[]): Promise<void>`

Sends a simultaneous key press + release for the given keys.

```ts
await m8.sendKeyPress(['shift', 'play'])
```

#### `sendKeyDown(keys: M8KeyName[]): Promise<void>`

Holds the given keys down without releasing. Pair with `sendKeyUp()`.

```ts
await m8.sendKeyDown(['shift'])
await m8.sendKeyPress(['right'])
await m8.sendKeyUp()
```

#### `sendKeyUp(): Promise<void>`

Releases all currently held keys.

---

### State

#### `getState(): M8State`

Returns the in-memory cached state synchronously. Same as reading `m8.state`.

#### `fetchState(): Promise<M8State>`

Requests a fresh state snapshot from the host and updates the internal cache.

```ts
const state = await m8.fetchState()
```

---

### Event subscriptions

Every `on*` method returns an **unsubscribe function** — call it to stop listening.

#### `onStateChange(callback: (state: M8State) => void): () => void`

Fires whenever any part of the device state changes.

```ts
const off = m8.onStateChange((state) => {
  console.log(state.viewName, state.cursorPos)
})
off() // unsubscribe
```

#### `onViewChange(callback: (viewName: string | null, viewTitle: string | null) => void): () => void`

Fires when the active view changes.

```ts
m8.onViewChange((name, title) => {
  console.log(`Switched to ${name}: ${title}`)
})
```

#### `onCursorMove(callback: (pos: CursorPos | null, rect: CursorRect | null, selectionMode: boolean) => void): () => void`

Fires when the cursor position or selection mode changes.

```ts
m8.onCursorMove((pos, rect, sel) => {
  console.log(`Cursor at (${pos?.x}, ${pos?.y}), selecting: ${sel}`)
})
```

#### `onTextUpdate(callback: (textUnderCursor: string | null, currentLine: string | null) => void): () => void`

Fires when the text under the cursor or the full current line changes.

```ts
m8.onTextUpdate((text, line) => {
  console.log('Under cursor:', text)
  console.log('Full line:', line)
})
```

#### `onKeyPress(callback: (keys: number) => void): () => void`

Fires when a physical key event occurs on the device. `keys` is a bitmask of active keys.

---

### Semantic context on the client

#### `getSemanticContext(): M8SemanticContext | null`

Parses `m8.state` into structured field data. Returns `null` when no view is active.

```ts
const ctx = m8.getSemanticContext()

if (ctx?.activeField?.type === 'chainRef') {
  const track = ctx.activeField.meta?.trackIndex  // 1–8
  const chain = ctx.activeField.hexValue           // 0–255 or null if empty
  const row   = ctx.row?.rowIndex
}
```

#### `describeContext(): string | null`

Returns a human-readable one-liner, e.g.:

- `"Track 3 — Chain 0A — Song View row 02"`
- `"Note A#4 — Step 7 (Phrase View)"`
- `"FX1 Command: KIL (Kill Note) — Step 0 — Phrase View row 03"`

Returns `null` when not connected or no view is active.

---

### Lifecycle

#### `disconnect(): void`

Closes the host connection and clears all event listeners and internal state.

---

## Standalone semantic context functions

These are re-exported from `@yam8d/m8-sdk` for use without an `M8Client` instance.

### `getSemanticContext(state: M8State): M8SemanticContext | null`

Parses an `M8State` snapshot into a semantic context. Returns `null` if `state.viewName` is not set.

```ts
import { getSemanticContext } from '@yam8d/m8-sdk'

const ctx = getSemanticContext(state)
if (ctx?.isGridView && ctx.row) {
  const note = ctx.row.fields['note']
  console.log(note?.rawValue) // e.g. 'C-4'
}
```

### `describeContext(ctx: M8SemanticContext): string`

Returns a human-readable summary of the context (see examples above).

### `formatFieldValue(field: M8ParsedField): string`

Formats a single parsed field as a display string:

| Type | Example output |
|---|---|
| `note` | `"Note C-4"`, `"Note Off"` |
| `transpose` | `"+3 st"`, `"-12 st"`, `"±0 st"` |
| `velocity` | `"57h (87 / 127 max)"` |
| `fxValue` | `"1Ah (dec 26)"` |
| `ticks` | `"06h (6 ticks)"`, `"00 (skip step)"` |
| `chainRef` / `phraseRef` / `fxCommand` / `volume` | raw value, e.g. `"0A"`, `"KIL"` |
| empty cell | `"(empty)"` |

### `lookupFxCommand(cmd: string): { description: string } | undefined`

Looks up a 3-character FX command name (case-insensitive) across all categories (sequencer, instrument, mixer).

```ts
import { lookupFxCommand } from '@yam8d/m8-sdk'

const info = lookupFxCommand('KIL')
// → { description: 'Kill: stops the playing instrument after XX ticks.' }
```

---

## Types reference

### `M8State`

The complete snapshot of the device at a point in time.

```ts
interface M8State {
  viewName: string | null          // active view key, e.g. 'song', 'phrase'
  viewTitle: string | null         // raw title string from screen, e.g. ' SONG   '
  minimapKey: string | null        // current minimap position key
  cursorPos: CursorPos | null      // character-grid position of the cursor
  cursorRect: CursorRect | null    // pixel rectangle of the cursor overlay
  selectionMode: boolean           // true when a selection is active
  highlightColor: RGB | null       // cursor highlight colour
  titleColor: RGB | null           // view title text colour
  backgroundColor: RGB | null      // screen background colour
  textUnderCursor: string | null   // characters covered by the cursor rect
  currentLine: string | null       // full text of the row at cursorPos.y
  deviceModel: string | null       // e.g. 'Headless', 'Model:02'
  fontMode: number | null          // 0=standard, 1=bold, 2=large
  systemInfo: SystemInfos | null   // device-reported system properties
  macroRunning: boolean            // true while a macro is executing
  macroCurrentStep?: number        // current macro step index
  macroSequenceLength?: number     // total steps in the running macro
}
```

### `CursorPos / CursorRect / RGB / SystemInfos`

```ts
interface CursorPos  { x: number; y: number }
interface CursorRect { x: number; y: number; w: number; h: number }
interface RGB        { r: number; g: number; b: number }
interface SystemInfos { [key: string]: string | number | boolean | undefined }
```

### `M8SemanticContext`

```ts
interface M8SemanticContext {
  viewName: string               // e.g. 'song', 'phrase', 'instrumentpool'
  viewTitle: string | null       // e.g. 'Song View'
  viewDescription: string | null // long description from schema
  viewId: string | null          // item ID parsed from screen title, e.g. 'F2', '03'; null for song/instrumentpool
  isUnsaved: boolean             // true when the title carries a '*' suffix (unsaved changes)
  isGridView: boolean            // true for song/chain/phrase/table/groove/instrumentpool
  row: M8ParsedRow | null        // all columns on the line at cursorPos.y
  activeField: M8ActiveField | null  // the column currently under the cursor
}
```

### `M8ParsedRow`

```ts
interface M8ParsedRow {
  rowIndex: number | null                   // hex row index from leftmost chars; null if unparseable
  rowKey: string                            // schema key, e.g. 'songRow', 'step', 'chainPos'
  fields: Record<string, M8ParsedField>     // column key → parsed field
}
```

### `M8ActiveField / M8ParsedField`

`M8ActiveField` extends `M8ParsedField` with two extra convenience fields.

```ts
interface M8ParsedField {
  key: string                        // schema key, e.g. 'fx1cmd', 'track3', 'note'
  label: string                      // human label, e.g. 'FX1 Command', 'Track 3'
  type: M8FieldType
  rawValue: string                   // trimmed text sliced from currentLine
  hexValue: number | null            // parsed integer; null for empty cells and text types
  isEmpty: boolean                   // true when '--', '---', '---00', etc.
  meta?: Record<string, unknown>     // view-specific extras (e.g. { trackIndex: 3 })
}

interface M8ActiveField extends M8ParsedField {
  viewName: string         // repeated for convenience
  rowIndex: number | null  // row index of the line containing this field
}
```

### `M8FieldType`

```ts
type M8FieldType =
  | 'chainRef'       // chain number hex 00–FF; '--' = empty
  | 'phraseRef'      // phrase number hex 00–FF; '--' = empty
  | 'note'           // note name e.g. 'C-4', 'A#3'; '---' = empty; 'OFF' = note-off
  | 'velocity'       // velocity 00–7F hex; '--' = inherit
  | 'instrumentRef'  // instrument slot 00–7F hex; '--' = keep current
  | 'fxCommand'      // 3-char command name e.g. 'KIL'; '---' = none
  | 'fxValue'        // FX parameter 00–FF hex
  | 'transpose'      // relative semitones: 00=none, 01–7F=+1–+127, FF–80=−1–−128
  | 'ticks'          // groove ticks per step hex; '00'=skip; '--'=end of groove
  | 'volume'         // level 00–FF hex; '--' = no override
  | 'ppq'            // pulses-per-quarter-note decimal; groove row 0 only
  | 'instrumentName' // instrument name text ≤12 chars; no hexValue
  | 'eqSlot'         // EQ slot assignment hex; '--' = none
  | 'rowIndex'       // row/step index hex
```

### `M8KeyName`

```ts
type M8KeyName = 'left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit'
```

### `M8SdkConfig`

```ts
interface M8SdkConfig {
  debug?: boolean  // enables verbose postMessage logging via DebugMessenger
}
```

---

## Host events

These events are emitted by the host and consumed internally by `M8Client`. They are listed here for reference if you use the `post-me` connection directly.

| Event | Payload | Fired when |
|---|---|---|
| `stateChanged` | `M8State` | Any state field changes |
| `viewChanged` | `{ viewName, viewTitle }` | The active view changes |
| `cursorMoved` | `{ pos, rect, selectionMode }` | Cursor position or selection mode changes |
| `textUpdated` | `{ textUnderCursor, currentLine }` | Text under cursor or current line changes |
| `keyPressed` | `{ keys: number }` | A physical key event fires on the device |

---

## Supported views

The semantic context parser supports these `viewName` values:

| `viewName` | Columns |
|---|---|
| `song` | `track1`–`track8` (chainRef, meta: trackIndex 1–8) |
| `chain` | `phrase` (phraseRef), `transpose` |
| `phrase` | `note`, `vel`, `inst`, `fx1cmd`, `fx1val`, `fx2cmd`, `fx2val`, `fx3cmd`, `fx3val` |
| `table` | `transpose`, `volume`, `fx1cmd`, `fx1val`, `fx2cmd`, `fx2val`, `fx3cmd`, `fx3val` |
| `groove` | `ticks`, `ppq` (row 0 only) |
| `instrumentpool` | `name`, `dry`, `mx`, `de`, `rv`, `eq` |

All other views (`isGridView: false`) return a context with `row: null` and `activeField: null`.

---

## Notes

- **Playback indicator** — When a row is actively playing the M8 prepends `<` or `>` to `currentLine`. The SDK strips this automatically before parsing so column offsets remain consistent.
- **Font mode** — All column offsets assume font mode 0 (Headless: 8×10 px cells; Model:02: 12×14 px cells). Font modes 1 (bold) and 2 (large) may shift positions.
- **Schema file** — View and column definitions live in `src/m8-view-context.json` and are bundled into `dist/index.js` at build time.
- **Requirement** — The app must run inside the yam8d host iframe. The `ChildHandshake` from `post-me` will never resolve in a standalone tab.


Client SDK for iframe applications that communicate with an M8 host.

## Install

```bash
npm install @yam8d/m8-sdk
```

For local development before the package is published:

```bash
npm install ../yam8d/packages/m8-sdk
```

## Usage

```ts
import { createM8Client } from '@yam8d/m8-sdk'

const m8 = await createM8Client()

console.log(m8.state.viewName)
await m8.sendKeyPress(['play'])

const unsubscribe = m8.onStateChange((state) => {
  console.log(state.cursorPos)
})

unsubscribe()
m8.disconnect()
```

For React or other environments where top-level `await` is not convenient:

```ts
import { createM8ClientSync } from '@yam8d/m8-sdk'

const { client, connect } = createM8ClientSync()
await connect()
```

The app must run inside the host iframe. Opening it directly in a standalone browser tab cannot establish the SDK handshake.

---

## Semantic Context

The SDK can interpret the current cursor position and row text as typed, labelled field values. This works for the five grid views (`song`, `chain`, `phrase`, `table`, `groove`) and the `instrumentpool` view.

### Via the client

```ts
const ctx = m8.getSemanticContext()
// or as a human-readable string:
const description = m8.describeContext()
// e.g. "Track 3 — Chain 0A — Song View row 02"
```

### Standalone functions

```ts
import { getSemanticContext, describeContext, formatFieldValue, lookupFxCommand } from '@yam8d/m8-sdk'

const ctx = getSemanticContext(state)

if (ctx?.activeField) {
  const field = ctx.activeField

  console.log(field.key)      // e.g. 'track3', 'note', 'fx1cmd'
  console.log(field.label)    // e.g. 'Track 3', 'Note (N)', 'FX1 Command'
  console.log(field.type)     // e.g. 'chainRef', 'note', 'fxCommand'
  console.log(field.rawValue) // raw text from the line, e.g. '0A', 'C-4', 'KIL'
  console.log(field.hexValue) // parsed integer or null (null for empty cells and text types)
  console.log(field.isEmpty)  // true when '--' / '---' / '---00'

  // Song view: which track is the cursor on?
  if (field.type === 'chainRef') {
    console.log(field.meta?.trackIndex) // 1–8
  }

  // FX command: look up its description
  if (field.type === 'fxCommand' && !field.isEmpty) {
    const info = lookupFxCommand(field.rawValue)
    console.log(info?.description)
  }
}

// Row-level fields (all columns on the current line)
if (ctx?.row) {
  console.log(ctx.row.rowIndex)        // hex-parsed row index, e.g. 2
  console.log(ctx.row.fields['note'])  // M8ParsedField for the note column
}
```

### Returned types

```ts
interface M8SemanticContext {
  viewName: string               // e.g. 'song', 'phrase'
  viewTitle: string | null       // e.g. 'Song View'
  viewDescription: string | null
  isGridView: boolean
  row: M8ParsedRow | null        // all columns on the cursor's line
  activeField: M8ActiveField | null  // the column under the cursor
}

interface M8ParsedField {
  key: string          // schema key, e.g. 'fx1cmd', 'track3'
  label: string        // human label, e.g. 'FX1 Command', 'Track 3'
  type: M8FieldType
  rawValue: string     // trimmed text from currentLine
  hexValue: number | null
  isEmpty: boolean
  meta?: Record<string, unknown>
}
```

### Supported field types (`M8FieldType`)

| Type | Description |
|---|---|
| `chainRef` | Chain number (hex). `--` = empty. |
| `phraseRef` | Phrase number (hex). `--` = empty. |
| `note` | Note name, e.g. `C-4`, `A#3`. `---` = empty. |
| `velocity` | Note velocity 00–7F (hex). |
| `instrumentRef` | Instrument slot 00–7F (hex). `--` = keep current. |
| `fxCommand` | 3-char FX command name, e.g. `KIL`, `ARP`. `---` = none. |
| `fxValue` | FX value 00–FF (hex). |
| `transpose` | Relative transpose (hex): `00`=none, `01`–`7F`=+1–+127, `FF`–`80`=−1–−128. |
| `ticks` | Groove ticks per step (hex). |
| `volume` | Volume level 00–FF (hex). `--` = no override. |
| `ppq` | Pulses Per Quarter note (decimal). Groove row 0 only. |
| `instrumentName` | Instrument name text (up to 12 chars). No `hexValue`. |
| `eqSlot` | EQ slot assignment (hex). `--` = none. |
| `rowIndex` | Row/step index (hex). |

### Playback indicator

When a row is actively playing, the M8 prepends a `<` or `>` character to `currentLine`. The SDK strips this automatically before parsing, so column offsets are always consistent.

### Notes file

View/column definitions live in `src/m8-view-context.json` and are bundled into `dist/index.js` at build time. All x/width values assume **font mode 0** (8×10 px cells on Headless, 12×14 px on Model:02). Font modes 1 and 2 may shift column positions.
