/// <reference types="vite-plugin-pwa/vanillajs" />

import { registerSW } from 'virtual:pwa-register'

export interface PwaCallbacks {
  onOfflineReady: () => void
  onUpdateReady: (update: () => Promise<void>) => void
  onError: (error: unknown) => void
}

export const PWA_SUPPORTED =
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator

const listeners = new Set<PwaCallbacks>()
let started = false
let offlineReady = false
let pendingUpdate: (() => Promise<void>) | undefined
let registrationError: unknown
let reloadRequested = false

function offerUpdate(update: () => Promise<void>) {
  pendingUpdate = update
  listeners.forEach((listener) => listener.onUpdateReady(update))
}

function markOfflineReady() {
  if (offlineReady) return
  offlineReady = true
  registrationError = undefined
  listeners.forEach((listener) => listener.onOfflineReady())
}

function reportError(error: unknown) {
  registrationError = error
  listeners.forEach((listener) => listener.onError(error))
}

/** Subscribe from a React effect. Cleanup does not unregister the offline worker. */
export function setupPwa(callbacks: PwaCallbacks): () => void {
  listeners.add(callbacks)
  if (offlineReady) callbacks.onOfflineReady()
  if (pendingUpdate) callbacks.onUpdateReady(pendingUpdate)
  if (registrationError) callbacks.onError(registrationError)

  if (import.meta.env.PROD && !PWA_SUPPORTED && !registrationError) {
    reportError(new Error('Offline access requires a supported browser and an HTTPS address (or localhost).'))
  }

  if (PWA_SUPPORTED && !started) {
    started = true
    const updateSW = registerSW({
      immediate: true,
      onOfflineReady: markOfflineReady,
      onNeedRefresh() {
        offerUpdate(async () => {
          reloadRequested = true
          await updateSW(true)
        })
      },
      onNeedReload() {
        if (reloadRequested) {
          window.location.reload()
          return
        }
        // Another tab may activate the update. Never force this tab to discard edits.
        offerUpdate(async () => {
          window.location.reload()
        })
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        // A returning visit is also offline-ready, even without a new install event.
        if (registration.active?.state === 'activated') markOfflineReady()

        const monitorInstallation = () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'redundant' && !registration.active && !offlineReady) {
              reportError(new Error('The offline files could not be downloaded. Reconnect and reload to try again.'))
            }
          })
        }
        monitorInstallation()
        registration.addEventListener('updatefound', monitorInstallation)

        // Check after returning to the installed app. Network failures are harmless:
        // the installed version remains available, including while offline.
        const checkForUpdate = () => {
          if (navigator.onLine && !registration.installing && document.visibilityState === 'visible') {
            void registration.update().catch(() => {})
          }
        }
        document.addEventListener('visibilitychange', checkForUpdate)
        window.addEventListener('online', checkForUpdate)
      },
      onRegisterError: reportError,
    })
  }

  return () => {
    listeners.delete(callbacks)
  }
}
