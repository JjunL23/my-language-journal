import { expect, test } from '@playwright/test'

test('browser Back protects a dirty editor and removes its history guard after discard or save', async ({ page }) => {
  const nativeDialogs: string[] = []
  page.on('dialog', async dialog => {
    nativeDialogs.push(dialog.type())
    await dialog.dismiss()
  })
  const navigate = async (name: 'Library' | 'Settings') => {
    await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${name}`) }).click()
  }
  const guardHasClosed = async () => {
    // Closing calls history.back(), whose popstate is asynchronous. Wait for
    // that cleanup before issuing the next real browser Back action.
    await expect.poll(() => page.evaluate(() => window.history.state?.journalEditor ?? null)).toBeNull()
  }

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New entry', exact: true })).toBeEnabled()
  await navigate('Settings')
  await navigate('Library')
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  const english = page.getByPlaceholder('A word or phrase in English')
  const notes = page.getByPlaceholder('An example, a little context, or a way to remember…')
  await english.fill('Back-guard draft')
  await notes.fill('Keep this while checking browser navigation.')

  await page.goBack()
  const warning = page.getByRole('dialog', { name: 'Leave this page?', exact: true })
  await expect(warning).toBeVisible()
  await warning.getByRole('button', { name: 'Keep writing', exact: true }).click()
  await expect(english).toHaveValue('Back-guard draft')
  await expect(notes).toHaveValue('Keep this while checking browser navigation.')
  await expect(warning).toHaveCount(0)

  await page.goBack()
  await expect(warning).toBeVisible()
  await warning.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your library.', exact: true })).toBeVisible()
  await expect(page.locator('.entry-card')).toHaveCount(0)
  await guardHasClosed()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeVisible()

  await navigate('Library')
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await english.fill('Saved after navigation')
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  const detail = page.getByRole('dialog', { name: 'A little discovery', exact: true })
  await expect(detail.getByText('Saved after navigation', { exact: true })).toBeVisible()
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.entry-card')).toHaveCount(1)
  await guardHasClosed()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeVisible()

  // A later pristine editor closes on Back without inheriting the old draft
  // warning, and its history entry does not swallow the next Back navigation.
  await navigate('Library')
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await expect(english).toHaveValue('')
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'View Saved after navigation', exact: true })).toBeVisible()
  await guardHasClosed()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeVisible()
  expect(nativeDialogs).toEqual([])
})
