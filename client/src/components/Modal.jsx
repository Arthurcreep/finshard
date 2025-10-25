import { useEffect, useRef } from 'react'
import s from './Modal.module.css'

export default function Modal({ open, onClose, title, children }) {
    const dialogRef = useRef(null)

    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        document.addEventListener('keydown', onKey)
        // автофокус
        const first = dialogRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        first?.focus?.()
        return () => document.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

    return (
        <div className={s.overlay} role="presentation" onMouseDown={(e) => {
            // клик по фону — закрыть; по контенту — нет
            if (e.target === e.currentTarget) onClose?.()
        }}>
            <div className={s.dialog} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={dialogRef}>
                {title ? <h3 className={s.title}>{title}</h3> : null}
                <div className={s.content}>
                    {children}
                </div>
                <button className={s.close} aria-label="Закрыть" onClick={onClose}>×</button>
            </div>
        </div>
    )
}
