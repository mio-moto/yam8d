import { afterEach, describe, expect, it } from 'bun:test'
import { setAppInputBlocked, shouldIgnoreAppKeyboardEvent } from '../src/features/inputs/inputGate'

const keyEvent = (tagName = 'BODY', inCodeMirror = false) =>
    ({
        target: {
            tagName,
            isContentEditable: false,
            closest: (selector: string) => (inCodeMirror && selector === '.cm-editor' ? {} : null),
        },
    }) as unknown as KeyboardEvent

afterEach(() => {
    setAppInputBlocked('menu', false)
    setAppInputBlocked('other', false)
})

describe('input gate', () => {
    it('lets keys through by default', () => {
        expect(shouldIgnoreAppKeyboardEvent(keyEvent())).toBe(false)
    })

    it('ignores keys typed into form fields and code editors', () => {
        expect(shouldIgnoreAppKeyboardEvent(keyEvent('INPUT'))).toBe(true)
        expect(shouldIgnoreAppKeyboardEvent(keyEvent('TEXTAREA'))).toBe(true)
        expect(shouldIgnoreAppKeyboardEvent(keyEvent('DIV', true))).toBe(true)
    })

    it('ignores keys while any registered UI blocks input', () => {
        setAppInputBlocked('menu', true)
        expect(shouldIgnoreAppKeyboardEvent(keyEvent())).toBe(true)
        setAppInputBlocked('other', true)
        setAppInputBlocked('menu', false)
        expect(shouldIgnoreAppKeyboardEvent(keyEvent())).toBe(true)
        setAppInputBlocked('other', false)
        expect(shouldIgnoreAppKeyboardEvent(keyEvent())).toBe(false)
    })
})
