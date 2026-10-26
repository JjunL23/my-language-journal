import { useState } from 'react'
import type { Entry, EntryDraft } from '../lib/entries'
import { createEntry, updateEntry, validateDraft } from '../lib/entries'
import { deleteEntry, saveEntry } from '../lib/storage'
import { draftFrom, EMPTY_DRAFT, errorMessage, isDirty } from '../lib/ui'
import type { EditorState } from '../lib/ui'
import type { JournalData } from './useJournalData'
import { useEditorNavigation } from './useEditorNavigation'

export function useEntryWorkflow(data: JournalData, notify: (message: string) => void) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailNotice, setDetailNotice] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [formError, setFormError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const detail = data.entries.find((entry) => entry.id === detailId)

  function openDetails(id: string) {
    setDetailError('')
    setDetailNotice('')
    setDetailId(id)
  }
  function openEditor(entry?: Entry) {
    setFormError('')
    setDetailId(null)
    setDetailNotice('')
    setEditor({ original: entry || null, draft: entry ? draftFrom(entry) : { ...EMPTY_DRAFT } })
  }
  function closeEditor() {
    if (!editor || data.busy) return
    if (isDirty(editor)) setDiscard(true)
    else setEditor(null)
  }
  useEditorNavigation(!!editor, !!editor && isDirty(editor), data.busy, closeEditor)

  function changeDraft(draft: EntryDraft) {
    setEditor((current) => (current ? { ...current, draft } : null))
    setFormError('')
  }
  async function submitEntry() {
    if (!editor || data.busy) return
    const validation = validateDraft(editor.draft)
    if (validation) {
      setFormError(validation)
      return
    }
    setFormError('')
    try {
      const entry = editor.original
        ? updateEntry(editor.original, editor.draft)
        : createEntry(editor.draft)
      const message = editor.original ? 'Changes saved.' : 'A new entry for your journal.'
      if (await data.mutate(() => saveEntry(entry, editor.original), message)) {
        setEditor(null)
        setDetailId(entry.id)
        setDetailError('')
        setDetailNotice(message)
      }
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }
  async function toggleFavorite(entry: Entry) {
    setDetailError('')
    setDetailNotice('')
    const message = entry.favorite ? 'Removed from favorites.' : 'Saved to favorites.'
    try {
      if (
        (await data.mutate(
          () =>
            saveEntry(
              { ...entry, favorite: !entry.favorite, updatedAt: new Date().toISOString() },
              entry,
            ),
          message,
        )) &&
        detailId === entry.id
      )
        setDetailNotice(message)
    } catch (error) {
      const message = `Could not update favorite. ${errorMessage(error)}`
      if (detailId === entry.id) setDetailError(message)
      else notify(message)
    }
  }
  function requestDelete(entry: Entry) {
    setDeleteError('')
    setDeleteTarget(entry)
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError('')
    try {
      if (await data.mutate(() => deleteEntry(deleteTarget.id, deleteTarget), 'Entry deleted.')) {
        setDeleteTarget(null)
        setDetailId(null)
      }
    } catch (error) {
      const latest = await data.refresh()
      if (latest) {
        const current = latest.find((entry) => entry.id === deleteTarget.id)
        if (!current) {
          setDeleteTarget(null)
          setDetailId(null)
          notify('This entry was already removed in another window.')
          return
        }
        setDeleteTarget(current)
      }
      setDeleteError(errorMessage(error))
    }
  }
  return {
    detail,
    detailError,
    detailNotice,
    editor,
    formError,
    discard,
    deleteTarget,
    deleteError,
    openDetails,
    openEditor,
    closeEditor,
    changeDraft,
    submitEntry,
    toggleFavorite,
    requestDelete,
    confirmDelete,
    closeDetails: () => setDetailId(null),
    keepWriting: () => setDiscard(false),
    discardChanges: () => {
      setDiscard(false)
      setEditor(null)
    },
    cancelDelete: () => setDeleteTarget(null),
  }
}
