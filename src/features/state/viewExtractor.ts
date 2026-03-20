import { getDefaultStore } from 'jotai'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, } from '../connection/protocol'
import {
    cellMetricsAtom,
    cursorPosAtom,
    cursorRectAtom,
    deviceModelAtom,
    fontModeAtom,
    systemInfoAtom,
    highlightColorAtom,
    textUnderCursorAtom,
    currentLineAtom,
    viewNameAtom,
    viewTitleAtom,
    titleColorAtom,
    backgroundColorAtom,
    selectionModeAtom,
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


interface SelectionRectSample {
    x: number
    y: number
    w: number
    h: number
    ts: number
    hasColor: boolean
}

class AssemblyCursorExtractor {
    // Active cursor assemblies being built
    private assemblies: CursorAssembly[] = []

    // Recent 1px-border segments used to detect selection rectangles
    private selectionRectSamples: SelectionRectSample[] = []

    // Last cursor from the corner-based assembly. NEVER written by selection detection.
    private lastCursor: CursorRect = defaultCursor

    // Last selection rectangle (separate from lastCursor to avoid cross-contamination)
    private lastSelectionCursor: CursorRect | null = null

    // Last detected cursor color (from type 4 rectangles)
    private lastCursorColor: RGB | null = null

    // Selection mode tracking
    private lastSelectionMode = false
    private lastSelectionSeenAt = 0

    // Timeout for stale assemblies (ms)
    private readonly ASSEMBLY_TIMEOUT = 100
    // Max age of segment samples considered part of the same selection draw call
    private readonly SELECTION_SAMPLE_WINDOW = 50
    // How long to stay in selection mode after the last fresh detection
    private readonly SELECTION_HOLD_DURATION = 150

    /**
     * Process a rectangle command.
     * Strategy: run normal corner assembly FIRST (unchanged), only attempt
     * selection detection as a fallback. Selection detection NEVER writes
     * lastCursor, so false positives cannot corrupt normal cursor tracking.
     */
    processRect(rect: RectCommand): { cursor: CursorRect; cursorColor: RGB | null; selectionMode: boolean } {
        if (!rect) {
            const cursorOut = this.lastSelectionMode && this.lastSelectionCursor
                ? this.lastSelectionCursor
                : this.lastCursor
            return { cursor: cursorOut, cursorColor: this.lastCursorColor, selectionMode: this.lastSelectionMode }
        }

        const now = Date.now()

        // ----- 1. Normal corner-based cursor assembly (original, unchanged logic) -----
        this.assemblies = this.assemblies.filter(a => now - a.startTime < this.ASSEMBLY_TIMEOUT)

        let completedCursor: CursorRect | null = null
        for (const assembly of this.assemblies) {
            if (assembly.state === 'complete') continue
            this.processRectAgainstAssembly(rect, assembly)
            if (this.isAssemblyComplete(assembly)) {
                completedCursor = this.buildCursorFromAssembly(assembly)
                assembly.state = 'complete'
            }
        }

        if (completedCursor) {
            this.lastCursor = completedCursor
            this.assemblies = []
            // Normal cursor confirmed → exit selection mode immediately
            this.lastSelectionMode = false
            this.lastSelectionCursor = null
            this.selectionRectSamples = []
            return { cursor: completedCursor, cursorColor: this.lastCursorColor, selectionMode: false }
        }

        // Start a new assembly from a type-4 TL corner candidate
        if (rect.type === 4 && rect.size.width === 3 && rect.size.height === 1) {
            const newAssembly = this.createNewAssembly(rect)
            this.assemblies.push(newAssembly)
            if ('color' in rect && rect.color) {
                this.lastCursorColor = rect.color
            }
            if (this.assemblies.length > 2) {
                this.assemblies = this.assemblies.slice(-2)
            }
        }

        // ----- 2. Selection border detection (only if normal assembly didn't complete) -----
        this.recordSelectionSample(rect, now)
        const selectionCursor = this.detectSelectionCursor(now)

        if (selectionCursor) {
            this.lastSelectionCursor = selectionCursor
            this.lastSelectionMode = true
            this.lastSelectionSeenAt = now
            // Clear after a full detection so next cycle starts with a clean buffer.
            // This prevents old edges (still within the 50ms window) from polluting
            // the next detection and making the old position win the score race.
            this.selectionRectSamples = []
            return { cursor: selectionCursor, cursorColor: this.lastCursorColor, selectionMode: true }
        }

        // Incremental update path: while in selection mode, M8 can redraw only one
        // border segment at a time. Keep rect tracking independent from key events
        // by updating the previous selection rectangle from partial edge draws.
        const incrementalSelection = this.updateSelectionFromPartialRect(rect)
        if (incrementalSelection) {
            this.lastSelectionCursor = incrementalSelection
            this.lastSelectionMode = true
            this.lastSelectionSeenAt = now
            return { cursor: incrementalSelection, cursorColor: this.lastCursorColor, selectionMode: true }
        }

        // Stay in selection mode for SELECTION_HOLD_DURATION after last fresh detection
        if (this.lastSelectionMode) {
            if (now - this.lastSelectionSeenAt > this.SELECTION_HOLD_DURATION) {
                this.lastSelectionMode = false
                this.lastSelectionCursor = null
            } else if (this.lastSelectionCursor) {
                return { cursor: this.lastSelectionCursor, cursorColor: this.lastCursorColor, selectionMode: true }
            }
        }

        return { cursor: this.lastCursor, cursorColor: this.lastCursorColor, selectionMode: false }
    }

    private updateSelectionFromPartialRect(rect: RectCommand): CursorRect | null {
        if (!this.lastSelectionMode || !this.lastSelectionCursor) return null

        const w = rect.size.width
        const h = rect.size.height
        const isHorizontal = h === 1 && w >= 5
        const isVertical = w === 1 && h >= 3
        if (!isHorizontal && !isVertical) return null

        const prev = this.lastSelectionCursor
        let left = prev.x - 1
        let top = prev.y - 1
        let right = prev.x + prev.w
        let bottom = prev.y + prev.h

        if (isHorizontal) {
            const lineLeft = rect.pos.x
            const lineRight = rect.pos.x + w - 1
            const prevSpan = right - left + 1
            const overlap = Math.min(lineRight, right) - Math.max(lineLeft, left) + 1

            // Reject unrelated horizontal lines.
            if (overlap < Math.max(3, Math.floor(prevSpan * 0.6))) return null

            const y = rect.pos.y
            if (Math.abs(y - top) <= Math.abs(y - bottom)) {
                top = y
            } else {
                bottom = y
            }

            // Keep lateral bounds coherent with the longest observed edge.
            if (lineRight - lineLeft > right - left) {
                left = lineLeft
                right = lineRight
            }
        } else {
            const lineTop = rect.pos.y
            const lineBottom = rect.pos.y + h - 1
            const prevSpan = bottom - top + 1
            const overlap = Math.min(lineBottom, bottom) - Math.max(lineTop, top) + 1

            // Reject unrelated vertical lines.
            if (overlap < Math.max(3, Math.floor(prevSpan * 0.6))) return null

            const x = rect.pos.x
            if (Math.abs(x - left) <= Math.abs(x - right)) {
                left = x
            } else {
                right = x
            }

            // Keep vertical bounds coherent with the longest observed edge.
            if (lineBottom - lineTop > bottom - top) {
                top = lineTop
                bottom = lineBottom
            }
        }

        const outerW = right - left + 1
        const outerH = bottom - top + 1
        if (outerW < 3 || outerH < 3) return null

        return {
            x: left + 1,
            y: top + 1,
            w: outerW - 2,
            h: outerH - 2,
        }
    }

    private recordSelectionSample(rect: RectCommand, now: number): void {
        const w = rect.size.width
        const h = rect.size.height

        // w >= 5 excludes the normal corner cursor's 3px-wide pieces (TL/TR/BL/BR are all 3x1)
        // h >= 3 excludes the 1x2 corner-edge pieces
        const isHorizontal = h === 1 && w >= 5
        const isVertical = w === 1 && h >= 3
        if (!isHorizontal && !isVertical) return

        this.selectionRectSamples.push({
            x: rect.pos.x,
            y: rect.pos.y,
            w,
            h,
            ts: now,
            hasColor: rect.type === 2 || rect.type === 4,
        })

        this.selectionRectSamples = this.selectionRectSamples.filter(sample => now - sample.ts <= this.SELECTION_SAMPLE_WINDOW)
    }

    private detectSelectionCursor(now: number): CursorRect | null {
        this.selectionRectSamples = this.selectionRectSamples.filter(sample => now - sample.ts <= this.SELECTION_SAMPLE_WINDOW)
        if (this.selectionRectSamples.length < 4) return null

        const horizontals = this.selectionRectSamples.filter(sample => sample.h === 1 && sample.w >= 3)
        const verticals = this.selectionRectSamples.filter(sample => sample.w === 1 && sample.h >= 3)
        if (horizontals.length === 0 || verticals.length === 0) return null

        const refCursor = this.lastSelectionMode && this.lastSelectionCursor
            ? this.lastSelectionCursor
            : this.lastCursor
        const prevCenterX = refCursor.x + refCursor.w / 2
        const prevCenterY = refCursor.y + refCursor.h / 2

        let best: { cursor: CursorRect; score: number; latestTs: number } | null = null

        for (const top of horizontals) {
            for (const bottom of horizontals) {
                if (bottom.y <= top.y) continue
                if (bottom.x !== top.x || bottom.w !== top.w) continue

                const outerH = bottom.y - top.y + 1
                if (outerH < 3) continue

                // M8 may draw verticals starting 1px inside the corners:
                //   left side: x=top.x, y=top.y+1, h=outerH-2  (skipping corners)
                //   OR:        x=top.x, y=top.y,   h=outerH     (covering corners)
                // Both are valid – check that the segment spans from near top to near bottom.
                const left = verticals.find(v =>
                    v.x === top.x &&
                    v.y >= top.y && v.y <= top.y + 2 &&
                    v.y + v.h - 1 >= bottom.y - 1
                )
                if (!left) continue

                const rightX = top.x + top.w - 1
                const right = verticals.find(v =>
                    v.x === rightX &&
                    v.y >= top.y && v.y <= top.y + 2 &&
                    v.y + v.h - 1 >= bottom.y - 1
                )
                if (!right) continue

                const cursor = {
                    x: top.x + 1,
                    y: top.y + 1,
                    w: top.w - 2,
                    h: outerH - 2,
                }

                if (cursor.w <= 0 || cursor.h <= 0) continue

                const latestTs = Math.max(top.ts, bottom.ts, left.ts, right.ts)

                // Tiebreak by distance from previous cursor center (prefer spatially close)
                const centerX = cursor.x + cursor.w / 2
                const centerY = cursor.y + cursor.h / 2
                const dx = centerX - prevCenterX
                const dy = centerY - prevCenterY
                const score = dx * dx + dy * dy

                // Primary sort: freshest quad wins (avoids stale previous-frame edges
                // shadowing new ones when both are within the SELECTION_SAMPLE_WINDOW).
                // Secondary sort: closest to previous center.
                if (!best || latestTs > best.latestTs || (latestTs === best.latestTs && score < best.score)) {
                    best = { cursor, score, latestTs }
                }
            }
        }

        return best?.cursor ?? null
    }

    /**
     * Create a new cursor assembly from TL starter
     */
    private createNewAssembly(tlRect: RectCommand): CursorAssembly {
        const tlX = tlRect?.pos.x ?? 0
        const tlY = tlRect?.pos.y ?? 0

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
        this.selectionRectSamples = []
        this.lastCursor = { x: 0, y: 0, w: 1, h: 1 }
        this.lastSelectionCursor = null
        this.lastSelectionMode = false
        this.lastSelectionSeenAt = 0
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
            return s.toLowerCase().trim().replace(/[{}]/g, '0') //.replace(/[^a-z0-9]/g, '')
        }

        private normalizeFinal(titleRaw: string) {
            // Trim, remove trailing hex token and optional ^/*, strip spaces/punct, lower, cap 20
            const trimmed = titleRaw.trim()

            // biome-ignore lint/complexity/noUselessEscapeInRegex: needed for * or ^
            const noTrail = trimmed.replace(/[{}]/g, '0').replace(/\s[0-9a-fA-F]{1,2}[\^\*]?\s*$/, '')
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
                store.set(viewTitleAtom, partial)
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
            // Use floor to consistently map pixel positions to grid positions
            const gx = Math.floor((cmd.pos.x - offX) / cellW)
            const gy = Math.floor((cmd.pos.y - offY) / cellH)

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


    // Character grid tracker for text extraction
    class CharacterGridTracker {
        // Grid: y -> x -> { char, fg, bg }
        private grid: Map<number, Map<number, { ch: string; fg: RGB; bg: RGB }>> = new Map()

        processChar(cmd: CharacterCommand) {
            const { cellW, cellH, offX, offY } = store.get(cellMetricsAtom)
            const gx = Math.floor((cmd.pos.x - offX) / cellW)
            const gy = Math.floor((cmd.pos.y - offY) / cellH)

            if (!this.grid.has(gy)) {
                this.grid.set(gy, new Map())
            }
            this.grid.get(gy)?.set(gx, { ch: cmd.character.replace(/[{}]/g, '0'), fg: cmd.foreground, bg: cmd.background })

            // Clean up old rows (keep only last 30 rows)
            if (this.grid.size > 30) {
                console.log('too much rows', this.grid.size)
                const sortedKeys = Array.from(this.grid.keys()).sort((a, b) => a - b)
                const toRemove = sortedKeys.slice(0, sortedKeys.length - 30)
                for (const key of toRemove) {
                    this.grid.delete(key)
                }
            }
            // Update highlight info for new cursor position
            this.updateHighlightAtCursor()

        }

        updateHighlightAtCursor() {
            const cursorRect = store.get(cursorRectAtom)
            const pos = store.get(cursorPosAtom)

            if (!pos || !cursorRect) {
                store.set(textUnderCursorAtom, null)
                store.set(currentLineAtom, null)
                store.set(highlightColorAtom, null)
                return
            }

            const { cellW, offX, } = store.get(cellMetricsAtom)

            // Convert pixel cursor bounds to grid coordinates.
            // startGx uses Math.round to absorb the 1–2px leftward overhang of the cursor
            // border so we don't pick up the character in the column to the left.
            // endGx uses Math.floor: the cursor's right pixel (tr.x - 1) falls exactly at
            // the last cell's rightmost pixel, so floor is already correct there.
            const startGx = Math.round((cursorRect.x - offX) / cellW)
            const endGx = Math.floor(((cursorRect.x + cursorRect.w - 1) - offX) / cellW)
            const gy = pos.y // Use cursor's grid Y position

            // Extract text within cursor bounds (no hue filtering)
            const textUnderCursor = this.getTextUnderCursor(startGx, endGx, gy)

            // Extract highlight color from text under cursor (stable, not pulsing)
            const textHighlightColor = this.getHighlightColorFromText(startGx, endGx, gy)

            const currentLine = this.getCurrentLine(gy)

            store.set(textUnderCursorAtom, textUnderCursor)
            store.set(currentLineAtom, currentLine)

            // Use stable text color as highlight color
            if (textHighlightColor) {
                store.set(highlightColorAtom, textHighlightColor)
            }
        }

        getTextUnderCursor(startGx: number, endGx: number, gy: number): string | null {
            const row = this.grid.get(gy)
            if (!row) return null

            // Extract all characters within cursor bounds without hue filtering
            const text: string[] = []
            for (let x = startGx; x <= endGx; x++) {
                const cell = row.get(x)
                if (cell) {
                    text.push(cell.ch)
                }
            }

            return text.join('').trim() || null
        }

        /**
         * Get the stable highlight color from text under cursor
         * This is the foreground color of the text, which doesn't pulse
         */
        getHighlightColorFromText(startGx: number, endGx: number, gy: number): RGB | null {
            const row = this.grid.get(gy)
            if (!row) return null

            // Find first non-space character within cursor bounds
            for (let x = startGx; x <= endGx; x++) {
                const cell = row.get(x)
                if (cell?.ch.trim()) {
                    return cell.fg
                }
            }
            return null
        }

        getCurrentLine(gy: number): string | null {
            const row = this.grid.get(gy)
            if (!row || row.size === 0) return null

            // Get all characters in the row, sorted by x position
            const sortedEntries = Array.from(row.entries()).sort((a, b) => a[0] - b[0])
            const line = sortedEntries.map(([, v]) => v.ch).join('')
            return line.trim() || null
        }



        reset() {
            this.grid.clear()
        }
    }

    const charGridTracker = new CharacterGridTracker()

    // Temporary debug: set window.__debugRects = true in the console for 1 second of rect logging
    let debugRectEndTime = 0
    if (typeof window !== 'undefined') {
        const win = window as unknown as Record<string, unknown>
        win.__debugRects = false
        Object.defineProperty(win, '__debugRects', {
            configurable: true,
            set(v: unknown) { if (v) debugRectEndTime = Date.now() + 1000 },
        })
    }

    const cursorExtractor = (data: RectCommand) => {
        if (!data) return

        if (Date.now() < debugRectEndTime) {
            console.log(`[rect] type=${data.type} pos=(${data.pos.x},${data.pos.y}) size=${data.size.width}x${data.size.height}`)
        }

        const { cellW, cellH, offX, offY } = store.get(cellMetricsAtom)
        const { cursor, selectionMode } = CursorAssembly.processRect(data)
        const { x, y, w, h } = cursor
        // Use top-left of cursor to determine grid position (same as characters).
        // Math.round instead of Math.floor absorbs the 1–2px leftward overhang of the
        // cursor border corners so gx maps to the correct cell (not the one to its left).
        const gx = Math.round((x - offX) / cellW)
        const gy = Math.round((y - offY) / cellH)

        const prevPos = store.get(cursorPosAtom)
        const prevSelectionMode = store.get(selectionModeAtom)

        if (!selectionMode) {
            // Normal cursor: update when grid position changed OR when
            // transitioning out of selection mode (rect size changes dramatically).
            const modeJustChanged = prevSelectionMode !== selectionMode
            if (!prevPos || prevPos.x !== gx || prevPos.y !== gy || modeJustChanged) {
                store.set(cursorPosAtom, { x: gx, y: gy })
                store.set(cursorRectAtom, { x, y, w, h })
            }
        } else {
            // Selection mode: update independently — selection can grow at the same
            // anchor grid cell (SHIFT+direction extends rect without moving anchor).
            const prevRect = store.get(cursorRectAtom)
            if (!prevPos || prevPos.x !== gx || prevPos.y !== gy) {
                store.set(cursorPosAtom, { x: gx, y: gy })
            }
            if (!prevRect || prevRect.x !== x || prevRect.y !== y || prevRect.w !== w || prevRect.h !== h) {
                store.set(cursorRectAtom, { x, y, w, h })
            }
        }

        if (prevSelectionMode !== selectionMode) {
            store.set(selectionModeAtom, selectionMode)
        }
    }

    const systemInfoHandler = (info: { model: string; fontMode: 0 | 1 | 2; spacingX: number; spacingY: number; offX: number; offY: number; screenWidth?: number; screenHeight?: number; rectOffset: number }) => {
        store.set(deviceModelAtom, info.model)
        store.set(fontModeAtom, info.fontMode)
        store.set(cellMetricsAtom, { cellW: info.spacingX, cellH: info.spacingY, offX: info.offX, offY: info.offY })
        store.set(systemInfoAtom, {
            model: info.model,
            fontMode: info.fontMode,
            spacingX: info.spacingX,
            spacingY: info.spacingY,
            offX: info.offX,
            offY: info.offY,
            screenWidth: info.screenWidth ?? 480,
            screenHeight: info.screenHeight ?? 320,
            rectOffset: info.rectOffset
        })
    }

    const onText = (d: CharacterCommand) => {
        extractor.processChar(d)
        charGridTracker.processChar(d)
    }
    bus.protocol.eventBus.on('text', onText)
    bus.protocol.eventBus.on('rect', cursorExtractor)
    bus.protocol.eventBus.on('systemInfo', systemInfoHandler)

    return () => {
        bus.protocol.eventBus.off('text', onText)
        bus.protocol.eventBus.off('rect', cursorExtractor)
        bus.protocol.eventBus.off('systemInfo', systemInfoHandler)
        extractor.reset()
        charGridTracker.reset()
    }
}
