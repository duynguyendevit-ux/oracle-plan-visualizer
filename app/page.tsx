'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  comparePlans,
  flattenPlan,
  normalizePlan,
  type PlanComparison,
  type PlanNode,
} from '@/lib/execution-plan'

const PlanVisualizer = dynamic(() => import('@/components/PlanVisualizer'), {
  ssr: false,
})

type Mode = 'single' | 'compare'

interface PlanStats {
  totalCost: number
  totalCpu: number
  deadBranches: number
  fullScans: number
  indexScans: number
}

interface ParsedJsonResult {
  plan: PlanNode | null
  error: string | null
}

interface ComparisonRow {
  id: string
  kind: 'Added' | 'Removed' | 'Changed'
  label: string
  costDelta: number | undefined
  estimatedRowsDelta: number | undefined
  actualRowsDelta: number | undefined
}

function calculateStats(plan: PlanNode): PlanStats {
  const entries = flattenPlan(plan)
  const stats: PlanStats = {
    totalCost: 0,
    totalCpu: 0,
    deadBranches: 0,
    fullScans: 0,
    indexScans: 0,
  }

  for (const entry of entries) {
    const node = entry.node
    stats.totalCost += node.cost ?? 0
    stats.totalCpu += node.cpuCost ?? 0

    if (node.filterPredicates?.toUpperCase().includes('NULL IS NOT NULL')) {
      stats.deadBranches += 1
    }

    if (node.operation.toUpperCase() === 'TABLE ACCESS' && node.options?.toUpperCase() === 'FULL') {
      stats.fullScans += 1
    }

    if (node.operation.toUpperCase() === 'INDEX') {
      stats.indexScans += 1
    }
  }

  return stats
}

