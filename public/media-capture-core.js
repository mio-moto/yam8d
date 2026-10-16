// Pure helpers for media-capture.html (no DOM, no SDK), so they can be tested in Node.
// Key bits are identical to src/features/connection/keys.ts and to the m8-shortcuts player.

export const KEY = { left: 0x80, up: 0x40, down: 0x20, shift: 0x10, play: 0x08, right: 0x04, opt: 0x02, edit: 0x01 }
const KEY_ORDER = ['left', 'up', 'down', 'shift', 'play', 'right', 'opt', 'edit']

/** 0x12 -> ['shift', 'opt']: the key names the SDK's sendKeyDown() takes for a full held-key state. */
export const maskToNames = (mask) => KEY_ORDER.filter((name) => (mask & KEY[name]) !== 0)

export const namesToMask = (names) => names.reduce((mask, name) => mask | KEY[name], 0)

export const median = (values) => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
export const DIRECTIONS = ['up', 'down', 'left', 'right']

/** The recipe a job will play: a fixed one, or the one for the chosen navigate-views direction. */
export const resolveRecipe = (job, direction) => {
    if (job.recipeByDirection) {
        const dir = direction ?? job.direction
        if (!dir || !job.recipeByDirection[dir]) return null
        return job.recipeByDirection[dir]
    }
    return job.recipe ?? null
}

/** Length of the clip: pre-roll, the recipe, the look after its last key (`tailMs`), post-roll. */
export const clipLengthMs = (recipe, timing, tailMs = 0) => timing.preRollMs + (recipe.length ? recipe[recipe.length - 1][0] : 0) + tailMs + timing.postRollMs

/**
 * Turns the log of key calls into the file format: [[ms, mask], ...] relative to the recorder's t0.
 * `log` is [{ t, mask }] with t from performance.now(); `shiftMs` is the calibrated SDK-to-device delay.
 */
export const buildTimeline = (log, t0, shiftMs = 0) => {
    const events = []
    let previous = 0
    let lastMs = 0
    for (const { t, mask } of log) {
        if (mask === previous) continue
        const ms = Math.max(lastMs, Math.round(t - t0 + shiftMs))
        events.push([ms, mask])
        previous = mask
        lastMs = ms
    }
    return events
}

/** Timeline QA (plan 3.6): sorted, masks 0-255, last mask 0, last event before the clip end, first event late enough. */
export const checkTimeline = (events, { clipMs, minFirstMs = 300 }) => {
    const errors = []
    if (!Array.isArray(events) || events.length === 0) return { ok: false, errors: ['timeline is empty'] }
    for (let i = 0; i < events.length; i++) {
        const [ms, mask] = events[i]
        if (!Number.isInteger(ms) || ms < 0) errors.push(`event ${i}: bad time ${ms}`)
        if (!Number.isInteger(mask) || mask < 0 || mask > 255) errors.push(`event ${i}: bad mask ${mask}`)
        if (i > 0 && ms < events[i - 1][0]) errors.push(`event ${i}: time goes backwards`)
    }
    const last = events[events.length - 1]
    if (last[1] !== 0) errors.push('last mask is not 0')
    if (clipMs !== undefined && last[0] >= clipMs) errors.push(`last event at ${last[0]} ms is not before the clip end (${clipMs} ms)`)
    if (events[0][0] < minFirstMs) errors.push(`first event at ${events[0][0]} ms is earlier than ${minFirstMs} ms`)
    return { ok: errors.length === 0, errors }
}

/** Rows (indexes) whose text differs between two screen captures. */
export const diffRows = (before, after) => {
    const rows = []
    const n = Math.max(before.length, after.length)
    for (let i = 0; i < n; i++) if ((before[i] ?? '') !== (after[i] ?? '')) rows.push(i)
    return rows
}

const samePos = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.x === b.x && a.y === b.y)

