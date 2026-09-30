let installed = false

// UI that temporarily owns the keyboard (e.g. the open menu), by name
const blockers = new Set<string>()

/** Suspends the app's keyboard shortcuts while `source` needs the keys for itself. */
export function setAppInputBlocked(source: string, blocked: boolean): void {
    if (blocked) blockers.add(source)
    else blockers.delete(source)
}

export function shouldIgnoreAppKeyboardEvent(ev: KeyboardEvent): boolean {
    const tgt = ev.target as HTMLElement | null
    const codeMirrorTarget = !!tgt?.closest?.('.cm-editor')

    const typingTarget = !!(
        tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)
    )
    return codeMirrorTarget || typingTarget || blockers.size > 0
}

function shouldCaptureBlock(ev: KeyboardEvent): boolean {
    const tgt = ev.target as HTMLElement | null
    const codeMirrorTarget = !!tgt?.closest?.('.cm-editor')
    if (codeMirrorTarget) return false

    return shouldIgnoreAppKeyboardEvent(ev)
}

function captureHandler(ev: KeyboardEvent) {
    if (!ev || !ev.type) return
    if (shouldCaptureBlock(ev)) {
        // Block app hooks by preventing further propagation.
        // Do NOT preventDefault so native input behavior still works.
        ev.stopImmediatePropagation?.()
        ev.stopPropagation()
    }
}

export function enableInputGate(): void {
    if (installed) return
    installed = true
    window.addEventListener('keydown', captureHandler, { capture: true })
    window.addEventListener('keyup', captureHandler, { capture: true })
    window.addEventListener('keypress', captureHandler, { capture: true })
}
