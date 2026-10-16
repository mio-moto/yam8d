export interface CursorPos {
  x: number
  y: number
}

export interface CursorRect {
  x: number
  y: number
  w: number
  h: number
}

export interface RGB {
  r: number
  g: number
  b: number
}

export interface SystemInfos {
  [key: string]: string | number | boolean | undefined
}

export interface M8State {
  viewName: string | null
  viewTitle: string | null
  minimapKey: string | null
  cursorPos: CursorPos | null
  cursorRect: CursorRect | null
  selectionMode: boolean
  highlightColor: RGB | null
  titleColor: RGB | null
  backgroundColor: RGB | null
  /**
   * Colour of the cursor rectangle as last drawn. The M8 animates the cursor, so it is not
   * the theme's CURSOR colour (read that with parseThemeScreen). Absent before SDK 0.5.
   */
  cursorColor?: RGB | null
  textUnderCursor: string | null
  currentLine: string | null
  deviceModel: string | null
  fontMode: number | null
  systemInfo: SystemInfos | null
  macroRunning: boolean
  macroCurrentStep?: number
  macroSequenceLength?: number
}

export interface M8Screen {
  width: number
  height: number
  /** One string per screen row; columns preserved, trailing spaces trimmed. */
  lines: string[]
}

/**
 * The screen with the colour of every character cell, for apps that want to look like
 * the device (or learn which theme colour the M8 uses for what).
 */
export interface M8ScreenCells extends M8Screen {
  /** fg[row][col]: foreground colour as '#rrggbb'; null where no character was drawn. Each row has `width` entries. */
  fg: (string | null)[][]
  /** bg[row][col]: background colour behind the character, same layout as `fg`. */
  bg: (string | null)[][]
}

export type M8KeyName = 'left' | 'right' | 'up' | 'down' | 'shift' | 'play' | 'opt' | 'edit'

/**
 * MIDI clock / transport from the M8 (SYNC OUT in its MIDI Settings, stored per song).
 * `at` is epoch milliseconds (performance.timeOrigin + timestamp), comparable across frames.
 * `clock` comes once per sixteenth (6 ticks at 24 PPQ); `ticks` counts clock ticks since the
 * host started listening (monotonic: the M8 can send clock while stopped and without Start);
 * `msPerTick` is the measured tick length, null until known.
 */
export interface M8TransportEvent {
  kind: 'start' | 'stop' | 'continue' | 'clock' | 'position'
  ticks: number
  at: number
  msPerTick: number | null
  /** Song Position Pointer (sixteenths), on 'position' events. */
  spp?: number
}

export interface M8HostMethods {
  navigateToView(viewName: string): Promise<boolean>
  navigateTo(x: number, y: number): Promise<void>
  setValueToHex(targetHex: number): Promise<boolean>
  setValueToInt(targetInt: number): Promise<boolean>
  setValueFloat(targetFloat: number): Promise<boolean>
  setNote(noteString: string): Promise<boolean>
  setValueToString(targetString: string, exact?: boolean, searchInCurrentLine?: boolean): Promise<boolean>
  browseFile(targetText: string, exact?: boolean): Promise<boolean>
  sendKeyPress(keys: M8KeyName[]): Promise<void>
  sendKeyDown(keys: M8KeyName[]): Promise<void>
  sendKeyUp(): Promise<void>
  getState(): Promise<M8State>
  getScreen(): Promise<M8Screen>
  getScreenCells(): Promise<M8ScreenCells>
  enableMidiTransport(): Promise<{ ok: boolean; error?: string }>
}

export interface M8ClientMethods {
  ping(): Promise<string>
}

export interface M8HostEvents {
  stateChanged: M8State
  viewChanged: { viewName: string | null; viewTitle: string | null }
  cursorMoved: { pos: CursorPos | null; rect: CursorRect | null; selectionMode: boolean }
  textUpdated: { textUnderCursor: string | null; currentLine: string | null }
  keyPressed: { keys: number }
  transport: M8TransportEvent
}

export interface M8ClientEvents {
  ready: undefined
  error: { message: string }
}

/** 'host': yam8d owns the M8 and the app talks to it from an iframe. 'standalone': the app connects to the M8 itself. */
export type M8ClientMode = 'host' | 'standalone'

/** The browser API a standalone client uses to reach the M8. */
export type M8DeviceTransport = 'serial' | 'usb' | 'midi'

export interface M8SdkConfig {
  debug?: boolean
  /**
   * 'auto' (default): use the yam8d host when the page runs in a yam8d External Apps iframe,
   * otherwise connect to the M8 from this page. 'host' and 'standalone' force one mode.
   */
  mode?: 'auto' | M8ClientMode
  /**
   * Auto mode in an iframe that yam8d did not mark: how long to wait for a host handshake
   * before going standalone. Default 3000 ms.
   */
  handshakeTimeoutMs?: number
  /**
   * Standalone: at connect, reopen a device this page was granted before, without a prompt.
   * Default true. A first connection always needs connectDevice() from a user gesture.
   */
  autoConnect?: boolean
}

export interface M8DeviceConnectOptions {
  /** 'auto' (default) picks Web Serial, then WebUSB, then Web MIDI SysEx, by browser support. */
  transport?: 'auto' | M8DeviceTransport
  /** Also play the M8's USB audio through the page (see M8Client.connectAudio). Default false. */
  audio?: boolean
}

/** Which device APIs this browser offers for standalone mode. */
export interface M8DeviceSupport {
  serial: boolean
  usb: boolean
  midi: boolean
}

/**
 * Low-level access to the M8 a standalone client is connected to: the raw draw / key /
 * system events and the device commands. For apps that render the screen themselves or
 * play notes; everything else is simpler through the client methods.
 */
export interface M8DeviceBus {
  readonly transport: M8DeviceTransport
  readonly events: {
    on<K extends keyof M8DeviceEvents>(event: K, callback: (data: M8DeviceEvents[K]) => void): void
    off<K extends keyof M8DeviceEvents>(event: K, callback: (data: M8DeviceEvents[K]) => void): void
  }
  readonly commands: {
    /** Raw key mask (see M8KeyMask); 0 releases every key. */
    sendKeys(keys: number): void
    /** Asks the M8 to redraw the whole screen. */
    resetScreen(): void
    sendNoteOn(note: number, velocity: number): void
    sendNoteOff(): void
    sendProgramChange(program: number, channel?: number): void
  }
}

/** Payloads of the M8 display protocol, in M8 pixel coordinates. */
export interface M8DeviceEvents {
  text: { character: string; pos: { x: number; y: number }; foreground: RGB; background: RGB }
  rect: { type: number; pos: { x: number; y: number }; size: { width: number; height: number }; color?: RGB }
  wave: { color: RGB; wave: number[] }
  key: { keys: number }
  system: { model: string; version: string; fontMode: 0 | 1 | 2 }
}
