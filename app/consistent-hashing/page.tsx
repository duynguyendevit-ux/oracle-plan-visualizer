'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useToolSession } from '@/hooks/useToolSession'
import {
  analyzeHashRing,
  compareAssignments,
  locateKey,
  type HashRingAnalysis,
  type KeyAssignment,
  type MovementAnalysis,
} from '@/lib/consistent-hashing'
import { toast } from '@/lib/toast'

const serverCatalog = ['server-a', 'server-b', 'server-c', 'server-d', 'server-e', 'server-f', 'server-g', 'server-h']
const serverColors = ['#0f62fe', '#24a148', '#da1e28', '#8a3ffc', '#007d79', '#ff832b', '#1192e8', '#6929c4']

interface SimulatorConfig {
  servers: string[]
  virtualNodes: number
  keyCount: number
  changeLabel: string
}

interface SimulatorSession {
  servers: string[]
  virtualNodes: number
  keyCount: number
  lookupKey: string
  selectedServer: string
}

const defaultConfig: SimulatorConfig = {
  servers: serverCatalog.slice(0, 3),
  virtualNodes: 24,
  keyCount: 120,
  changeLabel: 'Initial topology',
}

function pointOnRing(hash: number, radius: number) {
  const angle = (hash / 0xffffffff) * Math.PI * 2 - Math.PI / 2
  return { x: 200 + Math.cos(angle) * radius, y: 200 + Math.sin(angle) * radius }
}

function formatHash(hash: number) {
  return `0x${hash.toString(16).padStart(8, '0')}`
}

