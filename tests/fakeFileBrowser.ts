import { M8KeyMask } from '../packages/m8-sdk/src/engine/keys'
import type { FileBrowserSnapshot } from '../packages/m8-sdk/src/engine/host/fileBrowserHelpers'
import type { HostIO } from '../packages/m8-sdk/src/engine/host/hostIO'

// A software model of the M8 load view: one entry per screen row, a window that follows the
// cursor, Opt+Up/Down jumps of 8 rows, Shift+Opt alphabetical sort, and "/.." putting the
// cursor back on the folder that was left.

/** Directory tree: "/name" keys are folders, other keys are files (value null). */
export type FakeTree = { [name: string]: FakeTree | null }

export type FakeOptions = {
    /** Rows of the list window (screen has 24 rows, title on row 0). */
    capacity?: number
    /** Opt+Up/Down with fewer rows left: move what remains ('clamp') or do nothing ('refuse'). */
    jump?: 'clamp' | 'refuse'
    /** Where folders go once sorted: before the files, or among them by name. */
    sortFolders?: 'first' | 'mixed'
    /** A directory re-read when coming back from a child comes back unsorted. */
    unsortOnReturn?: boolean
    /** Case-sensitive (ASCII) alphabetical sort instead of case-insensitive. */
    asciiSort?: boolean
    /** Start inside this path instead of the root. */
    startPath?: string[]
    /** Index of the entry the cursor starts on. */
    startCursor?: number
}

const TITLE = 'LOAD INSTRUMENT'
const KEY = M8KeyMask

export const createFakeFileBrowser = (tree: FakeTree, options: FakeOptions = {}) => {
    const capacity = options.capacity ?? 18
    const jumpMode = options.jump ?? 'clamp'
    const sortFolders = options.sortFolders ?? 'first'

    let path: string[] = options.startPath ?? []
    let entries: string[] = []
    let cursor = 0
    let top = 0
    let selected: string | null = null
    let active = true
    // Directories the user sorted; a re-read keeps that order unless `unsortOnReturn`.
    const sortedDirs = new Set<string>()

    const stats = { presses: 0, noChange: 0, timeMs: 0, sorts: 0, enters: 0 }

    const node = (p: string[]): FakeTree => p.reduce<FakeTree>((current, name) => current[name] as FakeTree, tree)
    const load = (p: string[]): string[] => [...(p.length > 0 ? ['/..'] : []), ...Object.keys(node(p))]

    const fit = () => {
        if (cursor < top) top = cursor
        if (cursor >= top + capacity) top = cursor - capacity + 1
    }

    const compareNames = (a: string, b: string) => {
        const x = options.asciiSort ? a : a.toLowerCase()
        const y = options.asciiSort ? b : b.toLowerCase()
        return x < y ? -1 : x > y ? 1 : 0
    }

    const sortEntries = () => {
        const current = entries[cursor]
        const parent = entries.filter(entry => entry === '/..')
        const rest = entries.filter(entry => entry !== '/..')
        const dirs = rest.filter(entry => entry.startsWith('/')).sort((a, b) => compareNames(a.slice(1), b.slice(1)))
        const files = rest.filter(entry => !entry.startsWith('/')).sort(compareNames)
        const sorted = sortFolders === 'first'
            ? [...dirs, ...files]
            : rest.sort((a, b) => compareNames(a.replace(/^\//, ''), b.replace(/^\//, '')))
        entries = [...parent, ...sorted]
        cursor = Math.max(0, entries.indexOf(current))
        top = 0
        fit()
    }

    entries = load(path)
    cursor = Math.min(options.startCursor ?? 0, entries.length - 1)
    fit()

    const move = (delta: number, jump: boolean) => {
        let next = cursor + delta
        if (jump && jumpMode === 'refuse' && (next < 0 || next > entries.length - 1)) return
        next = Math.max(0, Math.min(entries.length - 1, next))
        cursor = next
        fit()
    }

    const press = (mask: number) => {
        if (!active) return
        if (mask === (KEY.Shift | KEY.Opt)) {
            stats.sorts += 1
            sortedDirs.add(path.join('/'))
            sortEntries()
            return
        }
        if (mask & KEY.Up) move(mask & KEY.Opt ? -8 : -1, !!(mask & KEY.Opt))
        else if (mask & KEY.Down) move(mask & KEY.Opt ? 8 : 1, !!(mask & KEY.Opt))
        else if (mask === KEY.Edit) {
            const entry = entries[cursor]
            if (entry === '/..') {
                const left = path[path.length - 1]
                path = path.slice(0, -1)
                entries = load(path)
                if (!options.unsortOnReturn && sortedDirs.has(path.join('/'))) sortEntries()
                cursor = Math.max(0, entries.indexOf(left))
                top = 0
                fit()
            } else if (entry.startsWith('/')) {
                stats.enters += 1
                path = [...path, entry]
                entries = load(path)
                cursor = 0
                top = 0
            } else {
                selected = path.length > 0 ? `${path.join('')}/${entry}` : entry
                active = false
            }
        }
    }

    const snapshot = (): FileBrowserSnapshot => {
        const entry = active ? entries[cursor] : null
        return {
            viewName: active ? 'loadinstrument' : 'instrument',
            viewTitle: active ? TITLE : 'INSTRUMENT',
            cursorPos: active ? { x: 0, y: 1 + cursor - top } : null,
            textUnderCursor: entry,
            currentLine: entry,
        } as FileBrowserSnapshot
    }

    const fingerprint = (s: FileBrowserSnapshot) => [s.viewName, s.viewTitle, s.cursorPos?.y, s.textUnderCursor].join('|')

    const screenLines = (): string[] => {
        const lines = new Array<string>(24).fill('')
        if (!active) return lines
        lines[0] = ` ${TITLE}`
        for (let row = 0; row < capacity; row += 1) {
            const entry = entries[top + row]
            if (entry !== undefined) lines[1 + row] = entry
        }
        return lines
    }

    const io: HostIO = {
        // biome-ignore lint/suspicious/noExplicitAny: only the members the search uses are modelled
        store: undefined as any,
        debugLog: () => {},
        hasBus: () => true,
        sendKeys: () => {},
        pressAndRelease: async (mask: number) => {
            stats.presses += 1
            stats.timeMs += 70
            press(mask)
        },
        waitForTextUnderCursorChange: async () => null,
        waitForCurrentLineChange: async () => null,
        getFileBrowserSnapshot: snapshot,
        waitForFileBrowserSnapshotChange: async (previous: FileBrowserSnapshot, timeoutMs: number = 500) => {
            const current = snapshot()
            if (fingerprint(current) === fingerprint(previous)) {
                stats.noChange += 1
                stats.timeMs += timeoutMs
            } else {
                stats.timeMs += 30
            }
            return current
        },
        getScreenLines: screenLines,
    }

    return {
        io,
        stats,
        get selected() { return selected },
        get path() { return path },
    }
}

/** n numbered files "<prefix>NNN.m8i" */
export const files = (prefix: string, count: number, ext = 'm8i'): FakeTree =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${String(i).padStart(3, '0')}.${ext}`, null]))
