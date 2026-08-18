'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  comparePlans,
  analyzePlanIssues,
  flattenPlan,
  type PlanIssue,
  type PlanComparison,
  type PlanNode,
} from '@/lib/execution-plan'
import { deleteSavedPlan, listSavedPlans, savePlan, type SavedPlan } from '@/lib/plan-history'
import EmptyState from '@/components/EmptyState'
import { useToolSession } from '@/hooks/useToolSession'
import { useToolTransfer } from '@/hooks/useToolTransfer'
import { useWorkerRpc } from '@/hooks/useWorkerRpc'
import type { PlanWorkerRequest, PlanWorkerResult } from '@/workers/execution-plan.worker'
import { toast } from '@/lib/toast'

const PlanVisualizer = dynamic(() => import('@/components/PlanVisualizer'), {
  ssr: false,
})

type Mode = 'single' | 'compare'
type InputFormat = 'json' | 'xplan'

interface PlanStats {
  totalCost: number
  totalCpu: number
  deadBranches: number
  fullScans: number
  indexScans: number
}

interface ComparisonRow {
  id: string
  kind: 'Added' | 'Removed' | 'Changed' | 'Moved'
  label: string
  costDelta: number | undefined
  costPercentDelta: number | undefined
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

function formatNumber(value: number | undefined): string {
  return value === undefined ? 'n/a' : value.toLocaleString()
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return 'n/a'
  if (value === 0) return '0'
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return 'n/a'
  if (!Number.isFinite(value)) return 'Infinity'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
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
      costPercentDelta: undefined,
      estimatedRowsDelta: entry.estimatedRows,
      actualRowsDelta: entry.actualRows,
    })),
    ...comparison.removed.map((entry) => ({
      id: `removed-${entry.id}`,
      kind: 'Removed' as const,
      label: entry.label,
      costDelta: costDelta(entry.node.cost, -1),
      costPercentDelta: undefined,
      estimatedRowsDelta: costDelta(entry.estimatedRows, -1),
      actualRowsDelta: costDelta(entry.actualRows, -1),
    })),
    ...comparison.changed.map((change) => ({
      id: `changed-${change.current.id}`,
      kind: change.moved ? 'Moved' as const : 'Changed' as const,
      label: change.current.label,
      costDelta: change.costDelta,
      costPercentDelta: change.costPercentDelta,
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

const singleDbmsSample = `SQL_ID  demo, child number 0
-------------------------------------
| Id | Operation          | Name      | Starts | E-Rows | A-Rows | A-Time      | Buffers | Cost (%CPU)|
-------------------------------------
|  0 | SELECT STATEMENT   |           |      1 |        |      1 | 00:00:00.02 |     180 |          14 |
|  1 |  TABLE ACCESS FULL | CUSTOMERS |      1 |     10 |    118 | 00:00:00.02 |     160 |          10 |
|  2 |  INDEX RANGE SCAN  | IDX_STATUS|      1 |    120 |    118 | 00:00:00.01 |      20 |           3 |
-------------------------------------
Predicate Information:
1 - filter("STATUS"='ACTIVE')`

function comparisonDbmsSamples() {
  const baseline = `| Id | Operation          | Name       | Starts | E-Rows | A-Rows | A-Time      | Buffers | Cost (%CPU)|
|  0 | SELECT STATEMENT   |            |      1 |    100 |     96 | 00:00:00.01 |     100 |          12 |
|  1 |  TABLE ACCESS FULL | CUSTOMERS  |      1 |    100 |     96 | 00:00:00.01 |      80 |           8 |
|  2 |  SORT ORDER BY     | CUSTOMER_N |      1 |    100 |     96 | 00:00:00.01 |      20 |           2 |`
  const current = `| Id | Operation          | Name       | Starts | E-Rows | A-Rows | A-Time      | Buffers | Cost (%CPU)|
|  0 | SELECT STATEMENT   |            |      1 |    120 |    118 | 00:00:00.03 |     220 |          15 |
|  1 |  TABLE ACCESS FULL | CUSTOMERS  |      1 |     10 |    118 | 00:00:00.02 |     160 |          10 |
|  2 |  TABLE ACCESS FULL | ADDRESSES  |      1 |      5 |    118 | 00:00:00.01 |      60 |           4 |`
  return { baseline, current }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character)
}

function reportHtml(plan: PlanNode, stats: PlanStats, issues: PlanIssue[], comparison: PlanComparison | null, diagram: string) {
  const issueRows = issues.map((issue) => `<tr><td>${escapeHtml(issue.severity)}</td><td>${escapeHtml(issue.title)}</td><td>${escapeHtml(issue.entry.label)}</td><td>${escapeHtml(issue.recommendation)}</td></tr>`).join('')
  const comparisonSummary = comparison
    ? `<p>Added ${comparison.added.length}, Removed ${comparison.removed.length}, Changed ${comparison.changed.filter((change) => !change.moved).length}, Moved ${comparison.changed.filter((change) => change.moved).length}</p>`
    : '<p>Single plan analysis</p>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Execution Plan Report</title><style>:root{--cds-background:#f4f4f4;--cds-layer-01:#fff;--cds-layer-accent-01:#e0e0e0;--cds-text-primary:#161616;--cds-text-secondary:#525252;--cds-border-subtle:#c6c6c6;--cds-interactive:#0f62fe;--cds-success:#24a148;--cds-danger:#da1e28;--cds-warning:#f1c21b}body{font-family:Arial,sans-serif;margin:32px;color:#161616}h1,h2{margin:0 0 16px}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:20px 0}.stat{border:1px solid #c6c6c6;padding:12px}.stat strong{display:block;font-size:22px;margin-top:6px}table{border-collapse:collapse;width:100%;margin:12px 0 24px}th,td{border:1px solid #c6c6c6;padding:8px;text-align:left;font-size:12px}svg{max-width:100%;height:auto;border:1px solid #c6c6c6}@media print{body{margin:12mm}.no-print{display:none}}</style></head><body><h1>Execution Plan Report</h1>${comparisonSummary}<div class="stats"><div class="stat">Total cost<strong>${stats.totalCost}</strong></div><div class="stat">CPU cost<strong>${stats.totalCpu}</strong></div><div class="stat">Dead branches<strong>${stats.deadBranches}</strong></div><div class="stat">Full scans<strong>${stats.fullScans}</strong></div><div class="stat">Index scans<strong>${stats.indexScans}</strong></div></div><h2>Detected Issues</h2><table><thead><tr><th>Severity</th><th>Issue</th><th>Node</th><th>Recommendation</th></tr></thead><tbody>${issueRows || '<tr><td colspan="4">No issues detected</td></tr>'}</tbody></table><h2>Execution Tree</h2>${diagram}<h2>Normalized Plan JSON</h2><pre>${escapeHtml(JSON.stringify(plan, null, 2))}</pre></body></html>`
}

function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('single')
  const [inputFormat, setInputFormat] = useState<InputFormat>('json')
  const [planJson, setPlanJson] = useState<string>('')
  const [baselinePlanJson, setBaselinePlanJson] = useState<string>('')
  const [currentPlanJson, setCurrentPlanJson] = useState<string>('')
  const [parsedPlan, setParsedPlan] = useState<PlanNode | null>(null)
  const [comparison, setComparison] = useState<PlanComparison | null>(null)
  const [error, setError] = useState<string>('')
  const [stats, setStats] = useState<PlanStats | null>(null)
  const [baselineStats, setBaselineStats] = useState<PlanStats | null>(null)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [historyName, setHistoryName] = useState('')
  const [historySqlName, setHistorySqlName] = useState('')
  const [historyEnvironment, setHistoryEnvironment] = useState('')
  const [historyNotes, setHistoryNotes] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [sourceSql, setSourceSql] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const runWorker = useWorkerRpc<PlanWorkerRequest, PlanWorkerResult>(() => new Worker(new URL('../workers/execution-plan.worker.ts', import.meta.url), { type: 'module' }))

  const applyWorkerResult = (result: PlanWorkerResult) => {
    setParsedPlan(result.plan)
    setStats(result.stats)
    setBaselineStats(result.baselineStats)
    setComparison(result.comparison)
  }

  useToolSession('execution-plan', {
    mode,
    inputFormat,
    planJson,
    baselinePlanJson,
    currentPlanJson,
    historySqlName,
    historyEnvironment,
    sourceSql,
  }, (saved) => {
    const restoredMode: Mode = saved.mode === 'compare' ? 'compare' : 'single'
    const restoredFormat: InputFormat = saved.inputFormat === 'xplan' ? 'xplan' : 'json'
    const singleInput = typeof saved.planJson === 'string' ? saved.planJson : ''
    const baselineInput = typeof saved.baselinePlanJson === 'string' ? saved.baselinePlanJson : ''
    const currentInput = typeof saved.currentPlanJson === 'string' ? saved.currentPlanJson : ''

    setMode(restoredMode)
    setInputFormat(restoredFormat)
    setPlanJson(singleInput)
    setBaselinePlanJson(baselineInput)
    setCurrentPlanJson(currentInput)
    if (typeof saved.historySqlName === 'string') setHistorySqlName(saved.historySqlName)
    if (typeof saved.historyEnvironment === 'string') setHistoryEnvironment(saved.historyEnvironment)
    if (typeof saved.sourceSql === 'string') setSourceSql(saved.sourceSql)

    if (restoredMode === 'single' && singleInput.trim()) {
      void runWorker({ mode: 'single', format: restoredFormat, value: singleInput })
        .then(applyWorkerResult)
        .catch(() => undefined)
    } else if (restoredMode === 'compare' && baselineInput.trim() && currentInput.trim()) {
      void runWorker({ mode: 'compare', format: restoredFormat, baseline: baselineInput, current: currentInput })
        .then(applyWorkerResult)
        .catch(() => undefined)
    }
  }, { maxBytes: 1_000_000 })

  useToolTransfer<{ sourceSql?: string }>('execution-plan', (payload) => {
    if (typeof payload.sourceSql !== 'string') return
    setSourceSql(payload.sourceSql)
    toast.info('Source SQL received from SQL Extractor')
  })

  const issues = useMemo(() => parsedPlan ? analyzePlanIssues(parsedPlan) : [], [parsedPlan])

  const refreshHistory = async () => {
    try {
      setSavedPlans(await listSavedPlans())
      setHistoryError('')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to read plan history.'
      setHistoryError(message)
      toast.error(message)
    }
  }

  useEffect(() => {
    void refreshHistory()
  }, [])

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode)
    setError('')
    setParsedPlan(null)
    setComparison(null)
    setStats(null)
    setBaselineStats(null)

    if (nextMode === 'compare' && baselinePlanJson.trim().length === 0 && planJson.trim().length > 0) {
      setBaselinePlanJson(planJson)
      setCurrentPlanJson(planJson)
    }
  }

  const handleParse = async () => {
    setError('')
    setIsProcessing(true)

    try {
      const result = mode === 'single'
        ? await runWorker({ mode: 'single', format: inputFormat, value: planJson })
        : await runWorker({ mode: 'compare', format: inputFormat, baseline: baselinePlanJson, current: currentPlanJson })
      applyWorkerResult(result)
      toast.success(mode === 'single' ? 'Execution plan visualized' : 'Execution plans compared')
    } catch (cause) {
      setParsedPlan(null)
      setComparison(null)
      setStats(null)
      setBaselineStats(null)
      const message = cause instanceof Error ? cause.message : 'Execution plan processing failed.'
      setError(message)
      toast.error(mode === 'single' ? 'Unable to visualize plan' : 'Unable to compare plans', message)
    } finally {
      setIsProcessing(false)
    }
  }

  const loadSample = async () => {
    setError('')
    const current = singleSample()
    const currentJson = inputFormat === 'json' ? JSON.stringify(current, null, 2) : singleDbmsSample
    setPlanJson(currentJson)

    if (mode === 'single') {
      if (inputFormat === 'json') {
        setParsedPlan(current)
        setStats(calculateStats(current))
      } else {
        setIsProcessing(true)
        try {
          applyWorkerResult(await runWorker({ mode: 'single', format: 'xplan', value: singleDbmsSample }))
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : 'Execution plan processing failed.'
          setError(message)
          toast.error('Unable to visualize plan', message)
        } finally {
          setIsProcessing(false)
        }
      }
      setComparison(null)
      setBaselineStats(null)
      return
    }

    const samples = comparisonSamples()
    const textSamples = comparisonDbmsSamples()
    const baselineJson = inputFormat === 'json' ? JSON.stringify(samples.baseline, null, 2) : textSamples.baseline
    const compareCurrentJson = inputFormat === 'json' ? JSON.stringify(samples.current, null, 2) : textSamples.current
    setBaselinePlanJson(baselineJson)
    setCurrentPlanJson(compareCurrentJson)
    if (inputFormat === 'json') {
      setParsedPlan(samples.current)
      setStats(calculateStats(samples.current))
      setBaselineStats(calculateStats(samples.baseline))
      setComparison(comparePlans(samples.baseline, samples.current))
    } else {
      setIsProcessing(true)
      try {
        applyWorkerResult(await runWorker({ mode: 'compare', format: 'xplan', baseline: textSamples.baseline, current: textSamples.current }))
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Execution plan processing failed.'
        setError(message)
        toast.error('Unable to compare plans', message)
      } finally {
        setIsProcessing(false)
      }
    }
  }

  const saveCurrentPlan = async () => {
    if (!parsedPlan) return
    try {
      await savePlan({
        name: historyName.trim() || `Plan ${new Date().toLocaleString()}`,
        sqlName: historySqlName.trim() || undefined,
        environment: historyEnvironment.trim() || undefined,
        notes: historyNotes.trim() || undefined,
        plan: parsedPlan,
      })
      setHistoryName('')
      setHistoryNotes('')
      setHistoryError('')
      await refreshHistory()
      toast.success('Plan saved to history')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to save plan history.'
      setHistoryError(message)
      toast.error(message)
    }
  }

  const loadHistoryPlan = (saved: SavedPlan) => {
    const json = JSON.stringify(saved.plan, null, 2)
    setMode('single')
    setInputFormat('json')
    setPlanJson(json)
    setParsedPlan(saved.plan)
    setStats(calculateStats(saved.plan))
    setBaselineStats(null)
    setComparison(null)
    setError('')
  }

  const loadHistoryAsBaseline = (saved: SavedPlan) => {
    setMode('compare')
    setInputFormat('json')
    setBaselinePlanJson(JSON.stringify(saved.plan, null, 2))
    const current = parsedPlan ?? saved.plan
    setCurrentPlanJson(JSON.stringify(current, null, 2))
    setParsedPlan(current)
    setBaselineStats(calculateStats(saved.plan))
    setStats(calculateStats(current))
    setComparison(comparePlans(saved.plan, current))
    setError('')
  }

  const removeHistoryPlan = async (id: string) => {
    try {
      await deleteSavedPlan(id)
      await refreshHistory()
      toast.success('Saved plan deleted')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to delete the saved plan.'
      setHistoryError(message)
      toast.error(message)
    }
  }

  const createReport = () => {
    if (!parsedPlan || !stats) return ''
    const svg = document.querySelector<SVGSVGElement>('[data-testid="execution-plan-svg"]')
    const diagram = svg ? new XMLSerializer().serializeToString(svg) : '<p>Diagram unavailable</p>'
    return reportHtml(parsedPlan, stats, issues, comparison, diagram)
  }

  const downloadReport = () => {
    const report = createReport()
    if (report) {
      downloadFile(report, 'execution-plan-report.html', 'text/html;charset=utf-8')
      toast.success('HTML report downloaded')
    }
  }

  const printReport = () => {
    const report = createReport()
    if (!report) return
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      toast.error('Unable to open print view', 'Allow pop-ups for this site and try again.')
      return
    }
    reportWindow.opener = null
    reportWindow.document.write(report)
    reportWindow.document.close()
    reportWindow.addEventListener('load', () => reportWindow.print(), { once: true })
  }

  const visualizerComparison = comparison
    ? {
        addedIds: comparison.added.map((entry) => entry.id),
        changedIds: comparison.changed.map((change) => change.current.id),
      }
    : { addedIds: [], changedIds: [] }
  const rows = comparison ? comparisonRows(comparison) : []
  const movedCount = comparison?.changed.filter((change) => change.moved).length ?? 0
  const changedCount = comparison ? comparison.changed.length - movedCount : 0
  const totalCostDelta = stats && baselineStats ? stats.totalCost - baselineStats.totalCost : undefined
  const totalCostPercent = stats && baselineStats
    ? baselineStats.totalCost === 0
      ? stats.totalCost === 0 ? 0 : Infinity
      : (totalCostDelta! / Math.abs(baselineStats.totalCost)) * 100
    : undefined

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
          <h3 className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Execution Plan Input</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex border border-outline-variant/60 bg-surface-container-lowest" role="group" aria-label="Plan input format">
              <button type="button" aria-pressed={inputFormat === 'json'} onClick={() => setInputFormat('json')} className={`px-3 py-2 text-sm font-medium ${inputFormat === 'json' ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}>JSON</button>
              <button type="button" aria-pressed={inputFormat === 'xplan'} onClick={() => setInputFormat('xplan')} className={`border-l border-outline-variant/60 px-3 py-2 text-sm font-medium ${inputFormat === 'xplan' ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}>DBMS_XPLAN</button>
            </div>
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
            {parsedPlan && (
              <>
                <button type="button" onClick={downloadReport} className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface">HTML Report</button>
                <button type="button" onClick={printReport} className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm font-medium text-on-surface">Print / PDF</button>
              </>
            )}
          </div>
        </div>

        <div className="p-4">
          {sourceSql && (
            <div className="mb-4 border border-outline-variant/60 bg-surface-container p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase text-on-surface-variant">Source SQL</span>
                <button type="button" onClick={() => setSourceSql('')} className="text-xs font-medium text-tertiary">Clear</button>
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs text-on-surface">{sourceSql}</pre>
            </div>
          )}
          {mode === 'single' ? (
            <label className="block">
              <span className="mb-2 block text-xs font-label font-semibold uppercase tracking-wide text-on-surface-variant">Current Plan {inputFormat === 'json' ? 'JSON' : 'DBMS_XPLAN'}</span>
              <textarea
                value={planJson}
                onChange={(event) => setPlanJson(event.target.value)}
                placeholder={inputFormat === 'json' ? 'Paste your Oracle execution plan JSON here...' : 'Paste DBMS_XPLAN.DISPLAY_CURSOR output here...'}
                className="h-48 w-full resize-y rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3 font-mono text-sm text-on-surface placeholder-on-surface-variant/50 focus:border-transparent focus:ring-2 focus:ring-primary"
              />
            </label>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-label font-semibold uppercase tracking-wide text-on-surface-variant">Baseline Plan {inputFormat === 'json' ? 'JSON' : 'DBMS_XPLAN'}</span>
                <textarea
                  value={baselinePlanJson}
                  onChange={(event) => setBaselinePlanJson(event.target.value)}
                  placeholder={inputFormat === 'json' ? 'Paste the baseline execution plan JSON here...' : 'Paste the baseline DBMS_XPLAN output here...'}
                  className="h-48 w-full resize-y rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-3 font-mono text-sm text-on-surface placeholder-on-surface-variant/50 focus:border-transparent focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-label font-semibold uppercase tracking-wide text-on-surface-variant">Current Plan {inputFormat === 'json' ? 'JSON' : 'DBMS_XPLAN'}</span>
                <textarea
                  value={currentPlanJson}
                  onChange={(event) => setCurrentPlanJson(event.target.value)}
                  placeholder={inputFormat === 'json' ? 'Paste the current execution plan JSON here...' : 'Paste the current DBMS_XPLAN output here...'}
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
            onClick={() => void handleParse()}
            disabled={isProcessing}
            className="mt-3 w-full rounded-lg bg-primary py-2.5 font-semibold text-white shadow-warm transition-colors hover:bg-primary/90"
          >
            {isProcessing ? 'Processing Plan...' : 'Visualize Plan'}
          </button>
        </div>
      </div>

      {parsedPlan && (
        <section className="mb-4 overflow-hidden rounded-lg bg-surface-container-low shadow-editorial" aria-labelledby="issues-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 bg-surface-container px-4 py-3">
            <h3 id="issues-heading" className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Execution Summary</h3>
            <div className="flex gap-4 text-xs text-on-surface-variant">
              <span>Critical {issues.filter((issue) => issue.severity === 'critical').length}</span>
              <span>Warnings {issues.filter((issue) => issue.severity === 'warning').length}</span>
              <span>Info {issues.filter((issue) => issue.severity === 'info').length}</span>
            </div>
          </div>
          <div className="divide-y divide-outline-variant/50">
            {issues.length > 0 ? issues.map((issue) => (
              <div key={issue.id} className="grid gap-2 px-4 py-3 md:grid-cols-[90px_minmax(180px,1fr)_minmax(260px,2fr)]">
                <span className={`text-xs font-semibold uppercase ${issue.severity === 'critical' ? 'text-tertiary' : issue.severity === 'warning' ? 'text-[#b28600]' : 'text-primary'}`}>{issue.severity}</span>
                <div><div className="text-sm font-semibold text-on-surface">{issue.title}</div><div className="mt-1 font-mono text-xs text-on-surface-variant">{issue.entry.label}</div></div>
                <div className="text-sm text-on-surface-variant">{issue.recommendation}</div>
              </div>
            )) : <p className="px-4 py-3 text-sm text-on-surface-variant">No execution-plan issues detected.</p>}
          </div>
        </section>
      )}

      <section className="mb-4 overflow-hidden rounded-lg bg-surface-container-low shadow-editorial" aria-labelledby="history-heading">
        <div className="border-b border-outline-variant/60 bg-surface-container px-4 py-3">
          <h3 id="history-heading" className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Plan History</h3>
        </div>
        <div className="grid gap-3 border-b border-outline-variant/60 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_2fr_auto]">
          <input value={historyName} onChange={(event) => setHistoryName(event.target.value)} placeholder="Plan name" aria-label="History plan name" className="h-10 px-3 text-sm" />
          <input value={historySqlName} onChange={(event) => setHistorySqlName(event.target.value)} placeholder="SQL name" aria-label="History SQL name" className="h-10 px-3 text-sm" />
          <input value={historyEnvironment} onChange={(event) => setHistoryEnvironment(event.target.value)} placeholder="Environment" aria-label="History environment" className="h-10 px-3 text-sm" />
          <input value={historyNotes} onChange={(event) => setHistoryNotes(event.target.value)} placeholder="Notes" aria-label="History notes" className="h-10 px-3 text-sm" />
          <button type="button" onClick={() => void saveCurrentPlan()} disabled={!parsedPlan} className="h-10 bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save Current</button>
        </div>
        {historyError && <p className="px-4 py-3 text-sm text-tertiary">{historyError}</p>}
        <div className="divide-y divide-outline-variant/50">
          {savedPlans.length > 0 ? savedPlans.map((saved) => (
            <div key={saved.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_minmax(160px,1fr)_auto] md:items-center">
              <div><div className="font-semibold text-on-surface">{saved.name}</div><div className="mt-1 text-xs text-on-surface-variant">{new Date(saved.updatedAt).toLocaleString()}{saved.environment ? ` | ${saved.environment}` : ''}{saved.sqlName ? ` | ${saved.sqlName}` : ''}</div></div>
              <div className="text-sm text-on-surface-variant">{saved.notes || `${flattenPlan(saved.plan).length} nodes`}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => loadHistoryPlan(saved)} className="border border-outline-variant bg-surface-container px-3 py-2 text-xs font-medium text-on-surface">Load</button>
                <button type="button" onClick={() => loadHistoryAsBaseline(saved)} className="border border-outline-variant bg-surface-container px-3 py-2 text-xs font-medium text-on-surface">Baseline</button>
                <button type="button" onClick={() => void removeHistoryPlan(saved.id)} className="border border-tertiary/40 px-3 py-2 text-xs font-medium text-tertiary">Delete</button>
              </div>
            </div>
          )) : <EmptyState compact title="No saved plans" description="Visualize a plan, add a name, then save it for later comparison." />}
        </div>
      </section>

      {comparison && (
        <section className="mb-4 overflow-hidden rounded-lg bg-surface-container-low shadow-editorial" aria-labelledby="comparison-heading">
          <div className="flex flex-col gap-2 border-b border-outline-variant/60 bg-surface-container px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 id="comparison-heading" className="text-sm font-label font-semibold uppercase tracking-wide text-on-surface">Comparison Results</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-label text-on-surface-variant">
              <span>Added {comparison.added.length}</span>
              <span>Removed {comparison.removed.length}</span>
              <span>Changed {changedCount}</span>
              <span>Moved {movedCount}</span>
              {totalCostDelta !== undefined && <span className={totalCostDelta > 0 ? 'text-tertiary' : totalCostDelta < 0 ? 'text-green-600' : ''}>Total cost {formatDelta(totalCostDelta)} ({formatPercent(totalCostPercent)})</span>}
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
                      <td className={`whitespace-nowrap px-4 py-2 font-label text-xs font-semibold uppercase ${row.kind === 'Added' ? 'text-green-600' : row.kind === 'Removed' ? 'text-tertiary' : row.kind === 'Moved' ? 'text-[#8a3ffc]' : 'text-[#a2191f]'}`}>
                        {row.kind}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-on-surface">{row.label}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-on-surface">{formatDelta(row.costDelta)} <span className="text-on-surface-variant">({formatPercent(row.costPercentDelta)})</span></td>
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
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-on-surface bg-[#ff832b]" /><span className="text-xs font-label text-on-surface-variant">Metric heatmap</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-on-surface bg-green-600" /><span className="text-xs font-label text-on-surface-variant">Added</span></div>
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-on-surface bg-[#8a3ffc]" /><span className="text-xs font-label text-on-surface-variant">Changed</span></div>
              <div className="flex items-center gap-2"><span className="h-1 w-5 bg-orange-500" /><span className="text-xs font-label text-on-surface-variant">Critical Path</span></div>
            </div>
          )}
        </div>

        <div className="p-2">
          {parsedPlan ? (
            <PlanVisualizer plan={parsedPlan} comparison={visualizerComparison} />
          ) : <EmptyState title="No execution plan loaded" description="Paste Oracle plan JSON or DBMS_XPLAN output, then select Visualize Plan." />}
        </div>
      </div>
    </div>
  )
}
