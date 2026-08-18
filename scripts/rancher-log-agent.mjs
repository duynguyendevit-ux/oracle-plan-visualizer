import { execFile, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { arch, homedir, platform, tmpdir } from 'node:os'
import { StringDecoder } from 'node:string_decoder'
import { dirname, join } from 'node:path'

const HOST = '127.0.0.1'
const PORT = Number(process.env.RANCHER_LOG_AGENT_PORT || 3210)
const NEXT_PORT = Number(process.env.PORT || 3000)
const DEFAULT_CONFIG_DIRECTORY = join(homedir(), '.config', 'mydevtools')
const AGENT_CONFIG_PATH = process.env.RANCHER_LOG_AGENT_CONFIG || join(DEFAULT_CONFIG_DIRECTORY, 'rancher-log-agent.json')

async function loadAgentConfig() {
  try {
    return JSON.parse(await readFile(AGENT_CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

const agentConfig = await loadAgentConfig()
let kubectlPath = process.env.KUBECTL_PATH || agentConfig.kubectlPath || '/usr/bin/kubectl'
const CONFIGURED_KUBECONFIG_PATH = process.env.KUBECONFIG || agentConfig.kubeconfigPath || ''
const MAX_KUBECONFIG_SIZE = 1024 * 1024
const MAX_REQUEST_SIZE = MAX_KUBECONFIG_SIZE + 128 * 1024
const MAX_OUTPUT_SIZE = 20 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 30_000
const MAX_STREAM_DURATION_MS = 30 * 60 * 1000
const MAX_ACTIVE_REQUESTS = 2
const MAX_ACTIVE_STREAMS = 1
const allowedOrigins = new Set([
  `http://127.0.0.1:${NEXT_PORT}`,
  `http://localhost:${NEXT_PORT}`,
  'http://127.0.0.1:3100',
  'http://localhost:3100',
  ...(process.env.RANCHER_LOG_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
])
const allowedClusterHosts = new Set(
  (process.env.KUBECTL_ALLOWED_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean)
)

let activeRequests = 0
let activeStreams = 0
let installPromise = null

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

class KubectlError extends Error {
  constructor(timedOut) {
    super(timedOut ? 'kubectl timed out' : 'kubectl failed')
    this.timedOut = timedOut
  }
}

function responseHeaders(origin) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  }
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers.Vary = 'Origin'
  }
  return headers
}

function streamHeaders(origin) {
  return {
    ...responseHeaders(origin),
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, responseHeaders(origin))
  response.end(JSON.stringify(payload))
}

async function availability() {
  try {
    await access(kubectlPath, constants.X_OK)
    const version = await kubectlClientVersion()
    let configuredKubeconfigPath = ''
    if (CONFIGURED_KUBECONFIG_PATH) {
      try {
        configuredKubeconfigPath = await resolveConfiguredKubeconfig()
      } catch {
        configuredKubeconfigPath = ''
      }
    }
    return { agentAvailable: true, available: true, kubectlPath, version, configuredKubeconfigPath }
  } catch {
    return { agentAvailable: true, available: false, kubectlPath, reason: `kubectl was not found at ${kubectlPath}.` }
  }
}

function kubectlClientVersion() {
  return new Promise((resolve, reject) => {
    execFile(kubectlPath, ['version', '--client', '-o', 'json'], { encoding: 'utf8', timeout: 10_000 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      try {
        resolve(JSON.parse(stdout).clientVersion?.gitVersion || 'installed')
      } catch {
        resolve('installed')
      }
    })
  })
}

async function downloadBuffer(url, maxBytes) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new RequestError(502, 'Unable to download kubectl from dl.k8s.io.')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > maxBytes) throw new RequestError(502, 'Downloaded kubectl binary is unexpectedly large.')
  return buffer
}

async function persistKubectlPath() {
  const configDirectory = dirname(AGENT_CONFIG_PATH)
  const temporaryPath = `${AGENT_CONFIG_PATH}.tmp-${process.pid}-${randomUUID()}`
  const latestConfig = await loadAgentConfig()
  const mergedConfig = {
    ...latestConfig,
    kubeconfigPath: latestConfig.kubeconfigPath || CONFIGURED_KUBECONFIG_PATH || agentConfig.kubeconfigPath,
    kubectlPath,
  }
  await mkdir(configDirectory, { recursive: true, mode: 0o700 })
  if (configDirectory === DEFAULT_CONFIG_DIRECTORY) await chmod(configDirectory, 0o700)
  try {
    await writeFile(temporaryPath, `${JSON.stringify(mergedConfig, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    await rename(temporaryPath, AGENT_CONFIG_PATH)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function performKubectlInstall() {
  const operatingSystem = platform()
  const architecture = arch() === 'x64' ? 'amd64' : arch() === 'arm64' ? 'arm64' : ''
  if (!['linux', 'darwin'].includes(operatingSystem) || !architecture) {
    throw new RequestError(400, `Automatic kubectl installation is unsupported on ${operatingSystem}/${arch()}.`)
  }

  const versionResponse = await fetch('https://dl.k8s.io/release/stable.txt', { signal: AbortSignal.timeout(30_000) })
  if (!versionResponse.ok) throw new RequestError(502, 'Unable to resolve the stable kubectl version.')
  const version = (await versionResponse.text()).trim()
  if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new RequestError(502, 'The kubectl release version is invalid.')

  const baseUrl = `https://dl.k8s.io/release/${version}/bin/${operatingSystem}/${architecture}/kubectl`
  const [binary, checksumBuffer] = await Promise.all([
    downloadBuffer(baseUrl, 100 * 1024 * 1024),
    downloadBuffer(`${baseUrl}.sha256`, 1024),
  ])
  const expectedChecksum = checksumBuffer.toString('utf8').trim().split(/\s+/)[0]
  const actualChecksum = createHash('sha256').update(binary).digest('hex')
  if (!/^[a-f0-9]{64}$/.test(expectedChecksum) || actualChecksum !== expectedChecksum) {
    throw new RequestError(502, 'kubectl checksum verification failed.')
  }

  const binDirectory = join(homedir(), '.local', 'bin')
  const targetPath = join(binDirectory, 'kubectl')
  const temporaryPath = `${targetPath}.download-${process.pid}-${randomUUID()}`
  await mkdir(binDirectory, { recursive: true, mode: 0o755 })
  try {
    await writeFile(temporaryPath, binary, { mode: 0o755 })
    await chmod(temporaryPath, 0o755)
    await rename(temporaryPath, targetPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
  kubectlPath = targetPath
  await persistKubectlPath()
  return availability()
}

async function installKubectl() {
  if (!installPromise) {
    installPromise = performKubectlInstall().finally(() => {
      installPromise = null
    })
  }
  return installPromise
}

async function resolveConfiguredKubeconfig() {
  if (!CONFIGURED_KUBECONFIG_PATH) throw new RequestError(400, 'Run npm run setup:rancher -- <kubeconfig-path> first.')
  const configPath = await realpath(CONFIGURED_KUBECONFIG_PATH)
  const file = await stat(configPath)
  if (!file.isFile()) throw new RequestError(400, 'Configured kubeconfig path is not a file.')
  if (file.size > MAX_KUBECONFIG_SIZE) throw new RequestError(413, 'Configured kubeconfig is larger than 1 MB.')
  await access(configPath, constants.R_OK)
  return configPath
}

function runKubectl(configPath, args) {
  return new Promise((resolve, reject) => {
    execFile(
      kubectlPath,
      ['--kubeconfig', configPath, '--request-timeout=20s', ...args],
      {
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_SIZE,
        timeout: COMMAND_TIMEOUT_MS,
        env: { ...process.env, KUBECONFIG: configPath },
      },
      (error, stdout) => {
        if (!error) {
          resolve(stdout)
          return
        }
        reject(new KubectlError(Boolean(error.killed || error.signal)))
      }
    )
  })
}

function isAllowedClusterHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (allowedClusterHosts.has(normalized)) return true
  const parts = normalized.split('.').map(Number)
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
  }
  return normalized.includes(':') && (normalized.startsWith('fc') || normalized.startsWith('fd'))
}

async function validateKubeconfig(configPath) {
  let config
  try {
    const output = await runKubectl(configPath, ['config', 'view', '--raw', '-o', 'json'])
    config = JSON.parse(output)
  } catch {
    throw new RequestError(400, 'Kubeconfig is invalid.')
  }

  const blockedUserKeys = new Set(['exec', 'authprovider', 'tokenfile', 'clientcertificate', 'clientkey'])
  for (const entry of config.users || []) {
    const blockedKey = Object.keys(entry.user || {}).find((key) => blockedUserKeys.has(key.toLowerCase().replace(/[-_]/g, '')))
    if (blockedKey) {
      throw new RequestError(400, `Kubeconfig user ${entry.name || '<unnamed>'} uses unsupported file-backed or executable credentials.`)
    }
  }

  if (!config.clusters?.length) throw new RequestError(400, 'Kubeconfig does not define a cluster.')
  for (const entry of config.clusters) {
    const cluster = entry.cluster || {}
    const blockedKey = Object.keys(cluster).find((key) => {
      const normalized = key.toLowerCase().replace(/[-_]/g, '')
      return normalized === 'certificateauthority' || normalized === 'proxyurl'
    })
    if (blockedKey) {
      throw new RequestError(400, `Cluster ${entry.name || '<unnamed>'} uses a file-backed certificate or proxy URL.`)
    }

    let server
    try {
      server = new URL(cluster.server || '')
    } catch {
      throw new RequestError(400, `Cluster ${entry.name || '<unnamed>'} has an invalid server URL.`)
    }
    if (server.protocol !== 'https:' || !isAllowedClusterHost(server.hostname)) {
      throw new RequestError(400, `Cluster ${entry.name || '<unnamed>'} must use an allowed private HTTPS endpoint.`)
    }
  }
}

function optionalValue(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function requireResourceName(value, label) {
  const normalized = optionalValue(value, 253)
  if (!normalized || !/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(normalized)) {
    throw new RequestError(400, `${label} is invalid.`)
  }
  return normalized
}

function normalizeSince(value) {
  const normalized = optionalValue(value, 16)
  if (!normalized) return ''
  if (!/^\d+[smhd]$/.test(normalized)) throw new RequestError(400, 'Since must use a value such as 30m, 2h, or 1d.')
  return normalized
}

function normalizeTail(value) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return 500
  return Math.min(5_000, Math.max(1, Math.round(number)))
}

function logArguments(body, contextArgs, follow = false) {
  const namespace = requireResourceName(body.namespace, 'Namespace')
  const pod = requireResourceName(body.pod, 'Pod')
  const container = optionalValue(body.container, 253)
  if (container) requireResourceName(container, 'Container')
  const tail = normalizeTail(body.tail)
  const since = normalizeSince(body.since)
  const args = [...contextArgs, '-n', namespace, 'logs', pod, `--tail=${tail}`]
  if (follow) args.push('--follow=true')
  if (container) args.push('-c', container)
  if (since) args.push(`--since=${since}`)
  if (body.previous) args.push('--previous')
  return { args, namespace, pod, container, tail, since }
}

async function readLimitedJson(request) {
  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_SIZE) {
    throw new RequestError(413, 'Request is too large.')
  }

  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_REQUEST_SIZE) throw new RequestError(413, 'Request is too large.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RequestError(400, 'Request JSON is invalid.')
  }
}

async function withTemporaryKubeconfig(content, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'mydevtools-kube-'))
  const configPath = join(directory, 'config.yaml')
  try {
    await writeFile(configPath, content, { encoding: 'utf8', mode: 0o600 })
    return await callback(configPath)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function executeWithKubeconfig(configPath, body) {
  await validateKubeconfig(configPath)
  const context = optionalValue(body.context, 253)
  const contextArgs = context ? ['--context', context] : []

    if (body.action === 'contexts') {
      const output = await runKubectl(configPath, ['config', 'get-contexts', '-o', 'name'])
      return { contexts: output.split('\n').map((item) => item.trim()).filter(Boolean) }
    }

    if (body.action === 'namespaces') {
      const output = await runKubectl(configPath, [...contextArgs, 'get', 'namespaces', '-o', 'json'])
      let payload
      try {
        payload = JSON.parse(output)
      } catch {
        throw new KubectlError(false)
      }
      const namespaces = (payload.items || [])
        .map((item) => item.metadata?.name || '')
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
      return { namespaces }
    }

    if (body.action === 'pods') {
      const namespace = requireResourceName(body.namespace, 'Namespace')
      const output = await runKubectl(configPath, [...contextArgs, '-n', namespace, 'get', 'pods', '-o', 'json'])
      let payload
      try {
        payload = JSON.parse(output)
      } catch {
        throw new KubectlError(false)
      }
      const pods = (payload.items || [])
        .map((item) => {
          const statuses = item.status?.containerStatuses || []
          return {
            namespace: item.metadata?.namespace || namespace,
            name: item.metadata?.name || '',
            phase: item.status?.phase || 'Unknown',
            ready: statuses.length > 0 && statuses.every((status) => status.ready),
            restarts: statuses.reduce((total, status) => total + (status.restartCount || 0), 0),
            containers: (item.spec?.containers || []).map((container) => container.name).filter(Boolean),
          }
        })
        .filter((pod) => pod.name)
        .sort((left, right) => left.name.localeCompare(right.name))
      return { pods }
    }

    if (body.action === 'logs') {
      const { args, namespace, pod, container, tail, since } = logArguments(body, contextArgs)
      const logs = await runKubectl(configPath, args)
      return { logs, namespace, pod, container, tail, since }
    }

  throw new RequestError(400, 'Unsupported Rancher log action.')
}

async function streamWithKubeconfig(configPath, body, response, origin) {
  await validateKubeconfig(configPath)
  const context = optionalValue(body.context, 253)
  const contextArgs = context ? ['--context', context] : []
  const { args } = logArguments(body, contextArgs, true)

  response.writeHead(200, streamHeaders(origin))
  response.write(`${JSON.stringify({ type: 'status', status: 'connected' })}\n`)

  const child = spawn(kubectlPath, ['--kubeconfig', configPath, '--request-timeout=0', ...args], {
    env: { ...process.env, KUBECONFIG: configPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stopRequested = false
  let forceKillTimer
  const stop = () => {
    if (stopRequested) return
    stopRequested = true
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 2000)
    }
  }
  const durationTimer = setTimeout(stop, MAX_STREAM_DURATION_MS)
  response.once('close', stop)

  const stdoutDecoder = new StringDecoder('utf8')
  const stderrDecoder = new StringDecoder('utf8')
  const writeLog = (data) => {
    if (!data || response.destroyed) return
    response.write(`${JSON.stringify({ type: 'log', data })}\n`)
  }
  child.stdout.on('data', (chunk) => {
    if (response.destroyed) return
    if (chunk.length > 1024 * 1024) {
      response.write(`${JSON.stringify({ type: 'error', error: 'kubectl produced an oversized log chunk.' })}\n`)
      stop()
      return
    }
    writeLog(stdoutDecoder.write(chunk))
  })
  child.stdout.once('close', () => writeLog(stdoutDecoder.end()))

  let stderr = ''
  const appendStderr = (data) => {
    stderr = `${stderr}${data}`.slice(-2048)
  }
  child.stderr.on('data', (chunk) => appendStderr(stderrDecoder.write(chunk)))
  child.stderr.once('close', () => appendStderr(stderrDecoder.end()))

  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      clearTimeout(durationTimer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      if (!response.destroyed) {
        response.write(`${JSON.stringify({
          type: 'status',
          status: 'closed',
          code,
          signal,
          error: code && !stopRequested ? 'kubectl live stream ended unexpectedly.' : undefined,
          detail: code && !stopRequested ? stderr : undefined,
        })}\n`)
        response.end()
      }
      resolve()
    })
  })
}

