export interface PlanNode {
  operation: string
  options?: string
  objectName?: string
  cost?: number
  cardinality?: number
  cpuCost?: number
  filterPredicates?: string
  children?: PlanNode[]
  actualRows?: number
  estimatedRows?: number
  elapsedTimeMs?: number
  starts?: number
  buffers?: number
}

export interface PlanEntry {
  id: string
  parentId: string | null
  depth: number
  node: PlanNode
  label: string
  estimatedRows: number | undefined
  actualRows: number | undefined
  misestimateRatio: number | undefined
}

export interface PlanChange {
  previous: PlanEntry
  current: PlanEntry
  costDelta: number | undefined
  estimatedRowsDelta: number | undefined
  actualRowsDelta: number | undefined
  costPercentDelta: number | undefined
  estimatedRowsPercentDelta: number | undefined
  actualRowsPercentDelta: number | undefined
  moved: boolean
}

export interface PlanComparison {
  added: PlanEntry[]
  removed: PlanEntry[]
  changed: PlanChange[]
}

export type PlanMetric = 'cost' | 'cpu' | 'elapsed' | 'buffers' | 'rows'

export interface PlanIssue {
  id: string
  severity: 'critical' | 'warning' | 'info'
  type: 'misestimate' | 'full-scan' | 'cartesian' | 'expensive-sort' | 'dead-branch'
  entry: PlanEntry
  title: string
  recommendation: string
}

type UnknownRecord = Record<string, unknown>

const STRING_FIELDS = ['options', 'objectName', 'filterPredicates'] as const
const NUMERIC_FIELDS = ['cost', 'cardinality', 'cpuCost', 'elapsedTimeMs', 'starts', 'buffers'] as const
const ACTUAL_ROW_ALIASES = ['actualRows', 'actual_rows', 'aRows', 'a_rows'] as const
const ESTIMATED_ROW_ALIASES = ['estimatedRows', 'estimated_rows', 'eRows', 'e_rows'] as const
const ELAPSED_TIME_ALIASES = ['elapsedTimeMs', 'elapsed_time_ms'] as const

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pathFor(path: string, field: string): string {
  return path === '$' ? `$.${field}` : `${path}.${field}`
}

function readString(record: UnknownRecord, field: (typeof STRING_FIELDS)[number], path: string): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new TypeError(`${pathFor(path, field)} must be a string`)
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function readNumber(record: UnknownRecord, field: string, path: string): number | undefined {
  const value = record[field]
  if (value === undefined) return undefined

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    throw new TypeError(`${pathFor(path, field)} must be finite`)
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }

  throw new TypeError(`${pathFor(path, field)} must be a finite number`)
}

function readAliasedNumber(record: UnknownRecord, fields: readonly string[], path: string): number | undefined {
  for (const field of fields) {
    if (record[field] !== undefined) return readNumber(record, field, path)
  }
  return undefined
}

function normalizeNode(input: unknown, path: string): PlanNode {
  if (!isRecord(input)) {
    throw new TypeError(`${path} must be an object`)
  }

  const operation = input.operation
  if (typeof operation !== 'string' || operation.trim().length === 0) {
    throw new TypeError(`${pathFor(path, 'operation')} must be a non-empty string`)
  }

  const childrenValue = input.children
  if (childrenValue !== undefined && !Array.isArray(childrenValue)) {
    throw new TypeError(`${pathFor(path, 'children')} must be an array`)
  }

  const cardinality = readNumber(input, 'cardinality', path)
  const estimatedRows = readAliasedNumber(input, ESTIMATED_ROW_ALIASES, path) ?? cardinality
  const node: PlanNode = {
    operation: operation.trim(),
    children: (childrenValue ?? []).map((child, index) => normalizeNode(child, `${pathFor(path, 'children')}[${index}]`)),
  }

  for (const field of STRING_FIELDS) {
    const value = readString(input, field, path)
    if (value !== undefined) node[field] = value
  }

  for (const field of NUMERIC_FIELDS) {
    const value = field === 'elapsedTimeMs'
      ? readAliasedNumber(input, ELAPSED_TIME_ALIASES, path)
      : readNumber(input, field, path)
    if (value !== undefined) node[field] = value
  }

  const actualRows = readAliasedNumber(input, ACTUAL_ROW_ALIASES, path)
  if (actualRows !== undefined) node.actualRows = actualRows
  if (estimatedRows !== undefined) node.estimatedRows = estimatedRows

  return node
}

