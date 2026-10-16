# @yam8d/m8-sdk

Client SDK for apps that read and drive a Dirtywave M8 tracker. Inside a [yam8d](https://github.com/mio-moto/yam8d) External Apps iframe it talks to yam8d; anywhere else it connects to the M8 itself over Web Serial, WebUSB or Web MIDI ([standalone mode](#standalone-mode)). The API is the same in both modes.

> **License:** MIT — © kronsilds

---

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Factory functions](#factory-functions)
- [Standalone mode](#standalone-mode)
- [M8Client](#m8client)
  - [Properties](#properties)
  - [Navigation](#navigation)
  - [Value setters](#value-setters)
  - [Key input](#key-input)
  - [State](#state)
  - [Event subscriptions](#event-subscriptions)
  - [Semantic context](#semantic-context-on-the-client)
  - [Device connection (standalone)](#device-connection-standalone)
  - [Lifecycle](#lifecycle)
- [Standalone semantic context functions](#standalone-semantic-context-functions)
- [Types reference](#types-reference)
  - [M8State](#m8state)
  - [CursorPos / CursorRect / RGB / SystemInfos](#cursorpos--cursorrect--rgb--systeminfos)
  - [M8SemanticContext](#m8semanticcontext)
  - [M8DescriptionPart](#m8descriptionpart)
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

> Inside yam8d the app uses yam8d's connection to the M8. Opened in its own tab, it runs in [standalone mode](#standalone-mode) and connects to the M8 itself.

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

## Standalone mode

`createM8Client()` decides the mode when it connects (`client.mode`):

- **`'host'`**: the page runs in an iframe that yam8d named `yam8d-external-app` (exported as `YAM8D_FRAME_NAME`). The client waits for yam8d's handshake, however long it takes.
- **`'standalone'`**: the page is a top-level tab. The client runs the same engine yam8d uses, in the page itself: the Web Serial / WebUSB / Web MIDI SysEx connection, the display protocol (SLIP, draw rect/character commands), screen text extraction, cursor tracking, view navigation over the view graph, the value editors, file browsing and the MIDI clock.
- In an iframe that yam8d did not name (an older yam8d, or another page embedding the app), the client tries the handshake for `handshakeTimeoutMs` (3 s) and then goes standalone.
- Force a mode with `createM8Client({ mode: 'host' | 'standalone' })`.

In standalone mode the M8 has to be connected before any call works:

```ts
const m8 = await createM8Client()
if (m8.mode === 'standalone' && !m8.isConnected) {
  // The browser's device picker only opens from a user gesture
  connectButton.onclick = () => m8.connectDevice()   // or connectDevice({ transport: 'midi' })
}
m8.onConnectionChange((connected) => updateUi(connected))
```

- **Audio**: `connectDevice({ audio: true })` (or `connectAudio()` later) plays the M8's USB audio input through the page, as yam8d does. The browser asks for audio permission; only an input whose label contains "M8" is played, never another microphone. Without it the device stays connected and the warning goes to the console; `isAudioConnected` tells. `disconnectDevice()` stops it too.
- **MIDI clock**: `enableMidiTransport()` / `onTransport()` work the same as in yam8d: the page opens the M8's MIDI input itself (Web MIDI permission). Enable it again after each new device connection.
- At start, a standalone client reopens a device the page was granted before, without a prompt (`autoConnect: false` turns that off).
- Only one page can hold the M8's serial port. Disconnect it in yam8d (or close that tab) before connecting from another page, and call `disconnectDevice()` to hand it back.
- `getDevice()` gives standalone apps the raw protocol events (`text`, `rect`, `wave`, `key`, `system`) and device commands (`sendKeys`, `resetScreen`, `sendNoteOn`, `sendNoteOff`, `sendProgramChange`), e.g. to draw the screen themselves.
- `getDeviceSupport()` tells which of the three browser APIs are available (Chromium browsers have all three; Firefox and Safari have none).
- The engine is exported too, for apps that want to drive the device below the client:
  - `createM8Connection` (open a device bus) and `createM8Engine` (the engine yam8d and standalone clients run on a bus);
  - `M8KeyMask` (the bit of each key in a key mask) and `pressKeys({ left, up, shift, ... })`, which builds a mask from booleans;
  - `createM8Audio()` (plays the M8's USB audio input through the page: `connect()`, `disconnect()`, `connected`, `getOutputCaptureStream()` for recording), `getM8InputStream({ requireM8 })` (the raw input stream; without `requireM8` it falls back to the default input) and `M8_AUDIO_CAPTURE_CONSTRAINTS` (no echo cancellation, noise suppression or gain control).

---

## M8Client

### Properties

| Property | Type | Description |
|---|---|---|
| `state` | `M8State` | Last known full device state (updated on every host event). |
| `isConnected` | `boolean` | Whether calls reach an M8: host mode, after the yam8d handshake; standalone, while a device is connected. |
| `mode` | `'host' \| 'standalone' \| null` | Chosen at connect; `null` before. |
| `deviceTransport` | `'serial' \| 'usb' \| 'midi' \| null` | Standalone: the API the device is connected through. |

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

#### `getScreen(): Promise<M8Screen>`

The whole screen as text rows (40 columns, column 0 is the margin where play markers are drawn), read from the character stream without moving the cursor.

#### `getScreenCells(): Promise<M8ScreenCells>`

The same screen plus the colour of every character cell, so an app can look like the device or learn which theme colour the M8 uses for what. `fg[row][col]` and `bg[row][col]` are `'#rrggbb'`, `null` where nothing was drawn. Needs a yam8d host with SDK 0.5 or later; older hosts reject the call.

```ts
const cells = await m8.getScreenCells()
cells.fg[5][3] // colour of the first note of a phrase, e.g. '#ffffff'
```

#### `captureSnapshot(): Promise<M8Snapshot>`

A fresh state, its semantic context, the description (as text and as parts) and the whole screen in one call. The result is plain JSON, safe to store.

```ts
const snap = await m8.captureSnapshot()
snap.description // e.g. "Note (N): Note C-4 — Phrase View row 00"
snap.screen.lines // the screen it was read from
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

Fires when a physical key event occurs on the device. `keys` is a bitmask of active keys (see `M8KeyMask`).

#### `enableMidiTransport(): Promise<{ ok: boolean; error?: string }>`

Starts forwarding the M8's MIDI clock and transport. The M8 only sends it with SYNC OUT set in its MIDI Settings (a setting stored in each song), and the page that owns the device needs Web MIDI permission: yam8d in host mode, the app itself in standalone mode. Hosts before SDK 0.5 reject the call. In standalone mode, call it again after each new device connection.

#### `onTransport(callback: (event: M8TransportEvent) => void): () => void`

MIDI start / stop / continue, the clock, and song positions, after `enableMidiTransport()`.

```ts
interface M8TransportEvent {
  kind: 'start' | 'stop' | 'continue' | 'clock' | 'position'
  ticks: number            // clock ticks since the host started listening (monotonic)
  at: number               // epoch ms (performance.timeOrigin + timestamp), comparable across frames
  msPerTick: number | null // measured tick length, null until known
  spp?: number             // Song Position Pointer in sixteenths, on 'position' events
}
```

`clock` events come once per sixteenth (6 ticks at 24 PPQ), not on every tick. The M8 can send clock while stopped.

```ts
const { ok, error } = await m8.enableMidiTransport()
if (!ok) console.warn(error)
m8.onTransport((e) => {
  if (e.kind === 'position') console.log('play from sixteenth', e.spp)
})
```

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

- `"Track 3: 0A — Track 3 — Song View row 01"`
- `"Note (N): Note C-4 — Phrase View row 00"`
- `"FX2 Command: KIL — (Kill: stops the playing instrument after XX ticks) — value 03: stops the note after 3 ticks — Phrase View row 01"`

Returns `null` when not connected or no view is active. It is the text of `describeContextParts()` joined with `' — '`.

It reads the cursor against its surroundings when that changes the meaning:

- **FX values are explained** — `ARP37` on `C-4` → `"+3 and +7 semitones: C-4 D#4 G-4"`, `KIL04` → `"stops the note after 4 ticks"`, relative instrument commands show their sign.
- **REP is followed down its FX lane.** With `VOL10` above, `REP05` reads `"repeats VOL from 10 (step 1), +05 per step → 15 on this step"`, and an empty cell below it reads `"REP still active: VOL reaches 1A on this step (+05 per step since step 3)"`. A new command, `REP00`, or an `RTO` limit in the same lane ends or caps it. `^^` (a REP carried over from the previous phrase) is recognised when it can be attributed to one lane.
- **Relative commands are tracked.** Per the manual, a relative instrument command (`VOL`, `CUT`, `PIT`, `EA1`… — the ones the device help marks `(RELATIVE)`) keeps its change until a note is triggered with a `RET` or with an instrument number in the `I` column. `VOL02` twice reads `"VOL has moved by +04 in 2 steps since the instrument number on step 0; stays until a note with an instrument number (I) or a RET resets it"`, REP repeats are counted, and the `I` cell or `RET` that resets it lists what it wipes (`"resets the relative changes still in force (CUT +10, VOL +0B)"`). Only the current phrase is visible, so totals start at the phrase's own last reset.
- **Instrument-type commands say who offers them.** `FM3` → `"…; offered by FM Synth instruments"`.
- **Scale View** names the scale the enabled notes spell (`"Scale: C D E F G A B — Major (Ionian)"`), says what the row under the cursor is (`"E — a major 3rd (+4 semitones above C) — is in the scale"`), reports detuning, and explains the KEY / TUNE / NAME rows.

The surroundings come from a copy of the screen that the client refreshes in the background after every state event. It is only used when its row under the cursor still matches `currentLine`; otherwise the description quietly falls back to the cursor row alone. Call `await m8.getScreen()` or `await m8.captureSnapshot()` first when you need it guaranteed current.

#### `describeContextParts(): M8DescriptionPart[] | null`

The same description as ordered, tagged parts, so you can keep, drop, reorder or style some of them instead of parsing the string:

```ts
m8.describeContextParts()
// [{ kind: 'field',    text: 'FX2 Command: KIL' },
//  { kind: 'fxInfo',   text: '(Kill: stops the playing instrument after XX ticks)' },
//  { kind: 'meaning',  text: 'value 03: stops the note after 3 ticks' },
//  { kind: 'location', text: 'Phrase View row 01' }]

// Your own view label instead of the SDK's location:
const text = m8.describeContextParts()?.filter((p) => p.kind !== 'location').map((p) => p.text).join(' · ')
```

See [`M8DescriptionPart`](#m8descriptionpart) for the kinds. Everything a part says is also in the context as data (`activeField`, `fxLane`, `relativeFx`, `resetsRelative`, `scaleNote`, `scale`, …), for when you want to write the text yourself.

---

### Device connection (standalone)

#### `connectDevice(options?: { transport?: 'auto' | 'serial' | 'usb' | 'midi'; audio?: boolean }): Promise<void>`

Connects to the M8 from this page. `'auto'` (default) uses Web Serial, then WebUSB, then Web MIDI SysEx, by browser support. Without a previously granted device the browser shows its picker, which needs a user gesture: call it from a click handler. Replaces the current device. No-op in host mode.

#### `disconnectDevice(): Promise<void>`

Releases the device (and stops its audio) so yam8d or another page can open it.

#### `connectAudio(): Promise<void>` / `disconnectAudio(): Promise<void>`

Standalone: plays the M8's USB audio through the page, or stops it. `connectAudio()` rejects when no audio input named M8 exists. No-ops in host mode (yam8d plays it). `isAudioConnected` reports the state.

#### `onConnectionChange(callback: (connected: boolean) => void): () => void`

Fires when `isConnected` changes: handshake done, device connected, unplugged or released.

#### `getDevice(): M8DeviceBus | null`

Standalone: raw protocol events and device commands. `null` in host mode or while disconnected.

---

### Lifecycle

#### `disconnect(): void`

Closes the host connection (and the device, in standalone mode) and clears all event listeners and internal state.

---

## Standalone semantic context functions

These are re-exported from `@yam8d/m8-sdk` for use without an `M8Client` instance.

### `getSemanticContext(state: M8State, screen?: M8Screen | null): M8SemanticContext | null`

Parses an `M8State` snapshot into a semantic context. Returns `null` if `state.viewName` is not set.

Pass the whole `screen` (from `getScreen()`) to fill the context's look-around fields: `steps` (all 16 phrase steps), `fxLane` (what the FX cell under the cursor means in its lane), `relativeFx`, `resetsRelative`, `carriedRepLane`, and `scale` (Scale View). A screen whose cursor row no longer matches `state.currentLine` is ignored. `lineText` is always set for grid views.

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

### `describeContextParts(ctx: M8SemanticContext): M8DescriptionPart[]`

The summary as ordered, tagged parts; `describeContext()` joins their text with `' — '`.

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

### `lookupFxCommand(cmd: string): M8FxCommandInfo | undefined`

Looks up a 3-character FX command name (case-insensitive) across all categories (sequencer, instrument, modulation, mixer). Modulator commands carry their slot as the third character (`EA1`, `LF3`).

```ts
import { lookupFxCommand } from '@yam8d/m8-sdk'

lookupFxCommand('KIL')
// → { description: 'Kill: stops the playing instrument after XX ticks.',
//     category: 'sequencer', relative: false, instrumentTypes: null, slot: null }
lookupFxCommand('FM3')
// → { …, category: 'instrument', relative: true, instrumentTypes: ['fmsynth'], slot: null }
lookupFxCommand('LF3')
// → { …, category: 'modulation', relative: false, instrumentTypes: null, slot: 3 }
```

`instrumentTypes` lists the instrument types that offer the command when not every type does (`null` = all, or not an instrument command).

### `getInstrumentFxCommands(type: string): M8InstrumentFxList | null`

The instrument commands offered by an instrument type (the "Current Instrument" section of the Effect Command Help view, opened with `[EDIT]+[UP/DOWN]` on an FX command). `type` is the key from `M8SemanticContext.instrumentType.key`.

```ts
getInstrumentFxCommands('hypersynth')
// → { type: 'hypersynth', verified: true,
//     commands: ['VOL','PIT','FIN','CRD','CVO','SWM','WID','SUB','FIL','CUT','RES','AMP','LIM','PAN','SNC','ERR','DRY','SMX','SDL','SRV'] }
```

`verified: true` means the list was read from a real M8 (Model:02): **sampler, macrosynth, fmsynth, hypersynth**. Wavsynth and External were not available on that device, so their lists are unknown (`null`); `midiout` only holds the documented `CHD`/`ADD`. The Sequencer FX and Mixer/Effects sections are the same for every type, and the Instrument Mods section depends on the kind of each modulator slot (envelope: `EA AT HO DE ET`, LFO: `LA LO LS LF LT`).

### `RELATIVE_FX_RULE: string`

The manual's rule for relative commands, for tooltips.

### `parseGridScreen(viewName: string, screen: M8Screen): M8ScreenGridRow[]`

Every content row of a grid view (`song`, `chain`, `phrase`, `table`, `groove`, `instrumentpool`) read off the whole screen, top to bottom, each with the `screenRow` it is drawn on. Use it to read a full page at once instead of only the cursor row. Rows whose index does not parse are skipped, so check `rowIndex` continuity when you need the whole page.

```ts
const steps = parseGridScreen('phrase', await m8.getScreen())
steps[0].fields.note.rawValue // 'c-4' (the text stream is lower case)
```

### `parseViewTitle(rawTitle: string | null): { viewId: string | null; isUnsaved: boolean }`

The item number of a title (`'PHRASE 1F*'` → `{ viewId: '1F', isUnsaved: true }`).

### `readPlayPositions(viewName: string, screen: M8Screen): M8PlayPositions | null`

Reads the play markers off a grid view. On the Song view the M8 draws a marker just left of each playing chain (`00>00>01>02`), so `tracks` holds the song row of each track's marker (`null` where it is not on screen). On the chain, phrase, table and groove views the marker follows the row index of the playing row (`F>--- -- --`), so `row` holds that row. Returns `null` for views without a grid, and all nulls when nothing plays. Seen on a Model:02, firmware 6.5.

```ts
interface M8PlayPositions {
  tracks: (number | null)[] | null // song view only
  row: number | null               // other grid views
}
```

### `SCREEN_MARGIN: number`

The one-column left margin of every screen row (`1`). `screen.lines[y].slice(SCREEN_MARGIN)` lines columns up with the schema's `x` positions.

### Theme: `parseThemeScreen`, `observeThemeColors`, `M8_THEME_ROLES`, `M8_THEME_VIEW`

The device theme has 13 colours, edited in System Settings › EDIT THEME (view name `themesettings`, exported as `M8_THEME_VIEW`).

- `parseThemeScreen(screen)` reads them off the Theme View screen: `{ colors: { background, textEmpty, textInfo, textDefault, textValue, textTitles, playMarkers, cursor, selection, scopeSlider, meterLow, meterMid, meterPeak }, mode: 'rgb' | 'hsv', name }`, colours as `'#rrggbb'`. HSV rows are converted (each channel read as 00-FF). It returns `null` unless all 13 rows are on screen.
- `observeThemeColors(state)` gives the colours any screen shows without opening the Theme View: `background` and `textTitles`. (`state.cursorColor` is the cursor rectangle as drawn; the M8 animates it, so it is not the theme's CURSOR colour.)
- `M8_THEME_ROLES` lists the roles with the labels the device shows.

```ts
if (m8.state.viewName === M8_THEME_VIEW) {
  const theme = parseThemeScreen(await m8.getScreen())
}
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
  cursorColor?: RGB | null         // cursor rectangle as drawn (animated, not the theme CURSOR); SDK 0.5+
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
  isGridView: boolean            // true for song/chain/phrase/table/groove/scale/instrumentpool
  isParameterView: boolean       // true for the label/value views (inst, mixer, project, …)
  section: string | null         // effectsettings: 'MODFX' | 'DELAY' | 'REVERB'
  instrumentType: { text: string; key: string | null } | null // inst view + screen, e.g. { text: 'WAVSYNTH', key: 'wavsynth' }
  row: M8ParsedRow | null        // all columns on the line at cursorPos.y
  activeField: M8ActiveField | null  // the column currently under the cursor
  lineText: string | null            // cursor row text, playback marker removed
  steps: M8ParsedRow[] | null        // phrase view + screen: all 16 steps (index = step)
  carriedRepLane: number | null      // FX lane (1–3) showing '^^' (REP from previous phrase)
  fxLane: M8FxLaneTrace | null       // phrase view + screen: what the FX cell means in its lane
  relativeFx: Record<string, M8RelativeFxState> | null // phrase view + screen: relative commands in force, with net change since the last trigger
  resetsRelative: Record<string, M8RelativeFxState> | null // phrase view + screen: when the cursor step triggers the instrument (I number or RET), the relative changes it puts back
  scaleNote: M8ScaleNote | null      // scale view: the interval row under the cursor { interval, semitone, enabled, offset }
  scale: M8ScaleInfo | null          // scale view + screen: the 12 intervals interpreted together
}
```

### `M8DescriptionPart`

```ts
interface M8DescriptionPart {
  kind: M8DescriptionPartKind
  text: string
}
```

Parts come in reading order; a kind can appear more than once.

| Kind | Example |
|---|---|
| `field` | `"FX1 Command: KIL"`, `"Tempo (TEMPO): 120.00 BPM"` |
| `fxInfo` | `"(Kill: stops the playing instrument after XX ticks)"` |
| `fxTarget` | on an FX value: `"for KIL (…)"` |
| `meaning` | `"value 03: stops the note after 3 ticks"`, `"E is detuned by −0.50 st"` |
| `fxLane` | `"REP still active: VOL reaches 09 on this step (+02 per step since step 1)"` |
| `relative` | `"relative: VOL has moved by +0C over 2 steps since …"`, `"triggers the instrument again: resets …"` |
| `optionInfo` | what the selected option does |
| `fieldInfo` | what the field is |
| `fileInfo` | `"directory: [EDIT] opens it"` |
| `instrument` | `"Wavsynth instrument"` |
| `section` | `"Delay"`, `"MOD2"` |
| `scale` | `"Scale: C D E F G A B"`, `"Major (Ionian); detuned: E −0.50 st"` |
| `track` | `"Track 3"` |
| `location` | `"Phrase View row 07"`, `"Mixer View"` |
| `line` | the cursor row's text, when no field on it is recognised |

### `M8ParsedRow`

```ts
interface M8ParsedRow {
  rowIndex: number | null                   // hex row index from leftmost chars; null if unparseable
  rowKey: string                            // schema key, e.g. 'songRow', 'step', 'chainPos'
  rowId: string | null                      // parameter views: matched schema row ('tempo', 'gain', …)
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
  // parameter views (all optional):
  description?: string               // what the field is
  text?: string | null               // non-numeric part: option name, caption, name, instrument type
  numericValue?: number | null       // value in its natural base (hex, decimal, fractional)
  values?: number[] | null           // both numbers of an 'XX:YY' pair
  parts?: string[]                   // names of those numbers, e.g. ['left time', 'right time']
  unit?: string                      // e.g. ' BPM', ' dB'
  valueDescription?: string          // what the selected option does
  fileKind?: M8FileKind              // file browser rows: 'parent' | 'directory' | 'instrumentPreset' | 'sample' | 'm8file' | 'file'
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
  | 'noteInterval'   // scale view row label: C, C#, D, …
  | 'onOff'          // 'ON' / 'OFF' toggle
  | 'semitoneOffset' // scale view detune, e.g. '-00.50'
  | 'swing'          // groove swing percentage
  | 'instrumentType' // instrument engine: WAVSYNTH, SAMPLER, FMSYNTH, …
  | 'name'           // free-text name field; dashes = unnamed
  | 'parameter'      // named editable value: CUTOFF, TEMPO, GAIN, …
  | 'option'         // choice from a list: '00CHORUS', 'BELL', 'STEREO'
  | 'action'         // button: LOAD, SAVE, RENDER, SETTINGS, EQ, …
  | 'fileEntry'      // file browser row: '/folder', '/..', 'Bass.m8i'
```

### `M8KeyName`

```ts
type M8KeyName = 'left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit'
```

### `M8SdkConfig`

```ts
interface M8SdkConfig {
  debug?: boolean                            // verbose logging (postMessage traffic, engine events)
  mode?: 'auto' | 'host' | 'standalone'      // default 'auto', see Standalone mode
  handshakeTimeoutMs?: number                // auto mode in an unmarked iframe; default 3000
  autoConnect?: boolean                      // standalone: reopen a granted device at start; default true
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
| `transport` | `M8TransportEvent` | MIDI clock / start / stop / continue / song position, after `enableMidiTransport()` |

---

## Supported views

The semantic context parser supports these `viewName` values:

| `viewName` | Columns |
|---|---|
| `song` | `track1`–`track8` (chainRef, meta: trackIndex 1–8) |
| `chain` | `phrase` (phraseRef), `transpose` |
| `phrase` | `note`, `vel`, `inst`, `fx1cmd`, `fx1val`, `fx2cmd`, `fx2val`, `fx3cmd`, `fx3val` |
| `table` | `transpose`, `volume`, `fx1cmd`, `fx1val`, `fx2cmd`, `fx2val`, `fx3cmd`, `fx3val` |
| `groove` | `ticks`, `ppq` (row 0 only), `swing` (row 0 only) |
| `scale` | `interval`, `en` (onOff), `offset` (semitoneOffset) |
| `instrumentpool` | `name`, `dry`, `mx`, `de`, `rv`, `eq` |
| `inst` | header: `instrumentType`, `load`/`save` (action), `name`, `transpose` (onOff), `tableTic`, `eq`; then the type's parameters as label/value pairs (`parameter` / `option`), described per instrument type |
| `instmods` | per modulation slot: type (`option`), `dest`, and the type's parameters (`amt`, `atk`, `hold`, `dec`, `sus`, `rel`, `peak`, `body`, `osc`, `trig`, `freq`, `src`, `lval`, `hval`) |
| `mixer` | `speakerVol`, `track1`–`track8`, `modfxVol`/`delayVol`/`reverbVol`, `inputVol`/`inputVol2`/`usbVol` and their sends, `mixEq` (action), `mainVol`, `limiter`, `djFilter`, `ott` |
| `project` | `tempo`, `transpose`, `groove`/`scale`/`liveQuantize` (option), `name`, and the `load`/`save`/`new`/`render`/`bundle`/… actions |
| `effectsettings` | per `section` (MODFX / DELAY / REVERB): type, input EQ (action), depth/frequency pairs, width, sends, delay time, feedback, room size, decay/shimmer |
| `mixeq`, `modfxeq`, `delayeq`, `reverbeq` | LOW/MID/HIGH band `gain`, `freq`, `q`, `type` (option), `mode` (option) |
| `mixscope`, `limiterscope` | `zoom`, `peak`, `softClip`, `mainVol`, `limiter`, `djFilter`, `ott`, `mixEq`; `atk`/`rel`/`type`/`res`/`time`/`color` as label/value pairs |
| `systemsettings` | `backlight`, `fontOptions`, `editTheme` (action), `notePreview`, `recCountIn`, `metronomeVol`, `usbAudioMode`, `usbMainOut`, `lineInGate`, `keyDelayRep`, … |
| `loadinstrument`, `selectsavedirectory` | `entry` (fileEntry) |
| `createdirectory` | `name` |

Grid views are read by column position (`src/m8-view-context.json`). Parameter views are label/value screens: a row is recognised from its label text and its cells come from `src/m8-parameter-views.json`, whose column positions were measured on the manual's screenshots. Instrument parameters vary with the instrument type, so they are read as label/value pairs and looked up in a per-type vocabulary. Layouts that only appear for some instrument types (Sampler `SAMPLE` row, FM operators, Hypersynth chord, MIDI CC rows) are best-effort.

---

## Notes

- **Screen geometry** — The screen is 40 × 24 characters. Every row has a one-column left margin, so schema `x` positions count from column 1 and `cursorPos.x` is the schema `x` + 1 (the SDK accounts for this). Titles are on row 3 and content starts on row 5. The text stream is lower case (`tempo`, `b-4`, `ff`); the SDK matches case-insensitively and shows values upper case, except user-typed names and file names.
- **Margin markers** — The M8 draws `<` in the left margin of the cursor row, so it can appear as the first character of `currentLine`. The SDK strips the margin before parsing so column offsets remain consistent. Play markers are drawn inside the row instead (see [`readPlayPositions`](#readplaypositionsviewname-string-screen-m8screen-m8playpositions--null)).
- **Font mode** — All column offsets assume font mode 0 (Headless: 8×10 px cells; Model:02: 12×14 px cells). Font modes 1 (bold) and 2 (large) may shift positions.
- **Schema file** — View and column definitions live in `src/m8-view-context.json` and are bundled into `dist/index.js` at build time.
- **Modes** — Inside a yam8d iframe named `yam8d-external-app` the client waits for yam8d's `post-me` handshake; in a top-level tab it runs the engine in the page and connects to the M8 itself (see [Standalone mode](#standalone-mode)). In an unnamed iframe it goes standalone after `handshakeTimeoutMs`.
