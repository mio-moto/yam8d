import { M8KeyMask } from '../keys'
import {
  FILE_BROWSER_EXTENSION_SUFFIX_REGEX,
  type FileBrowserEntryKind,
  type FileBrowserScreen,
  type FileBrowserSnapshot,
  getDirectoryHintTokens,
  getFileBrowserSnapshotFingerprint,
  getFileEntrySearchTerms,
  getSelectedFileBrowserEntry,
  isFileBrowserView,
  isM8FileEntry,
  mergeFileBrowserOrder,
  normalizeForSearch,
  PARENT_ENTRY_KEY,
  parseFileBrowserScreen,
  scoreDirectoryRelevance,
} from './fileBrowserHelpers'
import { type HostIO, wait } from './hostIO'

const browseLog = (message: string, details?: unknown) => {
  if (details === undefined) {
    console.log('[M8SDK browseFile]', message)
    return
  }
  console.log('[M8SDK browseFile]', message, details)
}

type Direction = 'up' | 'down'
type SearchOutcome = 'found' | 'missed' | 'aborted'

/** Rows moved by Opt+Up / Opt+Down. */
const JUMP_ROWS = 8
/**
 * A window showing fewer entries than this cannot be scrolled, so it is the whole
 * directory. Deliberately below any real list height (the screen has 24 rows): the
 * actual height is learned from the first scrolled window.
 */
const MIN_FULL_WINDOW = 8
const MAX_DEPTH = 64
const MAX_SCREENS_PER_LEVEL = 512

/** What is known about one directory while it is being searched. */
type Level = {
  /** Entry keys in display order, merged from every screen seen. */
  order: string[]
  kinds: Map<string, FileBrowserEntryKind>
  /** Entry text as displayed. */
  names: Map<string, string>
  /** The first / last entry of the directory has been on screen. */
  top: boolean
  bottom: boolean
  /** "/.." exists, i.e. this is not the SD card root. */
  hasParent: boolean
  /** Alphabetical sort was applied to this listing and the order seen so far agrees with it. */
  sorted: boolean
  visited: Set<string>
  /** Matches the cursor could not be moved onto. */
  rejected: Set<string>
}

const createLevel = (): Level => ({
  order: [],
  kinds: new Map(),
  names: new Map(),
  top: false,
  bottom: false,
  hasParent: false,
  sorted: false,
  visited: new Set(),
  rejected: new Set(),
})

const opposite = (direction: Direction): Direction => (direction === 'up' ? 'down' : 'up')

/**
 * Navigate the M8 file browser (load/save views) to a file by name.
 *
 * The whole screen is readable, so every move is decided from what is visible:
 *  - a match anywhere on screen is reached directly;
 *  - a directory is read page by page (Opt+Up/Down) before any sub-directory is opened,
 *    and a window that is not full is the whole directory (nothing to page);
 *  - sub-directories are only opened once the files of the level have been checked, and
 *    after coming back the cursor already sits on the folder just visited, so the next
 *    folder is a few rows away instead of a trip to the top of the list.
 */