export function normalizePlan(input: unknown): PlanNode {
  return normalizeNode(input, '$')
}

function makeLabel(node: PlanNode): string {
  return [node.operation, node.options, node.objectName].filter((value): value is string => value !== undefined).join(' ')
}

function misestimateRatio(estimatedRows: number | undefined, actualRows: number | undefined): number | undefined {
  if (estimatedRows === undefined || actualRows === undefined) return undefined
  if (estimatedRows === 0) return actualRows === 0 ? 1 : Infinity
  return actualRows / estimatedRows
}

export function flattenPlan(plan: PlanNode): PlanEntry[] {
  const entries: PlanEntry[] = []

  const visit = (node: PlanNode, id: string, parentId: string | null, depth: number): void => {
    const estimatedRows = node.estimatedRows ?? node.cardinality
    entries.push({
      id,
      parentId,
      depth,
      node,
      label: makeLabel(node),
      estimatedRows,
      actualRows: node.actualRows,
      misestimateRatio: misestimateRatio(estimatedRows, node.actualRows),
    })

    for (const [index, child] of (node.children ?? []).entries()) {
      visit(child, `${id}.${index}`, id, depth + 1)
    }
  }

  visit(plan, '0', null, 0)
  return entries
}

export function isDeadNode(node: PlanNode): boolean {
  return node.filterPredicates?.toUpperCase().includes('NULL IS NOT NULL') ?? false
}

function nodeCost(node: PlanNode): number {
  return Number.isFinite(node.cost) ? node.cost ?? 0 : 0
}

export function getMetricValue(node: PlanNode, metric: PlanMetric): number {
  switch (metric) {
    case 'cpu': return node.cpuCost ?? 0
    case 'elapsed': return node.elapsedTimeMs ?? 0
    case 'buffers': return node.buffers ?? 0
    case 'rows': return node.actualRows ?? node.estimatedRows ?? node.cardinality ?? 0
    default: return nodeCost(node)
  }
}

export function getMetricLabel(metric: PlanMetric): string {
  switch (metric) {
    case 'cpu': return 'CPU cost'
    case 'elapsed': return 'Elapsed time'
    case 'buffers': return 'Buffers'
    case 'rows': return 'Rows'
    default: return 'Cost'
  }
}

export function getCriticalPathIds(plan: PlanNode, metric: PlanMetric): string[] {
  const findPath = (node: PlanNode, id: string): { peak: number; ids: string[] } => {
    const childPaths = (node.children ?? [])
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => !isDeadNode(child))
      .map(({ child, index }) => findPath(child, `${id}.${index}`))

    if (childPaths.length === 0) return { peak: getMetricValue(node, metric), ids: [id] }
    const highestChildPath = childPaths.reduce((highest, current) => current.peak > highest.peak ? current : highest)
    return {
      peak: Math.max(getMetricValue(node, metric), highestChildPath.peak),
      ids: [id, ...highestChildPath.ids],
    }
  }

  return findPath(plan, '0').ids
}

export function getHighestCostPathIds(plan: PlanNode): string[] {
  return getCriticalPathIds(plan, 'cost')
}

export function getBottlenecks(plan: PlanNode, limit = 5, metric: PlanMetric = 'cost'): PlanEntry[] {
  if (!Number.isFinite(limit) || limit <= 0) return []

  return flattenPlan(plan)
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !isDeadNode(entry.node))
    .sort((left, right) => {
      const metricDelta = getMetricValue(right.entry.node, metric) - getMetricValue(left.entry.node, metric)
      if (metricDelta !== 0) return metricDelta

      const cpuDelta = (right.entry.node.cpuCost ?? 0) - (left.entry.node.cpuCost ?? 0)
      if (cpuDelta !== 0) return cpuDelta

      return left.index - right.index
    })
    .slice(0, Math.floor(limit))
    .map(({ entry }) => entry)
}