/**
 * Loop check (plan 3.6), report only: a clip that does not end where it started is kept and flagged, because many
 * views cannot be undone (navigating away from a view that is not in the graph, exit, ...).
 * `looped` is false when the view or the cursor differs. `valueChanged` is true when screen text differs outside the
 * cursor rows while the view is the same (the project data changed, so the runner restores it). Text is compared,
 * never pixels, because the cursor blink changes pixels.
 */
export const loopCheck = (before, after) => {
    const warnings = []
    const viewChanged = before.state.viewName !== after.state.viewName
    if (viewChanged) warnings.push(`view changed: ${before.state.viewName} -> ${after.state.viewName}`)
    if (!samePos(before.state.cursorPos, after.state.cursorPos)) warnings.push(`cursor moved: ${JSON.stringify(before.state.cursorPos)} -> ${JSON.stringify(after.state.cursorPos)}`)
    const allowed = new Set([before.state.cursorPos?.y, after.state.cursorPos?.y].filter((y) => y !== undefined))
    const changedRows = diffRows(before.screen.lines, after.screen.lines)
    const outside = changedRows.filter((row) => !allowed.has(row))
    const valueChanged = outside.length > 0 && !viewChanged
    return { ok: true, looped: warnings.length === 0, errors: [], warnings, valueChanged, viewChanged, changedRows, outsideRows: outside }
}

/**
 * Sync check (plan 3.6, warning only): the first change of the text under the cursor after the first press
 * should land 0-250 ms later. `changeTimes` are ms relative to t0.
 */
export const syncCheck = (firstPressMs, changeTimes, { skip = false, windowMs = 250 } = {}) => {
    if (skip) return { status: 'skipped', deltaMs: null }
    const next = changeTimes.find((t) => t >= firstPressMs)
    if (next === undefined) return { status: 'warn', deltaMs: null, reason: 'the text under the cursor never changed' }
    const deltaMs = Math.round(next - firstPressMs)
    return deltaMs <= windowMs ? { status: 'ok', deltaMs } : { status: 'warn', deltaMs, reason: `first change ${deltaMs} ms after the press` }
}

/** Media QA from the probed <video>; ffprobe repeats it offline (scripts/check-media.mjs). */
export const checkMedia = ({ durationMs, expectedMs, width, height }, { frameMs = 34, size = { width: 480, height: 320 } } = {}) => {
    const errors = []
    if (width !== size.width || height !== size.height) errors.push(`size is ${width}x${height}, expected ${size.width}x${size.height}`)
    if (durationMs === null || !Number.isFinite(durationMs)) return { ok: errors.length === 0, errors, warnings: ['duration could not be read here; check with ffprobe'] }
    const warnings = []
    if (Math.abs(durationMs - expectedMs) > frameMs * 2) warnings.push(`duration ${Math.round(durationMs)} ms vs expected ${expectedMs} ms`)
    return { ok: errors.length === 0, errors, warnings }
}

/**
 * MP4 first (decision D3); WebM only when Chrome cannot record MP4 here. High profile comes first: it entropy-codes
 * with CABAC (smaller files) and every browser decodes it. The level in the string is only a label for Chrome's
 * encoder; 5.1 is the one that admits 1920x1280 at 60 fps. H.265 is left out on purpose: Chrome records it only
 * with the hardware encoder, which starts ~700 ms late, far past MAX_START_LAG_MS.
 */
export const pickRecorderFormat = (isTypeSupported) => {
    const mp4 = ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4']
    for (const mime of mp4) if (isTypeSupported(mime)) return { mime, ext: 'mp4' }
    const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    for (const mime of webm) if (isTypeSupported(mime)) return { mime, ext: 'webm' }
    return null
}

// ---------- minimap (plan 3.5, D7) ----------
//
// The minimap in the bottom-right corner of the screen is plain text. On Project it is three rows:
//     P
//     SCPIT
//     V
// Letters are views, and Shift+Up/Down/Left/Right lead to the letter directly above/below/left/right
// of the current one. The highlight is a colour, so the current cell is found from the view name.
// REGION and VIEW_LETTER are a first guess; fix them from a real snapshot in the dry run.

