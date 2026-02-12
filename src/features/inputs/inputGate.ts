let installed = false

function shouldBlock(ev: KeyboardEvent): boolean {
    const tgt = ev.target as HTMLElement | null
    const typingTarget = !!(
        tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)
    )
    const menuOpen = typeof document !== 'undefined' && (document.body.dataset.m8MenuOpen === 'true')
    return typingTarget || menuOpen
}

function captureHandler(ev: KeyboardEvent) {
    if (!ev || !ev.type) return
    if (shouldBlock(ev)) {
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
