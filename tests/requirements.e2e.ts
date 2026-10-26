import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Entry } from '../src/lib/entries'
import type { BackupV1 } from '../src/lib/backup'

const seed = (id: string, english: string, extra: Partial<Entry> = {}): Entry => ({
  id, type: 'word', english, chinese: '', malay: '', note: '', favorite: false,
  createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T01:00:00.000Z', ...extra,
})
const backup = (entries: Entry[]): BackupV1 => ({
  app: 'my-language-journal', version: 1, exportedAt: '2026-10-26T02:00:00.000Z', entries,
})
async function settings(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: /^Settings/ }).click()
}
async function library(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: /^Library/ }).click()
}
async function upload(page: Page, entries: Entry[]) {
  await page.getByLabel('Import JSON backup', { exact: true }).setInputFiles({
    name: 'synthetic-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup(entries))),
  })
  await expect(page.getByRole('dialog', { name: 'Bring your words home.' })).toBeVisible()
}
async function merge(page: Page, entries: Entry[]) {
  await settings(page)
  await upload(page, entries)
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function exportEntries(page: Page) {
  await settings(page)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
  const stream = await (await downloaded).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return (JSON.parse(Buffer.concat(chunks).toString('utf8')) as BackupV1).entries
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New entry', exact: true })).toBeEnabled()
})

test('Replace needs two confirmations, cancellation preserves data, and repeated imports keep IDs unique', async ({ page }) => {
  const originals = [seed('kept', 'Keep me', { favorite: true, note: 'Original note' }), seed('removed', 'Only on this device')]
  await merge(page, originals)
  const incoming = [seed('kept', 'Restored', { chinese: '恢复', malay: 'Pulih', favorite: true, note: 'Restored note' }), seed('new', 'New record', { type: 'chunk' })]
  await upload(page, incoming)
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with replace', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Replace your journal?', exact: true })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep my journal', exact: true }).click()
  await expect(confirmation).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await exportEntries(page)).toEqual(originals)

  await upload(page, incoming)
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with replace', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Replace journal', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await exportEntries(page)).sort((a,b) => a.id.localeCompare(b.id))).toEqual(incoming.sort((a,b) => a.id.localeCompare(b.id)))
  await upload(page, incoming)
  // Every new import starts safely in Merge mode, even after replacing.
  await expect(page.getByRole('button', { name: 'Confirm import', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await exportEntries(page)).toHaveLength(2)
})

test('an empty Replace backup also requires explicit destructive confirmation', async ({ page }) => {
  await merge(page, [seed('original', 'Keep until confirmed')])
  await upload(page, [])
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with replace', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Replace your journal?', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Keep my journal', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await exportEntries(page)).toHaveLength(1)
})

test('Replace detects a change made in another window before clearing any records', async ({ page, context }) => {
  await merge(page, [seed('one', 'Original'), seed('two', 'Keep this too')])
  await upload(page, [seed('replacement', 'From backup')])
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with replace', exact: true }).click()
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('button', { name: 'View Original', exact: true }).click()
  await other.getByRole('button', { name: 'Edit entry', exact: true }).click()
  await other.getByPlaceholder('A word or phrase in English').fill('Updated in another window')
  await other.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(other.getByRole('dialog', { name: 'A little discovery' })).toBeVisible()
  await page.getByRole('button', { name: 'Replace journal', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Replace your journal?' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText(/changed since|changed after/)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const preserved = await exportEntries(page)
  expect(preserved).toHaveLength(2)
  expect(preserved.find(entry => entry.id === 'one')?.english).toBe('Updated in another window')
  expect(preserved.some(entry => entry.id === 'replacement')).toBe(false)
  await other.close()
})

test('matching content warns without blocking a separately saved entry', async ({ page }) => {
  await merge(page, [seed('existing', 'Improve', { chinese: '提升', malay: 'Meningkatkan' })])
  await library(page)
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await page.getByPlaceholder('A word or phrase in English').fill('  IMPROVE  ')
  await page.getByPlaceholder('输入中文词语或词块').fill('提升')
  await page.getByPlaceholder('Perkataan atau frasa dalam Bahasa Melayu').fill('meningkatkan')
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('already in your journal')
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'A little discovery' })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  const saved = await exportEntries(page)
  expect(saved).toHaveLength(2)
  expect(new Set(saved.map(entry => entry.id)).size).toBe(2)
})

test('mobile touch controls and a short keyboard-like viewport remain usable without console errors or data uploads', async ({ page }) => {
  const criticalErrors: string[] = []
  const outbound: string[] = []
  page.on('pageerror', error => criticalErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') criticalErrors.push(message.text()) })
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('blob:')) outbound.push(request.url())
    if (!['GET', 'HEAD'].includes(request.method())) outbound.push(`${request.method()} ${request.url()}`)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('searchbox', { name: 'Search entries' }).fill('anything')
  const undersized = await page.getByRole('button').evaluateAll(buttons => buttons
    .filter(button => { const r=button.getBoundingClientRect(); return r.width>0 && r.height>0 })
    .map(button => ({ name: button.getAttribute('aria-label') || button.textContent, width:button.getBoundingClientRect().width, height:button.getBoundingClientRect().height }))
    .filter(button => button.width<44 || button.height<44))
  expect(undersized).toEqual([])
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await page.getByPlaceholder('A word or phrase in English').fill('On my phone')
  await page.setViewportSize({ width: 390, height: 420 })
  const notes = page.getByPlaceholder('An example, a little context, or a way to remember…')
  await notes.fill('A note with the keyboard taking up space.')
  await expect(notes).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Save entry', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'A little discovery' })).toBeVisible()
  expect(criticalErrors).toEqual([])
  expect(outbound).toEqual([])
})