export function analyzePlanIssues(plan: PlanNode): PlanIssue[] {
  const entries = flattenPlan(plan)
  const maxCost = Math.max(0, ...entries.map((entry) => nodeCost(entry.node)))
  const issues: PlanIssue[] = []

  for (const entry of entries) {
    const operation = entry.node.operation.toUpperCase()
    const options = entry.node.options?.toUpperCase() ?? ''
    const ratio = entry.misestimateRatio

    if (ratio !== undefined && (ratio >= 10 || ratio <= 0.1)) {
      issues.push({
        id: `${entry.id}-misestimate`,
        severity: ratio >= 100 || ratio <= 0.01 ? 'critical' : 'warning',
        type: 'misestimate',
        entry,
        title: `Cardinality estimate differs by ${Number.isFinite(ratio) ? `${ratio.toFixed(ratio >= 10 ? 0 : 2)}x` : 'Infinity'}`,
        recommendation: 'Refresh statistics and review predicate correlation, histograms, and bind selectivity.',
      })
    }

    if (operation === 'TABLE ACCESS' && options === 'FULL') {
      issues.push({
        id: `${entry.id}-full-scan`,
        severity: maxCost > 0 && entry.node.cost !== undefined && entry.node.cost >= maxCost * 0.5 ? 'critical' : 'warning',
        type: 'full-scan',
        entry,
        title: `Full table scan on ${entry.node.objectName ?? 'unknown object'}`,
        recommendation: 'Review predicate selectivity, table size, partition pruning, and available indexes.',
      })
    }

    if (operation.includes('CARTESIAN')) {
      issues.push({
        id: `${entry.id}-cartesian`,
        severity: 'critical',
        type: 'cartesian',
        entry,
        title: 'Cartesian join detected',
        recommendation: 'Verify join predicates and row-source cardinality before this operation.',
      })
    }

    if (operation === 'SORT' && nodeCost(entry.node) >= maxCost * 0.5 && maxCost > 0) {
      issues.push({
        id: `${entry.id}-sort`,
        severity: 'warning',
        type: 'expensive-sort',
        entry,
        title: `Expensive sort (${entry.node.options ?? 'SORT'})`,
        recommendation: 'Review ordering/grouping requirements, memory sizing, and supporting indexes.',
      })
    }

    if (isDeadNode(entry.node)) {
      issues.push({
        id: `${entry.id}-dead`,
        severity: 'info',
        type: 'dead-branch',
        entry,
        title: 'Unreachable branch',
        recommendation: 'Treat this branch as non-runtime work and simplify the originating predicate when possible.',
      })
    }
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 }
  return issues.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity])
}

function semanticKey(node: PlanNode): string {
  return [node.operation, node.options ?? '', node.objectName ?? ''].join('\u0000')
}

function structuralKey(node: PlanNode): string {
  const childKeys = (node.children ?? []).map(structuralKey).sort()
  return `${semanticKey(node)}[${childKeys.join('|')}]`
}

function contextKey(entry: PlanEntry, entriesById: Map<string, PlanEntry>): string {
  const ancestors: string[] = []
  let parentId = entry.parentId

  while (parentId) {
    const parent = entriesById.get(parentId)
    if (!parent) break
    ancestors.unshift(semanticKey(parent.node))
    parentId = parent.parentId
  }

  return ancestors.join('>')
}

function numberDistance(left: number | undefined, right: number | undefined): number {
  if (left === right) return 0
  if (left === undefined || right === undefined) return 1_000_000
  return Math.abs(left - right)
}

function matchDistance(previous: PlanEntry, current: PlanEntry): number {
  const structurePenalty = structuralKey(previous.node) === structuralKey(current.node) ? 0 : 10_000_000
  return structurePenalty
    + numberDistance(previous.node.cost, current.node.cost)
    + numberDistance(previous.estimatedRows, current.estimatedRows)
    + numberDistance(previous.actualRows, current.actualRows)
    + numberDistance(previous.node.cpuCost, current.node.cpuCost)
}

function delta(current: number | undefined, previous: number | undefined): number | undefined {
  return current !== undefined && previous !== undefined ? current - previous : undefined
}

function percentDelta(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined) return undefined
  if (previous === 0) return current === 0 ? 0 : Infinity
  return ((current - previous) / Math.abs(previous)) * 100
}

