import { expect, test } from '@playwright/test'

test('opens a tool from the command palette with the keyboard', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+K')

  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await palette.getByRole('searchbox').fill('hash sha')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/hash-generator$/)
  await expect(page.getByRole('heading', { name: 'Hash Generator' })).toBeVisible()
})

test('filters tools in the sidebar', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle menu' }).click()
  }

  const navigation = page.getByRole('navigation', { name: 'Tools' })
  await page.getByRole('searchbox', { name: 'Search tools' }).fill('kubernetes yaml')
  await expect(navigation.getByRole('link', { name: 'Env to K8s' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Log Analyzer' })).toHaveCount(0)
})

test('shows a shared toast after copying and restores the latest tool session', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/url-encoder')

  const input = page.getByPlaceholder('Enter text to encode/decode...')
  await input.fill('session value')
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByRole('status')).toContainText('URL Encode copied')

  await page.waitForTimeout(450)
  await page.reload()
  await expect(input).toHaveValue('session value')
})

test('shows a useful result empty state', async ({ page }) => {
  await page.goto('/sql-extractor')
  await expect(page.getByRole('heading', { name: 'No SQL extracted yet' })).toBeVisible()
  await expect(page.getByText('Paste a log or drop a file')).toBeVisible()
})

test('uses the shared error toast for unreadable spreadsheets', async ({ page }) => {
  await page.goto('/excel-tools')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'broken.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('not an excel workbook'),
  })

  await expect(page.getByText('Unable to analyze spreadsheet', { exact: true })).toBeVisible()
})
