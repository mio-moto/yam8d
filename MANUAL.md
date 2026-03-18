# The Ultimate Web Companion for Your Dirtywave M8

Welcome to **yam8d** — your all-in-one browser-based cockpit for the Dirtywave M8 tracker. This isn't just a display; it’s a creative accelerator, a learning partner, a performance sidekick, and a content studio, all wrapped into one sleek web app.

Whether you're sketching out your first track, speeding through an intricate arrangement, practicing with interactive tutorials, or recording a video with slick visual effects—yam8d is built to supercharge your workflow.

## What Can yam8d Do for You?

Imagine controlling your M8 from your computer keyboard, clicking buttons on screen, playing a virtual piano, jumping between views instantly, and recording high-quality videos with trippy shader backgrounds—all directly in your browser, with no extra software. That's yam8d.

### Here’s your creative toolkit:

* **Live Screen Mirroring:** See your M8 screen in real-time.
* **Multi-Control Power:** Use your keyboard, gamepad, mouse, or touch.
* **Speed Navigation:** Instantly jump to any screen (Song, Phrase, Instrument, etc.).
* **Learn & Create:** Integrated interactive shortcut guides and (coming soon) tutorial games.
* **Build Tools:** Developers can create custom editors and tools using the yam8d SDK.
* **Virtual Piano:** Play notes directly into the M8 with an on-screen keyboard.
* **Visual Studio:** Record videos with the M8 screen and custom, audio-reactive visual effects.
* **Fully Customizable:** Remap every key, tweak the display, and save your perfect setup.

Ready to fly? Let’s get connected.

---

## Get Connected in 60 Seconds

**You’ll need:**

* Your **Dirtywave M8**, powered on and connected via USB.
* A modern browser like **Chrome, Edge, or Opera** (they support the necessary Web features).

**Follow these steps:**

1. Go to the yam8d website.
2. Click the big **"Connect"** button.
3. Your browser will ask for permission to connect to a device—select your M8 and approve.
4. That’s it! Watch your M8 screen appear live in the browser.

> **💡 Connection Tip:** yam8d will automatically choose the best way to talk to your M8 (WebSerial is preferred). Just make sure your M8 is on before you hit connect!

![Step-by-step connection guide showing the connect button and browser device permission prompt](/manual-screenshots/connect-flow.png)

---

## Master Your Controls

Control your M8 your way. Mix and match these methods to find your flow.

### Keyboard Pilot**

Map your keyboard to feel like a native M8. The default setup lets you start immediately:

| Press This Key → | Controls This M8 Button |
| :--- | :--- |
| `Arrow Keys` | D-Pad (Up, Down, Left, Right) |
| `Left Shift` | **Shift** |
| `Spacebar` | **Play** |
| `Z` | **Option** |
| `X` | **Edit** |

*Want to change it?* Go to **Settings → Keyboard Mapping** and create your perfect control scheme.

### **Mouse & Touch Navigator**

* **Click the M8 Body:** The on-screen replica has clickable buttons. Want to press **OPT**? Just click it!
* **Click the Screen:** Click anywhere on the live M8 display to instantly guide the cursor there. Perfect for fast edits.

### **Gamepad Support**

Plug in a gamepad (like an Xbox or PlayStation controller). yam8d will recognize it, letting you navigate with the D-pad and assign other buttons—great for a comfy, hands-on feel.

### **Macro View Jumps (The Speed Secret)**

Stop shifting the d-pad. Get to the screen you need *instantly*.

| Hotkey | Takes You To |
| :--- | :--- |
| `F1` | **Song** view |
| `F2` | **Chain** view |
| `F3` | **Phrase** view |
| `F4` | **Table** view |
| `F5` | **Instrument Pool** |
| `F6` | Selected **Instrument** |
| `F7` | Instrument **Modifiers** |
| `F8` | **Effect** Settings |
| `F9` | **Project** Settings |
| `Page Up` | Macro: **Shift + Up** |
| `Page Down` | Macro: **Shift + Down** |

**Pro Tip:** Press any other key to instantly exit a macro and take manual control.

---

## Integrated Learning & Tools Hub

yam8d isn't just about control; it's about growth and efficiency.

### **Interactive Shortcuts Library**

Forgot a command? Open the **Shortcuts Panel** to see a context-aware cheat sheet right beside your M8 screen. It updates based on the view you're in!

