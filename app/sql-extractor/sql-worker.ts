// Web Worker for SQL extraction and formatting
// Runs in background thread to avoid blocking UI

interface ExtractMessage {
  type: 'extract'
  input: string
  startTime: number
}

interface FormatMessage {
  type: 'format'
  sql: string
}

type WorkerMessage = ExtractMessage | FormatMessage

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data

  if (type === 'extract') {
    const { input, startTime } = e.data as ExtractMessage
    const result = extractSQL(input)
    const endTime = performance.now()
    
    self.postMessage({
      type: 'result',
      sql: result.sql,
      stats: {
        lines: result.lines,
        size: result.sql.length,
        time: endTime - startTime
      }
    })
  } else if (type === 'format') {
    const { sql } = e.data as FormatMessage
    const formatted = formatSQL(sql)
    
    self.postMessage({
      type: 'result',
      sql: formatted,
      stats: {
        lines: formatted.split('\n').length,
        size: formatted.length,
        time: 0
      }
    })
  }
}

function extractSQL(input: string): { sql: string; lines: number } {
  const lines = input.split('\n')
  const sqlLines: string[] = []
  const bindings: Array<{ index: number; value: string }> = []
  let inSQL = false
  let lineCount = 0

  // Process in chunks for better performance
  const CHUNK_SIZE = 1000
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE)
    
    chunk.forEach(line => {
      // Extract binding parameters
      const bindMatch = line.match(/binding parameter \[(\d+)\] as \[.*?\] - \[(.+?)\]/)
      if (bindMatch) {
        bindings.push({ index: parseInt(bindMatch[1]), value: bindMatch[2] })
        return
      }

      // Remove common prefixes (timestamps, log levels, etc.)
      let cleaned = line
        .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?\s+/, '') // ISO timestamp
        .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+\s+/, '') // timestamp
        .replace(/^\[.*?\]\s*/, '') // [INFO], [DEBUG], etc.
        .replace(/^(INFO|DEBUG|WARN|ERROR|TRACE)\s*:\s*/i, '') // log level
        .replace(/^.*?:\s*Executing\s+SQL:\s*/i, '') // "Executing SQL:"
        .replace(/^.*?---\s+\[.*?\]\s+/, '') // Spring Boot format
        .replace(/^Hibernate:\s*/i, '') // Hibernate prefix
        .replace(/^.*?SQL:\s*/i, '') // Generic SQL: prefix
        .trim()

      // Detect SQL keywords
      if (/^(select|insert|update|delete|create|alter|drop|with|merge)\b/i.test(cleaned)) {
        inSQL = true
      }

      if (inSQL && cleaned) {
        sqlLines.push(cleaned)
        lineCount++

        // End of SQL statement
        if (cleaned.endsWith(';') || /rows only$/i.test(cleaned) || /fetch first/i.test(cleaned)) {
          inSQL = false
        }
      }
    })
  }

  let sql = sqlLines.join('\n')

  // Replace ? with binding values
  if (bindings.length > 0) {
    bindings.sort((a, b) => a.index - b.index)
    bindings.forEach(binding => {
      const value = binding.value
      let formattedValue: string

      // Check if it's a timestamp/date
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        // Convert ISO timestamp to Oracle TIMESTAMP format
        const cleanDate = value.replace('T', ' ').replace(/\[.*?\]$/, '')
        formattedValue = `TIMESTAMP '${cleanDate}'`
      }
      // Check if it's a number
      else if (/^-?\d+(\.\d+)?$/.test(value)) {
        formattedValue = value
      }
      // String value
      else {
        formattedValue = `'${value.replace(/'/g, "''")}'` // Escape single quotes
      }

      sql = sql.replace('?', formattedValue)
    })
  }

  return { sql, lines: lineCount }
}

function formatSQL(sql: string): string {
  // Advanced SQL formatting with proper indentation
  let formatted = sql
    .replace(/\s+/g, ' ') // normalize whitespace
    .trim()

  // Keywords that should start new lines
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
    'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
    'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE', 'ALTER', 'DROP',
    'WITH'
  ]

  // Add newlines before major keywords
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
    formatted = formatted.replace(regex, `\n${keyword}`)
  })

  // Format SELECT columns
  formatted = formatted.replace(/SELECT\s+/gi, 'SELECT\n  ')
  formatted = formatted.replace(/,\s*(?![^()]*\))/g, ',\n  ')

  // Format WHERE conditions
  formatted = formatted.replace(/\bAND\b/gi, '\n  AND')
  formatted = formatted.replace(/\bOR\b/gi, '\n  OR')

  // Format JOIN conditions
  formatted = formatted.replace(/\bON\b/gi, '\n    ON')

  // Clean up extra whitespace
  formatted = formatted
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')

  // Add proper indentation
  const lines = formatted.split('\n')
  let indentLevel = 0
  const indented: string[] = []

  lines.forEach(line => {
    const trimmed = line.trim()
    
    // Decrease indent for closing keywords
    if (/^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|UNION)/i.test(trimmed)) {
      indentLevel = 0
    }

    // Add indentation
    const indent = '  '.repeat(Math.max(0, indentLevel))
    indented.push(indent + trimmed)

    // Increase indent after SELECT, JOIN
    if (/^(SELECT|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN)/i.test(trimmed)) {
      indentLevel = 1
    }
  })

  return indented.join('\n')
}

export {}
