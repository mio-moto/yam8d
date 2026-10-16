// One M8 engine (packages/m8-sdk/src/engine) per connected bus. The engine owns screen state,
// navigation and the SDK methods; its store is mirrored into the jotai atoms the UI reads.

import { getDefaultStore } from 'jotai'
import { useMemo } from 'react'
import type { ConnectedBus } from '../../packages/m8-sdk/src/engine/connection'
import { createM8Engine, type M8Engine } from '../../packages/m8-sdk/src/engine/engine'
import type { M8StoreKey } from '../../packages/m8-sdk/src/engine/store'
import {
    backgroundColorAtom,
    cellMetricsAtom,
    currentLineAtom,
    cursorColorAtom,
    cursorPosAtom,
    cursorRectAtom,
    deviceModelAtom,
    fontModeAtom,
    highlightColorAtom,
    minimapKeyAtom,
    selectionModeAtom,
    systemInfoAtom,
    textUnderCursorAtom,
    titleColorAtom,
    viewNameAtom,
    viewTitleAtom,
} from './state/viewStore'

// biome-ignore lint/suspicious/noExplicitAny: atoms of different value types, written with values of the matching store key
const mirroredAtoms: Partial<Record<M8StoreKey, any>> = {
    viewName: viewNameAtom,
    viewTitle: viewTitleAtom,
    minimapKey: minimapKeyAtom,
    cursorPos: cursorPosAtom,
    cursorRect: cursorRectAtom,
    selectionMode: selectionModeAtom,
    highlightColor: highlightColorAtom,
    cursorColor: cursorColorAtom,
    textUnderCursor: textUnderCursorAtom,
    currentLine: currentLineAtom,
    titleColor: titleColorAtom,
    backgroundColor: backgroundColorAtom,
    deviceModel: deviceModelAtom,
    fontMode: fontModeAtom,
    cellMetrics: cellMetricsAtom,
    systemInfo: systemInfoAtom,
}

const engines = new WeakMap<ConnectedBus, M8Engine>()

/**
 * The engine of `bus`, created on first use. Create it before asking the M8 for a screen
 * redraw, so the extractor sees the whole first frame.
 */
export const getM8Engine = (bus: ConnectedBus): M8Engine => {
    let engine = engines.get(bus)
    if (engine) return engine

    // yam8d's own keyboard input cancels running macros (as before the engine existed)
    engine = createM8Engine(bus, { cancelMacroOnKeydown: true })
    const jotai = getDefaultStore()
    const store = engine.store
    for (const [key, atom] of Object.entries(mirroredAtoms) as [M8StoreKey, unknown][]) {
        jotai.set(atom as Parameters<typeof jotai.set>[0], store.get(key) as never)
    }
    store.subAll((key) => {
        const atom = mirroredAtoms[key]
        if (atom) jotai.set(atom, store.get(key))
    })
    engines.set(bus, engine)
    return engine
}

export const useM8Engine = (bus: ConnectedBus | undefined): M8Engine | undefined => useMemo(() => (bus ? getM8Engine(bus) : undefined), [bus])
