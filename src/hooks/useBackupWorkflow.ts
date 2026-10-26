import { useState } from 'react'
import { createBackup, MAX_BACKUP_BYTES, parseBackup } from '../lib/backup'
import { listEntries, mergeEntries, replaceEntries } from '../lib/storage'
import { errorMessage } from '../lib/ui'
import type { ImportMode, ImportPlan } from '../lib/ui'
import type { JournalData } from './useJournalData'

export function useBackupWorkflow(data: JournalData, notify: (message: string) => void) {
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [replaceConfirmation, setReplaceConfirmation] = useState(false)

  async function exportBackup() {
    setError('')
    try {
      await data.withBusy(async () => {
        const latest = await listEntries()
        const blob = new Blob([JSON.stringify(createBackup(latest), null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `my-language-journal-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        notify('Backup prepared. Save the JSON file to Files or Downloads.')
      })
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  async function readImport(file: File | undefined) {
    if (!file) return
    setError('')
    setNotice('')
    try {
      await data.withBusy(async () => {
        if (file.size > MAX_BACKUP_BYTES)
          throw new Error('This file is too large. Choose a backup smaller than 10 MB.')
        const incoming = parseBackup(await file.text())
        const existing = await listEntries()
        setMode('merge')
        setReplaceConfirmation(false)
        setPlan({ incoming, existing, filename: file.name })
      })
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  function changeMode(next: ImportMode) {
    setMode(next)
    setReplaceConfirmation(false)
    setNotice('')
  }
  function cancelImport() {
    if (!data.busy) {
      setPlan(null)
      setReplaceConfirmation(false)
      setNotice('')
    }
  }
  async function applyImport(selectedMode: ImportMode) {
    if (!plan || data.busy) return
    setNotice('')
    try {
      const operation = selectedMode === 'replace' ? replaceEntries : mergeEntries
      if (
        await data.mutate(
          () => operation(plan.incoming, plan.existing),
          selectedMode === 'replace'
            ? 'Journal replaced with your backup.'
            : 'Backup imported. Your journal is up to date.',
        )
      ) {
        setReplaceConfirmation(false)
        setPlan(null)
      }
    } catch (error) {
      // Any failure returns to the first preview. A changed journal must never
      // reuse a destructive confirmation granted for an earlier snapshot.
      setReplaceConfirmation(false)
      try {
        const existing = await listEntries()
        data.setEntries(existing)
        setPlan({ ...plan, existing })
      } catch {
        /* The old snapshot is still checked atomically on retry. */
      }
      setNotice(`${errorMessage(error)} Review the preview before trying again.`)
    }
  }
  function continueImport() {
    if (mode === 'replace') setReplaceConfirmation(true)
    else void applyImport('merge')
  }
  async function confirmReplace() {
    if (replaceConfirmation && mode === 'replace') await applyImport('replace')
  }
  return {
    plan,
    mode,
    error,
    notice,
    replaceConfirmation,
    exportBackup,
    readImport,
    changeMode,
    cancelImport,
    continueImport,
    confirmReplace,
    keepJournal: () => setReplaceConfirmation(false),
  }
}
