import { getDefaultStore } from 'jotai'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, } from '../connection/protocol'
import {
    cellMetricsAtom,
    cursorPosAtom,
    cursorRectAtom,
    deviceModelAtom,
    fontModeAtom,
    //highlightColorAtom, //TODO
    viewNameAtom,
    viewTitleAtom,
    titleColorAtom,
    backgroundColorAtom,
    type CursorRect,
    type RGB,
} from './viewStore'
import { getLoadedViewList, loadViewList } from '../macros/m8GraphLoader'

// Heuristics aligned with existing extraction logic
const STABILIZE_MS = 50

interface CornerCandidate {
    x: number
    y: number
    // Expected positions for verification pieces
    expectedVert: { x: number, y: number } | null // 1x2 vertical edge
    expectedTip: { x: number, y: number } | null // 1x1 tip
    foundVert: boolean
    foundTip: boolean
}

interface CursorAssembly {
    tl: CornerCandidate  // Top-left (colored, type 4)
    tr: CornerCandidate | null  // Top-right
    bl: CornerCandidate | null  // Bottom-left
    br: CornerCandidate | null  // Bottom-right
    startTime: number
    state: 'waiting' | 'building' | 'complete'
}

const defaultCursor: CursorRect = { x: 0, y: 0, w: 1, h: 1 }


class AssemblyCursorExtractor {
    // Active cursor assemblies being built
    private assemblies: CursorAssembly[] = []

    // Last detected cursor (default)
    private lastCursor: CursorRect = defaultCursor

    // Timeout for stale assemblies (ms)
    private readonly ASSEMBLY_TIMEOUT = 100

    /**
     * Process a rectangle command
     */
    processRect(rect: RectCommand): CursorRect {
        if (!rect) return defaultCursor
        const now = Date.now()

        // Clean up stale assemblies
        this.assemblies = this.assemblies.filter(a =>
            now - a.startTime < this.ASSEMBLY_TIMEOUT
        )

        // Process the rectangle against all active assemblies
        let completedCursor: CursorRect | null = null

        for (const assembly of this.assemblies) {
            if (assembly.state === 'complete') continue

            this.processRectAgainstAssembly(rect, assembly)

            if (this.isAssemblyComplete(assembly)) {
                completedCursor = this.buildCursorFromAssembly(assembly)
                assembly.state = 'complete'
            }
        }

        // If we completed a cursor, clean up and return it
        if (completedCursor) {
            this.lastCursor = completedCursor
            this.assemblies = [] // Clear all assemblies (start fresh)
            return completedCursor
        }

        // If this is a potential TL starter (type 4, 3x1), start new assembly
        if (rect.type === 4 && rect.size.width === 3 && rect.size.height === 1) {
            const newAssembly = this.createNewAssembly(rect)
            this.assemblies.push(newAssembly)

            // Keep only 2 most recent assemblies to avoid explosion
            if (this.assemblies.length > 2) {
                this.assemblies = this.assemblies.slice(-2)
            }
        }

        return this.lastCursor
    }

