# yam8d Manual

**yam8d** (Yet Another M8 Display) is a browser-based live display and control surface for the Dirtywave M8.

It connects directly to your device with **WebSerial**, **WebUSB**, or **WebMIDI (SysEx)**, renders the M8 screen in real time, lets you control navigation from keyboard/gamepad/on-screen controls, adds an optional virtual MIDI keyboard, and can record your session.

## Why Use yam8d (Instead of Only m8.run)?

`m8.run` is useful and familiar, but **yam8d is built for deeper control, customization, and workflow speed**.

### yam8d advantages

- **More input flexibility**: keyboard mapping, gamepad mapping, on-device button clicks, virtual MIDI keyboard mapping.
- **Macro navigation workflow**: one-key jumps to core M8 views (`F1` to `F9`) with automatic route execution.
- **Display and render tuning**: smooth rendering controls and optional background shader pipeline.
- **Power-user visuals**: live shader editor with saved presets and audio-reactive uniforms.
- **Integrated recording**: record M8 screen-only or full display and download WebM.
- **Shortcut ecosystem integration**: embed contextual shortcuts panel with configurable host URL.

### Practical takeaway

If you want a straightforward display, both tools can work.
If you want a display that is also a **performance cockpit**, yam8d is the better fit.

## Browser and Device Requirements

yam8d requires a Chromium-based browser with one or more of:

- **WebSerial** (preferred when available)
- **WebUSB**
- **WebMIDI with SysEx enabled**

Recommended: Chrome, Edge, Opera.

Not recommended for full functionality: Firefox and Safari (no WebSerial/WebUSB support).

## Quick Start

1. Connect your M8 via USB and power it on.
2. Open yam8d.
3. Click **Connect**.
4. Approve the browser device prompt.
5. Start controlling from keyboard, gamepad, or on-screen controls.

## Connection Modes and Behavior

yam8d auto-selects the first available transport in this order:

1. **WebSerial**
2. **WebUSB**
3. **WebMIDI (SysEx)**

On connect, yam8d resets the M8 display stream and starts live protocol decoding.

### Audio behavior

- yam8d attempts to route M8 audio input to your system output.
- For shader-reactive visuals and recording audio, browser audio permissions may be requested.

## Core Capabilities

### 1) Live M8 screen rendering

- Real-time text/rect/wave rendering from M8 protocol data.
- Supports M8 model/layout differences and font modes automatically.
- Optional smooth rendering post-process with tunable controls.

### 2) On-screen M8 body interaction

- Clickable M8 body controls can send button presses directly.
- Button state highlights reflect active key presses.
- You can hide body shell and keep just the display for focused workflows.

### 3) Screen click navigation helper

- Clicking the rendered M8 screen sends a grid target for assisted navigation.
- Useful for quickly jumping focus while editing.

### 4) Keyboard and gamepad control

- Default keyboard maps to D-pad + Shift/Play/Opt/Edit.
- Gamepad buttons and non-standard d-pad/hat switches are supported.
- Input state is merged and sent as M8 key masks.

### 5) Macro view navigation

- Quick keys trigger iterative view routing through known graph paths.
- Supported default targets:
  - `F1` Song
  - `F2` Chain
  - `F3` Phrase
  - `F4` Table
  - `F5` Instrument Pool
  - `F6` Instrument
  - `F7` Instrument Mods
  - `F8` Effect Settings
  - `F9` Project
  - `PageUp` Shift+Up macro
  - `PageDown` Shift+Down macro
- Any key press preempts a running macro for immediate manual control.

### 6) Virtual MIDI keyboard

- On-screen piano keys for note input.
- Octave selectors (0 to 9).
- Velocity indicator and keyboard controls for octave/velocity shifts.
- Sends note on/off directly to M8 via active connection.

### 7) Shortcut panel integration

- Optional embedded shortcuts UI panel.
- Configurable `shortcutsHost` URL.
- Contextual view + modifier key state forwarding.

### 8) Recording

- Record **M8 screen only** (canvas capture) or **full tab/window**.
- Includes audio when available.
- Download recordings as WebM.
- In-app controls for start/stop/download/discard.

### 9) Mouse and on-screen controls

- **Click M8 body buttons** to press Up/Down/Left/Right/Shift/Play/Opt/Edit directly.
- **Click the M8 screen** to send a grid coordinate, triggering the macro navigation helper toward that position.
- **Click a piano key** on the virtual keyboard to send a note to the M8.
- **Click an octave segment** on the virtual keyboard row to change the active octave.
- The **velocity bar** on the left of the keyboard reflects the current note velocity.

### 10) Background shaders (advanced)

