import { useEffect, useRef } from 'react'

/**
 * Drives a <dialog> (see Modal) from React state: shows it modally while `open` is true,
 * and calls `onClose` when it is dismissed (Escape, form close or a click on the backdrop).
 * Attach the returned ref to the dialog.
 */
export const useDialogModal = (open: boolean, onClose: () => void) => {
    const modalRef = useRef<HTMLDialogElement | null>(null)
    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        const modal = modalRef.current
        if (!modal) return

        const handleClose = () => onCloseRef.current()
        const handleClick = (e: MouseEvent) => {
            // Close when clicking on backdrop
            if (e.target === modal) {
                onCloseRef.current()
            }
        }

        modal.addEventListener('close', handleClose)
        modal.addEventListener('click', handleClick)

        if (open) {
            modal.showModal()
        } else {
            modal.close()
        }

        return () => {
            modal.removeEventListener('close', handleClose)
            modal.removeEventListener('click', handleClick)
        }
    }, [open])

    return modalRef
}
