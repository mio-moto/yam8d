// M8 SDK - SDK for creating iframe applications that interact with yam8d

// Types
export type {
    M8State,
    M8HostMethods,
    M8ClientMethods,
    M8HostEvents,
    M8ClientEvents,
    M8SdkConfig,
    ViewNavigationTarget,
    CoordinateNavigationTarget,
    NavigationTarget,
    CursorPos,
    CursorRect,
    RGB,
    SystemInfos,
} from './types'

// Host-side hook (for yam8d application)
export { useM8SdkHost } from './useM8SdkHost'

// Client-side library (for iframe applications)
export {
    createM8Client,
    createM8ClientSync,
    type M8Client,
} from './client'

// Default exports
export { default } from './client'
