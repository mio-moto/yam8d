# YAM8D Manual

YAM8D is a browser companion for the Dirtywave M8. It mirrors the M8 screen, sends controls back to the device, hosts external tools, records sessions, and can turn the display into a WebGL visual surface.

## Connect

You need a powered Dirtywave M8, a USB connection, and a Chromium-based browser such as Chrome, Edge, or Opera.

1. Open YAM8D.
2. Click **Connect**.
3. Choose the M8 device or port in the browser permission dialog.
4. Wait for the screen to appear.

YAM8D prefers WebSerial when the browser supports it. If WebSerial is unavailable, it can use WebUSB or WebMIDI with SysEx support.

![YAM8D connect screen](./manual-screenshots/connect-splash.png)

## Main Controls

The default computer keyboard mapping is:

| Key | M8 button |
| --- | --- |
| `ArrowUp` | Up |
| `ArrowDown` | Down |
| `ArrowLeft` | Left |
| `ArrowRight` | Right |
| `ShiftLeft` | Shift |
| `Space` | Play |
| `Z` | Option |
| `X` | Edit |

Gamepads are also supported. The default mapping uses the D-pad for direction, common shoulder/select buttons for Shift, and face buttons for Play, Option, and Edit.

You can also click the on-screen M8 body. Pressing and releasing a body button sends the matching M8 key state.

## Screen Click Navigation

Clicking inside the M8 screen asks YAM8D to move the cursor to the clicked grid position. This is useful for jumping across dense tracker pages without repeated direction presses.

The calculation uses the current device screen layout, offsets, and font mode reported by the M8.

## View Macros

YAM8D can navigate between M8 views by following a generated view graph. The default macro keys are:

| Key | Target view |
| --- | --- |
| `F1` | Song |
| `F2` | Chain |
| `F3` | Phrase |
| `F4` | Table |
| `F5` | Instrument Pool |
| `F6` | Instrument |
| `F7` | Instrument Modifiers |
| `F8` | Effect Settings |
| `F9` | Project |
| `PageUp` | Shift + Up |
| `PageDown` | Shift + Down |

Any keyboard input can preempt a running macro. This keeps manual control responsive if a macro starts from an unexpected screen.

## Keyboard Mapping

Open **Menu > Input > Keyboard Mapping > Configure** to edit input mappings.

The mapping panel includes three areas:

- M8 button mappings for the computer keyboard.
- Macro input mappings for fast view navigation.
- Virtual MIDI keyboard mappings for notes, octave controls, and velocity controls.

Macro keys can be switched between `F1` to `F9` and `1` to `9`. Each macro row can also target a different view from the loaded M8 view list.

Use **Save** to persist changes in browser local storage. Use **Reset to Defaults** to restore the default M8 button, virtual keyboard, and macro mappings.

![Keyboard mapping settings](./manual-screenshots/keyboard-settings.png)

## Virtual MIDI Keyboard

Enable or disable the virtual keyboard from **Menu > Input > Virtual midi keyboard**.

Default note keys:

| Keys | Notes |
| --- | --- |
| `A W S E D F T G Y H U J K O L P ; '` | Chromatic notes across the displayed keyboard |

Default controls:

| Key | Action |
| --- | --- |
| `Minus` | Octave down |
| `Equal` | Octave up |
| `BracketLeft` | Velocity down |
| `BracketRight` | Velocity up |

The virtual keyboard sends note on and note off messages to the M8 using the current octave and velocity.

## External Apps

Enable the External Apps panel from **Menu > Tools > External Apps**.

The panel loads iframe tools next to the M8 display. External apps can connect to YAM8D through the SDK and receive live M8 state, cursor changes, view changes, text updates, and key events. They can also request navigation, set values, browse files, and send key presses.

The default app list includes:

| App | Purpose |
| --- | --- |
| M8 Shortcuts | Context-aware shortcut reference |
| M8 SDK Test | Local SDK test page (`sdk-test.html`) |
| M8 Groove Extractor | Groove extraction tool |
| M8 Scale Divinator | Scale exploration tool |

Open **Configure** to add, remove, rename, reorder by active selection, or edit external app URLs. Apps can optionally use the legacy URL fallback format before the SDK connection is ready.

![External apps setup](./manual-screenshots/external-apps-setup.png)

## SDK Capabilities

External iframe apps can use `@yam8d/m8-sdk`.

Common client methods include:

- `navigateToView(viewName)`
- `navigateTo(x, y)`
- `setValueToHex(value)`
- `setValueToInt(value)`
- `setNote(note)`
- `setValueToString(text, exact, searchInCurrentLine)`
- `browseFile(text, exact)`
- `sendKeyPress(keys)`
- `sendKeyDown(keys)`
- `sendKeyUp()`
- `fetchState()`

