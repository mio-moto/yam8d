import { getDefaultStore } from 'jotai'
import type { ConnectedBus } from '../connection/connection'
import type { CharacterCommand, RectCommand, SystemCommand } from '../connection/protocol'
import {
    cellMetricsAtom,
    cursorPosAtom,
    cursorRectAtom,
    deviceModelAtom,
    fontModeAtom,
    //highlightColorAtom, //TODO
    minimapKeyAtom,
    viewNameAtom,
    viewTitleAtom,
    titleColorAtom,
    backgroundColorAtom,
    type CursorRect,
    type RGB,
} from './viewStore'

// Heuristics aligned with existing extraction logic
const STABILIZE_MS = 50

interface CornerCandidate {
    x: number;
    y: number;
    // Expected positions for verification pieces
    expectedVert: { x: number, y: number } | null; // 1x2 vertical edge
    expectedTip: { x: number, y: number } | null; // 1x1 tip
    foundVert: boolean;
    foundTip: boolean;
}

interface CursorAssembly {
    tl: CornerCandidate;  // Top-left (colored, type 4)
    tr: CornerCandidate | null;  // Top-right
    bl: CornerCandidate | null;  // Bottom-left
    br: CornerCandidate | null;  // Bottom-right
    startTime: number;
    state: 'waiting' | 'building' | 'complete';
}

const defaultCursor: CursorRect = { x: 0, y: 0, w: 1, h: 1 };


class AssemblyCursorExtractor {
    // Active cursor assemblies being built
    private assemblies: CursorAssembly[] = [];

    // Last detected cursor (default)
    private lastCursor: CursorRect = defaultCursor;

    // Timeout for stale assemblies (ms)
    private readonly ASSEMBLY_TIMEOUT = 100;

    /**
     * Process a rectangle command
     */
    processRect(rect: RectCommand): CursorRect {
        if (!rect) return defaultCursor
        const now = Date.now();

        // Clean up stale assemblies
        this.assemblies = this.assemblies.filter(a =>
            now - a.startTime < this.ASSEMBLY_TIMEOUT
        );

        // Process the rectangle against all active assemblies
        let completedCursor: CursorRect | null = null;

        for (const assembly of this.assemblies) {
            if (assembly.state === 'complete') continue;

            this.processRectAgainstAssembly(rect, assembly);

            if (this.isAssemblyComplete(assembly)) {
                completedCursor = this.buildCursorFromAssembly(assembly);
                assembly.state = 'complete';
            }
        }

        // If we completed a cursor, clean up and return it
        if (completedCursor) {
            this.lastCursor = completedCursor;
            this.assemblies = []; // Clear all assemblies (start fresh)
            return completedCursor;
        }

        // If this is a potential TL starter (type 4, 3x1), start new assembly
        if (rect.type === 4 && rect.size.width === 3 && rect.size.height === 1) {
            const newAssembly = this.createNewAssembly(rect);
            this.assemblies.push(newAssembly);

            // Keep only 2 most recent assemblies to avoid explosion
            if (this.assemblies.length > 2) {
                this.assemblies = this.assemblies.slice(-2);
            }
        }

        return this.lastCursor;
    }

