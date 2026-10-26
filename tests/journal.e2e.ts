import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BackupV1 } from '../src/lib/backup'
import type { Entry } from '../src/lib/entries'

type EntryInput = { english?: string; chinese?: string; malay?: string; note?: string; type?: 'word' | 'chunk' }

async function navigate(page: Page, section: 'Library' | 'Favorites' | 'Settings') {
  await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${section}`) }).click()
}

async function fillEntry(page: Page, input: EntryInput) {
  if (input.type) await page.getByRole('dialog').getByRole('button', { name: input.type === 'word' ? 'Word' : 'Chunk', exact: true }).click()
  if (input.english !== undefined) await page.getByPlaceholder('A word or phrase in English').fill(input.english)
  if (input.chinese !== undefined) await page.getByPlaceholder('输入中文词语或词块').fill(input.chinese)
  if (input.malay !== undefined) await page.getByPlaceholder('Perkataan atau frasa dalam Bahasa Melayu').fill(input.malay)
  if (input.note !== undefined) await page.getByPlaceholder('An example, a little context, or a way to remember…').fill(input.note)
}

async function createEntryThroughUi(page: Page, input: EntryInput) {
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await fillEntry(page, input)
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'A little discovery', exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
}

async function exportThroughUi(page: Page): Promise<BackupV1> {
  await navigate(page, 'Settings')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^my-language-journal-\d{4}-\d{2}-\d{2}\.json$/)
  expect(await download.failure()).toBeNull()
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BackupV1
  expect(backup).toMatchObject({ app: 'my-language-journal', version: 1 })
  expect(Array.isArray(backup.entries)).toBe(true)
  return backup
}

async function uploadBackup(page: Page, backup: unknown, name = 'synthetic-journal.json') {
  await page.getByLabel('Import JSON backup', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof backup === 'string' ? backup : JSON.stringify(backup)),
  })
}

async function assertImportCounts(page: Page, expected: [number, number, number]) {
  const modal = page.getByRole('dialog', { name: 'Bring your words home.', exact: true })
  await expect(modal).toBeVisible()
  await expect(modal.locator('.import-summary strong')).toHaveText(expected.map(String))
  return modal
}

async function deleteThroughUi(page: Page, title: string, cancelFirst = false) {
  await page.getByRole('button', { name: `View ${title}`, exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'A little discovery', exact: true })
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  let confirmation = page.getByRole('dialog', { name: 'Delete this entry?', exact: true })
  await expect(confirmation).toBeVisible()
  await page.keyboard.press('Tab')
  expect(await confirmation.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true)
  if (cancelFirst) {
    await confirmation.getByRole('button', { name: 'Keep entry', exact: true }).click()
    await expect(confirmation).not.toBeVisible()
    await expect(detail).toBeVisible()
    await detail.getByRole('button', { name: 'Delete', exact: true }).click()
    confirmation = page.getByRole('dialog', { name: 'Delete this entry?', exact: true })
  }
  await confirmation.getByRole('button', { name: 'Delete entry', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: `View ${title}`, exact: true })).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New entry', exact: true })).toBeEnabled()
})

test('validates a new entry, saves one language, edits the same ID, and preserves a cancelled draft', async ({ page }) => {
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Add at least one language before saving.')
  await fillEntry(page, { english: 'Improve' })
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'A little discovery', exact: true })
  await expect(detail.getByText('Improve', { exact: true })).toBeVisible()
  await expect(detail.getByText('A translation for another day.', { exact: true })).toHaveCount(2)
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  const original = await exportThroughUi(page)
  expect(original.entries).toHaveLength(1)

  await navigate(page, 'Library')
  await page.getByRole('button', { name: 'View Improve', exact: true }).click()
  await detail.getByRole('button', { name: 'Edit entry', exact: true }).click()
  await fillEntry(page, { english: 'Improve steadily', chinese: '持续提升', malay: 'Meningkatkan secara beransur-ansur', note: 'One small discovery at a time.' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const discard = page.getByRole('dialog', { name: 'Leave this page?', exact: true })
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(page.getByPlaceholder('A word or phrase in English')).toHaveValue('Improve steadily')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(detail.getByText('持续提升', { exact: true })).toBeVisible()
  await expect(detail.getByText('One small discovery at a time.', { exact: true })).toBeVisible()
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  const edited = await exportThroughUi(page)
  expect(edited.entries).toHaveLength(1)
  expect(edited.entries[0].id).toBe(original.entries[0].id)
  expect(edited.entries[0].createdAt).toBe(original.entries[0].createdAt)
  expect(Date.parse(edited.entries[0].updatedAt)).toBeGreaterThan(Date.parse(original.entries[0].updatedAt))

  await navigate(page, 'Library')
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await fillEntry(page, { english: 'Never committed' })
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.locator('.entry-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'View Improve steadily', exact: true })).toBeVisible()
})

test('searches all three languages, filters words and chunks, and unfavorites without deleting', async ({ page }) => {
  await createEntryThroughUi(page, { english: 'Improve', chinese: '改善、提升', malay: 'Meningkatkan', note: 'Practice every day.' })
  await createEntryThroughUi(page, { type: 'chunk', english: 'Little by little', chinese: '一点一点地', malay: 'Sedikit demi sedikit' })
  const search = page.getByRole('searchbox', { name: 'Search entries', exact: true })
  for (const query of ['IMPROVE', '提升', 'MENINGKATKAN']) {
    await search.fill(query)
    await expect(page.locator('.entry-card')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'View Improve', exact: true })).toBeVisible()
  }
  await search.fill('not present')
  await expect(page.getByRole('heading', { name: 'No words found here', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('button', { name: /^Words/ }).click()
  await expect(page.locator('.entry-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'View Improve', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Chunks/ }).click()
  await expect(page.getByRole('button', { name: 'View Little by little', exact: true })).toBeVisible()
  await expect(page.locator('.entry-card')).toHaveCount(1)
  await page.getByRole('button', { name: /^All entries/ }).click()
  await page.getByRole('button', { name: 'Favorite Improve', exact: true }).click()
  await navigate(page, 'Favorites')
  await expect(page.locator('.entry-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Unfavorite Improve', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Some words stay with you.', exact: true })).toBeVisible()
  await navigate(page, 'Library')
  await expect(page.locator('.entry-card')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'View Improve', exact: true })).toBeVisible()
})

test('exports complete JSON, previews and cancels a merge, then restores all records in a clean browser context', async ({ page, browser }) => {
  await createEntryThroughUi(page, { english: 'Improve', chinese: '提升', malay: 'Meningkatkan', note: 'Remember this note.' })
  await createEntryThroughUi(page, { type: 'chunk', english: 'Little by little', chinese: '一点一点地', malay: 'Sedikit demi sedikit' })
  await page.getByRole('button', { name: 'Favorite Improve', exact: true }).click()
  const backup = await exportThroughUi(page)
  expect(backup.entries).toHaveLength(2)
  expect(backup.entries.find(entry => entry.english === 'Improve')).toMatchObject({ favorite: true, note: 'Remember this note.', chinese: '提升', malay: 'Meningkatkan' })
  const original = backup.entries.find(entry => entry.english === 'Improve')!
  const untouched = backup.entries.find(entry => entry.english === 'Little by little')!
  const added: Entry = { ...original, id: 'synthetic-new-record', english: 'Curious', chinese: '好奇的', malay: 'Ingin tahu', favorite: false }
  const incoming: BackupV1 = { ...backup, entries: [{ ...original, english: 'Improve through practice' }, untouched, added] }
  await uploadBackup(page, incoming)
  let preview = await assertImportCounts(page, [1, 1, 1])
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await exportThroughUi(page)).entries).toEqual(backup.entries)
  await uploadBackup(page, incoming)
  preview = await assertImportCounts(page, [1, 1, 1])
  await preview.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await expect(preview).not.toBeVisible()
  const merged = await exportThroughUi(page)
  expect(merged.entries).toHaveLength(3)
  expect(merged.entries.find(entry => entry.id === original.id)?.english).toBe('Improve through practice')
  expect(merged.entries.find(entry => entry.id === untouched.id)).toEqual(untouched)

  const cleanContext = await browser.newContext({ acceptDownloads: true })
  try {
    const restored = await cleanContext.newPage()
    await restored.goto('http://127.0.0.1:4173/')
    await expect(restored.getByRole('heading', { name: 'Good words deserve a place.', exact: true })).toBeVisible()
    await navigate(restored, 'Settings')
    await uploadBackup(restored, merged, 'exported-restoration.json')
    const restorePreview = await assertImportCounts(restored, [3, 0, 0])
    await restorePreview.getByRole('button', { name: 'Confirm import', exact: true }).click()
    await expect(restorePreview).not.toBeVisible()
    const roundTrip = await exportThroughUi(restored)
    expect(roundTrip.entries).toEqual(merged.entries)
  } finally {
    await cleanContext.close()
  }
})

test('rejects malformed, unsupported-version and duplicate-ID backups without changing saved entries', async ({ page }) => {
  await createEntryThroughUi(page, { english: 'Keep me', chinese: '保留' })
  const original = await exportThroughUi(page)
  await uploadBackup(page, '{ not json }')
  await expect(page.getByRole('alert')).toContainText('not valid JSON')
  await uploadBackup(page, { ...original, version: 2 })
  await expect(page.getByRole('alert')).toContainText('version is not supported')
  await uploadBackup(page, { ...original, entries: [original.entries[0], original.entries[0]] })
  await expect(page.getByRole('alert')).toContainText('duplicate ID')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await exportThroughUi(page)).entries).toEqual(original.entries)
})

test('reopens offline and supports creation, editing, search, favorites, backup and confirmed deletion', async ({ page, context }) => {
  await navigate(page, 'Settings')
  await expect(page.locator('.status-badge')).toHaveText('Ready', { timeout: 20_000 })
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await navigate(page, 'Library')
  await createEntryThroughUi(page, { english: 'Offline memory', chinese: '离线记录', malay: 'Catatan luar talian' })
  await page.getByRole('button', { name: 'View Offline memory', exact: true }).click()
  await page.getByRole('button', { name: 'Edit entry', exact: true }).click()
  await fillEntry(page, { note: 'Written and edited without a network.' })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Written and edited without a network.', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Favorite Offline memory', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search entries', exact: true }).fill('离线')
  await expect(page.getByRole('button', { name: 'View Offline memory', exact: true })).toBeVisible()
  const offlineBackup = await exportThroughUi(page)
  expect(offlineBackup.entries).toHaveLength(1)
  expect(offlineBackup.entries[0]).toMatchObject({ favorite: true, note: 'Written and edited without a network.' })
  await page.close()

  const reopened = await context.newPage()
  await reopened.goto('http://127.0.0.1:4173/')
  await expect(reopened.getByRole('button', { name: 'View Offline memory', exact: true })).toBeVisible()
  await navigate(reopened, 'Favorites')
  await expect(reopened.locator('.entry-card')).toHaveCount(1)
  await navigate(reopened, 'Library')
  await deleteThroughUi(reopened, 'Offline memory', true)
  await expect(reopened.getByRole('heading', { name: 'Good words deserve a place.', exact: true })).toBeVisible()
  await createEntryThroughUi(reopened, { type: 'chunk', english: 'Still here after restarting' })
  await reopened.reload()
  await expect(reopened.getByRole('button', { name: 'View Still here after restarting', exact: true })).toBeVisible()
})

test('keeps mobile layouts within the viewport and full-screen editor controls usable', async ({ page }, testInfo) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'New entry', exact: true })).toBeVisible()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await createEntryThroughUi(page, { english: 'A useful phrase to keep nearby', chinese: '一个有用的词块', malay: 'Frasa yang berguna', type: 'chunk' })
  await page.screenshot({ path: testInfo.outputPath('mobile-library.png'), fullPage: true })
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'What did you discover?', exact: true })
  await expect(editor).toBeVisible()
  const box = await editor.boundingBox()
  expect(box?.x).toBe(0)
  expect(box?.width).toBe(390)
  await fillEntry(page, { english: 'Mobile draft', note: 'A short note on the small screen.' })
  await expect(page.getByRole('button', { name: 'Save entry', exact: true })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('mobile-editor.png'), fullPage: true })
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'A little discovery', exact: true }).getByText('Mobile draft', { exact: true })).toBeVisible()
})