export const MINIMAP_REGION = { rows: 7, cols: 10 } // last N rows, last N columns of the screen

export const VIEW_LETTER = {
    project: { letter: 'P', pick: 'top' },
    song: { letter: 'S' },
    chain: { letter: 'C' },
    phrase: { letter: 'P', pick: 'widest-row' },
    inst: { letter: 'I' },
    table: { letter: 'T' },
    mixer: { letter: 'V' },
}

const DELTA = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }

/**
 * Parses the minimap from the screen rows. Returns the letters with their (row, col), the current cell when it
 * can be identified, and the directions that have a neighbour. `directions` is null when the current cell is
 * unknown: the caller then enables all four and shows the raw region.
 */
export const parseMinimap = (screen, viewName, region = MINIMAP_REGION) => {
    const height = screen.lines.length
    const width = Math.max(screen.width ?? 0, ...screen.lines.map((l) => l.length))
    const rowFrom = Math.max(0, height - region.rows)
    const colFrom = Math.max(0, width - region.cols)
    const raw = []
    const cells = []
    for (let r = rowFrom; r < height; r++) {
        const text = (screen.lines[r] ?? '').slice(colFrom).padEnd(width - colFrom, ' ')
        raw.push(text)
        for (let c = 0; c < text.length; c++) if (/[A-Z]/.test(text[c])) cells.push({ r, c: colFrom + c, ch: text[c] })
    }
    const result = { raw, rowFrom, colFrom, cells, current: null, directions: null }
    const hint = VIEW_LETTER[viewName]
    if (!hint) return result
    const candidates = cells.filter((cell) => cell.ch === hint.letter)
    if (candidates.length === 0) return result
    let current = candidates[0]
    if (candidates.length > 1) {
        const perRow = (row) => cells.filter((cell) => cell.r === row).length
        if (hint.pick === 'top') current = candidates.reduce((a, b) => (b.r < a.r ? b : a))
        else if (hint.pick === 'widest-row') current = candidates.reduce((a, b) => (perRow(b.r) > perRow(a.r) ? b : a))
        else return result
    }
    result.current = current
    result.directions = DIRECTIONS.filter((dir) => cells.some((cell) => cell.r === current.r + DELTA[dir][0] && cell.c === current.c + DELTA[dir][1]))
    return result
}

/** Directions that have at least one edge from `view` in m8Graph.generated.json. */
export const graphDirections = (graph, view) => {
    if (!graph || !graph[view]) return null
    return DIRECTIONS.filter((dir) => graph[view].some((edge) => edge.dir === dir))
}

export const crossCheckMinimap = (mapDirections, graphDirs) => {
    if (!mapDirections || !graphDirs) return { status: 'unknown' }
    const same = mapDirections.length === graphDirs.length && mapDirections.every((d) => graphDirs.includes(d))
    return { status: same ? 'ok' : 'mismatch', mapDirections, graphDirs }
}

export const DIRECTIONS_ALL = DIRECTIONS

// ---------- reading the screen to set up a job's context ----------
//
// screen.lines are the 24 text rows; a string index is a grid column (12x14 px cells on a Model:02), the same
// units as cursorPos and navigateTo. Checked on firmware 6.5.

/** The 12 views yam8d's navigateToView knows; every other view is a sub-view left with Option. */
export const GRAPH_VIEWS = new Set(['project', 'song', 'chain', 'phrase', 'table', 'groove', 'scale', 'inst', 'instrumentpool', 'instmods', 'effectsettings', 'mixer'])

