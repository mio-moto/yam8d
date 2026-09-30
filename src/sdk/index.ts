// M8 SDK - SDK for creating iframe applications that interact with yam8d

// Types
export type {
    M8State,
    M8HostMethods,
    M8ClientMethods,
    M8HostEvents,
    M8ClientEvents,
    M8SdkConfig,
    CursorPos,
    CursorRect,
    RGB,
    SystemInfos,
} from './types'

// Host-side hook (for yam8d application)
export { useM8SdkHost } from './useM8SdkHost'

// Client-side library for iframe applications: see packages/m8-sdk (@yam8d/m8-sdk)
