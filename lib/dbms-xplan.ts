import type { PlanNode } from '@/lib/execution-plan'

interface ParsedRow {
  id: number
  indent: number
  node: PlanNode
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = value.trim().replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([KMG])?/i)
  if (!match) return undefined
  const multiplier = match[2]?.toUpperCase() === 'K'
    ? 1_000
    : match[2]?.toUpperCase() === 'M'
      ? 1_000_000
      : match[2]?.toUpperCase() === 'G'
        ? 1_000_000_000
        : 1
  const number = Number(match[1]) * multiplier
  return Number.isFinite(number) ? number : undefined
}

function parseElapsedMs(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parts = value.trim().split(':')
  if (parts.length !== 3) return parseNumber(value)
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = Number(parts[2])
  if (![hours, minutes, seconds].every(Number.isFinite)) return undefined
  return ((hours * 60 + minutes) * 60 + seconds) * 1_000
}

function splitOperation(value: string): { operation: string; options?: string } {
  const normalized = value.replace(/^\*+/, '').trim().replace(/\s+/g, ' ')
  const optionBases = [
    'TABLE ACCESS',
    'INDEX',
    'SORT',
    'PARTITION RANGE',
    'PARTITION LIST',
    'PARTITION HASH',
    'MAT_VIEW ACCESS',
    'BITMAP CONVERSION',
  ]

  for (const base of optionBases) {
    if (normalized === base) return { operation: base }
    if (normalized.startsWith(`${base} `)) {
      return { operation: base, options: normalized.slice(base.length + 1) }
    }
  }

  return { operation: normalized }
}

function findColumn(headers: string[], ...candidates: string[]) {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.startsWith(candidate)))
}

function readPredicates(lines: string[]) {
  const predicates = new Map<number, string[]>()
  const start = lines.findIndex((line) => /predicate information/i.test(line))
  if (start === -1) return predicates
  let currentId: number | null = null

  for (const line of lines.slice(start + 1)) {
    if (/^-{3,}|^note$|^query block name/i.test(line.trim())) continue
    const match = line.match(/^\s*(\d+)\s*-\s*(?:filter|access)\s*\((.*)$/i)
    if (match) {
      currentId = Number(match[1])
      const existing = predicates.get(currentId) ?? []
      predicates.set(currentId, [...existing, match[2].trim()])
      continue
    }
    if (currentId === null || !line.trim()) continue
    if (/^\s*\d+\s*-/.test(line)) {
      currentId = null
      continue
    }
    predicates.get(currentId)?.push(line.trim())
  }

  for (const [id, parts] of predicates) {
    predicates.set(id, [parts.join(' ').replace(/\)\s*$/, '')])
  }
  return predicates
}

export function parseDbmsXplan(text: string): PlanNode {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const headerIndex = lines.findIndex((line) => line.includes('|') && /\bId\b/i.test(line) && /Operation/i.test(line))
  if (headerIndex === -1) throw new Error('DBMS_XPLAN table header with Id and Operation columns was not found.')

  const rawHeaders = lines[headerIndex].split('|').slice(1, -1)
  const headers = rawHeaders.map(normalizeHeader)
  const idIndex = findColumn(headers, 'id')
  const operationIndex = findColumn(headers, 'operation')
  const nameIndex = findColumn(headers, 'name')
  const startsIndex = findColumn(headers, 'starts')
  const estimatedRowsIndex = findColumn(headers, 'e-rows', 'rows')
  const actualRowsIndex = findColumn(headers, 'a-rows')
  const elapsedIndex = findColumn(headers, 'a-time', 'elapsed')
  const buffersIndex = findColumn(headers, 'buffers')
  const costIndex = findColumn(headers, 'cost')
  const predicates = readPredicates(lines)
  const rows: ParsedRow[] = []

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.includes('|')) continue
    const cells = line.split('|').slice(1, -1)
    if (cells.length < headers.length) continue
    const idText = cells[idIndex]?.trim().replace(/^\*/, '')
    if (!/^\d+$/.test(idText ?? '')) continue
    const rawOperation = cells[operationIndex] ?? ''
    const operationText = rawOperation.trim()
    if (!operationText || /^operation$/i.test(operationText)) continue
    const indent = rawOperation.match(/^\s*/)?.[0].length ?? 0
    const parsedOperation = splitOperation(operationText)
    const id = Number(idText)
    const node: PlanNode = {
      operation: parsedOperation.operation,
      children: [],
    }
    if (parsedOperation.options) node.options = parsedOperation.options
    const objectName = nameIndex >= 0 ? cells[nameIndex]?.trim() : ''
    if (objectName) node.objectName = objectName
    const starts = startsIndex >= 0 ? parseNumber(cells[startsIndex]) : undefined
    const estimatedRows = estimatedRowsIndex >= 0 ? parseNumber(cells[estimatedRowsIndex]) : undefined
    const actualRows = actualRowsIndex >= 0 ? parseNumber(cells[actualRowsIndex]) : undefined
    const elapsedTimeMs = elapsedIndex >= 0 ? parseElapsedMs(cells[elapsedIndex]) : undefined
    const buffers = buffersIndex >= 0 ? parseNumber(cells[buffersIndex]) : undefined
    const cost = costIndex >= 0 ? parseNumber(cells[costIndex]) : undefined
    if (starts !== undefined) node.starts = starts
    if (estimatedRows !== undefined) node.estimatedRows = estimatedRows
    if (actualRows !== undefined) node.actualRows = actualRows
    if (elapsedTimeMs !== undefined) node.elapsedTimeMs = elapsedTimeMs
    if (buffers !== undefined) node.buffers = buffers
    if (cost !== undefined) node.cost = cost
    const predicate = predicates.get(id)?.join(' ')
    if (predicate) node.filterPredicates = predicate
    rows.push({ id, indent, node })
  }

  if (rows.length === 0) throw new Error('No execution-plan operation rows were found in the DBMS_XPLAN text.')
  const roots: PlanNode[] = []
  const stack: ParsedRow[] = []
  for (const row of rows) {
    while (stack.length > 0 && row.indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.node.children?.push(row.node)
    else roots.push(row.node)
    stack.push(row)
  }

  if (roots.length === 1) return roots[0]
  return { operation: 'EXECUTION PLAN', children: roots }
}