The SDK state includes the current view, cursor position, cursor rectangle, selection mode, text under cursor, current line, colors, model information, system information, macro status, and key events.

See `src/sdk/README.md` and `src/sdk/CREATING_APP.md` for implementation details.

## Rendering Settings

Open **Menu > Rendering** to control the display renderer.

| Setting | Description |
| --- | --- |
| Smooth rendering | Enables processed font smoothing for the WebGL renderer |
| Blur radius | Controls smoothing spread |
| Threshold | Controls glyph edge cutoff |
| Smoothness | Controls edge softness |
| Background shader | Enables the custom WebGL background shader |
| Shader editor panel | Opens or closes the shader editor |
| VJ Mode | Enables numpad shader switching when background shaders are active |

![Menu and rendering settings](./manual-screenshots/menu-and-rendering.png)

## Background Shader Editor

The shader editor is available when **Background shader** is enabled. It edits a WebGL2 fragment shader and applies it live to the M8 display surface.

The editor includes:

- CodeMirror editing with line numbers, folding, syntax highlighting, bracket matching, snippets, and completion.
- Compile validation before applying a shader.
- A saved shader library stored in browser local storage.
- **Save changes**, **Save as new**, and **Delete** actions.
- A **Composite M8 screen on top** option.
- Audio spectrum band selection: `64`, `128`, or `256`.

Press `Ctrl-Space` in the editor to open completions. Type `u` to quickly discover the available uniforms.

Available shader uniforms include:

| Uniform | Type | Notes |
| --- | --- | --- |
| `uTime` | `float` | Resets when the shader changes |
| `uGlobalTime` | `float` | Keeps running across shader changes |
| `uResolution` | `vec2` | Canvas resolution |
| `uMouse` | `vec4` | Mouse x, y, down, unused |
| `uAudioLevel` | `float` | Audio level from microphone or captured input |
| `uAudioSpectrum` | `sampler2D` | Audio spectrum texture |
| `uAudioSpectrumBins` | `float` | Number of spectrum bins |
| `uPreviousFrame` | `sampler2D` | Previous background frame for feedback effects |
| `uFrameCount` | `int` | Resets when the shader changes |
| `uGlobalFrameCount` | `int` | Keeps counting across shader changes |
| `uM8Screen` | `sampler2D` | Current rendered M8 screen |

Shaders that use audio uniforms will request audio input. Audio is analyzed on the main thread and sent to the renderer worker.

## VJ Mode

VJ Mode appears when background shaders are enabled.

1. Save one or more shaders in the shader editor.
2. Turn on **Menu > Rendering > Background shader > VJ Mode**.
3. Click a numpad key in the small VJ pad overlay.
4. Assign a saved shader to that key.
5. Press the matching physical numpad key to switch shaders live.

Assigned shaders are precompiled when possible, so switching is designed to be immediate during performance or recording.

## Recording

The record control is displayed near the M8 player.

Recording modes:

| Mode | What it captures |
| --- | --- |
| M8 Screen only | The rendered M8 canvas, including shader output |
| Full tab/window | Browser display capture for the selected tab or window |

Press `Escape` to stop the active recording at any time. This is especially useful during **Full tab/window** recording, where YAM8D hides its controls to keep them out of the capture.

After stopping, YAM8D provides a WebM download action and a reset action to discard the captured result.

Recording availability depends on browser support for `MediaRecorder`, canvas capture, and display capture.

## Display Options

Open **Menu > Display** to control the M8 body shell and zoom behavior.

| Setting | Description |
| --- | --- |
| Show M8 body | Shows or hides the M8 body around the screen |
| Zoom View | When the body is shown, switches between full body view and a tighter screen-focused view |

## Stored Data

YAM8D stores settings locally in the browser. This includes keyboard mappings, external app configuration, shader source, saved shaders, VJ numpad assignments, and rendering preferences.

No project data or M8 content is uploaded by YAM8D.

## Troubleshooting

| Problem | Try this |
| --- | --- |
| The browser cannot connect | Use Chrome, Edge, or Opera and make sure the M8 is powered before clicking Connect |
| The screen stays blank after connect | Refresh, reconnect, and wait for the automatic screen reset |
| WebM recording is unavailable | Check browser MediaRecorder support and permissions |
| Audio-reactive shaders do not move | Allow microphone or audio capture permission and use a shader with audio uniforms |
| External app stays Waiting | Check the app URL, iframe permissions, and whether the app uses the SDK |

## Credits

YAM8D includes adapted code from M8WebDisplay by James Deery, used under the MIT License.