function parsePlanJson(value: string, label: string): ParsedJsonResult {
  if (value.trim().length === 0) {
    return { plan: null, error: `${label} JSON is empty. Paste a plan before visualizing.` }
  }

  try {
    return { plan: normalizePlan(JSON.parse(value) as unknown), error: null }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'Unknown validation error.'
    return { plan: null, error: `${label} JSON is invalid: ${detail}` }
  }
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? 'n/a' : value.toLocaleString()
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return 'n/a'
  if (value === 0) return '0'
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`
}

function costDelta(value: number | undefined, direction: 1 | -1 = 1): number | undefined {
  return value === undefined ? undefined : value * direction
}

function comparisonRows(comparison: PlanComparison): ComparisonRow[] {
  return [
    ...comparison.added.map((entry) => ({
      id: `added-${entry.id}`,
      kind: 'Added' as const,
      label: entry.label,
      costDelta: entry.node.cost,
      estimatedRowsDelta: entry.estimatedRows,
      actualRowsDelta: entry.actualRows,
    })),
    ...comparison.removed.map((entry) => ({
      id: `removed-${entry.id}`,
      kind: 'Removed' as const,
      label: entry.label,
      costDelta: costDelta(entry.node.cost, -1),
      estimatedRowsDelta: costDelta(entry.estimatedRows, -1),
      actualRowsDelta: costDelta(entry.actualRows, -1),
    })),
    ...comparison.changed.map((change) => ({
      id: `changed-${change.current.id}`,
      kind: 'Changed' as const,
      label: change.current.label,
      costDelta: change.costDelta,
      estimatedRowsDelta: change.estimatedRowsDelta,
      actualRowsDelta: change.actualRowsDelta,
    })),
  ]
}

function singleSample(): PlanNode {
  return {
    operation: 'SELECT STATEMENT',
    cost: 14,
    cpuCost: 58000,
    estimatedRows: 120,
    actualRows: 118,
    children: [
      {
        operation: 'TABLE ACCESS',
        options: 'FULL',
        objectName: 'customers',
        cost: 10,
        estimatedRows: 10,
        actualRows: 118,
      },
      {
        operation: 'INDEX',
        options: 'RANGE SCAN',
        objectName: 'idx_customer_status',
        cost: 3,
        estimatedRows: 120,
        actualRows: 118,
      },
      {
        operation: 'FILTER',
        filterPredicates: 'NULL IS NOT NULL',
        cost: 0,
        estimatedRows: 0,
        actualRows: 0,
        children: [
          {
            operation: 'TABLE ACCESS',
            options: 'FULL',
            objectName: 'archived_customers',
            cost: 0,
            estimatedRows: 0,
            actualRows: 0,
          },
        ],
      },
    ],
  }
}

function comparisonSamples(): { baseline: PlanNode; current: PlanNode } {
  const baseline: PlanNode = {
    operation: 'SELECT STATEMENT',
    cost: 12,
    cpuCost: 42000,
    estimatedRows: 100,
    actualRows: 96,
    children: [
      {
        operation: 'TABLE ACCESS',
        options: 'FULL',
        objectName: 'customers',
        cost: 8,
        estimatedRows: 100,
        actualRows: 96,
      },
      {
        operation: 'SORT',
        options: 'ORDER BY',
        objectName: 'customer_name',
        cost: 2,
        estimatedRows: 100,
        actualRows: 96,
      },
      {
        operation: 'INDEX',
        options: 'RANGE SCAN',
        objectName: 'idx_customer_status',
        cost: 2,
        estimatedRows: 100,
        actualRows: 96,
      },
    ],
  }

  const current: PlanNode = {
    operation: 'SELECT STATEMENT',
    cost: 15,
    cpuCost: 61000,
    estimatedRows: 120,
    actualRows: 118,
    children: [
      {
        operation: 'TABLE ACCESS',
        options: 'FULL',
        objectName: 'customers',
        cost: 10,
        estimatedRows: 10,
        actualRows: 118,
      },
      {
        operation: 'INDEX',
        options: 'RANGE SCAN',
        objectName: 'idx_customer_status',
        cost: 3,
        estimatedRows: 120,
        actualRows: 118,
      },
      {
        operation: 'TABLE ACCESS',
        options: 'FULL',
        objectName: 'customer_addresses',
        cost: 4,
        estimatedRows: 5,
        actualRows: 118,
      },
    ],
  }

  return { baseline, current }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('single')
  const [planJson, setPlanJson] = useState<string>('')
  const [baselinePlanJson, setBaselinePlanJson] = useState<string>('')
  const [currentPlanJson, setCurrentPlanJson] = useState<string>('')
  const [parsedPlan, setParsedPlan] = useState<PlanNode | null>(null)
  const [comparison, setComparison] = useState<PlanComparison | null>(null)
  const [error, setError] = useState<string>('')
  const [stats, setStats] = useState<PlanStats | null>(null)

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode)
    setError('')
    setParsedPlan(null)
    setComparison(null)
    setStats(null)

    if (nextMode === 'compare' && baselinePlanJson.trim().length === 0 && planJson.trim().length > 0) {
      setBaselinePlanJson(planJson)
      setCurrentPlanJson(planJson)
    }
  }

  const handleParse = () => {
    setError('')

    if (mode === 'single') {
      const result = parsePlanJson(planJson, 'Current plan')
      if (result.error || !result.plan) {
        setParsedPlan(null)
        setComparison(null)
        setStats(null)
        setError(result.error ?? 'Current plan could not be validated.')
        return
      }

      setParsedPlan(result.plan)
      setStats(calculateStats(result.plan))
      setComparison(null)
      return
    }

    const baselineResult = parsePlanJson(baselinePlanJson, 'Baseline plan')
    if (baselineResult.error || !baselineResult.plan) {
      setParsedPlan(null)
      setComparison(null)
      setStats(null)
      setError(baselineResult.error ?? 'Baseline plan could not be validated.')
      return
    }

    const currentResult = parsePlanJson(currentPlanJson, 'Current plan')
    if (currentResult.error || !currentResult.plan) {
      setParsedPlan(null)
      setComparison(null)
      setStats(null)
      setError(currentResult.error ?? 'Current plan could not be validated.')
      return
    }

    setParsedPlan(currentResult.plan)
    setStats(calculateStats(currentResult.plan))
    setComparison(comparePlans(baselineResult.plan, currentResult.plan))
  }

  const loadSample = () => {
    const current = singleSample()
    const currentJson = JSON.stringify(current, null, 2)
    setPlanJson(currentJson)

    if (mode === 'single') {
      setParsedPlan(current)
      setStats(calculateStats(current))
      setComparison(null)
      setError('')
      return
    }

    const samples = comparisonSamples()
    const baselineJson = JSON.stringify(samples.baseline, null, 2)
    const compareCurrentJson = JSON.stringify(samples.current, null, 2)
    setBaselinePlanJson(baselineJson)
    setCurrentPlanJson(compareCurrentJson)
    setParsedPlan(samples.current)
    setStats(calculateStats(samples.current))
    setComparison(comparePlans(samples.baseline, samples.current))
    setError('')
  }

  const visualizerComparison = comparison
    ? {
        addedIds: comparison.added.map((entry) => entry.id),
        changedIds: comparison.changed.map((change) => change.current.id),
      }
    : { addedIds: [], changedIds: [] }
  const rows = comparison ? comparisonRows(comparison) : []

  return (
    <div className="mx-auto max-w-full p-4">
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-lg bg-surface-container-low p-4 shadow-editorial">
            <div className="mb-1 text-xs font-label font-medium uppercase tracking-wide text-on-surface-variant">Total Cost</div>
            <div className="text-2xl font-serif font-semibold text-on-surface">{formatNumber(stats.totalCost)}</div>
          </div>
          <div className="rounded-lg bg-surface-container-low p-4 shadow-editorial">
            <div className="mb-1 text-xs font-label font-medium uppercase tracking-wide text-on-surface-variant">CPU Cost</div>
            <div className="text-2xl font-serif font-semibold text-on-surface">{formatNumber(stats.totalCpu)}</div>
          </div>
          <div className="rounded-lg bg-surface-container-low p-4 shadow-editorial">
            <div className="mb-1 text-xs font-label font-medium uppercase tracking-wide text-on-surface-variant">Dead Branches</div>
            <div className="text-2xl font-serif font-semibold text-tertiary">{formatNumber(stats.deadBranches)}</div>
          </div>
          <div className="rounded-lg bg-surface-container-low p-4 shadow-editorial">
            <div className="mb-1 text-xs font-label font-medium uppercase tracking-wide text-on-surface-variant">Full Scans</div>
            <div className="text-2xl font-serif font-semibold text-tertiary">{formatNumber(stats.fullScans)}</div>
          </div>
          <div className="rounded-lg bg-surface-container-low p-4 shadow-editorial">
            <div className="mb-1 text-xs font-label font-medium uppercase tracking-wide text-on-surface-variant">Index Scans</div>
            <div className="text-2xl font-serif font-semibold text-primary">{formatNumber(stats.indexScans)}</div>
          </div>
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-lg bg-surface-container-low shadow-editorial">
        <div className="flex flex-col gap-3 bg-surface-container px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Execution Plan JSON</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex border border-outline-variant/60 bg-surface-container-lowest" role="group" aria-label="Plan input mode">
              <button
                type="button"
                aria-pressed={mode === 'single'}
                onClick={() => handleModeChange('single')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${mode === 'single' ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}
              >
                Single
              </button>
              <button
                type="button"
                aria-pressed={mode === 'compare'}
                onClick={() => handleModeChange('compare')}
                className={`border-l border-outline-variant/60 px-3 py-2 text-sm font-medium transition-colors ${mode === 'compare' ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}
              >
                Compare
              </button>
            </div>
            <button
              type="button"
              onClick={loadSample}
              className="text-sm font-medium text-primary underline decoration-primary/30 transition-colors hover:text-primary/80 hover:decoration-primary"
            >
              Load Sample
            </button>
          </div>
        </div>

        <div className="p-4">
          {mode === 'single' ? (
            <label className="block">
              <span className="mb-2 block text-xs font-label font-semibold uppercase tracking-wide text-on-surface-variant">Current Plan JSON</span>
              <textarea
                value={planJson}
                onChange={(event) => setPlanJson(event.target.value)}
                placeholder="Paste your Oracle execution plan JSON here..."
                className="h-48 w-full resize-y rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3 font-mono text-sm text-on-surface placeholder-on-surface-variant/50 focus:border-transparent focus:ring-2 focus:ring-primary"
              />
            </label>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-label font-semibold uppercase tracking-wide text-on-surface-variant">Baseline Plan JSON</span>
                <textarea
                  value={baselinePlanJson}
                  onChange={(event) => setBaselinePlanJson(event.target.value)}
                  placeholder="Paste the baseline execution plan JSON here..."
                  className="h-48 w-full resize-y rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3 font-mono text-sm text-on-surface placeholder-on-surface-variant/50 focus:border-transparent focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-label font-semibold uppercase tracking-wide text-on-surface-variant">Current Plan JSON</span>
                <textarea
                  value={currentPlanJson}
                  onChange={(event) => setCurrentPlanJson(event.target.value)}
                  placeholder="Paste the current execution plan JSON here..."
                  className="h-48 w-full resize-y rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3 font-mono text-sm text-on-surface placeholder-on-surface-variant/50 focus:border-transparent focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>
          )}

          {error && (
            <div className="mt-3 border border-tertiary/30 bg-tertiary-container/30 p-3 text-sm text-tertiary" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleParse}
            className="mt-3 w-full rounded-lg bg-primary py-2.5 font-semibold text-white shadow-warm transition-colors hover:bg-primary/90"
          >
            Visualize Plan
          </button>
        </div>
      </div>

      {comparison && (
        <section className="mb-4 overflow-hidden rounded-lg bg-surface-container-low shadow-editorial" aria-labelledby="comparison-heading">
          <div className="flex flex-col gap-2 border-b border-outline-variant/60 bg-surface-container px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 id="comparison-heading" className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Comparison Results</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-label text-on-surface-variant">
              <span>Added {comparison.added.length}</span>
              <span>Removed {comparison.removed.length}</span>
              <span>Changed {comparison.changed.length}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {rows.length > 0 ? (
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-outline-variant/60 text-xs font-label uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Change</th>
                    <th className="px-4 py-2 font-semibold">Plan node</th>
                    <th className="px-4 py-2 text-right font-semibold">Cost delta</th>
                    <th className="px-4 py-2 text-right font-semibold">Est. rows</th>
                    <th className="px-4 py-2 text-right font-semibold">Actual rows</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-outline-variant/40 last:border-b-0">
                      <td className={`whitespace-nowrap px-4 py-2 font-label text-xs font-semibold uppercase ${row.kind === 'Added' ? 'text-primary' : row.kind === 'Removed' ? 'text-tertiary' : 'text-[#a2191f]'}`}>
                        {row.kind}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-on-surface">{row.label}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-on-surface">{formatDelta(row.costDelta)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-on-surface-variant">{formatDelta(row.estimatedRowsDelta)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-on-surface-variant">{formatDelta(row.actualRowsDelta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-on-surface-variant">No structural or metric differences detected.</p>
            )}
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-lg bg-surface-container-low shadow-editorial">
        <div className="flex flex-col gap-3 bg-surface-container px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Execution Tree</h3>

          {parsedPlan && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 lg:justify-end" aria-label="Execution plan legend">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-on-surface bg-green-600" /><span className="text-xs font-label text-on-surface-variant">Active Branch</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-on-surface bg-yellow-400" /><span className="text-xs font-label text-on-surface-variant">Dead Code (NULL IS NOT NULL)</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-on-surface bg-tertiary" /><span className="text-xs font-label text-on-surface-variant">Full Table Scan</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-on-surface bg-cyan-600" /><span className="text-xs font-label text-on-surface-variant">Index Scan</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-on-surface bg-[#ff832b]" /><span className="text-xs font-label text-on-surface-variant">Cost heatmap</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-on-surface bg-green-600" /><span className="text-xs font-label text-on-surface-variant">Added</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-on-surface bg-[#8a3ffc]" /><span className="text-xs font-label text-on-surface-variant">Changed</span></div>
              <div className="flex items-center gap-2"><span className="h-1 w-5 bg-orange-500" /><span className="text-xs font-label text-on-surface-variant">Highest Cost Path</span></div>
            </div>
          )}
        </div>

        <div className="p-2">
          {parsedPlan ? (
            <PlanVisualizer plan={parsedPlan} comparison={visualizerComparison} />
          ) : (
            <div className="flex h-96 items-center justify-center px-4 text-center text-sm font-serif text-on-surface-variant">
              No execution plan loaded
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