async function streamAction(body, response, origin) {
  const kubeconfig = typeof body.kubeconfig === 'string' ? body.kubeconfig.trim() : ''
  if (kubeconfig) {
    if (Buffer.byteLength(kubeconfig, 'utf8') > MAX_KUBECONFIG_SIZE) throw new RequestError(413, 'Kubeconfig is larger than 1 MB.')
    return withTemporaryKubeconfig(kubeconfig, (configPath) => streamWithKubeconfig(configPath, body, response, origin))
  }
  return streamWithKubeconfig(await resolveConfiguredKubeconfig(), body, response, origin)
}

async function executeAction(body) {
  if (body.action === 'check-environment') return availability()
  if (body.action === 'install-kubectl') return installKubectl()

  const kubeconfig = typeof body.kubeconfig === 'string' ? body.kubeconfig.trim() : ''
  if (kubeconfig) {
    if (Buffer.byteLength(kubeconfig, 'utf8') > MAX_KUBECONFIG_SIZE) throw new RequestError(413, 'Kubeconfig is larger than 1 MB.')
    return withTemporaryKubeconfig(kubeconfig, (configPath) => executeWithKubeconfig(configPath, body))
  }

  const configuredPath = await resolveConfiguredKubeconfig()
  return executeWithKubeconfig(configuredPath, body)
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin
  if (origin && !allowedOrigins.has(origin)) {
    sendJson(response, 403, { error: 'Origin is not allowed.' }, '')
    return
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, responseHeaders(origin))
    response.end()
    return
  }
  if (request.url !== '/rancher-logs') {
    sendJson(response, 404, { error: 'Not found.' }, origin)
    return
  }
  if (request.method === 'GET') {
    sendJson(response, 200, await availability(), origin)
    return
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' }, origin)
    return
  }
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    sendJson(response, 415, { error: 'Content-Type must be application/json.' }, origin)
    return
  }

  let requestKind = null
  try {
    const body = await readLimitedJson(request)
    const isStream = body?.action === 'stream-logs'
    if (isStream) {
      if (activeStreams >= MAX_ACTIVE_STREAMS) {
        sendJson(response, 429, { error: 'Too many kubectl requests are running.' }, origin)
        return
      }
      activeStreams += 1
      requestKind = 'stream'
      await streamAction(body, response, origin)
    } else {
      if (activeRequests >= MAX_ACTIVE_REQUESTS) {
        sendJson(response, 429, { error: 'Too many kubectl requests are running.' }, origin)
        return
      }
      activeRequests += 1
      requestKind = 'request'
      sendJson(response, 200, await executeAction(body), origin)
    }
  } catch (cause) {
    if (response.headersSent) {
      if (!response.destroyed) response.end(`${JSON.stringify({ type: 'error', error: 'Unable to continue Rancher log stream.' })}\n`)
      return
    }
    if (cause instanceof RequestError) {
      sendJson(response, cause.status, { error: cause.message }, origin)
    } else if (cause instanceof KubectlError) {
      sendJson(response, cause.timedOut ? 504 : 502, { error: cause.timedOut ? 'kubectl request timed out.' : 'kubectl could not complete the request.' }, origin)
    } else {
      sendJson(response, 500, { error: 'Unable to retrieve Rancher logs.' }, origin)
    }
  } finally {
    if (requestKind === 'stream') activeStreams -= 1
    else if (requestKind === 'request') activeRequests -= 1
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Rancher log agent listening on http://${HOST}:${PORT}`)
  console.log(`Allowed web origins: ${[...allowedOrigins].join(', ')}`)
})

if (process.argv.includes('--next')) {
  const next = spawn('npm', ['run', 'dev', '--', '--hostname', HOST, '--port', String(NEXT_PORT)], {
    stdio: 'inherit',
    env: process.env,
  })
  const shutdown = (signal) => {
    next.kill(signal)
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  next.on('exit', (code) => {
    server.close(() => process.exit(code || 0))
  })
}
