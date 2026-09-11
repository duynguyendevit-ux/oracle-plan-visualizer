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

test('uses a transform-only mobile sidebar and avoids animated desktop reflow', async ({ page, isMobile }) => {
  await page.addInitScript(() => localStorage.setItem('sidebarCollapsed', 'true'))
  await page.goto('/')

  const sidebar = page.getByTestId('app-sidebar')
  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle menu' }).click()
    await expect(sidebar).toBeVisible()
    await expect.poll(async () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(288)
    await expect.poll(async () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().left))).toBe(0)
    await expect.poll(async () => sidebar.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('transform')
    await expect.poll(async () => sidebar.evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true)
    return
  }

  await expect.poll(async () => sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(80)
  await expect.poll(async () => sidebar.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('none')
  await expect.poll(async () => sidebar.evaluate((element) => element.scrollWidth === element.clientWidth)).toBe(true)
})

test('opens the useful websites directory with safe external links', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle menu' }).click()
  }

  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Web hữu ích' }).click()
  await expect(page).toHaveURL(/\/useful-websites$/)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Web hữu ích' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Globalping' })).toBeVisible()
  await expect(page.getByText('Mạng & DNS', { exact: true })).toBeVisible()

  const externalLink = page.getByRole('link', { name: 'Mở Globalping trong tab mới' })
  await expect(externalLink).toHaveAttribute('href', 'https://globalping.io/')
  await expect(externalLink).toHaveAttribute('target', '_blank')
  await expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer')
})

test('explores consistent hashing topology changes and key placement', async ({ page }) => {
  await page.goto('/consistent-hashing')
  await expect(page.getByRole('heading', { name: 'Consistent Hashing Explorer' })).toBeVisible()
  await expect(page.getByTestId('consistent-hash-ring')).toBeVisible()
  await expect(page.getByText('server-a', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Locate', exact: true }).click()
  await expect(page.getByText('user:1042', { exact: true })).toBeVisible()
  await expect(page.getByText(/maps to server-[a-c]/)).toBeVisible()
  await expect(page.getByTestId('located-key-marker')).toBeVisible()

  await page.getByRole('button', { name: /Add server/ }).click()
  await expect(page.getByText('server-d', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Added server-d', { exact: true })).toBeVisible()
  await expect(page.getByText(/existing keys moved to a different server/)).toBeVisible()
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('shows a shared toast after copying and restores the latest tool session', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/url-encoder')

  const input = page.getByPlaceholder('Enter text to encode/decode...')
  await input.fill('session value')
  await page.getByRole('button', { name: 'Copy' }).first().click()
  await expect(page.getByRole('status')).toContainText('URL Encode copied')

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('mydevtools:session:url-encoder:v1'))).toContain('session value')
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
  await expect(page.getByPlaceholder(/Paste logs, code/)).toContainText('from users')

  await page.getByRole('button', { name: /Extract SQL/ }).click()
  await page.getByRole('button', { name: 'Open in Plan' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Source SQL', { exact: true })).toBeVisible()
})

test('groups repeated log root causes and filters by correlation ID', async ({ page }) => {
  await page.goto('/log-analyzer')
  await page.getByRole('button', { name: 'Load Sample' }).click()
  await page.getByRole('button', { name: 'Analyze Logs' }).click()

  await expect(page.getByText('Trace:', { exact: false }).first()).toBeVisible()
  await expect(page.getByTestId('log-root-cause').first()).toContainText('ORA-00904')
  await page.getByRole('button', { name: 'Error groups' }).click()
  await expect(page.getByTestId('error-groups')).toContainText('2 occurrences')

  await page.getByLabel('Trace or request ID').fill('trace-user-1042')
  await page.getByRole('button', { name: 'Analyze Logs' }).click()
  await page.getByRole('button', { name: 'Entries' }).click()
  await expect(page.getByText('trace-user-1042', { exact: true })).toBeVisible()
  await expect(page.getByText('trace-user-1044', { exact: true })).toHaveCount(0)
})

test('parses structured JSON metadata without merging the next text entry', async ({ page }) => {
  const structuredError = JSON.stringify({
    '@timestamp': '2026-09-10T10:00:00.000Z',
    'log.level': 'ERROR',
    'log.logger': 'example.users.UserImportService',
    'trace.id': 'json-trace-1',
    'request.id': 'json-request-1',
    message: 'User import failed',
    'error.stack_trace': 'java.lang.IllegalStateException: Import failed\nCaused by: java.io.IOException: users.csv is unreadable',
  })

  await page.goto('/log-analyzer')
  await page.getByPlaceholder('Paste Spring Boot logs here or upload a file...').fill(`${structuredError}\n2026-09-10T10:00:01.000Z INFO 1 --- [main] example.users.UserImportService : Import retry scheduled`)
  await page.getByRole('button', { name: 'Analyze Logs' }).click()

  await expect(page.getByText('json-trace-1', { exact: true })).toBeVisible()
  await expect(page.getByText('json-request-1', { exact: true })).toBeVisible()
  await expect(page.getByTestId('log-root-cause')).toContainText('users.csv is unreadable')
  await expect(page.getByText('1 --- [main] example.users.UserImportService : Import retry scheduled', { exact: true })).toBeVisible()
})

test('saves and restores a named workspace snapshot', async ({ page }) => {
  await page.goto('/url-encoder')
  const input = page.getByPlaceholder('Enter text to encode/decode...')
  await input.fill('workspace original')
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('mydevtools:session:url-encoder:v1'))).toContain('workspace original')

  await page.getByRole('button', { name: 'Open workspace manager' }).click()
  await page.getByLabel('Workspace name').fill('E2E Workspace')
  await page.getByRole('button', { name: 'Save snapshot' }).click()
  await expect(page.getByText('E2E Workspace')).toBeVisible()
  await page.getByRole('button', { name: 'Close workspace manager' }).click()

  await input.fill('changed value')
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('mydevtools:session:url-encoder:v1'))).toContain('changed value')
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
