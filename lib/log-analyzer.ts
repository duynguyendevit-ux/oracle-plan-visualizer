export interface LogEntry {
  line: number
  level: string
  timestamp: string
  message: string
  stackTrace?: string[]
  logger?: string
  traceId?: string
  requestId?: string
  rootCause?: string
}

export interface LogErrorGroup {
  signature: string
  cause: string
  logger: string
  count: number
  lines: number[]
}

export interface LogStats {
  total: number
  filtered: number
  ERROR: number
  WARN: number
  INFO: number
  DEBUG: number
  TRACE: number
  unparsedLines: number
}

export interface LogAnalysisResult {
  entries: LogEntry[]
  stats: LogStats
  errorGroups: LogErrorGroup[]
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

function correlation(message: string, key: 'trace' | 'request') {
  return message.match(new RegExp(`\\b${key}[_.-]?id\\s*[=:]\\s*["']?([\\w.-]+)`, 'i'))?.[1]
}

function enrich(entry: LogEntry) {
  entry.traceId ||= correlation(entry.message, 'trace')
  entry.requestId ||= correlation(entry.message, 'request')
  const trace = entry.stackTrace || []
  // The last explicit cause is the deepest cause reported, not a diagnosis.
  const causes = trace.filter((line) => /^\s*Caused by:/.test(line))
  entry.rootCause = causes.at(-1)?.trim().replace(/^Caused by:\s*/, '')
    || trace.find((line) => /^\s*[\w.$]+(?:Exception|Error)(?::|$)/.test(line))?.trim()
}

export function groupLogErrors(entries: LogEntry[]): LogErrorGroup[] {
  const groups = new Map<string, LogErrorGroup>()
  for (const entry of entries) {
    if (entry.level !== 'ERROR') continue
    const cause = entry.rootCause || entry.message
    const logger = entry.logger || ''
    const signature = JSON.stringify([logger, cause])
    const group = groups.get(signature)
    if (group) {
      group.count += 1
      group.lines.push(entry.line)
    } else {
      groups.set(signature, { signature, cause, logger, count: 1, lines: [entry.line] })
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.lines[0] - b.lines[0])
}

export function analyzeLogText(
  input: string,
  filterLevel: string,
  searchTerm: string,
  onProgress?: (progress: number) => void,
  correlationId = '',
): LogAnalysisResult {
  const lines = input.split('\n')
  const entries: LogEntry[] = []
  let currentEntry: LogEntry | null = null
  const levels = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 }
  const updateInterval = Math.max(1, Math.floor(lines.length / 100))
  let unparsedLines = 0
  const flush = () => {
    if (!currentEntry) return
    enrich(currentEntry)
    entries.push(currentEntry)
    currentEntry = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, '').replace(/\u001b\[[0-9;]*m/g, '')
    if (index % updateInterval === 0 || index === lines.length - 1) {
      onProgress?.(Math.min(99, Math.round(((index + 1) / Math.max(lines.length, 1)) * 100)))
    }
    if (!line.trim()) continue

    try {
      const json = JSON.parse(line) as Record<string, unknown>
      if (!json || typeof json !== 'object' || Array.isArray(json)
        || !['message', 'msg', 'level', 'log.level', '@timestamp', 'timestamp'].some((key) => key in json)) throw new Error('Not a log record')
      const rawLevel = String(json.level || json['log.level'] || 'INFO').toUpperCase()
      const level = rawLevel === 'WARNING' ? 'WARN' : rawLevel === 'FATAL' ? 'ERROR' : rawLevel
      flush()
      if (Object.hasOwn(levels, level)) levels[level as keyof typeof levels] += 1
      currentEntry = {
        line: index + 1,
        level,
        timestamp: String(json['@timestamp'] || json.timestamp || ''),
        message: textValue(json.message ?? json.msg) ?? line,
        stackTrace: String(json.stack_trace || json.stackTrace || json['error.stack_trace'] || '').split(/\r?\n/).filter(Boolean),
        logger: textValue(json.logger_name ?? json.logger ?? json['log.logger']),
        traceId: textValue(json.traceId ?? json.trace_id ?? json['trace.id']),
        requestId: textValue(json.requestId ?? json.request_id ?? json['request.id']),
      }
      continue
    } catch {
      // Fall through to the standard text log parser.
    }

    const match = line.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(.+)/)
    if (match) {
      flush()
      const [, timestamp, level, message] = match
      levels[level as keyof typeof levels] += 1
      const logger = message.match(/\]\s+([\w.$]+)\s*:/)?.[1]
      currentEntry = { line: index + 1, level, timestamp, message, logger, stackTrace: [] }
    } else if (currentEntry) {
      currentEntry.stackTrace?.push(line)
    } else {
      unparsedLines += 1
    }
  }

  flush()
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filtered = entries.filter((entry) => {
    if (filterLevel !== 'ALL' && entry.level !== filterLevel) return false
    const id = correlationId.trim()
    if (id && entry.traceId !== id && entry.requestId !== id) return false
    if (!normalizedSearch) return true
    return [entry.message, entry.logger, entry.traceId, entry.requestId, entry.rootCause, ...(entry.stackTrace || [])]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  })

  onProgress?.(100)
  return { entries: filtered, errorGroups: groupLogErrors(filtered), stats: { total: entries.length, filtered: filtered.length, unparsedLines, ...levels } }
}
