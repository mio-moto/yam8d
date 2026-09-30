import { pressKeys } from '../../features/connection/keys'
import { getScreenLines, SCREEN_ROWS } from '../../features/state/viewExtractor'
import type { M8HostMethods, M8KeyName } from '../types'
import type { HostIO } from './hostIO'
import { getCurrentState, textGridToPixel } from './hostState'
import type { createValueEditors } from './valueEditors'

const SCREEN_COLUMNS = 40

const keyNamesToMask = (keys: M8KeyName[]) =>
    pressKeys({
        left: keys.includes('left'),
        right: keys.includes('right'),
        up: keys.includes('up'),
        down: keys.includes('down'),
        shift: keys.includes('shift'),
        play: keys.includes('play'),
        opt: keys.includes('opt'),
        edit: keys.includes('edit'),
    })

export type HostMethodsDeps = {
    io: HostIO
    editors: ReturnType<typeof createValueEditors>
    setValueFloat: (targetFloat: number) => Promise<boolean>
    browseFile: (targetText: string, exact: boolean) => Promise<boolean>
    navigateToView: (viewName: string) => Promise<void>
    navigateTo: (point: { x: number; y: number }) => Promise<void>
}

/** The methods a client iframe can call on the host (transport-agnostic). */
export const createHostMethods = ({ io, editors, setValueFloat, browseFile, navigateToView, navigateTo }: HostMethodsDeps): M8HostMethods => {
    const { debugLog, hasBus, sendKeys, pressAndRelease } = io

    // Wrap a method so it warns and returns `fallback` when no M8 is connected
    const guarded = <A extends unknown[], R>(name: string, fallback: R, fn: (...args: A) => Promise<R>) =>
        async (...args: A): Promise<R> => {
            if (!hasBus()) {
                console.warn(`[M8SDK] ${name}: no bus connection`)
                return fallback
            }
            return fn(...args)
        }

    return {
        navigateToView: guarded('navigateToView', false, async (viewName: string): Promise<boolean> => {
            debugLog('[M8SDK] Executing navigateToView:', viewName)
            await navigateToView(viewName)
            return true
        }),
        navigateTo: guarded('navigateTo', undefined, async (gridX: number, gridY: number): Promise<void> => {
            // Convert text grid coordinates (0-39, 0-23) to pixel coordinates
            await navigateTo(textGridToPixel(gridX, gridY))
        }),
        setValueToHex: guarded('setValueToHex', false, async (hex: number): Promise<boolean> => {
            debugLog('[M8SDK] Executing setValueToHex:', hex)
            return editors.setValueToHex(hex)
        }),
        setValueToInt: guarded('setValueToInt', false, async (targetInt: number): Promise<boolean> => {
            debugLog('[M8SDK] Executing setValueToInt:', targetInt)
            return editors.setValueToInt(targetInt)
        }),
        setValueFloat: guarded('setValueFloat', false, async (targetFloat: number): Promise<boolean> => {
            debugLog('[M8SDK] Executing setValueFloat:', targetFloat)
            return setValueFloat(targetFloat)
        }),
        setNote: guarded('setNote', false, async (noteString: string): Promise<boolean> => {
            debugLog('[M8SDK] Executing setNote:', noteString)
            return editors.setNote(noteString)
        }),
        setValueToString: guarded('setValueToString', false, async (targetString: string, exact: boolean = true, searchInCurrentLine: boolean = false): Promise<boolean> => {
            debugLog('[M8SDK] Executing setValueToString:', { targetString, exact, searchInCurrentLine })
            return editors.setValueToString(targetString, exact, searchInCurrentLine)
        }),
        browseFile: guarded('browseFile', false, async (targetText: string, exact: boolean = true): Promise<boolean> => {
            debugLog('[M8SDK] Executing browseFile:', { targetText, exact })
            return browseFile(targetText, exact)
        }),
        sendKeyDown: guarded('sendKeyDown', undefined, async (keys: M8KeyName[]): Promise<void> => {
            debugLog('[M8SDK] Executing sendKeyDown:', keys)
            sendKeys(keyNamesToMask(keys))
        }),
        sendKeyUp: guarded('sendKeyUp', undefined, async (): Promise<void> => {
            debugLog('[M8SDK] Executing sendKeyUp')
            sendKeys(0)
        }),
        sendKeyPress: guarded('sendKeyPress', undefined, async (keys: M8KeyName[]): Promise<void> => {
            debugLog('[M8SDK] Executing sendKeyPress:', keys)
            await pressAndRelease(keyNamesToMask(keys))
        }),
        getState: async () => getCurrentState(),
        getScreen: async () => ({ width: SCREEN_COLUMNS, height: SCREEN_ROWS, lines: getScreenLines() }),
    }
}