    /**
     * Create a new cursor assembly from TL starter
     */
    private createNewAssembly(tlRect: RectCommand): CursorAssembly {
        const tlX = tlRect?.pos.x ?? 0
        const tlY = tlRect?.pos.y ?? 0

        //console.log('found assembly starter on', tlX, tlY)

        return {
            tl: {
                x: tlX,
                y: tlY,
                expectedVert: { x: tlX, y: tlY + 1 }, // 1x2 below the 3x1
                expectedTip: { x: tlX + 1, y: tlY + 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            },
            tr: null,
            bl: null,
            br: null,
            startTime: Date.now(),
            state: 'building'
        }
    }

    /**
     * Process a rectangle against a specific assembly
     */
    private processRectAgainstAssembly(rect: RectCommand, assembly: CursorAssembly): void {
        // Check if rectangle matches any expected pattern in the assembly

        // 1. Check TL corner verification pieces
        this.checkCornerVerification(rect, assembly.tl)

        // 2. Look for TR corner (3x1, type 3, same y as TL)
        if (!assembly.tr &&
            rect.type === 3 &&
            rect.size.width === 3 &&
            rect.size.height === 1 &&
            rect.pos.y === assembly.tl.y &&
            rect.pos.x > assembly.tl.x) { // Must be to the right

            //console.log('found TR starter on', rect.pos.x, rect.pos.y)

            assembly.tr = {
                x: rect.pos.x,
                y: rect.pos.y,
                expectedVert: { x: rect.pos.x + 2, y: rect.pos.y + 1 }, // 1x2 right of the 3x1
                expectedTip: { x: rect.pos.x + 1, y: rect.pos.y + 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            }
        }

        // 3. Look for BL corner (3x1, type 3, same x as TL)
        if (!assembly.bl &&
            rect.type === 3 &&
            rect.size.width === 3 &&
            rect.size.height === 1 &&
            rect.pos.x === assembly.tl.x &&
            rect.pos.y > assembly.tl.y) { // Must be below

            //console.log('found BL starter on', rect.pos.x, rect.pos.y)

            assembly.bl = {
                x: rect.pos.x,
                y: rect.pos.y,
                expectedVert: { x: rect.pos.x, y: rect.pos.y - 2 }, // 1x2 above the 3x1
                expectedTip: { x: rect.pos.x + 1, y: rect.pos.y - 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            }
        }

        // 4. Look for BR corner (3x1, type 3)
        if (assembly.tr && assembly.bl &&
            !assembly.br &&
            rect.type === 3 &&
            rect.size.width === 3 &&
            rect.size.height === 1 &&
            rect.pos.x === assembly.tr.x &&
            rect.pos.y === assembly.bl.y) {

            //console.log('found BR starter on', rect.pos.x, rect.pos.y)

            assembly.br = {
                x: rect.pos.x,
                y: rect.pos.y,
                expectedVert: { x: rect.pos.x + 2, y: rect.pos.y - 2 }, // 1x2 above-right
                expectedTip: { x: rect.pos.x + 1, y: rect.pos.y - 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            }
        }

        // 5. Check verification pieces for other corners
        if (assembly.tr) this.checkCornerVerification(rect, assembly.tr)
        if (assembly.bl) this.checkCornerVerification(rect, assembly.bl)
        if (assembly.br) this.checkCornerVerification(rect, assembly.br)
    }

    /**
     * Check if a rectangle verifies a corner pattern
     */
    private checkCornerVerification(rect: RectCommand, corner: CornerCandidate): void {
        if (!corner.expectedVert || !corner.expectedTip) return

        // Check for 1x2 vertical edge
        if (!corner.foundVert &&
            rect.type === 3 &&
            rect.size.width === 1 &&
            rect.size.height === 2 &&
            rect.pos.x === corner.expectedVert.x &&
            rect.pos.y === corner.expectedVert.y) {
            corner.foundVert = true
        }

        // Check for 1x1 tip
        if (!corner.foundTip &&
            rect.type === 1 &&
            rect.size.width === 1 &&
            rect.size.height === 1 &&
            rect.pos.x === corner.expectedTip.x &&
            rect.pos.y === corner.expectedTip.y) {
            corner.foundTip = true
        }
    }

    /**
     * Check if assembly has enough evidence to be a complete cursor
     */
    private isAssemblyComplete(assembly: CursorAssembly): boolean {
        // Must have all 4 corners
        if (!assembly.tr || !assembly.bl || !assembly.br) {
            return false
        }

        // Basic cursor geometry checks
        const width = assembly.tr.x - assembly.tl.x
        const height = assembly.bl.y - assembly.tl.y

        // Width and height should be positive
        if (width <= 0 || height <= 0) {
            return false
        }

        // Check if corners form a proper rectangle
        if (assembly.br.x !== assembly.tr.x || assembly.br.y !== assembly.bl.y) {
            return false
        }

        // We need some verification evidence to be confident
        // Count how many corners have at least one verification piece
        const corners = [assembly.tl, assembly.tr, assembly.bl, assembly.br]
        const verifiedCorners = corners.filter(c => c.foundVert || c.foundTip).length

        // Require at least 2 corners to have verification
        return verifiedCorners >= 2
    }

    /**
     * Build final cursor rectangle from complete assembly
     */
    private buildCursorFromAssembly(assembly: CursorAssembly): CursorRect {
        // Must have all 4 corners
        if (!assembly.tr || !assembly.bl || !assembly.br) {
            return defaultCursor
        }

        // Basic cursor geometry checks
        const width = assembly.tr.x - assembly.tl.x - 1
        const height = assembly.bl.y - assembly.tl.y - 1

        // Cursor is 1 pixel inside the 3x1 edges
        const x = assembly.tl.x + 1
        const y = assembly.tl.y + 1
        const w = width
        const h = height

        return { x, y, w, h }
    }

    /**
     * Reset detection
     */
    reset(): void {
        this.assemblies = []
        this.lastCursor = { x: 0, y: 0, w: 1, h: 1 }
    }
}

export function registerViewExtractor(bus?: ConnectedBus | null) {
    if (!bus) return () => { }
    const CursorAssembly = new AssemblyCursorExtractor()
    const store = getDefaultStore()
    // Title extractor with early acceptance
    class AssemblyViewNameExtractor {
        private rowChars: Map<number, { ch: string; fg: RGB | null; bg: RGB | null }> = new Map()
        //private lastChange = 0
        private timer: ReturnType<typeof setTimeout> | null = null
        private knownViews: string[] = []
        private earlyAccepted = false

        async init() {
            try {
                await loadViewList()
                const set = getLoadedViewList()
                if (set) this.knownViews = Array.isArray(set) ? (set as string[]) : Array.from(set as Set<string>)
            } catch { /* no-op */ }
        }

        private normForCompare(s: string) {
            s = s.includes('live') ? 'song' : s
            return s.toLowerCase().trim().replace(/}/g, '0').replace(/[^a-z0-9]/g, '')
        }

        private normalizeFinal(titleRaw: string) {
            // Trim, remove trailing hex token and optional ^/*, strip spaces/punct, lower, cap 20
            const trimmed = titleRaw.trim()

            // biome-ignore lint/complexity/noUselessEscapeInRegex: needed for * or ^
            const noTrail = trimmed.replace(/}/g, '0').replace(/\s[0-9a-fA-F]{1,2}[\^\*]?\s*$/, '')
            const cleaned = noTrail.replace(/[^a-z0-9 ]/gi, '').replace(/\s+/g, ' ').trim()
            const noSpaces = cleaned.replace(/\s+/g, '').toLowerCase().slice(0, 20)
            return noSpaces.includes('live') ? 'song' : noSpaces
        }

        private pickColors() {
            // pick first non-space char colors
            const entries = Array.from(this.rowChars.entries()).sort((a, b) => a[0] - b[0])
            for (const [, v] of entries) {
                if (v.ch?.trim()) return { fg: v.fg, bg: v.bg }
            }
            return { fg: null as RGB | null, bg: null as RGB | null }
        }

        private emitStable() {
            const entries = Array.from(this.rowChars.entries()).sort((a, b) => a[0] - b[0])
            const raw = entries.map(([, v]) => v.ch || ' ').join('')
            const normalized = this.normalizeFinal(raw)
            const { fg, bg } = this.pickColors()
            store.set(viewTitleAtom, raw || null)
            store.set(titleColorAtom, fg)
            store.set(backgroundColorAtom, bg)
            store.set(viewNameAtom, normalized || null)
        }

        private tryEarlyAccept(currentGx: number) {
            if (this.earlyAccepted) return true
            if (!this.knownViews || this.knownViews.length === 0) return false
            // Build partial from 0..currentGx (inclusive), preserving spaces
            const upto = Math.max(0, Math.min(currentGx, 39))
            const partialRaw = Array.from({ length: upto + 1 }, (_, i) => this.rowChars.get(i)?.ch || ' ').join('')
            const partial = this.normForCompare(partialRaw)
            if (!partial || partial.length < 2) return false
            const candidates = this.knownViews.filter((v) => v.startsWith(partial))
            if (candidates.length === 1) {
                const pick = candidates[0].slice(0, 20)
                const { fg, bg } = this.pickColors()
                store.set(viewTitleAtom, partialRaw)
                store.set(titleColorAtom, fg)
                store.set(backgroundColorAtom, bg)
                store.set(viewNameAtom, pick)
                this.earlyAccepted = true
                return true
            }
            return false
        }

        processChar(cmd: CharacterCommand) {
            const { cellW, cellH, offX, offY } = store.get(cellMetricsAtom)
            // Round to reduce off-by-one from offsets
            const gx = Math.round((cmd.pos.x - offX) / cellW)
            const gy = Math.round((cmd.pos.y - offY) / cellH)

            // If we observe rows beyond the title area, finalize immediately
            if (gy > 4) {
                if (this.rowChars.size > 0) {
                    if (this.timer) { clearTimeout(this.timer); this.timer = null }
                    this.emitStable()
                }
                return
            }

            // Title row detection: based on debug logs, title consistently at gy==3
            // across font modes (Model:02 + Headless). Narrow acceptance to row 3
            // to reduce noise and speed early acceptance.
            if (gy !== 3) return

            if (gx >= 30) return // cap title length to 20

            this.rowChars.set(gx, { ch: cmd.character, fg: cmd.foreground, bg: cmd.background })
            //this.lastChange = Date.now()

            // Early acceptance attempt
            if (this.tryEarlyAccept(gx)) {
                // continue to collect for full colors/raw title
            }

            if (this.timer) clearTimeout(this.timer)
            this.timer = setTimeout(() => {
                // If no match yet, accept stabilized buffer
                this.emitStable()
            }, STABILIZE_MS)
        }

        reset() {
            this.rowChars.clear()
            if (this.timer) {
                clearTimeout(this.timer)
                this.timer = null
            }
            this.earlyAccepted = false
        }
    }

    const extractor = new AssemblyViewNameExtractor()
    void extractor.init()

    // Temporary debug capture removed

    const cursorExtractor = (data: RectCommand) => {
        if (!data) return
        const { cellW, cellH, offX, offY } = store.get(cellMetricsAtom)
        const { x, y, w, h } = CursorAssembly.processRect(data)
        const centerPxX = x + (x + w) / 2
        const centerPxY = y + (y + h) / 2
        const gx = Math.round((centerPxX - offX) / cellW)
        const gy = Math.round((centerPxY - offY) / cellH)

        const prevPos = store.get(cursorPosAtom)
        if (!prevPos || prevPos.x !== gx || prevPos.y !== gy) {
            store.set(cursorPosAtom, { x: gx, y: gy })
            store.set(cursorRectAtom, { x, y, w, h })
        }
    }

    const systemInfoHandler = (info: { model: string; fontMode: 0 | 1 | 2; spacingX: number; spacingY: number; offX: number; offY: number; screenWidth?: number; screenHeight?: number }) => {
        store.set(deviceModelAtom, info.model)
        store.set(fontModeAtom, info.fontMode)
        store.set(cellMetricsAtom, { cellW: info.spacingX, cellH: info.spacingY, offX: info.offX, offY: info.offY })
    }

    const onText = (d: CharacterCommand) => extractor.processChar(d)
    bus.protocol.eventBus.on('text', onText)
    bus.protocol.eventBus.on('rect', cursorExtractor)
    bus.protocol.eventBus.on('systemInfo', systemInfoHandler)

    return () => {
        bus.protocol.eventBus.off('text', onText)
        bus.protocol.eventBus.off('rect', cursorExtractor)
        bus.protocol.eventBus.off('systemInfo', systemInfoHandler)
        extractor.reset()
    }
}