export const createFileBrowserSearch = (io: HostIO) => {
  const { hasBus, pressAndRelease, getFileBrowserSnapshot, waitForFileBrowserSnapshotChange, getScreenLines } = io

  // Layout facts learned from the device, reused by later searches on this host.
  // Rows of a window known to be scrolled (so full), per view.
  const fullWindowRows = new Map<string, number>()
  // Whether Opt+Up/Down moves the remaining rows near an end (true) or refuses to move (false).
  let jumpClampsAtEnd: boolean | null = null
  // Whether a sorted listing puts every folder before the first file. Unknown until a sorted
  // listing shows a folder before a file it would follow alphabetically (true), or a folder
  // after a file (false).
  let foldersFirst: boolean | null = null

  const browseFileImpl = async (targetText: string, exact: boolean = true): Promise<boolean> => {
    if (!hasBus()) return false

    const normalizedTarget = normalizeForSearch(targetText)
    if (!normalizedTarget) return false
    const targetIncludesExtension = FILE_BROWSER_EXTENSION_SUFFIX_REGEX.test(normalizedTarget)
    const hints = getDirectoryHintTokens(targetText, getFileBrowserSnapshot().viewTitle)

    browseLog('start', { targetText, normalizedTarget, exact })

    const isActive = (): boolean => isFileBrowserView(getFileBrowserSnapshot())

    const stepFileBrowser = async (keyMask: number, timeoutMs: number = 350): Promise<{ changed: boolean; snapshot: FileBrowserSnapshot }> => {
      const previousSnapshot = getFileBrowserSnapshot()
      await pressAndRelease(keyMask, 35)
      const nextSnapshot = await waitForFileBrowserSnapshotChange(previousSnapshot, timeoutMs)
      const changed = getFileBrowserSnapshotFingerprint(nextSnapshot) !== getFileBrowserSnapshotFingerprint(previousSnapshot)
      return { changed, snapshot: nextSnapshot }
    }

    const stepMask = (direction: Direction): number => (direction === 'up' ? M8KeyMask.Up : M8KeyMask.Down)
    const jumpMask = (direction: Direction): number => M8KeyMask.Opt | stepMask(direction)

    const applyAlphabeticalSort = async (): Promise<void> => {
      const previousSnapshot = getFileBrowserSnapshot()
      browseLog('apply alphabetical sort')
      await pressAndRelease(M8KeyMask.Shift | M8KeyMask.Opt, 35)
      // Sorting the browser can take a moment; give the UI time to settle
      // before relying on the next cursor/text snapshot.
      await wait(180)
      await waitForFileBrowserSnapshotChange(previousSnapshot, 300)
    }

    const entryMatchesTarget = (entry: string | null): boolean => {
      if (!isM8FileEntry(entry)) return false
      const searchTerms = getFileEntrySearchTerms(entry)
      return searchTerms.some((term) => (exact ? term === normalizedTarget : term.includes(normalizedTarget)))
    }

    // Name of a file as compared with the target: with its extension only if the target has one.
    const comparableName = (entry: string): string => {
      const trimmed = entry.trim()
      return targetIncludesExtension ? trimmed : trimmed.replace(FILE_BROWSER_EXTENSION_SUFFIX_REGEX, '')
    }
    const primarySearchTerm = (entry: string): string => normalizeForSearch(comparableName(entry))
    const typedTarget = comparableName(targetText)

    // --- Reading the screen ---------------------------------------------------------

    const readScreen = async (): Promise<FileBrowserScreen> => {
      for (let attempt = 0; ; attempt += 1) {
        const screen = parseFileBrowserScreen(getScreenLines(), getFileBrowserSnapshot())
        // Cursor atoms and screen text are updated separately: re-read when they disagree.
        if (screen.consistent || attempt >= 2) return screen
        await wait(40)
      }
    }

    // Fold a screen into what is known about the directory.
    const absorb = (level: Level, screen: FileBrowserScreen): void => {
      const keys = screen.entries.map((entry) => entry.key)
      const merged = mergeFileBrowserOrder(level.order, keys)
      level.order = merged.order
      if (!merged.consistent) {
        level.top = false
        level.bottom = false
      }
      for (const entry of screen.entries) {
        level.kinds.set(entry.key, entry.kind)
        level.names.set(entry.key, entry.text)
      }

      const viewKey = normalizeForSearch(getFileBrowserSnapshot().viewName)
      if (screen.hasParent) {
        level.hasParent = true
        level.top = true
      } else if (level.hasParent && keys.length > 0) {
        // "/.." is above the window: the list is scrolled, so the window is full.
        const known = fullWindowRows.get(viewKey)
        if (known === undefined || keys.length < known) fullWindowRows.set(viewKey, keys.length)
      }

      // A window that is not full cannot be scrolled: it already is the whole directory.
      if (keys.length < Math.max(MIN_FULL_WINDOW, fullWindowRows.get(viewKey) ?? 0)) {
        level.top = true
        level.bottom = true
      }
    }

    // --- Moving the cursor ----------------------------------------------------------

    // Move one page toward `direction`. Returns the new screen, or null at the end of the list.
    const pageLevel = async (level: Level, screen: FileBrowserScreen, direction: Direction): Promise<FileBrowserScreen | null> => {
      const jumped = (await stepFileBrowser(jumpMask(direction), 280)).changed
      let moved = jumped
      let reachedEnd = false

      if (!jumped && jumpClampsAtEnd !== true) {
        // Opt+Up/Down may refuse to move when less than a page remains, or the cursor may
        // already be on the last entry. Plain steps tell the two apart and walk the rest of
        // the way; the window follows the cursor, so one read at the end shows it all.
        for (let step = 0; step < JUMP_ROWS; step += 1) {
          if (!(await stepFileBrowser(stepMask(direction), 250)).changed) {
            reachedEnd = true
            break
          }
          moved = true
          jumpClampsAtEnd = false
        }
      } else if (!jumped) {
        reachedEnd = true
      }

      if (reachedEnd) {
        if (direction === 'up') level.top = true
        else level.bottom = true
        browseLog('end of list', { direction })
      }
      if (!moved) return null

      const next = await readScreen()
      absorb(level, next)
      // Indexes are taken after the merge, which may have inserted entries above.
      const fromIndex = screen.cursorKey ? level.order.indexOf(screen.cursorKey) : -1
      const toIndex = next.cursorKey ? level.order.indexOf(next.cursorKey) : -1
      // A jump that moved fewer rows than a full page was cut short by the end of the list.
      const travelled = Math.abs(toIndex - fromIndex)
      if (jumped && fromIndex >= 0 && toIndex >= 0 && travelled > 0 && travelled < JUMP_ROWS) {
        jumpClampsAtEnd = true
      }
      return next
    }

    const directionToward = (level: Level, screen: FileBrowserScreen, key: string): Direction => {
      if (key === PARENT_ENTRY_KEY) return 'up'
      const target = level.order.indexOf(key)
      const cursor = screen.cursorKey ? level.order.indexOf(screen.cursorKey) : -1
      if (target >= 0 && cursor >= 0) return target < cursor ? 'up' : 'down'
      return level.top && !level.bottom ? 'down' : 'up'
    }

    // Put the cursor on `key`. Returns the screen it ends on, or null if it cannot get there.
    const moveCursorToKey = async (level: Level, key: string, startScreen: FileBrowserScreen): Promise<FileBrowserScreen | null> => {
      let screen = startScreen
      let direction: Direction | null = null
      let reversed = false

      for (let i = 0; i < 96; i += 1) {
        const entry = screen.entries.find((candidate) => candidate.key === key)
        if (entry) {
          if (screen.cursorRow === null) return null
          const delta = entry.row - screen.cursorRow
          if (delta === 0) return screen
          // Screen row delta === rows to travel; jump when far, then fine steps.
          const way: Direction = delta < 0 ? 'up' : 'down'
          const result = await stepFileBrowser(Math.abs(delta) >= JUMP_ROWS ? jumpMask(way) : stepMask(way), 250)
          if (!result.changed) return null
          screen = await readScreen()
          absorb(level, screen)
          continue
        }

        // Not on screen: page toward it, turning round once if that end is reached.
        direction ??= directionToward(level, screen, key)
        const next = await pageLevel(level, screen, direction)
        if (next) {
          screen = next
        } else if (reversed) {
          return null
        } else {
          reversed = true
          direction = opposite(direction)
        }
      }
      return null
    }

    // --- Searching ------------------------------------------------------------------

    // 'failed': a match is visible but the cursor never landed on it (e.g. stale screen).
    const selectVisibleMatch = async (level: Level, screen: FileBrowserScreen): Promise<'found' | 'none' | 'failed'> => {
      const cursorRow = screen.cursorRow ?? 0
      const candidate = screen.entries
        .filter((entry) => entry.kind === 'file' && !level.rejected.has(entry.key) && entryMatchesTarget(entry.text))
        .sort((a, b) => Math.abs(a.row - cursorRow) - Math.abs(b.row - cursorRow))[0]
      if (!candidate) return 'none'

      const reached = await moveCursorToKey(level, candidate.key, screen)
      const entry = getSelectedFileBrowserEntry(getFileBrowserSnapshot())
      if (reached && entryMatchesTarget(entry)) {
        browseLog('match found', { entry, y: reached.cursorRow })
        await stepFileBrowser(M8KeyMask.Edit, 500)
        return 'found'
      }

      browseLog('match not reachable', { candidate: candidate.text })
      level.rejected.add(candidate.key)
      return 'failed'
    }

    // The files of a level in display order, as (case-insensitive, as-displayed) comparable names.
    const levelFiles = (level: Level): { ci: string; raw: string }[] =>
      level.order
        .filter((key) => level.kinds.get(key) === 'file')
        .map((key) => {
          const text = level.names.get(key) ?? ''
          return { ci: primarySearchTerm(text), raw: comparableName(text) }
        })

    // Called on a listing we sorted: checks the order is really alphabetical (by name with or
    // without case, since the firmware's rule is not known) and learns where folders go.
    const reviewSortedLevel = (level: Level): void => {
      if (!level.sorted) return
      const files = levelFiles(level)
      if (files.some((file, index) => index > 0 && (files[index - 1].ci > file.ci || files[index - 1].raw > file.raw))) {
        level.sorted = false
        browseLog('listing is not alphabetical, order hints disabled')
        return
      }

      const entries = level.order.map((key) => {
        const text = (level.names.get(key) ?? '').trim()
        return { kind: level.kinds.get(key), ci: normalizeForSearch(text).replace(/^\//, ''), raw: text.replace(/^\//, '') }
      })
      const firstFile = entries.findIndex((entry) => entry.kind === 'file')
      if (firstFile < 0) return

      if (entries.slice(firstFile).some((entry) => entry.kind === 'dir')) {
        foldersFirst = false
        return
      }
      // A folder listed before a file it follows alphabetically cannot come from merging
      // folders and files by name, so folders really are listed first.
      const proof = entries.some(
        (folder, index) =>
          folder.kind === 'dir' && entries.slice(index + 1).some((file) => file.kind === 'file' && folder.ci > file.ci && folder.raw > file.raw),
      )
      if (proof && foldersFirst === null) foldersFirst = true
    }

    // The listing is sorted, folders precede files, the top is on screen and a visible file
    // already follows the target alphabetically: whatever is below is a later file, so neither
    // the target nor a folder can be there. Only used when the device has shown folders-first.
    const nothingLeftBelow = (level: Level): boolean => {
      if (!exact || !level.sorted || foldersFirst !== true || !level.top || level.bottom) return false
      return levelFiles(level).some(
        (file) => /^[a-z0-9]/.test(file.ci) && file.ci > normalizedTarget && file.raw > typedTarget && file.raw > normalizedTarget,
      )
    }

    // In an alphabetical listing the visible files tell where the target is. This only
    // chooses which end to read first.
    const alphabeticalHint = (level: Level, screen: FileBrowserScreen): Direction | null => {
      if (!exact || !level.sorted) return null
      const visible = screen.entries.filter((entry) => entry.kind === 'file').map((entry) => primarySearchTerm(entry.text))
      const first = visible[0]
      const last = visible[visible.length - 1]
      if (first === undefined || last === undefined) return null
      if (normalizedTarget < first) return 'up'
      if (normalizedTarget > last) return 'down'
      return null
    }

    const pickDirection = (level: Level, screen: FileBrowserScreen): Direction => {
      if (level.top !== level.bottom) return level.top ? 'down' : 'up'
      return alphabeticalHint(level, screen) ?? 'up'
    }

    // Next folder to open: most relevant by name first, then the nearest to the cursor.
    const pickNextDirectory = (level: Level, screen: FileBrowserScreen): string | null => {
      const cursorIndex = screen.cursorKey ? level.order.indexOf(screen.cursorKey) : -1
      let best: { key: string; rank: number } | null = null
      for (const [key, kind] of level.kinds) {
        if (kind !== 'dir' || level.visited.has(key)) continue
        const onScreen = screen.entries.find((entry) => entry.key === key)
        const index = level.order.indexOf(key)
        const distance =
          onScreen && screen.cursorRow !== null
            ? Math.abs(onScreen.row - screen.cursorRow)
            : 100 + (cursorIndex >= 0 && index >= 0 ? Math.abs(index - cursorIndex) : 500)
        const rank = scoreDirectoryRelevance(key, hints) * 10000 - distance
        if (!best || rank > best.rank) best = { key, rank }
      }
      return best?.key ?? null
    }

    // "/.." is the first entry of its directory: jump up until it is on screen, then onto it.
    const climbToParent = async (level: Level, screen: FileBrowserScreen): Promise<boolean> => {
      const reached = await moveCursorToKey(level, PARENT_ENTRY_KEY, screen)
      if (!reached) {
        browseLog('parent directory entry unreachable')
        return false
      }
      browseLog('navigate to parent directory')
      const result = await stepFileBrowser(M8KeyMask.Edit, 500)
      return result.changed && isActive()
    }

    const searchLevel = async (depth: number): Promise<SearchOutcome> => {
      if (depth > MAX_DEPTH || !isActive()) {
        browseLog('search aborted', { depth, active: isActive() })
        return 'aborted'
      }

      const level = createLevel()
      let screen = await readScreen()
      absorb(level, screen)
      browseLog('search directory', { depth, entries: screen.entries.length, complete: level.top && level.bottom })

      // A long listing is worth sorting: the visible names then say which end to read first.
      if (exact && !(level.top && level.bottom)) {
        await applyAlphabeticalSort()
        // Whatever was read before the sort is in an order that no longer holds.
        level.order = []
        level.top = false
        level.bottom = false
        level.sorted = true
        screen = await readScreen()
        absorb(level, screen)
      }

      // 1. Every file of this level, before going deeper.
      for (let pages = 0; ; pages += 1) {
        const picked = await selectVisibleMatch(level, screen)
        if (picked === 'found') return 'found'
        if (picked === 'failed') {
          screen = await readScreen()
          absorb(level, screen)
        }
        reviewSortedLevel(level)
        if (nothingLeftBelow(level)) {
          browseLog('rest of listing is past the target', { depth })
          level.bottom = true
        }
        if ((level.top && level.bottom) || pages >= MAX_SCREENS_PER_LEVEL) break

        const next = await pageLevel(level, screen, pickDirection(level, screen))
        if (next) screen = next
      }

      // 2. Sub-directories. The listing is already known, so folders are taken in the
      // order that costs the fewest moves.
      for (;;) {
        const directory = pickNextDirectory(level, screen)
        if (!directory) break
        level.visited.add(directory)

        const reached = await moveCursorToKey(level, directory, screen)
        if (!reached) {
          browseLog('directory unreachable', { directory })
          screen = await readScreen()
          absorb(level, screen)
          continue
        }

        browseLog('enter directory', { directory, depth })
        const entered = await stepFileBrowser(M8KeyMask.Edit, 500)
        if (!isActive()) return 'aborted'
        if (!entered.changed) {
          screen = await readScreen()
          absorb(level, screen)
          continue
        }

        const outcome = await searchLevel(depth + 1)
        if (outcome !== 'missed') return outcome

        // Back in this directory with the cursor on the folder just left.
        screen = await readScreen()
        absorb(level, screen)
      }

      if (depth === 0) return 'missed'
      // Nothing here: leave straight away, the parent continues with the next folder.
      return (await climbToParent(level, screen)) ? 'missed' : 'aborted'
    }

    if (!isActive()) {
      console.warn('[M8SDK] browseFile requires a file browser view (load/save)')
      return false
    }
    if (getScreenLines().length === 0) {
      console.warn('[M8SDK] browseFile needs the screen reader, which is not available')
      return false
    }

    const outcome = await searchLevel(0)
    if (outcome !== 'found') browseLog('search failed', { targetText, outcome })
    return outcome === 'found'
  }

  return browseFileImpl
}
