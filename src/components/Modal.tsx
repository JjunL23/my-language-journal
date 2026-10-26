import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useEditorViewport } from '../hooks/useEditorViewport'

interface Props {
  title: string
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  className?: string
  busy?: boolean
  keyboardAware?: boolean
}

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  className = '',
  busy = false,
  keyboardAware = false,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  useEditorViewport(ref, keyboardAware)
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button close-button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
