# yam8d Manual

**yam8d** (Yet Another M8 Display) is a web-based display for the Dirtywave M8 tracker. It uses WebUSB, WebSerial, or WebMIDI to communicate with your M8 device.

## Getting Started

### Browser Requirements

yam8d requires a browser that supports one of the following:

- **WebSerial** - Recommended for serial connection
- **WebUSB** - For USB connection
- **WebMIDI** - For MIDI connection (requires SysEx support)

Chrome, Edge, and Opera are recommended. Firefox and Safari do not support WebSerial or WebUSB.

### Connecting

1. Connect your M8 device to your computer via USB
2. Power on the M8
3. Click the **Connect** button
4. Select your M8 device from the browser prompt

## Keyboard Controls

### M8 Button Mapping

| Keyboard Key    | M8 Button   |
| --------------- | ----------- |
| `↑` Arrow Up    | D-Pad Up    |
| `↓` Arrow Down  | D-Pad Down  |
| `←` Arrow Left  | D-Pad Left  |
| `→` Arrow Right | D-Pad Right |
| `Shift` (Left)  | Shift       |
| `Space`         | Play        |
| `Z`             | Option      |
| `X`             | Edit        |

### Quick Navigation (F-Keys)

| Key        | Navigates To       |
| ---------- | ------------------ |
| `F1`       | Song View          |
| `F2`       | Chain View         |
| `F3`       | Phrase View        |
| `F4`       | Table View         |
| `F5`       | Instrument Pool    |
| `F6`       | Instrument         |
| `F7`       | Instrument Mods    |
| `F8`       | Effect Settings    |
| `F9`       | Project View       |
| `PageUp`   | Shift+Up (macro)   |
| `PageDown` | Shift+Down (macro) |

## Settings Menu

Click the menu icon in the top-left corner to access settings:

| Setting                      | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| **Show M8 Body**             | Toggle the M8 device visualization around the screen      |
| **Zoom View**                | Fill the screen with just the M8 display (no device body) |
| **Smooth Rendering**         | Enable sub-pixel smoothing for better text readability    |
| **Virtual MIDI Keyboard**    | Show an on-screen piano keyboard for note input           |
| **Display Shortcuts**        | Show contextual keyboard shortcuts panel                  |
| **Keyboard Mapping**         | Customize which keyboard keys map to M8 buttons           |
| **Virtual Keyboard Mapping** | Customize MIDI keyboard key bindings                      |

### Smooth Rendering Options

When smooth rendering is enabled, you can adjust:

- **Blur Radius** - Controls sub-pixel blur amount
- **Threshold** - Pixel intensity threshold for smoothing
- **Smoothness** - Overall smoothing intensity

## Virtual MIDI Keyboard

When enabled, a virtual piano keyboard appears above the M8 display. Click on the piano keys to send MIDI notes to the M8.

- **Click an octave** to change the current octave (0-9)
- The **velocity indicator** shows the current note velocity
- Use the **Virtual Keyboard Mapping** settings to configure computer keyboard input

## Tips & Troubleshooting

- If connection fails, try refreshing the page and reconnecting
- For MIDI connection, ensure SysEx is enabled in your browser's MIDI settings
- The quick navigation keys (F1-F9) will automatically navigate through menus to reach the target view
- Pressing any key will preempt a running navigation macro

## Credits

This project includes code derived from [M8WebDisplay](https://github.com/derkyjadex/M8WebDisplay/), © 2021-2022 James Deery, used under the MIT License.
