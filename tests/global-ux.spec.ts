import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

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

test('evaluates formulas in a worker and rejects assignments', async ({ page }) => {
  await page.goto('/excel-tools')
  await page.getByRole('button', { name: /Formula Tester/ }).click()
  const formula = page.getByPlaceholder('=SUM(1,2,3)')

  await formula.fill('=SUM(1,2,3) + AVERAGE(10,20)')
  await page.getByRole('button', { name: 'Test Formula' }).click()
  await expect(page.getByText('Result: 21', { exact: true })).toBeVisible()

  await formula.fill('x = 2')
  await page.getByRole('button', { name: 'Test Formula' }).click()
  await expect(page.getByText(/AssignmentNode/).first()).toBeVisible()
})

test('analyzes CSV data in a background worker', async ({ page }) => {
  await page.goto('/excel-tools')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'scores.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,score\nAlice,10\nBob,20\n'),
  })

  const results = page.getByRole('heading', { name: 'Analysis Results' }).locator('..').locator('..')
  await expect(results).toContainText('Rows')
  await expect(results).toContainText('2')
  await expect(results).toContainText('Columns')
})

test('analyzes a valid XLSX workbook in a background worker', async ({ page }) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Scores')
  worksheet.addRow(['name', 'score'])
  worksheet.addRow(['Alice', 10])
  worksheet.addRow(['Bob', 20])
  const buffer = await workbook.xlsx.writeBuffer()

  await page.goto('/excel-tools')
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'scores.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(buffer),
  })

  const results = page.getByRole('heading', { name: 'Analysis Results' }).locator('..').locator('..')
  await expect(results).toContainText('Rows')
  await expect(results).toContainText('2')
  await expect(results).toContainText('score')
})

test('extracts SQL in a background worker', async ({ page }) => {
  await page.goto('/sql-extractor')
  await page.getByPlaceholder(/Paste logs, code/).fill('Hibernate: select * from events where status = ?;\nbinding parameter [1] as [VARCHAR] - [ACTIVE]')
  await page.getByRole('button', { name: /Extract SQL/ }).click()

  await expect(page.getByLabel('Extracted SQL output')).toContainText('select * from events')
})

test('hands log input to SQL Extractor and SQL context to Execution Plan', async ({ page }) => {
  await page.goto('/log-analyzer')
  await page.getByRole('button', { name: 'Load Sample' }).click()
  await page.getByRole('button', { name: 'Send to SQL' }).click()
  await expect(page).toHaveURL(/\/sql-extractor$/)
  await expect(page.getByPlaceholder(/Paste logs, code/)).toContainText('ORA-00904')

  await page.getByRole('button', { name: /Extract SQL/ }).click()
  await page.getByRole('button', { name: 'Open in Plan' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Source SQL', { exact: true })).toBeVisible()
})

test('saves and restores a named workspace snapshot', async ({ page }) => {
  await page.goto('/url-encoder')
  const input = page.getByPlaceholder('Enter text to encode/decode...')
  await input.fill('workspace original')
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: 'Open workspace manager' }).click()
  await page.getByLabel('Workspace name').fill('E2E Workspace')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(page.getByText('E2E Workspace')).toBeVisible()
  await page.getByRole('button', { name: 'Close workspace manager' }).click()

  await input.fill('changed value')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Open workspace manager' }).click()
  await page.getByText('E2E Workspace').locator('..').locator('..').getByRole('button', { name: 'Restore' }).click()
  await page.waitForLoadState('domcontentloaded')
  await expect(input).toHaveValue('workspace original')
})

test('marks tools as favorites in the command palette', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Toggle menu' }).click()
  await page.getByRole('button', { name: 'Add URL Encoder to favorites' }).click()

  await page.keyboard.press('Control+K')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await palette.getByRole('searchbox').fill('url encoder')
  await expect(palette.getByText('Favorite', { exact: true })).toBeVisible()
})

test('restores Diff Viewer before placing an incoming transfer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mydevtools:session:diff-viewer:v1', JSON.stringify({
      leftText: 'restored original',
      rightText: 'restored modified',
    }))
    localStorage.setItem('mydevtools:transfer:diff-viewer', JSON.stringify({
      createdAt: Date.now(),
      payload: { text: 'incoming environment text', label: 'Env to K8s' },
    }))
  })

  await page.goto('/diff-viewer')
  const editors = page.locator('textarea')
  await expect(editors.nth(0)).toHaveValue('restored original')
  await expect(editors.nth(1)).toHaveValue('incoming environment text')
})

test('places an incoming Diff Viewer transfer on the left when restored left is empty', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mydevtools:session:diff-viewer:v1', JSON.stringify({
      leftText: '',
      rightText: 'restored modified',
    }))
    localStorage.setItem('mydevtools:transfer:diff-viewer', JSON.stringify({
      createdAt: Date.now(),
      payload: { text: 'incoming environment text' },
    }))
  })

  await page.goto('/diff-viewer')
  const editors = page.locator('textarea')
  await expect(editors.nth(0)).toHaveValue('incoming environment text')
  await expect(editors.nth(1)).toHaveValue('restored modified')
})
