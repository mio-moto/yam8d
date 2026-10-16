# YAM8D: Yet Another M8 Display

YAM8D is a browser-based companion for the Dirtywave M8 tracker. It mirrors the M8 screen, lets you control the device from the browser, and provides tools for navigation, learning, external apps, recording, and WebGL visual rendering.

The app communicates with the M8 through WebSerial when available, then falls back to WebUSB or WebMIDI depending on browser support.

## Features

- Live M8 screen rendering with WebGL2 and OffscreenCanvas when supported.
- Support for M8 Model:01 and Model:02 screen layouts and font modes.
- Keyboard, gamepad, mouse, touch, and on-screen M8 body controls.
- Click-to-navigate on the M8 screen.
- Configurable keyboard mappings for M8 buttons, the virtual MIDI keyboard, and view macros.
- Graph-based view navigation macros, with default shortcuts for Song, Chain, Phrase, Table, Instrument, FX, and Project views.
- Virtual MIDI keyboard with configurable note, octave, and velocity keys.
- External Apps panel for iframe tools that can talk to the live M8 through the YAM8D SDK.
- Built-in presets for M8 Shortcuts, SDK Test, Cont8xt Notes, Groove Extractor and Scale Divinator.
- Plays the M8's USB audio through the computer.
- Canvas or full-tab recording to WebM, with the M8's audio.
- Smooth text rendering controls.
- Custom background shader editor with CodeMirror, GLSL completions, compile feedback, saved shader library, audio-reactive uniforms, mouse uniforms, feedback frames, and optional M8 screen compositing.
- VJ mode for assigning saved shaders to numpad keys and switching them live.

## Browser Support

Use a Chromium-based browser such as Chrome, Edge, or Opera for the full feature set.

Required browser APIs vary by feature:

- WebSerial or WebUSB for direct M8 display/control.
- WebMIDI with SysEx for MIDI fallback.
- WebGL2 for the renderer and shader features.
- OffscreenCanvas for the worker renderer; the app falls back to the text renderer when unavailable.
- MediaRecorder and display capture for recording.

## Development

Install dependencies:

```bash
bun install
```

Run the app:

```bash
bun run dev
```

Build the app:

```bash
bun run build
```

Lint:

```bash
bun run lint
```

Run the tests (`bun:test`, files in `tests/`):

```bash
bun test
```

Build the SDK package (needed before `dev` on a fresh clone):

```bash
bun run build:sdk
```

Pack the SDK package:

```bash
bun run pack:sdk
```

## SDK

YAM8D includes an SDK for external tools loaded in the External Apps panel. It exposes state updates, screen reads, a description of what the cursor is on, view navigation, cursor navigation, value editing helpers, file browsing helpers, key press methods and the M8's MIDI clock.

The device engine (connection, protocol, screen extraction, navigation, value editors) lives in the SDK package too, and YAM8D runs on it. An app built on the SDK can therefore also run in its own tab and connect to the M8 itself (standalone mode).

The package lives in `packages/m8-sdk` and can be installed as:

```bash
npm install @yam8d/m8-sdk
```

See:

- `src/sdk/README.md`
- `src/sdk/CREATING_APP.md`
- `packages/m8-sdk/README.md`

## Manual

The in-app manual is sourced from `MANUAL.md` and displayed from the Help section in the YAM8D menu.

## Credits

This project includes code derived from [M8WebDisplay](https://github.com/derkyjadex/M8WebDisplay/), (c) 2021-2022 James Deery, used under the MIT License.
