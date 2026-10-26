import { useEffect, useState } from 'react'
import { setupPwa } from '../lib/pwa'
import { currentPage, errorMessage } from '../lib/ui'
import type { Page } from '../lib/ui'

export function useAppStatus() {
  const [page, setPage] = useState<Page>(currentPage)
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(false)
  const [pwaError, setPwaError] = useState('')
  const [pendingUpdate, setPendingUpdate] = useState<(() => Promise<void>) | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [storageNotice, setStorageNotice] = useState('')

  useEffect(() => {
    const onHash = () => setPage(currentPage())
    const onOnline = () => setOnline(navigator.onLine)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)
    if (navigator.storage?.persisted)
      void navigator.storage
        .persisted()
        .then(setPersisted)
        .catch(() => setPersisted(null))
    const cleanup = setupPwa({
      onOfflineReady: () => {
        setOfflineReady(true)
        setPwaError('')
      },
      onUpdateReady: (update) => setPendingUpdate(() => update),
      onError: (error) => {
        setPwaError(errorMessage(error))
        setOfflineReady(false)
      },
    })
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOnline)
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 4300)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function navigate(next: Page) {
    window.location.hash = next
    setPage(next)
  }
  async function requestPersistence() {
    try {
      if (!navigator.storage?.persist) {
        setStorageNotice(
          'Persistent storage is not available in this browser. Keep regular JSON backups.',
        )
        return
      }
      const granted = await navigator.storage.persist()
      setPersisted(granted)
      setStorageNotice(
        granted
          ? 'Persistent storage is enabled. Keep a JSON backup as well.'
          : 'Your browser did not grant persistent storage. Your journal still works; keep regular JSON backups.',
      )
    } catch {
      setStorageNotice('Could not request persistent storage. You can still export a JSON backup.')
    }
  }
  const status = !online
    ? 'You’re offline'
    : offlineReady
      ? 'Ready for offline use'
      : import.meta.env.DEV
        ? 'Local preview'
        : 'Preparing offline access'
  return {
    page,
    navigate,
    toast,
    setToast,
    online,
    offlineReady,
    pwaError,
    pendingUpdate,
    persisted,
    storageNotice,
    requestPersistence,
    status,
  }
}
