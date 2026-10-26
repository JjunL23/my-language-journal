import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('core mobile screens have no detected WCAG A/AA violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Good words deserve a place.' })).toBeVisible()

  async function checkScreen() {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
  }

  await checkScreen()
  await page.getByRole('button', { name: 'New entry', exact: true }).click()
  await checkScreen()
  await page.getByPlaceholder('A word or phrase in English').fill('Accessible')
  await page.getByRole('button', { name: 'Save entry', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'A little discovery' })).toBeVisible()
  await checkScreen()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await checkScreen()
  await page.getByRole('button', { name: 'Keep entry', exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await checkScreen()
  await page.getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Settings', exact: true }).click()
  await checkScreen()
})
