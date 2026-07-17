import { expect, test } from '@playwright/test'

test('loads Rancher pod logs from the configured local kubeconfig and analyzes them', async ({ page }) => {
  await page.route('**/rancher-logs', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({ json: { agentAvailable: true, available: true, kubectlPath: '/usr/bin/kubectl', version: 'v1.30.14', configuredKubeconfigPath: '/home/dev/rancher.yaml' } })
      return
    }

    const body = request.postDataJSON() as { action: string }
    if (body.action === 'contexts') {
      await route.fulfill({ json: { contexts: ['rancher-dev'] } })
      return
    }
    if (body.action === 'namespaces') {
      await route.fulfill({ json: { namespaces: ['backend', 'monitoring'] } })
      return
    }
    if (body.action === 'pods') {
      await route.fulfill({
        json: {
          pods: [{
            namespace: 'backend',
            name: 'event-diary-7dbf9',
            phase: 'Running',
            ready: true,
            restarts: 1,
            containers: ['event-diary'],
          }],
        },
      })
      return
    }
    if (body.action === 'logs') {
      await route.fulfill({
        json: {
          logs: '2026-07-16T09:10:11.123Z ERROR 1 --- [main] c.e.EventDiary : Rancher log failure',
        },
      })
      return
    }

    await route.fulfill({ status: 400, json: { error: 'Unexpected action' } })
  })

  await page.goto('/log-analyzer')
  await page.getByRole('button', { name: 'Rancher', exact: true }).click()
  await expect(page.getByText('/home/dev/rancher.yaml')).toBeVisible()

  await page.getByRole('button', { name: 'Load contexts' }).click()
  await expect(page.getByLabel('Kubernetes context')).toHaveValue('rancher-dev')
  await page.getByRole('button', { name: 'Load namespaces' }).click()
  await page.getByLabel('Kubernetes namespace').selectOption('backend')
  await page.getByRole('button', { name: 'Load pods' }).click()

  await expect(page.getByLabel('Kubernetes pod')).toHaveValue('backend/event-diary-7dbf9')
  await expect(page.getByLabel('Kubernetes container')).toHaveValue('event-diary')
  await page.getByLabel('Log tail lines').fill('800')
  await page.getByLabel('Log since duration').fill('30m')
  await page.getByRole('button', { name: 'Fetch and analyze logs' }).click()

  await expect(page.getByPlaceholder('Paste Spring Boot logs here or upload a file...')).toContainText('Rancher log failure')
  await expect(page.getByText('Rancher log failure', { exact: false })).toBeVisible()
  await expect(page.getByText('ERROR', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText('/home/dev/rancher.yaml')).toBeVisible()
  await expect(page.getByLabel('Kubernetes context')).toBeDisabled()
  await expect(page.getByLabel('Kubernetes namespace')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Load pods' })).toBeDisabled()
})

test('shows Rancher runtime unavailability without disabling file analysis', async ({ page }) => {
  await page.route('**/rancher-logs', async (route) => {
    await route.fulfill({ status: 200, json: { agentAvailable: false, available: false, reason: 'Local runtime required.' } })
  })

  await page.goto('/log-analyzer')
  await page.getByRole('button', { name: 'Rancher', exact: true }).click()
  await expect(page.getByText('Local runtime required.')).toBeVisible()
  await expect(page.getByLabel('Select kubeconfig YAML')).toBeDisabled()

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Load Sample' }).click()
  await page.getByRole('button', { name: 'Analyze Logs' }).click()
  await expect(page.getByText('ORA-00904', { exact: false })).toBeVisible()
})

test('installs kubectl through the local agent when it is missing', async ({ page }) => {
  await page.route('**/rancher-logs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { agentAvailable: true, available: false, kubectlPath: '/usr/bin/kubectl', reason: 'kubectl was not found.' } })
      return
    }
    const body = route.request().postDataJSON() as { action: string }
    expect(body.action).toBe('install-kubectl')
    await route.fulfill({ json: { agentAvailable: true, available: true, kubectlPath: '/home/dev/.local/bin/kubectl', version: 'v1.31.0' } })
  })

  await page.goto('/log-analyzer')
  await page.getByRole('button', { name: 'Rancher', exact: true }).click()
  await page.getByRole('button', { name: 'Install kubectl' }).click()
  await expect(page.getByText('/home/dev/.local/bin/kubectl', { exact: false })).toBeVisible()
  await expect(page.getByText('v1.31.0', { exact: false })).toBeVisible()
})