- Toggle background shader mode.
- Open shader editor panel.
- Author/edit GLSL fragment shaders live.
- Validate shader compile/link before apply.
- Save, load, delete named shader presets (stored locally).
- Select spectrum band count (64, 128, 256).
- Audio-reactive uniforms are available for custom visualizers.

## Default Keyboard Mapping (M8 Buttons)

| Keyboard Key | M8 Button   |
| ------------ | ----------- |
| `ArrowUp`    | D-Pad Up    |
| `ArrowDown`  | D-Pad Down  |
| `ArrowLeft`  | D-Pad Left  |
| `ArrowRight` | D-Pad Right |
| `ShiftLeft`  | Shift       |
| `Space`      | Play        |
| `KeyZ`       | Option      |
| `KeyX`       | Edit        |

## Default Virtual Keyboard Mapping

Default note row starts at:

- `A W S E D F T G Y H U J K O L P ; '`

Default controls:

- `[` = Velocity down
- `]` = Velocity up
- `-` = Octave down
- `=` = Octave up

## Settings Menu Reference

Open the top-left menu to access all runtime settings.

| Setting                   | Description                                     |
| ------------------------- | ----------------------------------------------- |
| **Display shortcuts**     | Show/hide contextual shortcuts iframe panel     |
| **Shortcuts host**        | Change source URL for embedded shortcuts app    |
| **Show M8 body**          | Show/hide full M8 shell around screen           |
| **Zoom View**             | Tight display layout when body is shown         |
| **Smooth rendering**      | Enable text post-process smoothing              |
| **Blur radius**           | Smoothing spread amount                         |
| **Threshold**             | Pixel intensity threshold                       |
| **Smoothness**            | Edge softness                                   |
| **Background shader**     | Enable animated shader background               |
| **Shader editor panel**   | Open/close live shader editor                   |
| **Virtual midi keyboard** | Show/hide on-screen piano keyboard              |
| **Keyboard mapping**      | Open full mapper for M8 + virtual keyboard keys |
| **Manual**                | Open this manual in-app                         |

## Keyboard Mapping UI (Deep Customization)

The keyboard mapper lets you:

- Click any M8 button and bind a physical key.
- Click any virtual piano note and bind a key.
- Bind octave/velocity controls.
- Click an already-bound key to remove assignment.
- Save mappings or reset to defaults.

Both M8 input mapping and virtual keyboard mapping are persisted locally.

## Screenshot Gallery

The images below are placeholder frames so the manual renders immediately in-app. Replace them with real captures anytime.

### Connect and startup

![yam8d connect splash placeholder](/manual-screenshots/connect-splash-placeholder.svg)

### Settings, shortcuts, and rendering tools

![yam8d menu and rendering placeholder](/manual-screenshots/menu-and-rendering-placeholder.svg)

### Virtual MIDI keyboard workflow

![yam8d virtual keyboard placeholder](/manual-screenshots/virtual-keyboard-placeholder.svg)

## M8 SDK — Build Your Own Integrations

yam8d exposes a JavaScript SDK that lets external iframe-based applications communicate with the M8 in real time.

### What the SDK provides

- Read live M8 state: current view name, cursor position, highlight color, text under cursor, device model.
- Navigate to a view by name from code.
- Navigate to any grid coordinate on screen.
- Send key presses programmatically.
- Subscribe to state-change events: view changes, cursor moves, text updates, key presses.

### How to use it

Any webpage can be loaded as an iframe into the shortcuts panel. Once the `M8 SDK` client is connected inside your iframe, it can drive and observe the M8 through the host.

```typescript
import { createM8Client } from "m8-sdk";

const m8 = await createM8Client();

console.log(m8.state.viewName); // e.g. "song"

await m8.navigateToView("phrase");

m8.onStateChange((state) => {
  console.log("View:", state.viewName, "Cursor:", state.cursorPos);
});
```

The SDK is what powers the contextual shortcuts panel — and you can use the same interface to build chord helpers, generative sequencers, parameter editors, or any custom tool that integrates with your M8 session.

See `src/sdk/README.md` inside the yam8d source for full API documentation.

## Data Storage and Privacy

- Settings are stored in your browser `localStorage`.
- No cloud account is required for local operation.
- Device access is governed by browser permission prompts.

## Troubleshooting

- If connect fails, refresh and reconnect with the M8 already powered.
- If MIDI mode is used, ensure SysEx is enabled in browser MIDI permissions.
- If macros seem stuck, press any key to preempt and regain manual control.
- If recording is unavailable, confirm browser support for `MediaRecorder` and capture permissions.
- If shader apply fails, check compile errors in the editor status and browser console.

## Credits

This project includes code derived from [M8WebDisplay](https://github.com/derkyjadex/M8WebDisplay/), (c) 2021-2022 James Deery, used under the MIT License.
