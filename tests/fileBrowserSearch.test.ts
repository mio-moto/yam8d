import { describe, expect, it } from 'bun:test'
import { type FakeOptions, type FakeTree, createFakeFileBrowser, files } from './fakeFileBrowser'
import {
    classifyFileBrowserEntry,
    mergeFileBrowserOrder,
    parseFileBrowserScreen,
    scoreDirectoryRelevance,
    getDirectoryHintTokens,
} from '../packages/m8-sdk/src/engine/host/fileBrowserHelpers'
import { createFileBrowserSearch } from '../packages/m8-sdk/src/engine/host/fileBrowserSearch'

const run = async (tree: FakeTree, target: string, exact = true, options: FakeOptions = {}) => {
    const log = console.log
    console.log = () => {}
    try {
        const browser = createFakeFileBrowser(tree, options)
        const found = await createFileBrowserSearch(browser.io)(target, exact)
        return { found, selected: browser.selected, stats: browser.stats }
    } finally {
        console.log = log
    }
}

describe('file browser screen helpers', () => {
    it('classifies entries', () => {
        expect(classifyFileBrowserEntry('/..')).toBe('parent')
        expect(classifyFileBrowserEntry('/Bass')).toBe('dir')
        expect(classifyFileBrowserEntry('/Instruments/Bass')).toBe('other')
        expect(classifyFileBrowserEntry('Lead.m8i')).toBe('file')
        expect(classifyFileBrowserEntry('kick.wav')).toBe('other')
    })

    it('reads the list around the cursor and leaves out the title and what follows a blank row', () => {
        const lines = ['  LOAD INSTRUMENT', '/..', '/Bass', 'Lead.m8i', '', 'FREE 12GB']
        const screen = parseFileBrowserScreen(lines, {
            cursorPos: { x: 0, y: 2 },
            viewTitle: 'LOAD INSTRUMENT',
            textUnderCursor: '/Bass',
        })
        expect(screen.entries.map(entry => [entry.row, entry.key, entry.kind])).toEqual([
            [1, '/..', 'parent'],
            [2, '/bass', 'dir'],
            [3, 'lead.m8i', 'file'],
        ])
        expect(screen.cursorKey).toBe('/bass')
        expect(screen.hasParent).toBe(true)
        expect(screen.consistent).toBe(true)
    })

    it('flags a screen that disagrees with the cursor atoms', () => {
        const screen = parseFileBrowserScreen(['T', '/..', '/Old'], {
            cursorPos: { x: 0, y: 2 },
            viewTitle: 'T',
            textUnderCursor: '/New',
        })
        expect(screen.consistent).toBe(false)
    })

    it('merges overlapping screens and restarts when they contradict', () => {
        const first = mergeFileBrowserOrder([], ['a', 'b', 'c'])
        const down = mergeFileBrowserOrder(first.order, ['c', 'd', 'e'])
        expect(down).toEqual({ order: ['a', 'b', 'c', 'd', 'e'], consistent: true })
        const up = mergeFileBrowserOrder(['c', 'd'], ['a', 'b', 'c'])
        expect(up).toEqual({ order: ['a', 'b', 'c', 'd'], consistent: true })
        expect(mergeFileBrowserOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual({ order: ['c', 'a'], consistent: false })
        expect(mergeFileBrowserOrder(['a', 'b'], ['x', 'y'])).toEqual({ order: ['x', 'y'], consistent: false })
    })

    it('ranks folders by shared words with the target and the view title', () => {
        const hints = getDirectoryHintTokens('bassline.m8i', 'LOAD INSTRUMENT')
        expect(scoreDirectoryRelevance('/bass', hints)).toBe(2)
        expect(scoreDirectoryRelevance('/instruments', hints)).toBe(1)
        expect(scoreDirectoryRelevance('/misc', hints)).toBe(0)
        expect(scoreDirectoryRelevance('/a', hints)).toBe(0)
    })
})

describe('browseFile on a simulated M8', () => {
    const tree: FakeTree = {
        '/Songs': { '/Old': { 'demo.m8s': null }, 'song1.m8s': null },
        '/Instruments': {
            '/Bass': { 'sub.m8i': null, 'bassline.m8i': null },
            '/Drums': { '/Kits': { 'deep.m8i': null }, 'kick.m8i': null, 'snare.m8i': null },
            'lead.m8i': null,
        },
        '/Empty': {},
        'readme.txt': null,
        'root.m8i': null,
    }

    it('selects a file visible in the current directory', async () => {
        const result = await run(tree, 'root.m8i')
        expect(result.found).toBe(true)
        expect(result.selected).toBe('root.m8i')
    })

    it('matches the base name without extension', async () => {
        const result = await run(tree, 'root')
        expect(result.selected).toBe('root.m8i')
    })

    it('finds files in nested folders', async () => {
        for (const [target, expected] of [
            ['deep', '/Instruments/Drums/Kits/deep.m8i'],
            ['bassline', '/Instruments/Bass/bassline.m8i'],
            ['demo.m8s', '/Songs/Old/demo.m8s'],
            ['snare', '/Instruments/Drums/snare.m8i'],
        ]) {
            const result = await run(tree, target)
            expect(result.found).toBe(true)
            expect(result.selected).toBe(expected as string)
        }
    })

    it('reports a missing file and ends having read every folder', async () => {
        const result = await run(tree, 'nothing')
        expect(result.found).toBe(false)
        expect(result.selected).toBeNull()
        expect(result.stats.enters).toBe(7)
    })

    it('does not open a folder that holds nothing but the parent entry', async () => {
        const result = await run({ '/Empty': {}, '/Full': { 'a.m8i': null } }, 'a')
        expect(result.selected).toBe('/Full/a.m8i')
    })

    it('does not select non-M8 files', async () => {
        const result = await run(tree, 'readme.txt')
        expect(result.found).toBe(false)
    })

    it('supports partial matches', async () => {
        const result = await run(tree, 'ass', false)
        expect(result.selected).toBe('/Instruments/Bass/bassline.m8i')
    })

    it('works from inside a sub-folder and does not leave the starting folder', async () => {
        const inside = await run(tree, 'kick', true, { startPath: ['/Instruments', '/Drums'] })
        expect(inside.selected).toBe('/Instruments/Drums/kick.m8i')
        const outside = await run(tree, 'lead', true, { startPath: ['/Instruments', '/Drums'] })
        expect(outside.found).toBe(false)
    })

    for (const jump of ['clamp', 'refuse'] as const) {
        for (const sortFolders of ['first', 'mixed'] as const) {
            describe(`long listings (jump ${jump}, folders ${sortFolders})`, () => {
                const options: FakeOptions = { jump, sortFolders }
                const big: FakeTree = {
                    ...files('f', 150),
                    '/Alpha': { '/Inner': { 'zed.m8i': null, ...files('in', 40) }, ...files('al', 30) },
                    '/Omega': { 'hidden.m8i': null },
                    'z-last.m8i': null,
                }

                it('finds the first, middle and last file', async () => {
                    for (const target of ['f000', 'f075', 'f149', 'z-last', 'al029', 'in039', 'hidden']) {
                        const result = await run(big, target, true, options)
                        expect(result.found).toBe(true)
                        expect(result.selected?.endsWith(`${target}.m8i`)).toBe(true)
                    }
                })

                it('starts from the middle of a listing', async () => {
                    const result = await run(big, 'f003', true, { ...options, startCursor: 100 })
                    expect(result.selected).toBe('f003.m8i')
                })

                it('survives a listing that comes back unsorted', async () => {
                    const result = await run(big, 'hidden', true, { ...options, unsortOnReturn: true })
                    expect(result.selected).toBe('/Omega/hidden.m8i')
                })

                it('survives an ASCII sort with mixed case', async () => {
                    const mixed: FakeTree = {
                        ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${i % 2 ? 'Z' : 'a'}name${i}.m8i`, null])),
                        '/Sub': { 'target.m8i': null },
                    }
                    const result = await run(mixed, 'target', true, { ...options, asciiSort: true })
                    expect(result.selected).toBe('/Sub/target.m8i')
                    const inList = await run(mixed, 'Zname9', true, { ...options, asciiSort: true })
                    expect(inList.selected).toBe('Zname9.m8i')
                })

                it('is exhaustive when the file is absent', async () => {
                    const result = await run(big, 'absent', true, options)
                    expect(result.found).toBe(false)
                    expect(result.stats.enters).toBe(3)
                })

                it('has no folder to open in a flat listing', async () => {
                    const result = await run(files('g', 100), 'g099', true, options)
                    expect(result.selected).toBe('g099.m8i')
                })
            })
        }
    }

    describe('alphabetical order shortcuts', () => {
        // The root shows a folder before files it follows alphabetically (in either case rule),
        // which proves folders go first.
        const withProof = (leaf: FakeTree): FakeTree => ({
            '/zeta': { ...leaf, '/nested': { 'inside.m8i': null } },
            ...files('a', 12),
        })

        it('stops reading a long listing once a file past the target is on screen', async () => {
            const folders = await run(withProof(files('leaf', 150)), 'absent', true, { sortFolders: 'first' })
            const merged = await run(withProof(files('leaf', 150)), 'absent', true, { sortFolders: 'mixed' })
            expect(folders.found).toBe(false)
            expect(merged.found).toBe(false)
            expect(folders.stats.enters).toBe(merged.stats.enters)
            expect(folders.stats.presses).toBeLessThan(merged.stats.presses - 15)
        })

        it('still finds files and folders further down a listing it could shorten', async () => {
            const tree = withProof(files('leaf', 150))
            for (const target of ['leaf000', 'leaf149', 'inside', 'a005']) {
                const result = await run(tree, target, true, { sortFolders: 'first' })
                expect(result.found).toBe(true)
            }
        })

        it('does not shorten anything when folders are merged with files by name', async () => {
            const tree: FakeTree = { ...files('m', 40), '/z-dir': { 'hidden.m8i': null } }
            const result = await run(tree, 'hidden', true, { sortFolders: 'mixed' })
            expect(result.selected).toBe('/z-dir/hidden.m8i')
        })
    })

    it('works with a short window', async () => {
        const result = await run({ ...files('f', 60), '/Sub': { 'x.m8i': null } }, 'x', true, { capacity: 9 })
        expect(result.selected).toBe('/Sub/x.m8i')
    })
})
