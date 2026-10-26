import { useEffect, useRef } from 'react'

/** Give browser Back the same close/discard behavior as the editor's Cancel action. */
export function useEditorNavigation(
  active: boolean,
  dirty: boolean,
  busy: boolean,
  requestClose: () => void,
) {
  const latest = useRef({ dirty, busy, requestClose })
  latest.current = { dirty, busy, requestClose }

  useEffect(() => {
    if (!active) return
    const marker = `journal-editor-${crypto.randomUUID()}`
    const url = window.location.href
    const originalState = window.history.state
    const editorState = { ...originalState, journalEditor: marker }
    window.history.pushState(editorState, '', url)
    const onBack = () => {
      if (window.history.state?.journalEditor === marker) return
      // Preserve a local history entry until the user explicitly discards edits.
      if (latest.current.dirty || latest.current.busy)
        window.history.pushState(editorState, '', url)
      latest.current.requestClose()
    }
    window.addEventListener('popstate', onBack)
    return () => {
      window.removeEventListener('popstate', onBack)
      if (window.history.state?.journalEditor === marker) window.history.back()
    }
  }, [active])

  useEffect(() => {
    if (!active || !dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [active, dirty])
}
