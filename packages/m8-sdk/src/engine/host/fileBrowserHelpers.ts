import type { M8State } from '../../types'

// Pure helpers to read the M8 file browser (load/save views) from screen snapshots.

export const normalizeForSearch = (text: string | null): string => {
  return text?.trim().toLowerCase() ?? ''
}

// M8 browser files use short extensions such as .MBN, .MNS, .MNT...
// Accept ".M" followed by two alphanumeric characters so base-name matching
// works across file browser types without hardcoding each one.
export const FILE_BROWSER_EXTENSION_SUFFIX_REGEX = /\.m[a-z0-9]{2}$/i

export type FileBrowserSnapshot = {
  viewName: string | null
  viewTitle: string | null
  cursorPos: M8State['cursorPos']
  textUnderCursor: string | null
  currentLine: string | null
}

export const getFileBrowserSnapshotFingerprint = (snapshot: FileBrowserSnapshot): string => {
  return [
    snapshot.viewName ?? '',
    snapshot.viewTitle ?? '',
    snapshot.cursorPos?.x ?? '',
    snapshot.cursorPos?.y ?? '',
    snapshot.textUnderCursor ?? '',
    snapshot.currentLine ?? '',
  ].join('|')
}

export const getSelectedFileBrowserEntry = (snapshot: FileBrowserSnapshot): string | null => {
  return snapshot.textUnderCursor?.trim() || snapshot.currentLine?.trim() || null
}

export const isFileBrowserView = (snapshot: Pick<FileBrowserSnapshot, 'viewName' | 'viewTitle'>): boolean => {
  const normalizedViewName = normalizeForSearch(snapshot.viewName)
  const normalizedViewTitle = normalizeForSearch(snapshot.viewTitle)
  return (
    normalizedViewName.includes('load') ||
    normalizedViewName.includes('save') ||
    normalizedViewTitle.includes('load') ||
    normalizedViewTitle.includes('save')
  )
}

export const isParentDirectoryEntry = (entry: string | null): boolean => normalizeForSearch(entry) === '/..'
export const isDirectoryEntry = (entry: string | null): boolean => !!entry?.trim().startsWith('/')
export const isM8FileEntry = (entry: string | null): boolean =>
  !!entry && !isDirectoryEntry(entry) && FILE_BROWSER_EXTENSION_SUFFIX_REGEX.test(entry.trim())
export const getFileEntrySearchTerms = (entry: string | null): string[] => {
  const trimmedEntry = entry?.trim() ?? ''
  if (!trimmedEntry) return []

  const normalizedFullName = normalizeForSearch(trimmedEntry)
  const normalizedBaseName = normalizeForSearch(trimmedEntry.replace(FILE_BROWSER_EXTENSION_SUFFIX_REGEX, ''))
  return Array.from(new Set([normalizedFullName, normalizedBaseName].filter(Boolean)))
}

// --- Whole-screen reading -------------------------------------------------------------
// The browser lists one entry per screen row, so a single screen read shows the visible
// window of the current directory: directories ("/name"), the parent entry ("/..") and
// files ("name.m8s"). Only entries with an M8 extension can be a search result; the rest
// ("other") is still a row the cursor can stand on.

export type FileBrowserEntryKind = 'parent' | 'dir' | 'file' | 'other'

export type FileBrowserScreenEntry = {
  /** Screen row, equal to the cursor grid row when the cursor stands on it. */
  row: number
  text: string
  /** Normalized text, unique inside a directory. */
  key: string
  kind: FileBrowserEntryKind
}

export type FileBrowserScreen = {
  entries: FileBrowserScreenEntry[]
  cursorRow: number | null
  cursorKey: string | null
  /** The "/.." entry is visible, so the top of the directory is on screen. */
  hasParent: boolean
  /** False when the cursor row disagrees with the cursor atoms: the screen is mid-redraw. */
  consistent: boolean
}

export const PARENT_ENTRY_KEY = '/..'

export const classifyFileBrowserEntry = (text: string): FileBrowserEntryKind => {
  if (isParentDirectoryEntry(text)) return 'parent'
  // A directory name never contains a slash, so "/a/b" is a path shown in a header.
  if (isDirectoryEntry(text)) return /^\/[^/]+$/.test(text.trim()) ? 'dir' : 'other'
  return isM8FileEntry(text) ? 'file' : 'other'
}

