export interface LogEntry {
  line: number
  level: string
  timestamp: string
  message: string
  stackTrace?: string[]
}

export interface LogStats {
  total: number
  filtered: number
  ERROR: number
  WARN: number
  INFO: number
  DEBUG: number
  TRACE: number
}

export interface LogAnalysisResult {
  entries: LogEntry[]
  stats: LogStats
}

export function analyzeLogText(
  input: string,
  filterLevel: string,
  searchTerm: string,
  onProgress?: (progress: number) => void,
): LogAnalysisResult {
  const lines = input.split('\n')
  const entries: LogEntry[] = []
  let currentEntry: LogEntry | null = null
  const levels = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 }
  const updateInterval = Math.max(1, Math.floor(lines.length / 100))

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (index % updateInterval === 0 || index === lines.length - 1) {
      onProgress?.(Math.min(99, Math.round(((index + 1) / Math.max(lines.length, 1)) * 100)))
    }
    if (!line.trim()) continue

    try {
      const json = JSON.parse(line) as Record<string, unknown>
      const level = String(json.level || 'INFO').toUpperCase()
      if (level in levels) levels[level as keyof typeof levels] += 1
      entries.push({
        line: index + 1,
        level,
        timestamp: String(json['@timestamp'] || json.timestamp || ''),
        message: String(json.message || line),
        stackTrace: json.stack_trace ? [String(json.stack_trace)] : [],
      })
      continue
    } catch {
      // Fall through to the standard text log parser.
    }

    const match = line.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.,]\d+)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(.+)/)
    if (match) {
      if (currentEntry) entries.push(currentEntry)
      const [, timestamp, level, message] = match
      levels[level as keyof typeof levels] += 1
      currentEntry = { line: index + 1, level, timestamp, message, stackTrace: [] }
    } else if (currentEntry) {
      currentEntry.stackTrace?.push(line)
    }
  }

  if (currentEntry) entries.push(currentEntry)
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filtered = entries.filter((entry) => {
    if (filterLevel !== 'ALL' && entry.level !== filterLevel) return false
    if (!normalizedSearch) return true
    return entry.message.toLowerCase().includes(normalizedSearch) || entry.stackTrace?.some((line) => line.toLowerCase().includes(normalizedSearch))
  })

  onProgress?.(100)
  return { entries: filtered, stats: { total: entries.length, filtered: filtered.length, ...levels } }
}