function toPlanChange(previous: PlanEntry, current: PlanEntry, moved: boolean): PlanChange {
  return {
    previous,
    current,
    costDelta: delta(current.node.cost, previous.node.cost),
    estimatedRowsDelta: delta(current.estimatedRows, previous.estimatedRows),
    actualRowsDelta: delta(current.actualRows, previous.actualRows),
    costPercentDelta: percentDelta(current.node.cost, previous.node.cost),
    estimatedRowsPercentDelta: percentDelta(current.estimatedRows, previous.estimatedRows),
    actualRowsPercentDelta: percentDelta(current.actualRows, previous.actualRows),
    moved,
  }
}

function numbersDiffer(current: number | undefined, previous: number | undefined): boolean {
  return current !== previous
}

function entriesDiffer(previous: PlanEntry, current: PlanEntry): boolean {
  const previousNode = previous.node
  const currentNode = current.node

  return (
    numbersDiffer(previousNode.cost, currentNode.cost) ||
    numbersDiffer(previous.estimatedRows, current.estimatedRows) ||
    numbersDiffer(previous.actualRows, current.actualRows) ||
    numbersDiffer(previousNode.cardinality, currentNode.cardinality) ||
    numbersDiffer(previousNode.cpuCost, currentNode.cpuCost) ||
    numbersDiffer(previousNode.elapsedTimeMs, currentNode.elapsedTimeMs) ||
    numbersDiffer(previousNode.starts, currentNode.starts) ||
    numbersDiffer(previousNode.buffers, currentNode.buffers) ||
    previousNode.filterPredicates !== currentNode.filterPredicates
  )
}

export function comparePlans(previous: PlanNode, current: PlanNode): PlanComparison {
  const previousEntries = flattenPlan(previous)
  const currentEntries = flattenPlan(current)
  const previousEntriesById = new Map(previousEntries.map((entry) => [entry.id, entry]))
  const currentEntriesById = new Map(currentEntries.map((entry) => [entry.id, entry]))
  const previousByKey = new Map<string, PlanEntry[]>()
  const matchedPrevious = new Set<PlanEntry>()
  const added: PlanEntry[] = []
  const changed: PlanChange[] = []

  for (const entry of previousEntries) {
    const key = `${contextKey(entry, previousEntriesById)}\u0001${semanticKey(entry.node)}`
    const entries = previousByKey.get(key) ?? []
    entries.push(entry)
    previousByKey.set(key, entries)
  }

  for (const currentEntry of currentEntries) {
    const key = `${contextKey(currentEntry, currentEntriesById)}\u0001${semanticKey(currentEntry.node)}`
    const candidates = previousByKey.get(key)
    let previousEntry: PlanEntry | undefined

    if (candidates && candidates.length > 0) {
      const bestIndex = candidates.reduce((best, candidate, index) => {
        const candidateDistance = matchDistance(candidate, currentEntry)
        const bestDistance = matchDistance(candidates[best], currentEntry)
        if (candidateDistance !== bestDistance) return candidateDistance < bestDistance ? index : best
        return candidate.id.localeCompare(candidates[best].id) < 0 ? index : best
      }, 0)
      previousEntry = candidates.splice(bestIndex, 1)[0]
    }

    if (!previousEntry) {
      added.push(currentEntry)
      continue
    }

    matchedPrevious.add(previousEntry)
    if (entriesDiffer(previousEntry, currentEntry)) {
      changed.push(toPlanChange(previousEntry, currentEntry, false))
    }
  }

  const unmatchedPrevious = previousEntries.filter((entry) => !matchedPrevious.has(entry))
  const addedKeyCounts = new Map<string, number>()
  for (const entry of added) {
    const key = semanticKey(entry.node)
    addedKeyCounts.set(key, (addedKeyCounts.get(key) ?? 0) + 1)
  }

  for (let addedIndex = added.length - 1; addedIndex >= 0; addedIndex -= 1) {
    const currentEntry = added[addedIndex]
    const key = semanticKey(currentEntry.node)
    const candidates = unmatchedPrevious.filter((entry) => !matchedPrevious.has(entry) && semanticKey(entry.node) === key)
    if (candidates.length !== 1 || addedKeyCounts.get(key) !== 1) continue
    const previousEntry = candidates[0]
    matchedPrevious.add(previousEntry)
    added.splice(addedIndex, 1)
    changed.push(toPlanChange(previousEntry, currentEntry, true))
  }

  return {
    added,
    removed: previousEntries.filter((entry) => !matchedPrevious.has(entry)),
    changed,
  }
}
