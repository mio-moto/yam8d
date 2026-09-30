import type { M8State } from '../types'

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
    return normalizedViewName.includes('load')
        || normalizedViewName.includes('save')
        || normalizedViewTitle.includes('load')
        || normalizedViewTitle.includes('save')
}

export const isParentDirectoryEntry = (entry: string | null): boolean => normalizeForSearch(entry) === '/..'
export const isDirectoryEntry = (entry: string | null): boolean => !!entry?.trim().startsWith('/')
export const isM8FileEntry = (entry: string | null): boolean => !!entry && !isDirectoryEntry(entry) && FILE_BROWSER_EXTENSION_SUFFIX_REGEX.test(entry.trim())
export const getFileEntrySearchTerms = (entry: string | null): string[] => {
    const trimmedEntry = entry?.trim() ?? ''
    if (!trimmedEntry) return []

    const normalizedFullName = normalizeForSearch(trimmedEntry)
    const normalizedBaseName = normalizeForSearch(trimmedEntry.replace(FILE_BROWSER_EXTENSION_SUFFIX_REGEX, ''))
    return Array.from(new Set([normalizedFullName, normalizedBaseName].filter(Boolean)))
}
