import { useCallback, useEffect, useRef, useState } from 'react'
import type { Entry } from '../lib/entries'
import { listEntries } from '../lib/storage'
import { errorMessage } from '../lib/ui'

/** Owns storage refreshes and a single mutation lock shared by every workflow. */
export function useJournalData(notify: (message: string) => void) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const broadcast = useRef<BroadcastChannel | null>(null)

  const refresh = useCallback(async (showLoading = false): Promise<Entry[] | null> => {
    if (showLoading) setLoading(true)
    try {
      const latest = await listEntries()
      setEntries(latest)
      setLoadError('')
      return latest
    } catch (error) {
      setLoadError(errorMessage(error))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    if ('BroadcastChannel' in window) {
      broadcast.current = new BroadcastChannel('my-language-journal')
      broadcast.current.onmessage = onFocus
    }
    return () => {
      window.removeEventListener('focus', onFocus)
      broadcast.current?.close()
    }
  }, [refresh])

  const withBusy = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    try {
      await action()
      return true
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const mutate = useCallback(
    async (action: () => Promise<void>, success: string): Promise<boolean> => {
      return withBusy(async () => {
        await action()
        // A committed write is successful even if refreshing or notifying fails.
        // Never invite a retry that could duplicate a successfully created entry.
        try {
          setEntries(await listEntries())
          setLoadError('')
          notify(success)
        } catch {
          setLoadError(
            'Your changes were saved, but the list could not be refreshed. Try opening your journal again.',
          )
          notify('Changes saved. Refresh the journal to see them.')
        }
        try {
          broadcast.current?.postMessage('changed')
        } catch {
          /* The committed data is safe. */
        }
      })
    },
    [notify, withBusy],
  )

  return { entries, setEntries, loading, loadError, busy, refresh, withBusy, mutate }
}

export type JournalData = ReturnType<typeof useJournalData>
