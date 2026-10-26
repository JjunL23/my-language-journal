import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Resize only the mobile editor to the area above the software keyboard. */
export function useEditorViewport(ref: RefObject<HTMLDialogElement | null>, enabled: boolean) {
  useEffect(() => {
    const dialog = ref.current
    const viewport = window.visualViewport
    if (!enabled || !dialog || !viewport) return
    let animationFrame = 0
    const keepFocusedFieldVisible = () => {
      const field = document.activeElement
      const content = dialog.querySelector<HTMLElement>('.editor-content')
      if (!(field instanceof HTMLElement) || !dialog.contains(field) || !content?.contains(field))
        return
      const fieldBounds = field.getBoundingClientRect()
      const visible = content.getBoundingClientRect()
      if (fieldBounds.bottom > visible.bottom - 12)
        content.scrollTop += fieldBounds.bottom - visible.bottom + 12
      else if (fieldBounds.top < visible.top + 12)
        content.scrollTop -= visible.top - fieldBounds.top + 12
    }
    const update = () => {
      if (window.matchMedia('(max-width: 720px)').matches && Math.abs(viewport.scale - 1) < 0.05) {
        dialog.style.setProperty('--editor-viewport-height', `${Math.round(viewport.height)}px`)
        dialog.style.setProperty('--editor-viewport-top', `${Math.round(viewport.offsetTop)}px`)
      } else {
        // Do not interfere with pinch zoom or desktop dialog sizing.
        dialog.style.removeProperty('--editor-viewport-height')
        dialog.style.removeProperty('--editor-viewport-top')
      }
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(keepFocusedFieldVisible)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    dialog.addEventListener('focusin', update)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      dialog.removeEventListener('focusin', update)
      dialog.style.removeProperty('--editor-viewport-height')
      dialog.style.removeProperty('--editor-viewport-top')
    }
  }, [enabled, ref])
}