export default function ConsistentHashingExplorer() {
  const [config, setConfig] = useState<SimulatorConfig>(defaultConfig)
  const [analysis, setAnalysis] = useState<HashRingAnalysis | null>(null)
  const [movement, setMovement] = useState<MovementAnalysis | null>(null)
  const [selectedServer, setSelectedServer] = useState(defaultConfig.servers[0])
  const [lookupKey, setLookupKey] = useState('user:1042')
  const [locatedKey, setLocatedKey] = useState<KeyAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const previousAssignmentsRef = useRef<KeyAssignment[] | null>(null)
  const generationRef = useRef(0)

  useToolSession<SimulatorSession>('consistent-hashing', {
    servers: config.servers,
    virtualNodes: config.virtualNodes,
    keyCount: config.keyCount,
    lookupKey,
    selectedServer,
  }, (saved) => {
    const servers = Array.isArray(saved.servers)
      ? saved.servers.filter((server): server is string => serverCatalog.includes(server))
      : []
    const restoredServers = [...new Set(servers)].slice(0, serverCatalog.length)
    setConfig({
      servers: restoredServers.length > 0 ? restoredServers : defaultConfig.servers,
      virtualNodes: typeof saved.virtualNodes === 'number' ? Math.min(64, Math.max(1, saved.virtualNodes)) : defaultConfig.virtualNodes,
      keyCount: typeof saved.keyCount === 'number' ? Math.min(240, Math.max(20, saved.keyCount)) : defaultConfig.keyCount,
      changeLabel: 'Restored topology',
    })
    if (typeof saved.lookupKey === 'string') setLookupKey(saved.lookupKey)
    if (typeof saved.selectedServer === 'string' && serverCatalog.includes(saved.selectedServer)) setSelectedServer(saved.selectedServer)
  })

  const keys = useMemo(() => Array.from({ length: config.keyCount }, (_, index) => `user:${String(index + 1).padStart(4, '0')}`), [config.keyCount])

  useEffect(() => {
    const generation = ++generationRef.current
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void analyzeHashRing(config.servers, config.virtualNodes, keys)
        .then((nextAnalysis) => {
          if (generation !== generationRef.current) return
          setMovement(compareAssignments(previousAssignmentsRef.current, nextAnalysis.assignments))
          previousAssignmentsRef.current = nextAnalysis.assignments
          setAnalysis(nextAnalysis)
          setLocatedKey(null)
        })
        .catch((cause) => {
          if (generation !== generationRef.current) return
          setError(cause instanceof Error ? cause.message : 'Unable to build the hash ring.')
        })
        .finally(() => {
          if (generation === generationRef.current) setLoading(false)
        })
    }, 80)

    return () => window.clearTimeout(timer)
  }, [config, keys])

  useEffect(() => {
    if (!config.servers.includes(selectedServer)) setSelectedServer(config.servers[0])
  }, [config.servers, selectedServer])

  const colorByServer = useMemo(() => Object.fromEntries(config.servers.map((server) => [server, serverColors[serverCatalog.indexOf(server) % serverColors.length]])), [config.servers])
  const averageLoad = config.keyCount / config.servers.length
  const maxLoad = analysis ? Math.max(...Object.values(analysis.distribution)) : 0
  const peakSkew = averageLoad === 0 ? 0 : Math.max(0, ((maxLoad - averageLoad) / averageLoad) * 100)
  const locatedPoint = locatedKey ? pointOnRing(locatedKey.hash, 166) : null

  const updateConfig = (next: Partial<SimulatorConfig>, changeLabel: string) => {
    setMovement(null)
    setLocatedKey(null)
    setConfig((current) => ({ ...current, ...next, changeLabel }))
  }

  const addServer = () => {
    const server = serverCatalog.find((candidate) => !config.servers.includes(candidate))
    if (!server) return
    updateConfig({ servers: [...config.servers, server] }, `Added ${server}`)
    setSelectedServer(server)
  }

  const removeServer = () => {
    if (config.servers.length <= 1) return
    updateConfig({ servers: config.servers.filter((server) => server !== selectedServer) }, `Removed ${selectedServer}`)
  }

  const reset = () => {
    previousAssignmentsRef.current = null
    setConfig(defaultConfig)
    setSelectedServer(defaultConfig.servers[0])
    setLookupKey('user:1042')
    setLocatedKey(null)
    toast.info('Sample topology restored')
  }

  const locate = async () => {
    if (!analysis || !lookupKey.trim()) return
    try {
      const result = await locateKey(analysis.ring, lookupKey.trim())
      setLocatedKey(result)
    } catch (cause) {
      toast.error('Unable to locate key', cause instanceof Error ? cause.message : 'Hash lookup failed.')
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] p-4 md:p-6">
      <header className="mb-5 flex flex-col gap-4 border-b border-outline-variant/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Distributed systems lab</p>
          <h1 className="text-2xl font-semibold text-on-surface md:text-3xl">Consistent Hashing Explorer</h1>
          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">Explore how a hash ring distributes requests or data across servers while limiting redistribution when the topology changes.</p>
        </div>
        <button type="button" onClick={reset} className="inline-flex min-h-10 items-center justify-center gap-2 border border-outline-variant/60 bg-surface-container px-3 text-sm font-medium text-on-surface hover:bg-surface-container-high">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 4v5h5M20 20v-5h-5M5.2 15a7 7 0 0011.9 2M18.8 9a7 7 0 00-11.9-2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Reset sample
        </button>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="border border-outline-variant/60 bg-surface-container-low p-3"><p className="text-xs font-semibold uppercase text-on-surface-variant">Servers</p><p className="mt-1 text-2xl font-semibold text-on-surface">{config.servers.length}</p></div>
        <div className="border border-outline-variant/60 bg-surface-container-low p-3"><p className="text-xs font-semibold uppercase text-on-surface-variant">Virtual nodes</p><p className="mt-1 text-2xl font-semibold text-on-surface">{config.servers.length * config.virtualNodes}</p></div>
        <div className="border border-outline-variant/60 bg-surface-container-low p-3"><p className="text-xs font-semibold uppercase text-on-surface-variant">Moved keys</p><p className="mt-1 text-2xl font-semibold text-primary">{movement ? `${movement.percentage.toFixed(1)}%` : '--'}</p></div>
        <div className="border border-outline-variant/60 bg-surface-container-low p-3"><p className="text-xs font-semibold uppercase text-on-surface-variant">Peak skew</p><p className="mt-1 text-2xl font-semibold text-on-surface">{analysis ? `${peakSkew.toFixed(1)}%` : '--'}</p></div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,0.7fr)_minmax(420px,1.15fr)_minmax(320px,0.85fr)]">
        <section className="border border-outline-variant/60 bg-surface-container-low" aria-labelledby="topology-heading">
          <div className="border-b border-outline-variant/60 bg-surface-container px-4 py-3"><h2 id="topology-heading" className="text-sm font-semibold text-on-surface">Topology</h2></div>
          <div className="space-y-5 p-4">
            <div className="flex gap-2">
              <button type="button" onClick={addServer} disabled={config.servers.length === serverCatalog.length || loading} className="min-h-10 flex-1 bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">+ Add server</button>
              <button type="button" onClick={removeServer} disabled={config.servers.length <= 1 || loading} className="min-h-10 flex-1 border border-outline-variant/60 px-3 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50">- Remove</button>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">Physical servers</legend>
              <div className="divide-y divide-outline-variant/60 border-y border-outline-variant/60">
                {config.servers.map((server) => (
                  <label key={server} className="flex min-h-11 cursor-pointer items-center gap-3 bg-surface-container-lowest px-3 hover:bg-surface-container">
                    <input type="radio" name="selected-server" checked={selectedServer === server} onChange={() => setSelectedServer(server)} />
                    <span className="h-3 w-3 flex-none" style={{ backgroundColor: colorByServer[server] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-mono text-sm text-on-surface">{server}</span>
                    <span className="text-xs text-on-surface-variant">{analysis?.distribution[server] ?? 0} keys</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="flex items-center justify-between text-xs font-semibold uppercase text-on-surface-variant"><span>Virtual nodes / server</span><strong className="text-on-surface">{config.virtualNodes}</strong></span>
              <input type="range" min="1" max="64" value={config.virtualNodes} onChange={(event) => updateConfig({ virtualNodes: Number(event.target.value) }, 'Changed virtual node count')} className="mt-3 w-full" aria-label="Virtual nodes per server" />
            </label>
            <label className="block">
              <span className="flex items-center justify-between text-xs font-semibold uppercase text-on-surface-variant"><span>Sample keys</span><strong className="text-on-surface">{config.keyCount}</strong></span>
              <input type="range" min="20" max="240" step="20" value={config.keyCount} onChange={(event) => updateConfig({ keyCount: Number(event.target.value) }, 'Changed sample key count')} className="mt-3 w-full" aria-label="Sample key count" />
            </label>

            <div>
              <label htmlFor="key-lookup" className="mb-2 block text-xs font-semibold uppercase text-on-surface-variant">Locate a key</label>
              <div className="flex gap-2">
                <input id="key-lookup" value={lookupKey} onChange={(event) => setLookupKey(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void locate() }} className="h-10 min-w-0 flex-1 px-3 font-mono text-sm" placeholder="user:1042" />
                <button type="button" onClick={() => void locate()} disabled={loading || !analysis || !lookupKey.trim()} className="h-10 bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Locate</button>
              </div>
              {locatedKey && <div className="mt-3 border-l-4 border-primary bg-surface-container p-3 text-xs text-on-surface-variant" aria-live="polite"><code className="text-on-surface">{locatedKey.key}</code> maps to <strong style={{ color: colorByServer[locatedKey.serverId] }}>{locatedKey.serverId}</strong><span className="mt-1 block font-mono">{formatHash(locatedKey.hash)}</span></div>}
            </div>
          </div>
        </section>

        <section className="border border-outline-variant/60 bg-surface-container-low" aria-labelledby="ring-heading">
          <div className="flex items-center justify-between border-b border-outline-variant/60 bg-surface-container px-4 py-3"><h2 id="ring-heading" className="text-sm font-semibold text-on-surface">Hash ring</h2><span className="text-xs text-on-surface-variant">Clockwise ownership</span></div>
          <div className="p-4">
            <div className="mx-auto aspect-square w-full max-w-[620px]" data-testid="consistent-hash-ring">
              <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Consistent hashing ring">
                <circle cx="200" cy="200" r="142" fill="none" stroke="var(--cds-border-subtle)" strokeWidth="2" />
                <circle cx="200" cy="200" r="166" fill="none" stroke="var(--cds-border-subtle)" strokeWidth="1" strokeDasharray="3 5" />
                {analysis?.assignments.map((assignment) => {
                  const point = pointOnRing(assignment.hash, 166)
                  return <circle key={assignment.key} cx={point.x} cy={point.y} r="1.7" fill={colorByServer[assignment.serverId]} opacity="0.45" />
                })}
                {locatedKey && locatedPoint && <circle cx={locatedPoint.x} cy={locatedPoint.y} r="5" fill={colorByServer[locatedKey.serverId]} stroke="var(--cds-text-primary)" strokeWidth="2" data-testid="located-key-marker" />}
                {analysis?.ring.map((point) => {
                  const position = pointOnRing(point.hash, 142)
                  return <circle key={`${point.serverId}-${point.vnodeIndex}`} cx={position.x} cy={position.y} r="3" fill={colorByServer[point.serverId]} stroke="var(--cds-layer-01)" strokeWidth="0.7" />
                })}
                <text x="200" y="188" textAnchor="middle" fill="var(--cds-text-primary)" className="text-[20px] font-semibold">{loading ? 'Building...' : `${config.servers.length} servers`}</text>
                <text x="200" y="214" textAnchor="middle" fill="var(--cds-text-secondary)" className="text-[12px]">{config.servers.length * config.virtualNodes} virtual nodes</text>
                <text x="200" y="234" textAnchor="middle" fill="var(--cds-text-secondary)" className="text-[12px]">{config.keyCount} keys</text>
              </svg>
            </div>
            {error && <div role="alert" className="mt-3 border-l-4 border-tertiary bg-surface-container p-3 text-sm text-tertiary">{error}</div>}
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {config.servers.map((server) => <span key={server} className="inline-flex items-center gap-2 text-xs text-on-surface-variant"><span className="h-2.5 w-2.5" style={{ backgroundColor: colorByServer[server] }} />{server}</span>)}
            </div>
          </div>
        </section>

        <section className="border border-outline-variant/60 bg-surface-container-low" aria-labelledby="distribution-heading">
          <div className="border-b border-outline-variant/60 bg-surface-container px-4 py-3"><h2 id="distribution-heading" className="text-sm font-semibold text-on-surface">Distribution & movement</h2></div>
          <div className="space-y-6 p-4">
            <div className="space-y-3" aria-label="Key distribution">
              {config.servers.map((server) => {
                const count = analysis?.distribution[server] ?? 0
                const percentage = config.keyCount === 0 ? 0 : (count / config.keyCount) * 100
                return <div key={server}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="font-mono text-on-surface">{server}</span><span className="text-on-surface-variant">{count} ({percentage.toFixed(1)}%)</span></div><div className="h-3 bg-surface-container"><div className="h-full transition-[width] duration-200" style={{ width: `${percentage}%`, backgroundColor: colorByServer[server] }} /></div></div>
              })}
            </div>

            <div className="border-t border-outline-variant/60 pt-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-on-surface-variant">Latest change</p><p className="mt-1 text-sm font-medium text-on-surface">{config.changeLabel}</p></div>{movement && <strong className="text-lg text-primary">{movement.moved}/{movement.compared}</strong>}</div>
              <p className="mt-3 text-sm text-on-surface-variant">{movement ? `${movement.moved} existing keys moved to a different server (${movement.percentage.toFixed(1)}%).` : 'Change the topology to compare key ownership.'}</p>
              {movement && movement.changes.length > 0 && <div className="mt-3 max-h-56 divide-y divide-outline-variant/60 overflow-y-auto border-y border-outline-variant/60">{movement.changes.slice(0, 20).map((change) => <div key={change.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-surface-container-lowest px-3 py-2 text-xs"><code className="truncate text-on-surface">{change.key}</code><span className="text-on-surface-variant">{change.from} -&gt; {change.to}</span></div>)}</div>}
            </div>

            <div className="border-l-4 border-[var(--cds-warning)] bg-surface-container p-3 text-xs text-on-surface-variant">
              Each key is owned by the first virtual node clockwise from its hash. More virtual nodes usually smooth uneven load across physical servers.
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