![The yam8d interface with the shortcuts panel open next to the M8 screen](/manual-screenshots/shortcuts-panel.png)

### **The yam8d SDK (For Builders)**

Want to build a custom chord generator, a parameter randomizer, or a practice game? Our JavaScript SDK lets any web app (loaded in the shortcuts panel) communicate with your live M8. The possibilities are endless.

```javascript
// Example: Jump to the Phrase editor from your custom app
await m8.navigateToView("phrase");
```

---

## Virtual MIDI Keyboard

No external controller? No problem. Activate the virtual keyboard to play melodies, basslines, and chords directly into your M8.

* Use the **octave strips** to shift range with mouse or keys `-` and `=`.
* Adjust **velocity** with keys `[` and `]`.
* **Default typing keys:** `A W S E D F T G Y H U J K O L P ; '`

![The virtual keyboard overlay with piano keys and octave controls](/manual-screenshots/virtual-keyboard.png)

---

## Record & Share Your Sessions

Create shareable videos of your jams or tracks directly from yam8d.

1. **Choose your source:** Record just the M8 screen (perfect for including shader backgrounds) or your entire browser tab.
2. **Include audio:** Capture your M8's sound output.
3. **Start/Stop recording** with the in-app controls.
4. **Download** a ready-to-share `.webm` video file.

**Ideal for:** Sharing on social media, creating tutorials, or documenting your workflow.

---

## Tweak Your Experience: The Settings Menu

Open the menu (☰) in the top-left to fine-tune everything.

| Category | What It Does |
| :--- | :--- |
| **Display** | Show/hide the M8 body shell, enable "Zoom View" for a tighter layout. |
| **Rendering** | Make the text look smoother (with Blur, Threshold, and Smoothness sliders). |
| **Background Shader** | Enable animated, audio-reactive visual backgrounds. This is where the magic happens! |
| **Shader Editor** | Open the built-in editor to write your own GLSL shaders or load presets. |
| **Virtual Keyboard** | Show or hide the on-screen piano. |
| **Keyboard Mapping** | Open the deep customization panel to remap every key. |
| **Shortcuts Panel** | Control the integrated shortcuts library (show/hide, change source URL). |

---

## Advanced Playground: Background Shaders

Transform yam8d into an audio-visual experience. Enable **Background Shader** mode to replace the plain background with dynamic, generated art that reacts to your M8's audio.

* **Shader Editor:** A live coding panel where you can write or paste GLSL fragment shaders.
* **Audio-Reactive Uniforms:** Your shader code has access to live audio frequency data (`audioFFT`), volume (`audioLevel`), and time—perfect for building visualizers.
* **Preset System:** Save, load, and manage your favorite shader creations locally in your browser.

![The shader editor interface with code on the left and a live preview on the right](/manual-screenshots/shader-editor.png)

**Quick Start with Shaders:**

1. Open **Settings → Background Shader → ON**.
2. Click **"Open Shader Editor"**.
3. Try a preset or paste in your own GLSL code.
4. Click **"Apply Shader"** to see it live!

---

## FAQ & Good to Know

* **Is my data safe?** Yes. All settings (keymaps, shaders) are saved in your browser's local storage. No data is sent to the cloud.
* **Which browser is best?** Chrome, Edge, or Opera for full support. Firefox and Safari lack key connection features.
* **The connection failed!** Ensure your M8 is on and connected before clicking "Connect". Refresh the page and try again.
* **Recording doesn't work?** Check that your browser supports `MediaRecorder` and that you've allowed audio/video permissions if needed.

---

## Credits & Thanks

yam8d stands on the shoulders of giants. It includes adapted code from the excellent **[M8WebDisplay](https://github.com/derkyjadex/M8WebDisplay/)** by James Deery, used under the MIT License.

---

## Ready, Set, Create!

You're now equipped to use yam8d not just as a display, but as a comprehensive creative environment for your Dirtywave M8. Whether you're here to learn, to build, to perform, or to share—your workflow is about to get a whole lot faster and a whole lot more fun.

**Happy tracking!**

<!-- Placeholder images to be replaced with actual screenshots -->
![View of the main yam8d interface with M8 screen and controls](/manual-screenshots/main-interface.png)
![Example of a custom shader background reacting to music](/manual-screenshots/shader-example.png)
![The keyboard mapping configuration screen](/manual-screenshots/keyboard-mapper.png)