    /**
     * Create a new cursor assembly from TL starter
     */
    private createNewAssembly(tlRect: RectCommand): CursorAssembly {
        const tlX = tlRect?.pos.x ?? 0;
        const tlY = tlRect?.pos.y ?? 0;

        //console.log('found assembly starter on', tlX, tlY);

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
        };
    }

    /**
     * Process a rectangle against a specific assembly
     */
    private processRectAgainstAssembly(rect: RectCommand, assembly: CursorAssembly): void {
        // Check if rectangle matches any expected pattern in the assembly

        // 1. Check TL corner verification pieces
        this.checkCornerVerification(rect, assembly.tl);

        // 2. Look for TR corner (3x1, type 3, same y as TL)
        if (!assembly.tr &&
            rect.type === 3 &&
            rect.size.width === 3 &&
            rect.size.height === 1 &&
            rect.pos.y === assembly.tl.y &&
            rect.pos.x > assembly.tl.x) { // Must be to the right

            //console.log('found TR starter on', rect.pos.x, rect.pos.y);

            assembly.tr = {
                x: rect.pos.x,
                y: rect.pos.y,
                expectedVert: { x: rect.pos.x + 2, y: rect.pos.y + 1 }, // 1x2 right of the 3x1
                expectedTip: { x: rect.pos.x + 1, y: rect.pos.y + 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            };
        }

        // 3. Look for BL corner (3x1, type 3, same x as TL)
        if (!assembly.bl &&
            rect.type === 3 &&
            rect.size.width === 3 &&
            rect.size.height === 1 &&
            rect.pos.x === assembly.tl.x &&
            rect.pos.y > assembly.tl.y) { // Must be below

            //console.log('found BL starter on', rect.pos.x, rect.pos.y);

            assembly.bl = {
                x: rect.pos.x,
                y: rect.pos.y,
                expectedVert: { x: rect.pos.x, y: rect.pos.y - 2 }, // 1x2 above the 3x1
                expectedTip: { x: rect.pos.x + 1, y: rect.pos.y - 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            };
        }

        // 4. Look for BR corner (3x1, type 3)
        if (assembly.tr && assembly.bl &&
            !assembly.br &&
            rect.type === 3 &&
            rect.size.width === 3 &&
            rect.size.height === 1 &&
            rect.pos.x === assembly.tr.x &&
            rect.pos.y === assembly.bl.y) {

            //console.log('found BR starter on', rect.pos.x, rect.pos.y);

            assembly.br = {
                x: rect.pos.x,
                y: rect.pos.y,
                expectedVert: { x: rect.pos.x + 2, y: rect.pos.y - 2 }, // 1x2 above-right
                expectedTip: { x: rect.pos.x + 1, y: rect.pos.y - 1 }, // 1x1 inside corner
                foundVert: false,
                foundTip: false
            };
        }

        // 5. Check verification pieces for other corners
        if (assembly.tr) this.checkCornerVerification(rect, assembly.tr);
        if (assembly.bl) this.checkCornerVerification(rect, assembly.bl);
        if (assembly.br) this.checkCornerVerification(rect, assembly.br);
    }

    /**
     * Check if a rectangle verifies a corner pattern
     */
    private checkCornerVerification(rect: RectCommand, corner: CornerCandidate): void {
        if (!corner.expectedVert || !corner.expectedTip) return;

        // Check for 1x2 vertical edge
        if (!corner.foundVert &&
            rect.type === 3 &&
            rect.size.width === 1 &&
            rect.size.height === 2 &&
            rect.pos.x === corner.expectedVert.x &&
            rect.pos.y === corner.expectedVert.y) {
            corner.foundVert = true;
        }

        // Check for 1x1 tip
        if (!corner.foundTip &&
            rect.type === 1 &&
            rect.size.width === 1 &&
            rect.size.height === 1 &&
            rect.pos.x === corner.expectedTip.x &&
            rect.pos.y === corner.expectedTip.y) {
            corner.foundTip = true;
        }
    }

    /**
     * Check if assembly has enough evidence to be a complete cursor
     */
    private isAssemblyComplete(assembly: CursorAssembly): boolean {
        // Must have all 4 corners
        if (!assembly.tr || !assembly.bl || !assembly.br) {
            return false;
        }

        // Basic cursor geometry checks
        const width = assembly.tr.x - assembly.tl.x;
        const height = assembly.bl.y - assembly.tl.y;

        // Width and height should be positive
        if (width <= 0 || height <= 0) {
            return false;
        }

        // Check if corners form a proper rectangle
        if (assembly.br.x !== assembly.tr.x || assembly.br.y !== assembly.bl.y) {
            return false;
        }

        // We need some verification evidence to be confident
        // Count how many corners have at least one verification piece
        const corners = [assembly.tl, assembly.tr, assembly.bl, assembly.br];
        const verifiedCorners = corners.filter(c => c.foundVert || c.foundTip).length;

        // Require at least 2 corners to have verification
        return verifiedCorners >= 2;
    }

    /**
     * Build final cursor rectangle from complete assembly
     */
    private buildCursorFromAssembly(assembly: CursorAssembly): CursorRect {
        // Must have all 4 corners
        if (!assembly.tr || !assembly.bl || !assembly.br) {
            return defaultCursor;
        }

        // Basic cursor geometry checks
        const width = assembly.tr.x - assembly.tl.x - 1;
        const height = assembly.bl.y - assembly.tl.y - 1;

        // Cursor is 1 pixel inside the 3x1 edges
        const x = assembly.tl.x + 1;
        const y = assembly.tl.y + 1;
        const w = width;
        const h = height;

        return { x, y, w, h };
    }

    /**
     * Reset detection
     */
    reset(): void {
        this.assemblies = [];
        this.lastCursor = { x: 0, y: 0, w: 1, h: 1 };
    }
}

export function registerViewExtractor(bus?: ConnectedBus | null) {
    if (!bus) return () => { }
    const CursorAssembly = new AssemblyCursorExtractor()
    const store = getDefaultStore()
    // extractor active
    // Page title buffer (fourth row of 40 columns)
    const titleRow: string[] = Array(40).fill('')
    const titleFgRow: (RGB | null)[] = Array(40).fill(null)
    const titleBgRow: (RGB | null)[] = Array(40).fill(null)

    // Minimap buffer: capture 6×6 region (cols 34..39, rows 19..23) to handle off-by-one layouts
    const MINI_W = 7
    const MINI_H = 7
    const minimapArr: string[][] = Array.from({ length: MINI_W }, () => Array(MINI_H).fill(''))
    let stabilizeTimer: ReturnType<typeof setTimeout> | null = null
    let currentVersion = 0
    let previousVersion = 0

    // Normalize to Model:02 resolution 480x320 using observed screen bounds (pixel space)
    const { cellW, cellH, offX, offY } = store.get(cellMetricsAtom)

    const viewNameExtractor = (data: CharacterCommand) => {
        const { cellW, cellH, offX, offY } = store.get(cellMetricsAtom)
        // Map pixel position to 40×24 grid
        const gx = Math.floor((data.pos.x - offX) / cellW)
        const gy = Math.floor((data.pos.y - offY) / cellH)

        // Title is on fourth row (0-indexed → gy === 3)
        if (gy === 3) {
            titleRow[gx] = data.character
            titleFgRow[gx] = data.foreground
            titleBgRow[gx] = data.background
            currentVersion += 1

            if (gx === 2) console.log(data)
        }

        // Minimap region: bottom-right capture 6x5 (gx 34..39, gy 19..23)
        if (gx >= 34 && gx <= 40 && gy >= 18 && gy <= 24) {
            const lx = gx - 34
            const ly = gy - 18
            // vertically fill array
            minimapArr[lx][ly] = data.character
            currentVersion += 1
        }

        // check stability
        if (previousVersion !== currentVersion) {
            if (stabilizeTimer) clearTimeout(stabilizeTimer)

            stabilizeTimer = setTimeout(() => {
                const titleRaw = titleRow.join('')

                const title = titleRaw
                    .trim()
                    // Remove trailing hex token (1–2 hex digits) and optional ^/*, then spaces
                    // biome-ignore lint/complexity/noUselessEscapeInRegex: <need to match either * or ^ (stupid biome)>
                    .replace(/\s[0-9a-fA-F]{1,2}[\^\*]?/, '')
                    .replace(/[ *]/g, '')
                    .toLowerCase()

                // flatten minimap
                const mapStr = minimapArr
                    .flat()
                    .join('')
                    .toLowerCase()
                    .replace(/\s/g, '')
                    .replace(/l/g, 's')

                // Store atoms separately and also compose viewName
                store.set(viewTitleAtom, title || null)
                store.set(minimapKeyAtom, mapStr || null)

                // Stabilized first-character colors from the title row
                const firstIdx = titleRow.findIndex((c) => c && c.trim().length > 0)
                const firstFg = firstIdx >= 0 ? titleFgRow[firstIdx] : null
                const firstBg = firstIdx >= 0 ? titleBgRow[firstIdx] : null
                store.set(titleColorAtom, firstFg)
                store.set(backgroundColorAtom, firstBg)

                //for graph building                
                //if live mode just use 'song' else remove '.' to have clean name
                const cleanedTitle = title?.includes('live') ? 'song' : title?.replace(/\./, '')
                //if live mode just uniformize minimapKey to song mode
                const cleanedMapStr = mapStr.replace(/l/g, 's')

                // use above const to set current start
                const page = `${cleanedTitle}${cleanedMapStr}`
                store.set(viewNameAtom, page || null)

                console.log('the page is', page)

            }, STABILIZE_MS)

            previousVersion = currentVersion
        }
    }

    const cursorExtractor = (data: RectCommand) => {
        if (!data) return

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

    const systemHandler = (data: SystemCommand) => {
        store.set(deviceModelAtom, data.model)
        store.set(fontModeAtom, data.fontMode)


        // // Initialize screen bounds from known model resolutions
        // // Model:02 → 480x320, Model:01 → 320x240; default to 480x320 for headless/beta
        // if (data.model === 'M8 Model:02') {
        //     screenW = 480
        //     screenH = 336
        // } else if (data.model === 'M8 Model:01') {
        //     screenW = 320
        //     screenH = 240
        // } else {
        //     // Headless/Beta M8: assume Model:02 resolution
        //     screenW = 480
        //     screenH = 336
        // }
        // store.set(cellMetricsAtom, { cellW: screenW / 40, cellH: screenH / 24, offX: 0, offY: 0 })
    }

    //const systemInfo = bus?.protocol.getSystemInfo()

    bus.protocol.eventBus.on('text', viewNameExtractor)
    bus.protocol.eventBus.on('rect', cursorExtractor)
    bus.protocol.eventBus.on('system', systemHandler)

    return () => {
        bus.protocol.eventBus.off('text', viewNameExtractor)
        bus.protocol.eventBus.off('rect', cursorExtractor)
        bus.protocol.eventBus.off('system', systemHandler)
        if (stabilizeTimer) {
            clearTimeout(stabilizeTimer)
            stabilizeTimer = null
        }
    }
}
