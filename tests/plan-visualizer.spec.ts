import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const svgSelector = '[data-testid="execution-plan-svg"]'

async function loadSample(page: Page, mode: 'single' | 'compare' = 'single') {
  await page.goto('/')

  if (mode === 'compare') {
    await page.getByRole('button', { name: 'Compare', exact: true }).click()
  }

  await page.getByRole('button', { name: 'Load Sample', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Execution Tree', exact: true })).toBeVisible()
  await expect(page.locator(`${svgSelector} .node`).first()).toBeVisible()
}

test('renders the sample execution plan and summary metrics', async ({ page }) => {
  await loadSample(page)

  await expect(page.getByText('Total Cost', { exact: true }).locator('..')).toContainText('27')
  await expect(page.getByText('CPU Cost', { exact: true }).locator('..')).toContainText('58,000')
  await expect(page.locator(`${svgSelector} .node`)).toHaveCount(5)
  await expect(page.locator(`${svgSelector} .node[aria-label*="SELECT STATEMENT"]`)).toHaveCount(1)
})

test('search and filter update visible execution nodes', async ({ page }) => {
  await loadSample(page)

  const svg = page.locator(svgSelector)
  const search = page.getByRole('searchbox', { name: 'Search execution plan' })
  const archivedNode = svg.locator('.node').filter({ hasText: 'archived_customers' })
  const customerIndexNode = svg.locator('.node').filter({ hasText: 'idx_customer_status' })

  await search.fill('archived_customers')
  await expect(archivedNode).toHaveAttribute('opacity', '1')
  await expect(customerIndexNode).toHaveAttribute('opacity', '0.18')

  const filter = page.locator('label').filter({ hasText: 'Filter' }).getByRole('combobox')
  await search.fill('')
  await filter.selectOption({ label: 'Full table scans' })
  await expect(svg.locator('.node[opacity="1"]')).toHaveCount(2)
})

test('toggles a collapsible node from the keyboard', async ({ page }) => {
  await loadSample(page)

  const svg = page.locator(svgSelector)
  const rootNode = svg.locator('[role="button"][aria-label*="SELECT STATEMENT"]')

  await expect(rootNode).toHaveAttribute('aria-expanded', 'true')
  await rootNode.focus()
  await page.keyboard.press('Enter')
  await expect(rootNode).toHaveAttribute('aria-expanded', 'false')
  await expect(svg.locator('.node')).toHaveCount(1)

  await rootNode.focus()
  await page.keyboard.press('Enter')
  await expect(rootNode).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('.node')).toHaveCount(5)
})

test('loads comparison mode with change results', async ({ page }) => {
  await loadSample(page, 'compare')

  const comparison = page.locator('section[aria-labelledby="comparison-heading"]')
  await expect(comparison).toBeVisible()
  await expect(comparison).toContainText(/Added \d+/)
  await expect(comparison).toContainText(/Removed \d+/)
  await expect(comparison.locator('tbody tr')).not.toHaveCount(0)
})

test('keeps the document within the mobile viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'This assertion is scoped to the Chromium mobile project')
  await loadSample(page)

  const widths = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))

  expect(widths.document).toBeLessThanOrEqual(widths.viewport)
  expect(widths.body).toBeLessThanOrEqual(widths.viewport)
})

test('imports DBMS_XPLAN text with runtime metrics and issues', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'DBMS_XPLAN', exact: true }).click()
  await page.getByRole('button', { name: 'Load Sample', exact: true }).click()

  await expect(page.locator(`${svgSelector} .node`)).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Execution Summary' }).locator('..').locator('..')).toContainText('Cardinality estimate differs')
  await page.getByLabel('Analysis metric').selectOption('elapsed')
  await expect(page.locator('aside')).toContainText('Active metric20')
})

