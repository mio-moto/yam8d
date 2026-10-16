// The M8 engine: device connection, protocol, screen state, navigation and the SDK host
// methods. Used by yam8d (host) and by the standalone client.

export type { EngineBus, ProtocolEventBus } from './bus'
export { connectWithRetry } from './connectWithRetry'
export { type ConnectedBus, connection, decode7BitPacked, type M8ConnectOptions, type M8DeviceTransport } from './connection'
export { type CursorNavigator, createCursorNavigator, type Point } from './cursorNavigator'
export { createM8Engine, type M8Engine, type M8EngineOptions } from './engine'
export { createEventBus } from './eventBus'
export { isDown, isEdit, isLeft, isOpt, isPlay, isRight, isShift, isUp, M8KeyMask, pressKeys } from './keys'
export { createMacroRunner, type MacroRunner } from './macroRunner'
export {
  type CharacterCommand,
  type KeyCommand,
  type ProtocolEvents,
  protocol,
  type RectCommand,
  type SystemCommand,
  type SystemInfos,
  type WaveCommand,
} from './protocol'
export { createSlipParser, queuedSerialReader, queuedUsbReader } from './queuedReaders'
export {
  createM8Store,
  type M8CellMetrics,
  type M8MacroStatus,
  type M8Store,
  type M8StoreKey,
  type M8StoreState,
  type M8SystemInfo,
} from './store'
export { type DrawEventSource, registerViewExtractor, SCREEN_COLUMNS, SCREEN_ROWS, type ScreenCellColors, type ViewExtractor } from './viewExtractor'
export { getViewGraph, getViewNames, type M8ViewGraph } from './viewGraph'
export { createViewNavigation, toKeyMasks, type ViewNavigation } from './viewNavigation'
