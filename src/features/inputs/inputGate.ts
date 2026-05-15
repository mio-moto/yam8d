let installed = false

export function shouldIgnoreAppKeyboardEvent(ev: KeyboardEvent): boolean {
    const tgt = ev.target as HTMLElement | null
    const codeMirrorTarget = !!tgt?.closest?.('.cm-editor')

    const typingTarget = !!(
        tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)
    )
    const menuOpen = typeof document !== 'undefined' && (document.body.dataset.m8MenuOpen === 'true')
    return codeMirrorTarget || typingTarget || menuOpen
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

export function disableInputGate(): void {
    if (!installed) return
    installed = false
    window.removeEventListener('keydown', captureHandler, { capture: true } as EventListenerOptions)
    window.removeEventListener('keyup', captureHandler, { capture: true } as EventListenerOptions)
    window.removeEventListener('keypress', captureHandler, { capture: true } as EventListenerOptions)
}
