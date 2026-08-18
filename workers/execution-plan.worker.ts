/// <reference lib="webworker" />

import { parseDbmsXplan } from '@/lib/dbms-xplan'
import { comparePlans, flattenPlan, normalizePlan, type PlanComparison, type PlanNode } from '@/lib/execution-plan'

export interface PlanWorkerStats {
  totalCost: number
  totalCpu: number
  deadBranches: number
  fullScans: number
  indexScans: number
}

export type PlanWorkerRequest =
  | { mode: 'single'; format: 'json' | 'xplan'; value: string }
  | { mode: 'compare'; format: 'json' | 'xplan'; baseline: string; current: string }

export interface PlanWorkerResult {
  plan: PlanNode
  stats: PlanWorkerStats
  baselineStats: PlanWorkerStats | null
  comparison: PlanComparison | null
}

function parsePlan(value: string, label: string, format: 'json' | 'xplan') {
  const formatLabel = format === 'json' ? 'JSON' : 'DBMS_XPLAN text'
  if (!value.trim()) throw new Error(`${label} ${formatLabel} is empty. Paste a plan before visualizing.`)
  try {
    return format === 'json' ? normalizePlan(JSON.parse(value) as unknown) : parseDbmsXplan(value)
  } catch (cause) {
    throw new Error(`${label} ${formatLabel} is invalid: ${cause instanceof Error ? cause.message : 'Unknown validation error.'}`)
  }
}

function calculateStats(plan: PlanNode): PlanWorkerStats {
  const stats: PlanWorkerStats = { totalCost: 0, totalCpu: 0, deadBranches: 0, fullScans: 0, indexScans: 0 }
  flattenPlan(plan).forEach(({ node }) => {
    stats.totalCost += node.cost ?? 0
    stats.totalCpu += node.cpuCost ?? 0
    if (node.filterPredicates?.toUpperCase().includes('NULL IS NOT NULL')) stats.deadBranches += 1
    if (node.operation.toUpperCase() === 'TABLE ACCESS' && node.options?.toUpperCase() === 'FULL') stats.fullScans += 1
    if (node.operation.toUpperCase() === 'INDEX') stats.indexScans += 1
  })
  return stats
}

self.onmessage = (event: MessageEvent<{ id: number; payload: PlanWorkerRequest }>) => {
  const { id, payload } = event.data
  try {
    let result: PlanWorkerResult
    if (payload.mode === 'single') {
      const plan = parsePlan(payload.value, 'Current plan', payload.format)
      result = { plan, stats: calculateStats(plan), baselineStats: null, comparison: null }
    } else {
      const baseline = parsePlan(payload.baseline, 'Baseline plan', payload.format)
      const current = parsePlan(payload.current, 'Current plan', payload.format)
      result = {
        plan: current,
        stats: calculateStats(current),
        baselineStats: calculateStats(baseline),
        comparison: comparePlans(baseline, current),
      }
    }
    self.postMessage({ id, result })
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : 'Execution plan processing failed.' })
  }
}

export {}