test('reports worker validation errors and can visualize after correction', async ({ page }) => {
  await page.goto('/')
  const input = page.getByRole('textbox', { name: 'Current Plan JSON' })
  await input.fill('{ invalid json')
  await page.getByRole('button', { name: 'Visualize Plan' }).click()
  await expect(page.locator('main div[role="alert"]').filter({ hasText: 'Current plan JSON is invalid' })).toBeVisible()

  await page.getByRole('button', { name: 'Load Sample', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Execution Tree', exact: true })).toBeVisible()
  await expect(page.locator(`${svgSelector} .node`)).toHaveCount(5)
})

test('keeps multiple predicates for the same DBMS_XPLAN operation', async ({ page }) => {
  const plan = `| Id | Operation          | Name      | Rows | Cost (%CPU)|
|  0 | SELECT STATEMENT   |           |    1 |           4 |
|  1 |  TABLE ACCESS FULL | CUSTOMERS |   10 |           3 |
Predicate Information:
1 - access("CUSTOMER_ID"=:B1)
1 - filter("STATUS"='ACTIVE')`

  await page.goto('/')
  await page.getByRole('button', { name: 'DBMS_XPLAN', exact: true }).click()
  await page.getByRole('textbox', { name: 'Current Plan DBMS_XPLAN' }).fill(plan)
  await page.getByRole('button', { name: 'Visualize Plan' }).click()
  await expect(page.locator(`${svgSelector} .node`)).toHaveCount(2)
  await page.locator(`${svgSelector} .node[data-node-id="0.0"]`).dispatchEvent('click')
  await expect(page.locator('aside')).toContainText('CUSTOMER_ID')
  await expect(page.locator('aside')).toContainText('STATUS')
})

test('persists plan history and loads it as comparison baseline', async ({ page }) => {
  await loadSample(page)
  await page.getByLabel('History plan name').fill('Saved E2E Plan')
  await page.getByLabel('History environment').fill('TEST')
  await page.getByRole('button', { name: 'Save Current' }).click()
  await expect(page.getByText('Saved E2E Plan')).toBeVisible()

  await page.reload()
  const row = page.getByText('Saved E2E Plan').locator('..').locator('..')
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Baseline' }).click()
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('exports a standalone HTML report', async ({ page }) => {
  await loadSample(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'HTML Report' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('execution-plan-report.html')
  const path = await download.path()
  expect(path).not.toBeNull()
  const report = await readFile(path as string, 'utf8')
  expect(report).toContain('--cds-background:#f4f4f4')
})

test('shows breadcrumb, metric-specific bottlenecks, and minimap', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop minimap is intentionally hidden on mobile')
  await loadSample(page)
  await page.locator(`${svgSelector} .node[data-node-id="0.0"]`).dispatchEvent('click')
  await expect(page.getByRole('navigation', { name: 'Selected node path' })).toContainText('TABLE ACCESS')
  await page.getByLabel('Analysis metric').selectOption('rows')
  await expect(page.getByLabel('Execution plan minimap')).toBeVisible()
  await expect(page.getByLabel('Execution plan minimap').locator('circle')).toHaveCount(5)
})

test('detects an operation moved between branches', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const baseline = { operation: 'SELECT STATEMENT', children: [{ operation: 'VIEW', objectName: 'OLD_PARENT', children: [{ operation: 'TABLE ACCESS', options: 'FULL', objectName: 'EVENTS', cost: 5 }] }] }
  const current = { operation: 'SELECT STATEMENT', children: [{ operation: 'VIEW', objectName: 'NEW_PARENT', children: [{ operation: 'TABLE ACCESS', options: 'FULL', objectName: 'EVENTS', cost: 5 }] }] }
  await page.getByRole('textbox', { name: 'Baseline Plan JSON' }).fill(JSON.stringify(baseline))
  await page.getByRole('textbox', { name: 'Current Plan JSON' }).fill(JSON.stringify(current))
  await page.getByRole('button', { name: 'Visualize Plan' }).click()
  const comparison = page.locator('section[aria-labelledby="comparison-heading"]')
  await expect(comparison).toContainText('Moved 1')
  await expect(comparison.locator('tbody')).toContainText('Moved')
})

test('does not infer movement when duplicate operations are ambiguous', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  const table = { operation: 'TABLE ACCESS', options: 'FULL', objectName: 'EVENTS', cost: 5 }
  const baseline = { operation: 'SELECT STATEMENT', children: [{ operation: 'VIEW', objectName: 'OLD_A', children: [table] }, { operation: 'VIEW', objectName: 'OLD_B', children: [table] }] }
  const current = { operation: 'SELECT STATEMENT', children: [{ operation: 'VIEW', objectName: 'NEW_A', children: [table] }, { operation: 'VIEW', objectName: 'NEW_B', children: [table] }] }
  await page.getByRole('textbox', { name: 'Baseline Plan JSON' }).fill(JSON.stringify(baseline))
  await page.getByRole('textbox', { name: 'Current Plan JSON' }).fill(JSON.stringify(current))
  await page.getByRole('button', { name: 'Visualize Plan' }).click()
  const comparison = page.locator('section[aria-labelledby="comparison-heading"]')
  await expect(comparison).toContainText('Moved 0')
  await expect(comparison).toContainText('Added 4')
  await expect(comparison).toContainText('Removed 4')
})
