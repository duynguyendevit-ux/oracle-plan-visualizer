import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, chmod, mkdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const defaultConfigDirectory = join(homedir(), '.config', 'mydevtools')
const configPath = process.env.RANCHER_LOG_AGENT_CONFIG || join(defaultConfigDirectory, 'rancher-log-agent.json')
const requestedKubeconfig = process.argv[2]
  || process.env.KUBECONFIG?.split(':')[0]
  || join(homedir(), '.kube', 'config')
const kubectlPath = process.env.KUBECTL_PATH || '/usr/bin/kubectl'

function runKubectl(kubeconfigPath, args) {
  return new Promise((resolve, reject) => {
    execFile(kubectlPath, ['--kubeconfig', kubeconfigPath, ...args], { encoding: 'utf8', timeout: 20_000 }, (error, stdout) => {
      if (error) reject(new Error('kubectl could not read the selected kubeconfig.'))
      else resolve(stdout)
    })
  })
}

try {
  await access(kubectlPath, constants.X_OK)
  const kubeconfigPath = await realpath(requestedKubeconfig)
  const kubeconfig = await stat(kubeconfigPath)
  if (!kubeconfig.isFile()) throw new Error('Kubeconfig path is not a file.')
  if (kubeconfig.size > 1024 * 1024) throw new Error('Kubeconfig is larger than 1 MB.')
  await access(kubeconfigPath, constants.R_OK)

  const contexts = (await runKubectl(kubeconfigPath, ['config', 'get-contexts', '-o', 'name']))
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
  if (contexts.length === 0) throw new Error('Kubeconfig does not contain any contexts.')

  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 })
  if (dirname(configPath) === defaultConfigDirectory) await chmod(dirname(configPath), 0o700)
  const temporaryPath = `${configPath}.tmp-${process.pid}`
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ kubeconfigPath, kubectlPath }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    await rename(temporaryPath, configPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }

  console.log(`Saved Rancher log config: ${configPath}`)
  console.log(`Kubeconfig: ${kubeconfigPath}`)
  console.log(`Contexts: ${contexts.length}`)
  console.log('Start Log Analyzer with: npm run dev:rancher')
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Unable to configure Rancher logs.')
  console.error('Usage: npm run setup:rancher -- /absolute/path/to/kubeconfig.yaml')
  process.exit(1)
}
