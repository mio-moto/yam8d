export type {
  CursorPos,
  CursorRect,
  M8ClientEvents,
  M8ClientMethods,
  M8ClientMode,
  M8DeviceBus,
  M8DeviceConnectOptions,
  M8DeviceEvents,
  M8DeviceSupport,
  M8DeviceTransport,
  M8HostEvents,
  M8HostMethods,
  M8KeyName,
  M8Screen,
  M8ScreenCells,
  M8SdkConfig,
  M8State,
  M8TransportEvent,
  RGB,
  SystemInfos,
} from './types'

export { createM8Client, createM8ClientSync, getDeviceSupport, type M8Client, type M8Snapshot, YAM8D_FRAME_NAME } from './client'

// The engine behind standalone mode, for apps that want to drive the device at a lower level
export { connection as createM8Connection, type ConnectedBus as M8ConnectedBus, type M8ConnectOptions } from './engine/connection'
export { createM8Audio, getM8InputStream, type M8Audio, M8_AUDIO_CAPTURE_CONSTRAINTS } from './engine/audio'
export { createM8Engine, type M8Engine, type M8EngineOptions } from './engine/engine'
export { M8KeyMask, pressKeys } from './engine/keys'
export type { M8MacroStatus, M8Store, M8StoreKey, M8StoreState } from './engine/store'

export {
  getSemanticContext,
  parseGridScreen,
  readPlayPositions,
  parseViewTitle,
  SCREEN_MARGIN,
  describeContext,
  describeContextParts,
  formatFieldValue,
  lookupFxCommand,
  getInstrumentFxCommands,
  RELATIVE_FX_RULE,
  type M8FieldType,
  type M8ParsedField,
  type M8ParsedRow,
  type M8ScreenGridRow,
  type M8PlayPositions,
  type M8ActiveField,
  type M8SemanticContext,
  type M8DescriptionPart,
  type M8DescriptionPartKind,
  type M8FileKind,
  type M8FxCommandInfo,
  type M8InstrumentFxList,
  type M8FxLaneTrace,
  type M8RelativeFxState,
  type M8ScaleInfo,
  type M8ScaleNote,
} from './viewContext'

export {
  parseThemeScreen,
  observeThemeColors,
  M8_THEME_ROLES,
  M8_THEME_VIEW,
  type M8Theme,
  type M8ThemeRole,
} from './theme'

export { default } from './client'