export const EMPTY_RE = /^-+$/
// Cells that look filled but hold nothing: an FX command with no command ("---00"), an unused MIDI mapping range.
const BLANK_RE = /^(-+[0-9A-F]{2}|[->]+)$/
export const NOTE_RE = /^[A-G][-#][0-9]$/

const inZone = (cell, z) => cell.x >= z.x && cell.x < z.x + z.w && cell.y >= z.y && cell.y < z.y + z.h
const inAnyZone = (cell, zones) => (zones ?? []).some((z) => inZone(cell, z))

/** Runs of non-space text inside each zone, clipped to the zone's columns: the cells the cursor can sit on. */
export const zoneTokens = (lines, zones) => {
    const cells = []
    for (const z of zones) {
        for (let y = z.y; y < z.y + z.h; y++) {
            const part = (lines[y] ?? '').slice(z.x, z.x + z.w)
            for (const m of part.matchAll(/\S+/g)) cells.push({ x: z.x + m.index, y, text: m[0] })
        }
    }
    return cells
}

/** One cell per character: name fields, where every letter is a cursor position. */
export const zoneChars = (lines, zones) => {
    const cells = []
    for (const z of zones) {
        for (let y = z.y; y < z.y + z.h; y++) {
            const line = lines[y] ?? ''
            for (let x = z.x; x < z.x + z.w; x++) if (line[x] && line[x] !== ' ') cells.push({ x, y, text: line[x] })
        }
    }
    return cells
}

/** An FX value whose command is empty ("---00") is not a value worth editing. */
const isEmptyFxValue = (lines, cell) => /^[0-9A-F]{2}$/.test(cell.text) && (lines[cell.y] ?? '').slice(cell.x - 3, cell.x) === '---'

/** Does a cell's text satisfy a job's `want`: any, value, empty, note, file, dash, or a regular expression. */
export const cellWanted = (text, want) => {
    if (text === null || text === undefined) return want === 'any'
    const t = String(text).trim()
    switch (want) {
        case 'any': return true
        case 'value': return t !== '' && !EMPTY_RE.test(t) && !BLANK_RE.test(t)
        case 'empty': return EMPTY_RE.test(t)
        case 'note': return NOTE_RE.test(t)
        case 'file': return t !== '' && !t.startsWith('/')
        case 'dash': return t === '-'
        default: return new RegExp(want).test(t)
    }
}

/**
 * Cells of `target.zones` that fit the job, nearest to `target.near` first (the builder puts it on the zone's first
 * cell, where a song's data usually is). Rows count 1.5 columns: the cells are 12x14 px and a person reads across a
 * row before going down. A blank cell comes after every filled one for "any", and a selection (`room.down`) prefers
 * a start with data in the rows it covers: copying, moving or randomizing empty rows shows nothing.
 */
export const findCandidates = (lines, target) => {
    const charLevel = target.want === 'dash'
    let cells = (charLevel ? zoneChars : zoneTokens)(lines, target.zones).filter((c) => !inAnyZone(c, target.avoid))
    if (target.cmd) {
        const re = new RegExp(target.cmd)
        cells = cells.filter((c) => re.test((lines[c.y] ?? '').slice(c.x - 3, c.x)))
    }
    if (target.room?.down) cells = cells.filter((c) => target.zones.some((z) => inZone(c, z) && c.y + target.room.down < z.y + z.h))
    // pairDown: the cell that many rows below must hold a value too (both ends of a selection).
    const pairOk = (c) => !target.pairDown || cellWanted((lines[c.y + target.pairDown] ?? '').slice(c.x, c.x + Math.max(2, c.text.length)), 'value')
    const wanted = (want) => cells.filter((c) => cellWanted(c.text, want) && !(want === 'value' && isEmptyFxValue(lines, c)) && pairOk(c))
    let list = wanted(target.want)
    if (list.length === 0 && target.fallback) list = wanted(target.fallback)
    const near = target.near ?? { x: 0, y: 0 }
    // "any" still prefers a filled cell: the cursor on a value reads better than on "--".
    const blank = (c) => (target.want === 'any' && (EMPTY_RE.test(c.text) || BLANK_RE.test(c.text)) ? 1000 : 0)
    // Each blank cell of the selection's column below the start costs as much as three rows further away.
    const rows = target.want === 'empty' ? 0 : (target.room?.down ?? 0)
    const emptyBelow = (c) => {
        let n = 0
        for (let i = 1; i <= rows; i++) if (!cellWanted((lines[c.y + i] ?? '').slice(c.x, c.x + c.text.length), 'value')) n++
        return n
    }
    const dist = (c) => Math.hypot(c.x - near.x, (c.y - near.y) * 1.5) + blank(c) + emptyBelow(c) * 4.5
    return list.sort((a, b) => dist(a) - dist(b))
}

/** After navigateTo: is the cursor on a cell the job accepts? */
export const cursorFits = (snap, target) => {
    const pos = snap.state.cursorPos
    if (!pos || !inAnyZone(pos, target.zones) || inAnyZone(pos, target.avoid)) return false
    const lines = snap.screen.lines
    if (target.cmd && !new RegExp(target.cmd).test((lines[pos.y] ?? '').slice(pos.x - 3, pos.x))) return false
    const text = snap.state.textUnderCursor
    const ok = (want) => cellWanted(text, want) && !(want === 'value' && isEmptyFxValue(lines, { x: pos.x, y: pos.y, text: String(text ?? '').trim() }))
    return ok(target.want) || (!!target.fallback && ok(target.fallback))
}

// The track panel on the right of most views: rows 7-14, a mute/solo flag at column 33, the track number at 34 and
// the note playing at 36-38 ("M6 D#7"; "1 ---" when silent).
export const trackPanel = (lines) => lines.slice(7, 15).map((l) => (l ?? '').slice(33, 39))
export const hasTrackPanel = (lines) => trackPanel(lines).filter((cell) => /^[ MS][1-8] (---|[A-G][-#]\d)/.test(cell)).length >= 6
export const trackFlags = (lines) => trackPanel(lines).map((cell) => (cell[0] === 'M' || cell[0] === 'S' ? cell[0] : null))
const panelNotes = (lines) => trackPanel(lines).some((cell) => /[A-G][-#]\d/.test(cell))
// Play heads: '>' before the playing cells (song) and '<' in the left margin (phrase); they move while playing.
const playheads = (lines) => lines.slice(5, 22).map((l) => (l ?? '').slice(0, 33).replace(/[^<>]/g, ' ')).join('\n')

/** 'playing' or 'stopped' from two screens taken a few hundred ms apart; 'unknown' on views without the panel. */
export const transportFrom = (a, b) => {
    if (!hasTrackPanel(a) && !hasTrackPanel(b)) return 'unknown'
    if (panelNotes(a) || panelNotes(b)) return 'playing'
    return playheads(a) !== playheads(b) || trackPanel(a).join() !== trackPanel(b).join() ? 'playing' : 'stopped'
}

/** Song cells that hold a chain, row by row: where to look for a chain or phrase with content. */
export const songCells = (lines) => {
    const cells = []
    for (let y = 6; y <= 21; y++) {
        for (let x = 4; x <= 25; x += 3) {
            const text = (lines[y] ?? '').slice(x, x + 2)
            if (/^[0-9A-F]{2}$/.test(text)) cells.push({ x, y, text })
        }
    }
    return cells
}

/** Song cell of a track: 2 characters, 3 columns per track, from column 4. */
export const songTrackX = (track) => 4 + (track - 1) * 3

/**
 * Where to start the song so a mute or solo has something to act on: a Song cell of one of `tracks` (in that order)
 * whose chain is not one of `skip` (00, FD and FE are kept for silence and stop by convention), preferably on a row
 * with at least `minChains` sounding chains so the song is audible. null when no row has such a cell.
 */
export const songPlayStart = (lines, { tracks = [3, 4], skip = ['00', 'FD', 'FE'], minChains = 4 } = {}) => {
    const sounding = (text) => /^[0-9A-F]{2}$/.test(text) && !skip.includes(text)
    for (const need of minChains > 1 ? [minChains, 1] : [1]) {
        for (let y = 6; y <= 21; y++) {
            const row = Array.from({ length: 8 }, (_, i) => (lines[y] ?? '').slice(songTrackX(i + 1), songTrackX(i + 1) + 2))
            if (row.filter(sounding).length < need) continue
            for (const track of tracks) {
                if (sounding(row[track - 1] ?? '')) return { x: songTrackX(track), y, track, text: row[track - 1] }
            }
        }
    }
    return null
}

/** First song row (screen row 6-21) with at least four chains: a place to start the song with something audible. */
export const songRowWithChains = (lines) => {
    for (let y = 6; y <= 21; y++) {
        const cells = (lines[y] ?? '').slice(4, 27).match(/\S\S/g) ?? []
        if (cells.filter((c) => !EMPTY_RE.test(c)).length >= 4) return y
    }
    return null
}

/** Instrument view: the TYPE value (SAMPLER, FMSYNTH, HYPERSYN, NONE, ...). */
export const instrumentType = (lines) => (lines[5] ?? '').slice(9, 18).trim() || null
export const instrumentMatches = (type, want) => (want === 'filled' ? !!type && type !== 'NONE' : type === want)

/**
 * Text that matters for "did the project change": columns 1-32 of rows 3-21, without play heads and without the
 * play time Project shows while the song runs ("VIEW(>00:00:07)"). Row 22 holds messages ("COPIED SELECTION").
 */
const dataText = (lines) => lines.slice(3, 22).map((l) => (l ?? '').slice(1, 33).replace(/\(>?\d+:\d\d:\d\d\)/g, '').replace(/[<>]/g, ' ')).join('\n')
export const dataChanged = (before, after) => before.state.viewName !== after.state.viewName || dataText(before.screen.lines) !== dataText(after.screen.lines)

// ---------- mirroring a gesture (edit up-then-down becomes down-then-up on a high value) ----------

const SWAP = {
    vertical: [KEY.up, KEY.down],
    horizontal: [KEY.left, KEY.right],
}

const swapBits = (m, a, b) => {
    const hasA = (m & a) !== 0
    const hasB = (m & b) !== 0
    let out = m & ~(a | b)
    if (hasA) out |= b
    if (hasB) out |= a
    return out
}

/** Swaps up/down, left/right, or both ('both': a gesture that mixes large and small steps) in every mask of a recipe. */
export const mirrorSteps = (steps, axis) => {
    const pairs = axis === 'both' ? [SWAP.vertical, SWAP.horizontal] : [SWAP[axis]]
    return steps.map(([t, m]) => [t, pairs.reduce((mask, [a, b]) => swapBits(mask, a, b), m)])
}

/**
 * The first moves of a gesture: the arrow pressed first while modifiers are held, how many times in a row, and
 * the held modifiers. Used to try them before recording and see whether the value clamps.
 */
export const firstMoves = (steps) => {
    const ARROWS = KEY.up | KEY.down | KEY.left | KEY.right
    let prev = 0
    let dir = 0
    let mods = 0
    let count = 0
    for (const [, m] of steps) {
        const pressed = m & ~prev & ARROWS
        if (pressed) {
            if (!dir) {
                dir = pressed
                mods = m & ~ARROWS
            }
            if (pressed === dir && (m & ~ARROWS) === mods) count++
            else if (count) break
        }
        prev = m
    }
    return dir ? { dir, mods, count } : null
}

/** A value near the top of its range goes down first, so the gesture does not clamp and comes back to it. */
export const shouldMirror = (text) => {
    const t = String(text ?? '').trim()
    if (/^[0-9A-F]{2}$/.test(t)) return parseInt(t, 16) >= 0x80
    const note = NOTE_RE.exec(t)
    if (note) return Number(t[2]) >= 6
    return false
}
