import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = process.cwd()
let root
let agent
let port
let agentUrl
let allowedOrigin
let fakeKubectl
let kubeconfig
let configPath
let argvLog

function freePort() {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

function waitForAgent(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Agent did not start.')), 10_000)
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Rancher log agent listening')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    child.once('exit', (code) => reject(new Error(`Agent exited with code ${code}.`)))
  })
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { errorOutput += chunk })
    child.on('exit', (code) => code === 0 ? resolve(output) : reject(new Error(errorOutput || `Process exited with ${code}.`)))
  })
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'rancher-agent-test-'))
  fakeKubectl = join(root, 'kubectl')
  kubeconfig = join(root, 'rancher.yaml')
  configPath = join(root, 'agent-config.json')
  argvLog = join(root, 'argv.log')
  await writeFile(kubeconfig, 'apiVersion: v1\nkind: Config\n', { mode: 0o600 })
  await writeFile(fakeKubectl, `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_KUBECTL_ARGV, JSON.stringify(args) + '\\n')
if (args[0] === 'version') {
  console.log(JSON.stringify({ clientVersion: { gitVersion: 'v1.30.14' } }))
  process.exit(0)
}
const configIndex = args.indexOf('--kubeconfig')
const config = configIndex >= 0 ? fs.readFileSync(args[configIndex + 1], 'utf8') : ''
if (args.includes('view')) {
  const user = config.includes('tokenFile') ? { tokenFile: '/etc/passwd' } : { token: 'inline' }
  const server = config.includes('example.com') ? 'https://example.com' : 'https://10.69.3.69:6443'
  console.log(JSON.stringify({ clusters: [{ name: 'demo', cluster: { server } }], users: [{ name: 'demo', user }] }))
} else if (args.includes('get-contexts')) {
  console.log('demo-context')
} else if (args.includes('logs') && args.includes('--follow=true')) {
  const writeChunks = (stream, chunks, index = 0) => {
    if (index >= chunks.length) return
    stream.write(chunks[index])
    setTimeout(() => writeChunks(stream, chunks, index + 1), 10)
  }
  if (args.includes('hold-pod')) {
    process.stdout.write('2026-07-17T10:00:00.000Z INFO 1 --- [main] demo.Stream : held line\\n')
    setInterval(() => {}, 1_000)
  } else if (args.includes('utf8-pod')) {
    writeChunks(process.stdout, [
      Buffer.from('2026-07-17T10:00:00.000Z INFO demo.Stream : caf'),
      Buffer.from([0xc3]),
      Buffer.from([0xa9]),
      Buffer.from(' 🚀 line\\n'),
    ])
    setTimeout(() => process.exit(0), 100)
  } else if (args.includes('error-pod')) {
    writeChunks(process.stderr, [
      Buffer.from('kubectl '),
      Buffer.from([0xe2]),
      Buffer.from([0x9d]),
      Buffer.from([0x8c]),
      Buffer.from(' failed'),
    ])
    setTimeout(() => process.exit(1), 100)
  } else {
    console.log('2026-07-17T10:00:00.000Z INFO 1 --- [main] demo.Stream : live line')
    setTimeout(() => process.exit(0), 50)
  }
} else {
  console.log(JSON.stringify({ items: [] }))
}
`, { mode: 0o755 })
  await chmod(fakeKubectl, 0o755)
  await mkdir(join(root, 'tmp'), { recursive: true })
  await writeFile(configPath, `${JSON.stringify({ kubeconfigPath: kubeconfig, kubectlPath: fakeKubectl })}\n`, { mode: 0o600 })

  port = await freePort()
  agentUrl = `http://127.0.0.1:${port}/rancher-logs`
  allowedOrigin = 'http://127.0.0.1:3999'
  agent = spawn(process.execPath, ['scripts/rancher-log-agent.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      KUBECONFIG: '',
      PORT: '3999',
      TMPDIR: join(root, 'tmp'),
      FAKE_KUBECTL_ARGV: argvLog,
      RANCHER_LOG_AGENT_PORT: String(port),
      RANCHER_LOG_AGENT_CONFIG: configPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitForAgent(agent)
})

after(async () => {
  if (agent && agent.exitCode === null) {
    const exited = new Promise((resolve) => agent.once('exit', resolve))
    agent.kill('SIGTERM')
    await exited
  }
  await rm(root, { recursive: true, force: true })
})

