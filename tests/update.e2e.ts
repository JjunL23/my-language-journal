import { expect, test, type Page } from '@playwright/test'
import type { Entry } from '../src/lib/entries'
import { startUpdateServer } from './support/update-server.mjs'

type UpdateServer = Awaited<ReturnType<typeof startUpdateServer>>
let server: UpdateServer

test.describe('Production PWA upgrade', () => {
  test.setTimeout(120_000)

  test.beforeAll(async () => {
    server = await startUpdateServer()
  })

  test.afterAll(async () => {
    await server?.close()
  })

  async function storedEntries(page: Page): Promise<Entry[]> {
    return page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('my-language-journal')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        return await new Promise<Entry[]>((resolve, reject) => {
          const transaction = database.transaction('entries', 'readonly')
          const request = transaction.objectStore('entries').getAll()
          transaction.oncomplete = () => resolve(request.result)
          transaction.onabort = () => reject(transaction.error)
        })
      } finally {
        database.close()
      }
    })
  }

  async function cachedPaths(page: Page): Promise<string[]> {
    return page.evaluate(async () => {
      const cacheNames = await caches.keys()
      const requests = await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()))
      return requests.flat().map((request) => new URL(request.url).pathname)
    })
  }

  test('preserves records and an open draft through waiting, cross-tab activation, update, and offline restart', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 900 } })
    const externalRequests: string[] = []
    const pageErrors: string[] = []
    context.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== server.origin) {
        externalRequests.push(request.url())
      }
    })
    context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)))

    try {
      const page = await context.newPage()
      await page.goto(server.url)
      await expect(page.locator('html')).toHaveAttribute('data-update-build', 'v1')
      await expect(page.getByRole('button', { name: 'New entry', exact: true })).toBeEnabled()
      await page.evaluate(async () => { await navigator.serviceWorker.ready })
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

      await page.getByRole('button', { name: 'New entry', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Chunk', exact: true }).click()
      await page.getByPlaceholder('A word or phrase in English').fill('Little by little')
      await page.getByPlaceholder('输入中文词语或词块').fill('一点一点地')
      await page.getByPlaceholder('Perkataan atau frasa dalam Bahasa Melayu').fill('Sedikit demi sedikit')
      const noteField = page.getByPlaceholder('An example, a little context, or a way to remember…')
      await noteField.fill('A note saved before the app update.')
      await page.getByRole('button', { name: 'Save entry', exact: true }).click()
      let detail = page.getByRole('dialog', { name: 'A little discovery', exact: true })
      await expect(detail).toBeVisible()
      await detail.getByRole('button', { name: 'Add to favorites', exact: true }).click()
      await expect(detail.getByRole('button', { name: 'Favorited', exact: true })).toHaveAttribute('aria-pressed', 'true')
      const originalEntries = await storedEntries(page)
      expect(originalEntries).toHaveLength(1)
      expect(originalEntries[0]).toMatchObject({ type: 'chunk', favorite: true, note: 'A note saved before the app update.' })
      expect(originalEntries[0].id).toBeTruthy()
      expect(Number.isFinite(Date.parse(originalEntries[0].createdAt))).toBe(true)
      expect(Number.isFinite(Date.parse(originalEntries[0].updatedAt))).toBe(true)

      const otherTab = await context.newPage()
      await otherTab.goto(server.url)
      await expect(otherTab.locator('html')).toHaveAttribute('data-update-build', 'v1')
      await expect(otherTab.getByRole('button', { name: 'View Little by little', exact: true })).toBeVisible()

      await page.bringToFront()
      await detail.getByRole('button', { name: 'Edit entry', exact: true }).click()
      const draft = 'Unsaved during the worker update — 保留这段笔记.'
      await noteField.fill(draft)
      const oldScripts = server.scripts.v1
      const newScripts = server.scripts.v2
      for (const script of oldScripts) expect(await cachedPaths(page)).toContain(script)

      server.activate('v2')
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration()
        if (!registration) throw new Error('The original worker is not registered.')
        await registration.update()
      })
      await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true)
      await expect(page.getByRole('button', { name: 'Update now', exact: true })).toBeDisabled()
      await expect(page.locator('html')).toHaveAttribute('data-update-build', 'v1')
      await expect(noteField).toHaveValue(draft)
      expect(await storedEntries(page)).toEqual(originalEntries)

      // Both versions are cached while v2 waits; a failed/abandoned update can still
      // reopen v1. This is a real service-worker update, not a manual page reload.
      for (const script of [...oldScripts, ...newScripts]) expect(await cachedPaths(page)).toContain(script)
      await expect(otherTab.getByRole('button', { name: 'Update now', exact: true })).toBeEnabled()
      await otherTab.getByRole('button', { name: 'Update now', exact: true }).click()
      await expect(otherTab.locator('html')).toHaveAttribute('data-update-build', 'v2')
      await expect.poll(() => page.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true)

      // Activating from another tab must not reload this still-dirty editor.
      await expect(page.locator('html')).toHaveAttribute('data-update-build', 'v1')
      await expect(noteField).toHaveValue(draft)
      await expect(page.getByRole('button', { name: 'Update now', exact: true })).toBeDisabled()
      expect(await storedEntries(page)).toEqual(originalEntries)

      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      detail = page.getByRole('dialog', { name: 'A little discovery', exact: true })
      await expect(detail.getByText(draft, { exact: true })).toBeVisible()
      const savedEntries = await storedEntries(page)
      expect(savedEntries).toHaveLength(1)
      expect(savedEntries[0]).toEqual({ ...originalEntries[0], note: draft, updatedAt: savedEntries[0].updatedAt })
      expect(Date.parse(savedEntries[0].updatedAt)).toBeGreaterThan(Date.parse(originalEntries[0].updatedAt))
      await detail.getByRole('button', { name: 'Close', exact: true }).click()
      await page.getByRole('button', { name: 'Update now', exact: true }).click()
      await expect(page.locator('html')).toHaveAttribute('data-update-build', 'v2')
      expect(await storedEntries(page)).toEqual(savedEntries)
      await expect(page.getByRole('button', { name: 'Unfavorite Little by little', exact: true })).toBeVisible()
      for (const script of newScripts) expect(await cachedPaths(page)).toContain(script)
      for (const script of oldScripts.filter((script: string) => !newScripts.includes(script))) {
        expect(await cachedPaths(page)).not.toContain(script)
      }

      await page.close()
      await otherTab.close()
      await context.setOffline(true)
      const reopened = await context.newPage()
      await reopened.goto(server.url)
      await expect(reopened.locator('html')).toHaveAttribute('data-update-build', 'v2')
      await expect(reopened.getByRole('button', { name: 'View Little by little', exact: true })).toBeVisible()
      expect(await storedEntries(reopened)).toEqual(savedEntries)
      await reopened.getByRole('button', { name: 'View Little by little', exact: true }).click()
      await expect(reopened.getByText(draft, { exact: true })).toBeVisible()
      await expect(reopened.getByRole('button', { name: 'Favorited', exact: true })).toHaveAttribute('aria-pressed', 'true')

      expect(externalRequests).toEqual([])
      expect(pageErrors).toEqual([])
    } finally {
      await context.close()
    }
  })
})
