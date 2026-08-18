'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { useToolSession } from '@/hooks/useToolSession'
import { useWorkerRpc } from '@/hooks/useWorkerRpc'
import { sendToolTransfer } from '@/hooks/useToolTransfer'
import type { LogEntry, LogStats } from '@/lib/log-analyzer'
import { copyText, toast } from '@/lib/toast'
import type { LogWorkerRequest, LogWorkerResult } from '@/workers/log-analyzer.worker'

interface RancherPod {
  namespace: string
  name: string
  phase: string
  ready: boolean
  restarts: number
  containers: string[]
}

interface RancherAvailability {
  agentAvailable?: boolean
  available: boolean
  kubectlPath?: string
  version?: string
  configuredKubeconfigPath?: string
  reason?: string
}

type LogSource = 'file' | 'rancher'
type RancherAction = 'check-environment' | 'install-kubectl' | 'contexts' | 'namespaces' | 'pods' | 'logs' | null
type LiveStatus = 'stopped' | 'connecting' | 'live' | 'paused' | 'reconnecting'

const RANCHER_LOG_AGENT_URL = process.env.NEXT_PUBLIC_RANCHER_LOG_AGENT_URL || 'http://127.0.0.1:3210/rancher-logs'

export default function LogAnalyzer() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('ALL')
  const [results, setResults] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [utcPlus7, setUtcPlus7] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [logSource, setLogSource] = useState<LogSource>('file')
  const [rancherAvailability, setRancherAvailability] = useState<RancherAvailability | null>(null)
  const [rancherAction, setRancherAction] = useState<RancherAction>(null)
  const [kubeconfig, setKubeconfig] = useState('')
  const [kubeconfigName, setKubeconfigName] = useState('')
  const [configuredKubeconfigPath, setConfiguredKubeconfigPath] = useState('')
  const [contexts, setContexts] = useState<string[]>([])
  const [selectedContext, setSelectedContext] = useState('')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [pods, setPods] = useState<RancherPod[]>([])
  const [selectedPodKey, setSelectedPodKey] = useState('')
  const [selectedContainer, setSelectedContainer] = useState('')
  const [tailLines, setTailLines] = useState(500)
  const [since, setSince] = useState('')
  const [previousContainer, setPreviousContainer] = useState(false)
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('stopped')
  const rancherConfigGeneration = useRef(0)
  const liveAbortRef = useRef<AbortController | null>(null)
  const liveTextRef = useRef('')
  const livePausedRef = useRef(false)
  const liveStoppedRef = useRef(true)
  const liveAnalyzeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const analysisGenerationRef = useRef(0)
  const runLogTask = useWorkerRpc<LogWorkerRequest, LogWorkerResult>(() => (
    new Worker(new URL('../../workers/log-analyzer.worker.ts', import.meta.url), { type: 'module' })
  ))

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  const selectedPod = pods.find((pod) => `${pod.namespace}/${pod.name}` === selectedPodKey)

  useEffect(() => () => {
    liveStoppedRef.current = true
    liveAbortRef.current?.abort()
    if (liveAnalyzeTimerRef.current) clearTimeout(liveAnalyzeTimerRef.current)
  }, [])

  useToolSession('log-analyzer', {
    input: input.length <= 400_000 ? input : '',
    searchTerm,
    filterLevel,
    utcPlus7,
    logSource,
    selectedContext,
    namespace,
    selectedPodKey,
    selectedContainer,
    tailLines,
    since,
    previousContainer,
  }, (saved) => {
    if (typeof saved.input === 'string') setInput(saved.input)
    if (typeof saved.searchTerm === 'string') setSearchTerm(saved.searchTerm)
    if (typeof saved.filterLevel === 'string') setFilterLevel(saved.filterLevel)
    if (typeof saved.utcPlus7 === 'boolean') setUtcPlus7(saved.utcPlus7)
    if (saved.logSource === 'file' || saved.logSource === 'rancher') setLogSource(saved.logSource)
    if (typeof saved.selectedContext === 'string') setSelectedContext(saved.selectedContext)
    if (typeof saved.namespace === 'string') setNamespace(saved.namespace)
    if (typeof saved.selectedPodKey === 'string') setSelectedPodKey(saved.selectedPodKey)
    if (typeof saved.selectedContainer === 'string') setSelectedContainer(saved.selectedContainer)
    if (typeof saved.tailLines === 'number') setTailLines(saved.tailLines)
    if (typeof saved.since === 'string') setSince(saved.since)
    if (typeof saved.previousContainer === 'boolean') setPreviousContainer(saved.previousContainer)
  })

  const showError = (message: string) => {
    setError(message)
    toast.error(message)
  }

  useEffect(() => {
    fetch(RANCHER_LOG_AGENT_URL, { cache: 'no-store' })
      .then(async (response) => response.json() as Promise<RancherAvailability>)
      .then((availability) => {
        setRancherAvailability(availability)
        const configuredPath = availability.configuredKubeconfigPath ?? ''
        setConfiguredKubeconfigPath(configuredPath)
        if (configuredPath) setKubeconfigName(configuredPath)
      })
      .catch(() => setRancherAvailability({ agentAvailable: false, available: false, reason: 'Start the local Rancher agent with npm run rancher-agent.' }))
  }, [])

  // Render single log entry
  const renderLogEntry = (entry: LogEntry, idx: number) => (
    <div key={idx} className="bg-white rounded border border-warm-300/60 p-2 md:p-3 relative group mb-2 md:mb-3">
      <button
        onClick={() => copyEntry(entry)}
        className="absolute top-1.5 md:top-2 right-1.5 md:right-2 p-1 md:p-1.5 rounded hover:bg-warm-100 text-warm-600 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy to clipboard"
      >
        <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
      <div className="flex items-start gap-1.5 md:gap-2 mb-1.5 md:mb-2 flex-wrap">
        <span className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded text-[10px] md:text-xs font-bold ${
          entry.level === 'ERROR' ? 'bg-red-100 text-red-700' :
          entry.level === 'WARN' ? 'bg-orange-100 text-orange-700' :
          entry.level === 'INFO' ? 'bg-blue-100 text-blue-700' :
          entry.level === 'DEBUG' ? 'bg-gray-100 text-gray-700' :
          'bg-gray-50 text-gray-600'
        }`}>
          {entry.level}
        </span>
        <span className="text-[10px] md:text-xs text-warm-600 font-mono font-bold break-all">{utcPlus7 ? convertToUTC7(entry.timestamp) : entry.timestamp}</span>
        <span className="text-[10px] md:text-xs text-warm-500 ml-auto">Line {entry.line}</span>
      </div>
      <div className="text-xs md:text-sm font-mono text-warm-800 mb-1.5 md:mb-2 break-words">{entry.message}</div>
      {entry.stackTrace && entry.stackTrace.length > 0 && (
        <details className="text-[10px] md:text-xs font-mono text-warm-600">
          <summary className="cursor-pointer hover:text-primary">Stack trace ({entry.stackTrace.length} lines)</summary>
          <pre className="mt-1.5 md:mt-2 p-1.5 md:p-2 bg-warm-100 rounded overflow-x-auto text-[10px] md:text-xs">
            {entry.stackTrace.join('\n')}
          </pre>
        </details>
      )}
    </div>
  )

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processFile(file)
  }

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      showError(`File too large! Maximum size is 50MB. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }

    setError('')
    setUploadProgress(1) // Start at 1% to ensure visibility
    const startTime = Date.now()
    const reader = new FileReader()
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100)
        setUploadProgress(Math.max(1, progress)) // Never go below 1%
      }
    }
    
    reader.onload = (event) => {
      setInput(event.target?.result as string)
      setUploadProgress(100)
      
      // Ensure progress bar shows for at least 500ms
      const elapsed = Date.now() - startTime
      const minDelay = Math.max(500 - elapsed, 0)
      
      setTimeout(() => setUploadProgress(0), minDelay + 1000)
    }
    
    reader.onerror = () => {
      showError('Error reading file')
      setUploadProgress(0)
    }
    
    reader.readAsText(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const analyzeLogs = useCallback(async (sourceInput = input) => {
    const generation = ++analysisGenerationRef.current
    setLoading(true)
    setError('')
    setAnalyzeProgress(1)

    try {
      const result = await runLogTask({ input: sourceInput, filterLevel, searchTerm }, { onProgress: setAnalyzeProgress })
      if (generation !== analysisGenerationRef.current) return
      setResults(result.entries)
      setStats(result.stats)
      toast.success('Log analysis complete', `${result.stats.filtered.toLocaleString()} matching entries.`)
      setTimeout(() => setAnalyzeProgress(0), 1000)
    } catch (cause) {
      if (generation !== analysisGenerationRef.current) return
      const message = 'Error parsing logs: ' + (cause instanceof Error ? cause.message : 'Unknown worker error.')
      setError(message)
      toast.error(message)
      setAnalyzeProgress(0)
    } finally {
      if (generation === analysisGenerationRef.current) setLoading(false)
    }
  }, [filterLevel, input, runLogTask, searchTerm])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!loading && input) void analyzeLogs()
      }

      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
        searchInput?.focus()
        searchInput?.select()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [analyzeLogs, input, loading])

  const stopLiveLogs = useCallback((showToast = true) => {
    liveStoppedRef.current = true
    livePausedRef.current = false
    liveAbortRef.current?.abort()
    liveAbortRef.current = null
    if (liveAnalyzeTimerRef.current) clearTimeout(liveAnalyzeTimerRef.current)
    liveAnalyzeTimerRef.current = null
    setLiveStatus('stopped')
    if (showToast) toast.info('Live log stream stopped')
  }, [])

  const pauseLiveLogs = () => {
    livePausedRef.current = true
    setLiveStatus('paused')
  }

  const resumeLiveLogs = () => {
    livePausedRef.current = false
    setLiveStatus('live')
    setInput(liveTextRef.current)
    void analyzeLogs(liveTextRef.current)
  }

  const startLiveLogs = useCallback(() => {
    if (!selectedPod) return
    const pod = selectedPod
    const maxBufferSize = 5 * 1024 * 1024
    liveStoppedRef.current = false
    livePausedRef.current = false
    liveTextRef.current = ''
    setInput('')
    setResults([])
    setStats(null)

    const connect = async (attempt: number): Promise<void> => {
      if (liveStoppedRef.current) return
      setLiveStatus(attempt === 0 ? 'connecting' : 'reconnecting')
      const controller = new AbortController()
      liveAbortRef.current = controller

      try {
        const response = await fetch(RANCHER_LOG_AGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'stream-logs',
            kubeconfig,
            context: selectedContext,
            namespace: pod.namespace,
            pod: pod.name,
            container: selectedContainer,
            tail: attempt === 0 ? tailLines : 1,
            since: attempt === 0 ? since : '10s',
            previous: previousContainer,
          }),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error || 'Unable to start the live log stream.')
        }

        setLiveStatus('live')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''

        while (!liveStoppedRef.current) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          const messages = pending.split('\n')
          pending = messages.pop() ?? ''

          for (const messageText of messages) {
            if (!messageText.trim()) continue
            const message = JSON.parse(messageText) as { type: string; data?: string; error?: string }
            if (message.type === 'error') throw new Error(message.error || 'Live log stream failed.')
            if (message.type !== 'log' || !message.data) continue

            liveTextRef.current = `${liveTextRef.current}${message.data}`.slice(-maxBufferSize)
            if (livePausedRef.current) continue
            setInput(liveTextRef.current)
            if (liveAnalyzeTimerRef.current) clearTimeout(liveAnalyzeTimerRef.current)
            liveAnalyzeTimerRef.current = setTimeout(() => {
              void analyzeLogs(liveTextRef.current)
            }, 750)
          }
        }

        if (!liveStoppedRef.current) throw new Error('Live log connection closed.')
      } catch (cause) {
        if (liveStoppedRef.current || (cause instanceof DOMException && cause.name === 'AbortError')) return
        if (attempt < 3) {
          setLiveStatus('reconnecting')
          await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)))
          return connect(attempt + 1)
        }
        const message = cause instanceof Error ? cause.message : 'Live log stream failed.'
        setError(message)
        toast.error('Live log stream stopped', message)
        stopLiveLogs(false)
      }
    }

    void connect(0)
  }, [analyzeLogs, kubeconfig, previousContainer, selectedContainer, selectedContext, selectedPod, since, stopLiveLogs, tailLines])

  useEffect(() => {
    if (liveStatus !== 'stopped') stopLiveLogs(false)
    // Selections identify the kubectl process. Changing one invalidates the active stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContainer, selectedContext, selectedPodKey])

  const loadSample = () => {
    const sample = `2026-04-06T04:56:28.540Z ERROR 72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Error: 904, SQLState: 42000
2026-04-06T04:56:28.540Z ERROR 72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : ORA-00904: "E2_0"."ZONE": invalid identifier
2026-04-06T04:56:28.541Z WARN  72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Warning Code: -1, SQLState: null
2026-04-06T04:56:28.541Z INFO  72378 --- [nio-8088-exec-1] c.e.service.EventService                  : Processing event batch: 20 items
2026-04-06T04:56:28.542Z DEBUG 72378 --- [nio-8088-exec-1] o.h.SQL                                   : select e1_0.event_id from events e1_0`
    setInput(sample)
  }

  const handleKubeconfigUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      showError('Kubeconfig is larger than 1 MB.')
      return
    }

    try {
      const content = await file.text()
      rancherConfigGeneration.current += 1
      setKubeconfig(content)
      setKubeconfigName(file.name)
      setContexts([])
      setSelectedContext('')
      setNamespaces([])
      setNamespace('')
      setPods([])
      setSelectedPodKey('')
      setSelectedContainer('')
      setError('')
    } catch {
      showError('Unable to read kubeconfig file.')
    }
  }

  const callRancherApi = async <T,>(action: Exclude<RancherAction, null>, payload: Record<string, unknown> = {}) => {
    const response = await fetch(RANCHER_LOG_AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, kubeconfig, ...payload }),
    })
    const data = await response.json() as T & { error?: string; reason?: string }
    if (!response.ok) throw new Error(data.error || data.reason || 'Rancher log request failed.')
    return data
  }

  const applyRancherAvailability = (availability: RancherAvailability) => {
    setRancherAvailability(availability)
    const configuredPath = availability.configuredKubeconfigPath ?? ''
    setConfiguredKubeconfigPath(configuredPath)
    if (!kubeconfig && configuredPath) setKubeconfigName(configuredPath)
  }

  const checkRancherEnvironment = async () => {
    setRancherAction('check-environment')
    setError('')
    try {
      const response = await fetch(RANCHER_LOG_AGENT_URL, { cache: 'no-store' })
      const availability = await response.json() as RancherAvailability
      if (!response.ok) throw new Error(availability.reason || 'Unable to check the local environment.')
      applyRancherAvailability(availability)
    } catch (cause) {
      setRancherAvailability({ agentAvailable: false, available: false, reason: 'Start the local Rancher agent with npm run rancher-agent.' })
      showError(cause instanceof Error ? cause.message : 'Unable to check the local environment.')
    } finally {
      setRancherAction(null)
    }
  }

  const installKubectl = async () => {
    setRancherAction('install-kubectl')
    setError('')
    try {
      const availability = await callRancherApi<RancherAvailability>('install-kubectl')
      applyRancherAvailability(availability)
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : 'Unable to install kubectl.')
    } finally {
      setRancherAction(null)
    }
  }

  const loadRancherContexts = async () => {
    const generation = rancherConfigGeneration.current
    setRancherAction('contexts')
    setError('')
    try {
      const data = await callRancherApi<{ contexts: string[] }>('contexts')
      if (generation !== rancherConfigGeneration.current) return
      setContexts(data.contexts)
      setSelectedContext((current) => current || data.contexts[0] || '')
      setNamespaces([])
      setNamespace('')
      setPods([])
      setSelectedPodKey('')
      setSelectedContainer('')
    } catch (cause) {
      if (generation !== rancherConfigGeneration.current) return
      showError(cause instanceof Error ? cause.message : 'Unable to load kubeconfig contexts.')
    } finally {
      setRancherAction(null)
    }
  }

  const handleContextSelection = (context: string) => {
    setSelectedContext(context)
    setNamespaces([])
    setNamespace('')
    setPods([])
    setSelectedPodKey('')
    setSelectedContainer('')
  }

  const loadRancherNamespaces = async () => {
    const generation = rancherConfigGeneration.current
    setRancherAction('namespaces')
    setError('')
    try {
      const data = await callRancherApi<{ namespaces: string[] }>('namespaces', {
        context: selectedContext,
      })
      if (generation !== rancherConfigGeneration.current) return
      setNamespaces(data.namespaces)
      setNamespace((current) => data.namespaces.includes(current) ? current : data.namespaces[0] ?? '')
      setPods([])
      setSelectedPodKey('')
      setSelectedContainer('')
      if (data.namespaces.length === 0) showError('No namespaces were found.')
    } catch (cause) {
      if (generation !== rancherConfigGeneration.current) return
      showError(cause instanceof Error ? cause.message : 'Unable to list namespaces.')
    } finally {
      setRancherAction(null)
    }
  }

  const handleNamespaceSelection = (value: string) => {
    setNamespace(value)
    setPods([])
    setSelectedPodKey('')
    setSelectedContainer('')
  }

  const loadRancherPods = async () => {
    const generation = rancherConfigGeneration.current
    setRancherAction('pods')
    setError('')
    try {
      const data = await callRancherApi<{ pods: RancherPod[] }>('pods', {
        context: selectedContext,
        namespace,
      })
      if (generation !== rancherConfigGeneration.current) return
      setPods(data.pods)
      const rememberedPod = data.pods.find((pod) => `${pod.namespace}/${pod.name}` === selectedPodKey)
      const nextPod = rememberedPod ?? data.pods[0]
      setSelectedPodKey(nextPod ? `${nextPod.namespace}/${nextPod.name}` : '')
      setSelectedContainer((current) => nextPod?.containers.includes(current) ? current : nextPod?.containers[0] ?? '')
      if (data.pods.length === 0) showError('No pods were found in this namespace.')
    } catch (cause) {
      if (generation !== rancherConfigGeneration.current) return
      showError(cause instanceof Error ? cause.message : 'Unable to list pods.')
    } finally {
      setRancherAction(null)
    }
  }

  const handlePodSelection = (podKey: string) => {
    setSelectedPodKey(podKey)
    const pod = pods.find((item) => `${item.namespace}/${item.name}` === podKey)
    setSelectedContainer(pod?.containers[0] ?? '')
  }

  const fetchRancherLogs = async () => {
    if (!selectedPod) return
    const generation = rancherConfigGeneration.current
    setRancherAction('logs')
    setError('')
    try {
      const data = await callRancherApi<{ logs: string }>('logs', {
        context: selectedContext,
        namespace: selectedPod.namespace,
        pod: selectedPod.name,
        container: selectedContainer,
        tail: tailLines,
        since,
        previous: previousContainer,
      })
      if (generation !== rancherConfigGeneration.current) return
      setInput(data.logs)
      analyzeLogs(data.logs)
      toast.success('Pod logs loaded')
    } catch (cause) {
      if (generation !== rancherConfigGeneration.current) return
      showError(cause instanceof Error ? cause.message : 'Unable to retrieve pod logs.')
    } finally {
      setRancherAction(null)
    }
  }

  const exportResults = () => {
    const text = results.map(entry => {
      let output = `[${entry.level}] ${entry.timestamp}\nLine ${entry.line}: ${entry.message}`
      if (entry.stackTrace && entry.stackTrace.length > 0) {
        output += '\n' + entry.stackTrace.join('\n')
      }
      return output
    }).join('\n\n---\n\n')
    
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `log-analysis-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Log analysis downloaded')
  }

  const copyEntry = (entry: LogEntry) => {
    const displayTimestamp = utcPlus7 ? convertToUTC7(entry.timestamp) : entry.timestamp
    let text = `[${entry.level}] ${displayTimestamp}\nLine ${entry.line}: ${entry.message}`
    if (entry.stackTrace && entry.stackTrace.length > 0) {
      text += '\n' + entry.stackTrace.join('\n')
    }
    void copyText(text, 'Log entry copied')
  }

  const convertToUTC7 = (timestamp: string): string => {
    if (!timestamp) return timestamp
    try {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return timestamp
      
      // Get UTC time in milliseconds and add 7 hours (7 * 60 * 60 * 1000)
      const utc7Time = new Date(date.getTime() + (7 * 60 * 60 * 1000))
      
      // Format: YYYY-MM-DD HH:mm:ss.SSS (UTC+7)
      const year = utc7Time.getUTCFullYear()
      const month = String(utc7Time.getUTCMonth() + 1).padStart(2, '0')
      const day = String(utc7Time.getUTCDate()).padStart(2, '0')
      const hours = String(utc7Time.getUTCHours()).padStart(2, '0')
      const minutes = String(utc7Time.getUTCMinutes()).padStart(2, '0')
      const seconds = String(utc7Time.getUTCSeconds()).padStart(2, '0')
      const ms = String(utc7Time.getUTCMilliseconds()).padStart(3, '0')
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms} (UTC+7)`
    } catch {
      return timestamp
    }
  }

  const clearAll = () => {
    stopLiveLogs(false)
    analysisGenerationRef.current += 1
    rancherConfigGeneration.current += 1
    setInput('')
    setSearchTerm('')
    setFilterLevel('ALL')
    setResults([])
    setStats(null)
    setError('')
    setKubeconfig('')
    setKubeconfigName(configuredKubeconfigPath)
    setContexts([])
    setSelectedContext('')
    setNamespaces([])
    setNamespace('')
    setPods([])
    setSelectedPodKey('')
    setSelectedContainer('')
    setTailLines(500)
    setSince('')
    setPreviousContainer(false)
  }

  const sendToSqlExtractor = () => {
    if (!input.trim()) return
    sendToolTransfer('sql-extractor', { input })
    router.push('/sql-extractor')
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-7 gap-2 md:gap-3 mb-3 md:mb-4">
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">Total</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-warm-800">{stats.total}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">Filtered</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-primary">{stats.filtered}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">ERROR</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-red-600">{stats.ERROR}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">WARN</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-orange-600">{stats.WARN}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">INFO</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-blue-600">{stats.INFO}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">DEBUG</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-gray-600">{stats.DEBUG}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-2 md:p-4 shadow-warm border border-warm-300/60">
            <div className="text-[10px] md:text-xs font-medium text-warm-600 uppercase tracking-wide mb-0.5 md:mb-1">TRACE</div>
            <div className="text-lg md:text-2xl font-serif font-semibold text-gray-500">{stats.TRACE}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)] xl:grid-cols-[minmax(420px,0.68fr)_minmax(0,1.32fr)] gap-4 min-h-[600px] lg:h-[calc(100vh-200px)]">
        {/* Input Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Log Input</h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex border border-outline-variant" role="group" aria-label="Log source">
                <button
                  type="button"
                  onClick={() => {
                    stopLiveLogs(false)
                    setLogSource('file')
                  }}
                  aria-pressed={logSource === 'file'}
                  className={`h-8 px-3 text-xs font-semibold ${logSource === 'file' ? 'bg-primary text-white' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'}`}
                >
                  File
                </button>
                <button
                  type="button"
                  onClick={() => setLogSource('rancher')}
                  aria-pressed={logSource === 'rancher'}
                  className={`h-8 border-l border-outline-variant px-3 text-xs font-semibold ${logSource === 'rancher' ? 'bg-primary text-white' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'}`}
                >
                  Rancher
                </button>
              </div>
              {logSource === 'file' && (
                <button
                  onClick={loadSample}
                  className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
                >
                  Load Sample
                </button>
              )}
              {input && (
                <button type="button" onClick={sendToSqlExtractor} className="h-8 border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary/10">
                  Send to SQL
                </button>
              )}
            </div>
          </div>
          
          <div className="p-4">
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm" role="alert" aria-live="assertive">
                <span className="mr-2">⚠</span>{error}
              </div>
            )}
            
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-warm-600 mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-warm-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            {analyzeProgress > 0 && analyzeProgress < 100 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-warm-600 mb-1">
                  <span>Analyzing logs...</span>
                  <span>{analyzeProgress}%</span>
                </div>
                <div className="w-full bg-warm-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${analyzeProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            {logSource === 'file' ? (
              <div className="mb-3">
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  Upload Log File (Max 50MB)
                </label>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer ${
                    isDragging
                      ? 'border-primary bg-primary/5 scale-[1.02]'
                      : 'border-warm-300 hover:border-primary hover:bg-warm-50'
                  }`}
                >
                  <input
                    type="file"
                    accept=".log,.txt,.json"
                    onChange={handleFileUpload}
                    aria-label="Upload log file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />

                  <div className="pointer-events-none">
                    <svg
                      className={`mx-auto h-12 w-12 mb-3 transition-colors ${
                        isDragging ? 'text-primary' : 'text-warm-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>

                    <p className={`text-sm font-medium mb-1 ${
                      isDragging ? 'text-primary' : 'text-warm-700'
                    }`}>
                      {isDragging ? 'Drop file here' : 'Drag & drop your log file here'}
                    </p>

                    <p className="text-xs text-warm-500">
                      or click to browse · .log, .txt, .json · Max 50MB
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-3 space-y-3 border border-outline-variant bg-surface-container-lowest p-3" data-testid="rancher-log-config">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-3">
                  <div>
                    <div className="text-xs font-semibold uppercase text-on-surface">Kubectl runtime</div>
                    <div className={`mt-1 text-xs ${rancherAvailability?.available ? 'text-green-600' : 'text-tertiary'}`} role="status" aria-live="polite">
                      {rancherAvailability === null
                        ? 'Checking...'
                        : rancherAvailability.available
                          ? `${rancherAvailability.kubectlPath}${rancherAvailability.version ? ` · ${rancherAvailability.version}` : ''}`
                          : rancherAvailability.reason}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void checkRancherEnvironment()}
                      disabled={rancherAction !== null}
                      className="h-9 border border-outline-variant bg-surface-container px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                    >
                      {rancherAction === 'check-environment' ? 'Checking...' : 'Check environment'}
                    </button>
                    {rancherAvailability?.agentAvailable && !rancherAvailability.available && (
                      <button
                        type="button"
                        onClick={() => void installKubectl()}
                        disabled={rancherAction !== null}
                        className="h-9 bg-primary px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {rancherAction === 'install-kubectl' ? 'Installing...' : 'Install kubectl'}
                      </button>
                    )}
                    <label className={`inline-flex h-9 items-center border border-outline-variant px-3 text-xs font-semibold ${rancherAvailability?.available ? 'cursor-pointer bg-surface-container text-on-surface hover:bg-surface-container-high' : 'cursor-not-allowed opacity-50'}`}>
                      <input
                        type="file"
                        accept=".yaml,.yml"
                        onChange={handleKubeconfigUpload}
                        disabled={!rancherAvailability?.available || rancherAction !== null}
                        aria-label="Select kubeconfig YAML"
                        className="sr-only"
                      />
                      Override config
                    </label>
                  </div>
                </div>

                {kubeconfigName && (
                  <div className="flex min-w-0 items-center gap-2 text-xs text-on-surface-variant">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-green-600" />
                    <span className="truncate font-mono">{kubeconfigName}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label>
                    <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Context</span>
                    <select
                      value={selectedContext}
                      onChange={(event) => handleContextSelection(event.target.value)}
                      disabled={contexts.length === 0 || rancherAction !== null}
                      aria-label="Kubernetes context"
                      className="h-9 w-full px-2 text-sm"
                    >
                      {contexts.length === 0 && <option value="">Load contexts first</option>}
                      {contexts.map((context) => <option key={context} value={context}>{context}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadRancherContexts()}
                    disabled={(!kubeconfig && !configuredKubeconfigPath) || rancherAction !== null || !rancherAvailability?.available}
                    className="h-9 self-end bg-primary px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rancherAction === 'contexts' ? 'Loading...' : 'Load contexts'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label>
                    <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Namespace</span>
                    <select
                      value={namespace}
                      onChange={(event) => handleNamespaceSelection(event.target.value)}
                      disabled={namespaces.length === 0 || rancherAction !== null}
                      aria-label="Kubernetes namespace"
                      className="h-9 w-full px-2 text-sm"
                    >
                      {namespaces.length === 0 && <option value="">Load namespaces first</option>}
                      {namespaces.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadRancherNamespaces()}
                    disabled={!selectedContext || rancherAction !== null || !rancherAvailability?.available}
                    className="h-9 self-end border border-primary bg-surface-container-lowest px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rancherAction === 'namespaces' ? 'Loading...' : 'Load namespaces'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <label>
                    <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Pod</span>
                    <select value={selectedPodKey} onChange={(event) => handlePodSelection(event.target.value)} disabled={pods.length === 0 || rancherAction !== null} aria-label="Kubernetes pod" title={selectedPodKey} className="h-9 w-full px-2 pr-8 font-mono text-xs">
                      {pods.length === 0 && <option value="">Load pods first</option>}
                      {pods.map((pod) => (
                        <option key={`${pod.namespace}/${pod.name}`} value={`${pod.namespace}/${pod.name}`}>
                          {pod.name} · {pod.phase} · restarts {pod.restarts}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadRancherPods()}
                    disabled={!namespace || rancherAction !== null || !rancherAvailability?.available}
                    className="h-9 self-end border border-primary bg-surface-container-lowest px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rancherAction === 'pods' ? 'Loading...' : 'Load pods'}
                  </button>
                </div>

                {selectedPod && (
                  <div className="space-y-2 border-t border-outline-variant pt-3">
                    <div className="text-xs text-on-surface-variant">
                      <span className="font-medium text-on-surface">Selected:</span> <span className="font-mono">{selectedPod.namespace}/{selectedPod.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label className="col-span-2 sm:col-span-1">
                        <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Container</span>
                        <select value={selectedContainer} onChange={(event) => setSelectedContainer(event.target.value)} disabled={rancherAction !== null} aria-label="Kubernetes container" title={selectedContainer} className="h-9 w-full px-2 pr-8 text-xs">
                          {(selectedPod?.containers ?? []).map((container) => <option key={container} value={container}>{container}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Tail</span>
                        <input type="number" min={1} max={5000} value={tailLines} onChange={(event) => setTailLines(Number(event.target.value))} disabled={rancherAction !== null} aria-label="Log tail lines" className="h-9 w-full px-2 text-sm" />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Since</span>
                        <input value={since} onChange={(event) => setSince(event.target.value)} disabled={rancherAction !== null} placeholder="30m" aria-label="Log since duration" className="h-9 w-full px-2 text-sm" />
                      </label>
                      <label className="flex h-9 items-center gap-2 self-end border border-outline-variant px-2 text-xs text-on-surface">
                        <input type="checkbox" checked={previousContainer} onChange={(event) => setPreviousContainer(event.target.checked)} disabled={rancherAction !== null} />
                        Previous
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          stopLiveLogs(false)
                          void fetchRancherLogs()
                        }}
                        disabled={!selectedPod || rancherAction !== null || liveStatus !== 'stopped'}
                        className="h-10 border border-primary bg-surface-container-lowest text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {rancherAction === 'logs' ? 'Fetching...' : 'Fetch once'}
                      </button>

                      {liveStatus === 'stopped' ? (
                        <button type="button" onClick={startLiveLogs} disabled={rancherAction !== null} className="h-10 bg-primary text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                          Start live
                        </button>
                      ) : (
                        <div className="flex h-10">
                          <button
                            type="button"
                            onClick={liveStatus === 'paused' ? resumeLiveLogs : pauseLiveLogs}
                            disabled={liveStatus === 'connecting' || liveStatus === 'reconnecting'}
                            className="flex-1 border border-primary bg-surface-container-lowest text-xs font-semibold text-primary disabled:opacity-50"
                          >
                            {liveStatus === 'paused' ? 'Resume' : liveStatus === 'reconnecting' ? 'Retrying...' : liveStatus === 'connecting' ? 'Connecting...' : 'Pause'}
                          </button>
                          <button type="button" onClick={() => stopLiveLogs()} className="w-14 bg-tertiary text-xs font-semibold text-white">Stop</button>
                        </div>
                      )}
                    </div>
                    {liveStatus !== 'stopped' && (
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant" role="status" aria-live="polite">
                        <span className={`h-2 w-2 rounded-full ${liveStatus === 'live' ? 'bg-green-600' : liveStatus === 'paused' ? 'bg-yellow-500' : 'animate-pulse bg-primary'}`} />
                        Live stream: {liveStatus}
                        <span className="ml-auto">Rolling buffer 5 MB</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Spring Boot logs here or upload a file..."
              className="w-full h-48 md:h-64 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
            />
            
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search keyword..."
                className="flex-1 p-2 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent text-warm-800 placeholder-warm-400"
              />
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="p-2 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent text-warm-800"
              >
                <option value="ALL">All Levels</option>
                <option value="ERROR">ERROR</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
                <option value="DEBUG">DEBUG</option>
                <option value="TRACE">TRACE</option>
              </select>
            </div>
            
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => analyzeLogs()}
                disabled={loading}
                data-analyze
                className="flex-1 bg-primary text-white py-3 sm:py-2.5 rounded hover:bg-primary/90 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  'Analyze Logs'
                )}
              </button>
              
              <button
                onClick={clearAll}
                disabled={loading || (!input && results.length === 0 && !kubeconfig)}
                className="sm:w-auto w-full px-6 bg-surface-container text-on-surface py-3 sm:py-2.5 rounded hover:bg-surface-container-high font-semibold transition-colors shadow-warm disabled:bg-surface-container disabled:text-on-surface-variant disabled:opacity-100 disabled:cursor-not-allowed dark:bg-dark-surface-container dark:text-dark-on-surface dark:hover:bg-dark-surface-container-high dark:disabled:bg-dark-surface-container dark:disabled:text-dark-on-secondary-container flex items-center justify-center gap-2 active:scale-95"
                title="Clear all data"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            </div>
            
            <p className="mt-2 text-xs text-warm-500 text-center hidden sm:block">
              Tip: Press <kbd className="px-2 py-1 bg-warm-100 border border-warm-300 rounded text-warm-700 font-mono">Ctrl+Enter</kbd> to analyze or <kbd className="px-2 py-1 bg-warm-100 border border-warm-300 rounded text-warm-700 font-mono">/</kbd> to search
            </p>
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Results</h3>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {results.length > 0 && (
                <>
                  <label className="flex items-center gap-2 text-xs sm:text-sm text-warm-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={utcPlus7}
                      onChange={(e) => setUtcPlus7(e.target.checked)}
                      className="rounded border-warm-300 text-primary focus:ring-primary w-4 h-4"
                    />
                    <span className="font-medium">UTC+7</span>
                  </label>
                  <button
                    onClick={exportResults}
                    className="text-xs sm:text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 active:scale-95 transition-transform px-2 py-1 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="p-4 overflow-auto h-full">
            {results.length === 0 ? (
              <EmptyState title={stats ? 'No matching logs' : 'No analysis results'} description={stats ? 'Adjust the search term or log level filter, then analyze again.' : 'Paste a log file or fetch pod logs, then select Analyze Logs.'} />
            ) : (
              <div className="space-y-3">
                {results.map((entry, idx) => renderLogEntry(entry, idx))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