test('setup persists the kubeconfig path with owner-only permissions', async () => {
  const setupConfig = join(root, 'setup-config.json')
  await runNode('scripts/setup-rancher-log.mjs', [kubeconfig], {
    ...process.env,
    KUBECTL_PATH: fakeKubectl,
    FAKE_KUBECTL_ARGV: argvLog,
    RANCHER_LOG_AGENT_CONFIG: setupConfig,
  })
  const saved = JSON.parse(await readFile(setupConfig, 'utf8'))
  assert.equal(saved.kubeconfigPath, kubeconfig)
  assert.equal((await stat(setupConfig)).mode & 0o777, 0o600)
})

test('agent exposes configured environment and accepts the configured kubeconfig', async () => {
  const availability = await fetch(agentUrl).then((response) => response.json())
  assert.equal(availability.available, true)
  assert.equal(availability.configuredKubeconfigPath, kubeconfig)

  const response = await fetch(agentUrl, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'contexts' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).contexts, ['demo-context'])
  const invocations = (await readFile(argvLog, 'utf8')).trim().split('\n').map(JSON.parse)
  assert.ok(invocations.some((args) => args.includes('get-contexts')))
})

test('agent rejects untrusted origins and unsafe kubeconfig credentials', async () => {
  const forbidden = await fetch(agentUrl, { headers: { Origin: 'https://evil.example' } })
  assert.equal(forbidden.status, 403)

  const unsafe = await fetch(agentUrl, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'contexts', kubeconfig: 'tokenFile: /etc/passwd' }),
  })
  assert.equal(unsafe.status, 400)
  assert.match((await unsafe.json()).error, /unsupported file-backed/i)
  assert.deepEqual(await readdir(join(root, 'tmp')), [])
})

test('agent rejects oversized requests before invoking kubectl', async () => {
  const response = await fetch(agentUrl, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'contexts', kubeconfig: 'a'.repeat(1_300_000) }),
  })
  assert.equal(response.status, 413)
})

test('agent streams kubectl logs and enables follow mode', async () => {
  const response = await fetch(agentUrl, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'stream-logs',
      context: 'demo-context',
      namespace: 'backend',
      pod: 'demo-pod',
      container: 'app',
      tail: 100,
      since: '5m',
    }),
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /application\/x-ndjson/)
  const stream = await response.text()
  assert.match(stream, /"status":"connected"/)
  assert.match(stream, /live line/)
  const invocations = (await readFile(argvLog, 'utf8')).trim().split('\n').map(JSON.parse)
  assert.ok(invocations.some((args) => args.includes('logs') && args.includes('--follow=true')))
})

test('agent keeps short requests available while a bounded live stream is active', async () => {
  const streamResponse = await fetch(agentUrl, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stream-logs', namespace: 'backend', pod: 'hold-pod' }),
  })
  assert.equal(streamResponse.status, 200)

  const shortRequests = [
    { action: 'contexts' },
    { action: 'namespaces', context: 'demo-context' },
    { action: 'pods', context: 'demo-context', namespace: 'backend' },
    { action: 'logs', context: 'demo-context', namespace: 'backend', pod: 'demo-pod' },
  ]
  for (const body of shortRequests) {
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 200, body.action)
  }

  const secondStream = await fetch(agentUrl, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stream-logs', namespace: 'backend', pod: 'hold-pod' }),
  })
  assert.equal(secondStream.status, 429)
  await secondStream.text()

  await streamResponse.body?.cancel()

  let released = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const probe = await fetch(agentUrl, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stream-logs', namespace: 'backend', pod: 'demo-pod' }),
    })
    await probe.text()
    if (probe.status === 200) {
      released = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.equal(released, true)
})

test('agent preserves split UTF-8 stdout and stderr across kubectl chunks', async () => {
  const readStream = async (pod) => {
    const response = await fetch(agentUrl, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stream-logs', namespace: 'backend', pod }),
    })
    assert.equal(response.status, 200)
    return (await response.text()).trim().split('\n').map(JSON.parse)
  }

  const stdoutRecords = await readStream('utf8-pod')
  assert.equal(stdoutRecords.filter((record) => record.type === 'log').map((record) => record.data).join(''), '2026-07-17T10:00:00.000Z INFO demo.Stream : café 🚀 line\n')

  const stderrRecords = await readStream('error-pod')
  const closed = stderrRecords.find((record) => record.type === 'status' && record.status === 'closed')
  assert.equal(closed.code, 1)
  assert.match(closed.detail, /kubectl ❌ failed/)
})
