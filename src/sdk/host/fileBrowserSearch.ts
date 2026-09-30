import { M8KeyMask } from '../../features/connection/keys'
import { getScreenLines, SCREEN_ROWS } from '../../features/state/viewExtractor'
import {
    FILE_BROWSER_EXTENSION_SUFFIX_REGEX,
    type FileBrowserSnapshot,
    getFileBrowserSnapshotFingerprint,
    getFileEntrySearchTerms,
    getSelectedFileBrowserEntry,
    isDirectoryEntry,
    isFileBrowserView,
    isM8FileEntry,
    isParentDirectoryEntry,
    normalizeForSearch,
} from './fileBrowserHelpers'
import { type HostIO, wait } from './hostIO'

const browseLog = (message: string, details?: unknown) => {
    if (details === undefined) {
        console.log('[M8SDK browseFile]', message)
        return
    }
    console.log('[M8SDK browseFile]', message, details)
}

// Navigate the M8 file browser (load/save views) to a file by name.
export const createFileBrowserSearch = (io: HostIO) => {
    const { hasBus, pressAndRelease, getFileBrowserSnapshot, waitForFileBrowserSnapshotChange } = io

    const browseFileImpl = async (targetText: string, exact: boolean = true): Promise<boolean> => {
        if (!hasBus()) return false

        type FileBrowserDirection = 'up' | 'down'

        const normalizedTarget = normalizeForSearch(targetText)
        const targetIncludesExtension = FILE_BROWSER_EXTENSION_SUFFIX_REGEX.test(normalizedTarget)
        if (!normalizedTarget) {
            return false
        }

        browseLog('start', { targetText, normalizedTarget, exact })

        const ensureFileBrowserActive = (): boolean => {
            const snapshot = getFileBrowserSnapshot()
            return isFileBrowserView(snapshot)
        }

        const stepFileBrowser = async (keyMask: number, timeoutMs: number = 350): Promise<{ changed: boolean; snapshot: FileBrowserSnapshot }> => {
            const previousSnapshot = getFileBrowserSnapshot()
            await pressAndRelease(keyMask, 35)
            const nextSnapshot = await waitForFileBrowserSnapshotChange(previousSnapshot, timeoutMs)
            const changed = getFileBrowserSnapshotFingerprint(nextSnapshot) !== getFileBrowserSnapshotFingerprint(previousSnapshot)
            return { changed, snapshot: nextSnapshot }
        }

        const getStepMask = (direction: FileBrowserDirection): number => direction === 'up' ? M8KeyMask.Up : M8KeyMask.Down
        const getJumpMask = (direction: FileBrowserDirection): number => direction === 'up' ? (M8KeyMask.Opt | M8KeyMask.Up) : (M8KeyMask.Opt | M8KeyMask.Down)

        const moveToTopOfCurrentDirectory = async (): Promise<FileBrowserSnapshot> => {
            let snapshot = getFileBrowserSnapshot()
            for (let i = 0; i < 512; i++) {
                const result = await stepFileBrowser(M8KeyMask.Up, 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('reached top of directory', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    return snapshot
                }
            }
            browseLog('top search hit safety cap', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
            return snapshot
        }

        const applyAlphabeticalSort = async (): Promise<void> => {
            const previousSnapshot = getFileBrowserSnapshot()
            browseLog('apply alphabetical sort')
            await pressAndRelease(M8KeyMask.Shift | M8KeyMask.Opt, 35)
            // Sorting the browser can take a moment; give the UI time to settle
            // before relying on the next cursor/text snapshot.
            await wait(180)
            const sortedSnapshot = await waitForFileBrowserSnapshotChange(previousSnapshot, 300)
            browseLog('sort settled', { entry: getSelectedFileBrowserEntry(sortedSnapshot), y: sortedSnapshot.cursorPos?.y })
        }

        const moveByRowCount = async (direction: FileBrowserDirection, rows: number): Promise<FileBrowserSnapshot> => {
            let remainingRows = Math.max(0, Math.floor(rows))
            let snapshot = getFileBrowserSnapshot()
            browseLog('move by row count', { direction, rows: remainingRows, from: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })

            while (remainingRows >= 8) {
                const result = await stepFileBrowser(getJumpMask(direction), 280)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('jump stopped early', { direction, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    return snapshot
                }
                remainingRows -= 8
            }

            while (remainingRows > 0) {
                const result = await stepFileBrowser(getStepMask(direction), 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('fine move stopped early', { direction, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    return snapshot
                }
                remainingRows -= 1
            }

            browseLog('move by row count complete', { direction, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
            return snapshot
        }

        const entryMatchesTarget = (entry: string | null): boolean => {
            if (!isM8FileEntry(entry)) return false
            const searchTerms = getFileEntrySearchTerms(entry)
            return searchTerms.some(term => exact ? term === normalizedTarget : term.includes(normalizedTarget))
        }

        // The whole screen is readable, so a match anywhere in the visible list can be
        // reached directly instead of stepping through every row above it. Screen line
        // index === cursor grid row, so the row delta is the number of steps to take.
        const findMatchingRowOnScreen = (cursorY: number): number | null => {
            let bestRow: number | null = null
            getScreenLines().forEach((line, row) => {
                if (!entryMatchesTarget(line.trim())) return
                if (bestRow === null || Math.abs(row - cursorY) < Math.abs(bestRow - cursorY)) {
                    bestRow = row
                }
            })
            return bestRow
        }

        // 'none': nothing visible matches (cursor untouched). 'failed': we moved toward a
        // visible match but the cursor never landed on it (e.g. stale screen); callers
        // should stop using this shortcut for the current directory.
        const selectVisibleMatch = async (): Promise<'found' | 'none' | 'failed'> => {
            for (let i = 0; i < SCREEN_ROWS * 2; i++) {
                const snapshot = getFileBrowserSnapshot()
                const cursorY = snapshot.cursorPos?.y
                if (cursorY === undefined || cursorY === null) return i === 0 ? 'none' : 'failed'

                const row = findMatchingRowOnScreen(cursorY)
                if (row === null) return i === 0 ? 'none' : 'failed'

                if (row === cursorY) {
                    const entry = getSelectedFileBrowserEntry(snapshot)
                    if (!entryMatchesTarget(entry)) return 'failed'
                    browseLog('match found on screen', { entry, y: cursorY })
                    await stepFileBrowser(M8KeyMask.Edit, 500)
                    return 'found'
                }

                const result = await stepFileBrowser(getStepMask(row < cursorY ? 'up' : 'down'), 250)
                if (!result.changed) return 'failed'
            }
            return 'failed'
        }

        const getPrimaryFileSearchTerm = (entry: string | null): string | null => {
            if (!isM8FileEntry(entry)) return null
            const terms = getFileEntrySearchTerms(entry)
            return targetIncludesExtension ? (terms[0] ?? null) : (terms[1] ?? terms[0] ?? null)
        }

        const compareFileEntryToTarget = (entry: string | null): number | null => {
            const primaryTerm = getPrimaryFileSearchTerm(entry)
            if (!primaryTerm) return null
            return primaryTerm.localeCompare(normalizedTarget)
        }

        const sharedPrefixLength = (a: string, b: string): number => {
            const maxLength = Math.min(a.length, b.length)
            let index = 0
            while (index < maxLength && a[index] === b[index]) {
                index += 1
            }
            return index
        }

        const shouldRescanJumpedBlock = (entry: string | null, compareToTarget: number | null): boolean => {
            if (compareToTarget === null) return true
            if (compareToTarget >= 0) return true

            const primaryTerm = getPrimaryFileSearchTerm(entry)
            if (!primaryTerm) return true

            // In exact sorted mode, stay in coarse-jump mode until we reach the
            // alphabetical neighborhood of the target. Once the landing entry
            // shares a meaningful prefix with the target, switch to fine scan
            // so we don't skip nearby exact matches inside the jumped block.
            const neighborhoodPrefix = Math.max(1, Math.min(3, normalizedTarget.length))
            return sharedPrefixLength(primaryTerm, normalizedTarget) >= neighborhoodPrefix
        }

        const shouldJumpTowardExactTarget = (entry: string | null): boolean => {
            if (!exact) return false
            const primaryTerm = getPrimaryFileSearchTerm(entry)
            if (!primaryTerm) return false
            if (primaryTerm.localeCompare(normalizedTarget) >= 0) return false
            return sharedPrefixLength(primaryTerm, normalizedTarget) < 2
        }

        const restoreEntryInCurrentDirectory = async (targetEntry: string): Promise<boolean> => {
            const normalizedEntry = normalizeForSearch(targetEntry)
            let snapshot = await moveToTopOfCurrentDirectory()
            browseLog('restore entry', { targetEntry })
            for (let i = 0; i < 2048; i++) {
                const currentEntry = getSelectedFileBrowserEntry(snapshot)
                if (normalizeForSearch(currentEntry) === normalizedEntry) {
                    browseLog('restore entry success', { targetEntry, y: snapshot.cursorPos?.y })
                    return true
                }

                const result = await stepFileBrowser(M8KeyMask.Down, 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    break
                }
            }

            browseLog('restore entry failed', { targetEntry })
            return false
        }

        const navigateToParentDirectory = async (): Promise<boolean> => {
            const topSnapshot = await moveToTopOfCurrentDirectory()
            const topEntry = getSelectedFileBrowserEntry(topSnapshot)
            if (!isParentDirectoryEntry(topEntry)) {
                browseLog('parent directory entry missing at top', { topEntry })
                return false
            }

            browseLog('navigate to parent directory')
            await stepFileBrowser(M8KeyMask.Edit, 500)
            return ensureFileBrowserActive()
        }

        const searchCurrentDirectory = async (depth: number): Promise<boolean> => {
            if (depth > 64 || !ensureFileBrowserActive()) {
                browseLog('search aborted', { depth, active: ensureFileBrowserActive() })
                return false
            }

            browseLog('search directory', { depth, entry: getSelectedFileBrowserEntry(getFileBrowserSnapshot()) })

            if (exact) {
                await applyAlphabeticalSort()
            }

            const inspectCurrentEntry = async (): Promise<'found' | 'continue' | 'failed'> => {
                const currentEntry = getSelectedFileBrowserEntry(getFileBrowserSnapshot())
                const normalizedEntry = normalizeForSearch(currentEntry)
                if (!normalizedEntry || isParentDirectoryEntry(currentEntry)) {
                    browseLog('skip entry', { currentEntry })
                    return 'continue'
                }

                browseLog('inspect entry', {
                    depth,
                    currentEntry,
                    y: getFileBrowserSnapshot().cursorPos?.y,
                    file: isM8FileEntry(currentEntry),
                    directory: isDirectoryEntry(currentEntry),
                })

                if (entryMatchesTarget(currentEntry)) {
                    browseLog('match found', { currentEntry, depth })
                    await stepFileBrowser(M8KeyMask.Edit, 500)
                    return 'found'
                }

                if (isDirectoryEntry(currentEntry)) {
                    const directoryEntry = currentEntry
                    browseLog('enter directory', { directoryEntry, depth })
                    await stepFileBrowser(M8KeyMask.Edit, 500)
                    if (!ensureFileBrowserActive()) {
                        browseLog('directory entry left file browser unexpectedly', { directoryEntry, depth })
                        return 'failed'
                    }

                    const foundInDirectory = await searchCurrentDirectory(depth + 1)
                    if (foundInDirectory) {
                        return 'found'
                    }

                    const navigatedBack = await navigateToParentDirectory()
                    if (!navigatedBack) {
                        browseLog('failed to navigate back to parent', { directoryEntry, depth })
                        return 'failed'
                    }

                    return (await restoreEntryInCurrentDirectory(directoryEntry ?? '')) ? 'continue' : 'failed'
                }

                return 'continue'
            }

            let visibleShortcutUsable = true

            if (exact) {
                let snapshot = await moveToTopOfCurrentDirectory()
                let allowCoarseJumps = true
                let coarseResumeFingerprint: string | null = null
                browseLog('exact search begins', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                for (let i = 0; i < 2048; i++) {
                    if (coarseResumeFingerprint && getFileBrowserSnapshotFingerprint(snapshot) === coarseResumeFingerprint) {
                        allowCoarseJumps = true
                        coarseResumeFingerprint = null
                        browseLog('coarse jumps re-enabled after rescanning jumped block', {
                            entry: getSelectedFileBrowserEntry(snapshot),
                            y: snapshot.cursorPos?.y,
                        })
                    }

                    if (visibleShortcutUsable) {
                        const visible = await selectVisibleMatch()
                        if (visible === 'found') return true
                        if (visible === 'failed') {
                            visibleShortcutUsable = false
                            snapshot = getFileBrowserSnapshot()
                        }
                    }

                    const entry = getSelectedFileBrowserEntry(snapshot)
                    const compare = compareFileEntryToTarget(entry)

                    const inspection = await inspectCurrentEntry()
                    if (inspection === 'found') {
                        return true
                    }
                    if (inspection === 'failed') {
                        return false
                    }
                    snapshot = getFileBrowserSnapshot()

                    if (allowCoarseJumps && shouldJumpTowardExactTarget(entry)) {
                        browseLog('coarse jump down', { entry, compare, y: snapshot.cursorPos?.y })
                        const jumpResult = await stepFileBrowser(getJumpMask('down'), 280)
                        snapshot = jumpResult.snapshot
                        if (!jumpResult.changed) {
                            browseLog('coarse jump hit end', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                            break
                        }

                        const afterJumpCompare = compareFileEntryToTarget(getSelectedFileBrowserEntry(snapshot))
                        browseLog('after coarse jump', {
                            entry: getSelectedFileBrowserEntry(snapshot),
                            compareBefore: compare,
                            compareAfter: afterJumpCompare,
                            y: snapshot.cursorPos?.y,
                        })
                        if (shouldRescanJumpedBlock(getSelectedFileBrowserEntry(snapshot), afterJumpCompare)) {
                            // We are at or near the target alphabetic window: rewind into the
                            // jumped block, scan it line-by-line, then resume coarse jumps only
                            // once we return to the landing entry.
                            const landingFingerprint = getFileBrowserSnapshotFingerprint(snapshot)
                            let rewoundSnapshot = snapshot
                            browseLog('rewind for fine scan of jumped block', {
                                landingEntry: getSelectedFileBrowserEntry(snapshot),
                                landingY: snapshot.cursorPos?.y,
                            })
                            for (let rewind = 0; rewind < 7; rewind++) {
                                const rewindResult = await stepFileBrowser(getStepMask('up'), 250)
                                rewoundSnapshot = rewindResult.snapshot
                                if (!rewindResult.changed) {
                                    break
                                }
                            }
                            snapshot = rewoundSnapshot
                            allowCoarseJumps = false
                            coarseResumeFingerprint = landingFingerprint
                            browseLog('rewind complete, scanning jumped block line-by-line', {
                                entry: getSelectedFileBrowserEntry(snapshot),
                                y: snapshot.cursorPos?.y,
                            })
                        } else {
                            browseLog('still below target letters, keep coarse jumps', {
                                entry: getSelectedFileBrowserEntry(snapshot),
                                compareAfter: afterJumpCompare,
                                y: snapshot.cursorPos?.y,
                            })
                        }
                        continue
                    }

                    const result = await stepFileBrowser(getStepMask('down'), 250)
                    snapshot = result.snapshot
                    if (!result.changed) {
                        browseLog('exact scan reached end', { entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                        break
                    }
                }

                browseLog('exact search failed', { targetText, normalizedTarget })
                return false
            }

            const initialVisible = await selectVisibleMatch()
            if (initialVisible === 'found') return true
            if (initialVisible === 'failed') visibleShortcutUsable = false

            const startSnapshot = getFileBrowserSnapshot()
            browseLog('fuzzy search begins', { entry: getSelectedFileBrowserEntry(startSnapshot), y: startSnapshot.cursorPos?.y })
            const initialInspection = await inspectCurrentEntry()
            if (initialInspection === 'found') {
                return true
            }
            if (initialInspection === 'failed') {
                return false
            }

            let upwardRows = 0
            let snapshot = startSnapshot
            for (let i = 0; i < 2048; i++) {
                const result = await stepFileBrowser(getStepMask('up'), 250)
                snapshot = result.snapshot
                if (!result.changed) {
                    browseLog('fuzzy upward pass reached top', { upwardRows, entry: getSelectedFileBrowserEntry(snapshot), y: snapshot.cursorPos?.y })
                    break
                }

                upwardRows += 1
                const upwardInspection = await inspectCurrentEntry()
                if (upwardInspection === 'found') {
                    return true
                }
                if (upwardInspection === 'failed') {
                    return false
                }
            }

            await moveByRowCount('down', upwardRows)

            let downwardSnapshot = getFileBrowserSnapshot()
            if (getFileBrowserSnapshotFingerprint(downwardSnapshot) !== getFileBrowserSnapshotFingerprint(startSnapshot)) {
                browseLog('restore exact starting point after upward pass', {
                    startEntry: getSelectedFileBrowserEntry(startSnapshot),
                    currentEntry: getSelectedFileBrowserEntry(downwardSnapshot),
                })
                await restoreEntryInCurrentDirectory(getSelectedFileBrowserEntry(startSnapshot) ?? '')
                downwardSnapshot = getFileBrowserSnapshot()
            }

            for (let i = 0; i < 2048; i++) {
                if (visibleShortcutUsable) {
                    const visible = await selectVisibleMatch()
                    if (visible === 'found') return true
                    if (visible === 'failed') visibleShortcutUsable = false
                }

                const result = await stepFileBrowser(getStepMask('down'), 250)
                downwardSnapshot = result.snapshot
                if (!result.changed) {
                    browseLog('fuzzy downward pass reached end', { entry: getSelectedFileBrowserEntry(downwardSnapshot), y: downwardSnapshot.cursorPos?.y })
                    break
                }

                const downwardInspection = await inspectCurrentEntry()
                if (downwardInspection === 'found') {
                    return true
                }
                if (downwardInspection === 'failed') {
                    return false
                }
            }

            browseLog('fuzzy search failed', { targetText, normalizedTarget })
            return false
        }

        if (!ensureFileBrowserActive()) {
            console.warn('[M8SDK] browseFile requires a file browser view (load/save)')
            return false
        }

        return searchCurrentDirectory(0)
    }

    return browseFileImpl
}