export const parseFileBrowserScreen = (
  lines: string[],
  snapshot: Pick<FileBrowserSnapshot, 'cursorPos' | 'viewTitle' | 'textUnderCursor'>,
): FileBrowserScreen => {
  const rowText = (row: number): string => lines[row]?.trim() ?? ''
  const cursorRow = snapshot.cursorPos?.y ?? null
  const title = normalizeForSearch(snapshot.viewTitle)

  // The list is the run of non-empty rows around the cursor; anything separated from it
  // by a blank row (footer, hints) is not part of it.
  let first = 0
  let last = lines.length - 1
  if (cursorRow !== null && rowText(cursorRow)) {
    first = cursorRow
    while (first > 0 && rowText(first - 1)) first -= 1
    last = cursorRow
    while (last < lines.length - 1 && rowText(last + 1)) last += 1
  }

  const entries: FileBrowserScreenEntry[] = []
  for (let row = first; row <= last; row += 1) {
    const text = rowText(row)
    if (!text || (title && normalizeForSearch(text) === title)) continue
    entries.push({ row, text, key: normalizeForSearch(text), kind: classifyFileBrowserEntry(text) })
  }

  const cursorText = snapshot.textUnderCursor?.trim()
  return {
    entries,
    cursorRow,
    cursorKey: cursorRow === null ? null : (entries.find((entry) => entry.row === cursorRow)?.key ?? null),
    hasParent: entries.some((entry) => entry.kind === 'parent'),
    consistent: !cursorText || cursorRow === null || rowText(cursorRow).includes(cursorText),
  }
}

/**
 * Merge the entry keys of one screen into the display order accumulated for a directory.
 * Screens overlap, so the first known entry anchors the new ones. When the screen
 * contradicts the accumulated order (listing re-sorted or reloaded) the order restarts from
 * the screen and `consistent` is false.
 */
export const mergeFileBrowserOrder = (order: string[], screen: string[]): { order: string[]; consistent: boolean } => {
  if (screen.length === 0) return { order, consistent: true }
  if (order.length === 0) return { order: [...screen], consistent: true }

  const anchor = screen.findIndex((key) => order.includes(key))
  if (anchor === -1) return { order: [...screen], consistent: false }

  const start = order.indexOf(screen[anchor]) - anchor
  const merged = start < 0 ? [...new Array<string>(-start).fill(''), ...order] : [...order]
  const offset = Math.max(0, start)
  for (let index = 0; index < screen.length; index += 1) {
    const position = offset + index
    const known = position < merged.length && merged[position] !== ''
    if (known) {
      if (merged[position] !== screen[index]) return { order: [...screen], consistent: false }
      continue
    }
    // A new entry that is already known elsewhere means the listing was reordered.
    if (merged.includes(screen[index])) return { order: [...screen], consistent: false }
    if (position >= merged.length) merged.push(screen[index])
    else merged[position] = screen[index]
  }
  return { order: merged, consistent: true }
}

const tokenize = (text: string): string[] => text.split(/[^a-z0-9]+/).filter((token) => token.length >= 3)
const TITLE_STOP_WORDS = new Set(['load', 'save', 'select', 'create', 'directory', 'new'])

/** Words of the search target (without its extension) and of the view title, to rank directories. */
export const getDirectoryHintTokens = (targetText: string, viewTitle: string | null) => ({
  target: tokenize(normalizeForSearch(targetText).replace(FILE_BROWSER_EXTENSION_SUFFIX_REGEX, '')),
  title: tokenize(normalizeForSearch(viewTitle)).filter((token) => !TITLE_STOP_WORDS.has(token)),
})

/**
 * 2: the folder name shares a word with the target ("/Bass" for "bassline"),
 * 1: it shares a word with the view title ("/Instruments" in "LOAD INSTRUMENT"), else 0.
 * Only used to decide which folder to open first, never to skip one.
 */
export const scoreDirectoryRelevance = (directoryKey: string, hints: ReturnType<typeof getDirectoryHintTokens>): number => {
  const name = directoryKey.replace(/^\//, '')
  if (name.length < 3) return 0
  const related = (token: string) => token.includes(name) || name.includes(token)
  if (hints.target.some(related)) return 2
  if (hints.title.some(related)) return 1
  return 0
}
