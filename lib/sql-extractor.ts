export interface SqlExtractionResult {
  sql: string
  lines: number
}

export function extractSQL(input: string): SqlExtractionResult {
  const lines = input.split('\n')
  const sqlLines: string[] = []
  const bindings: Array<{ index: number; value: string }> = []
  let inSQL = false
  let lineCount = 0

  lines.forEach((line) => {
    const bindMatch = line.match(/binding parameter \[(\d+)\] as \[.*?\] - \[(.+?)\]/)
    if (bindMatch) {
      bindings.push({ index: parseInt(bindMatch[1]), value: bindMatch[2] })
      return
    }

    const cleaned = line
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?\s+/, '')
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+\s+/, '')
      .replace(/^\[.*?\]\s*/, '')
      .replace(/^(INFO|DEBUG|WARN|ERROR|TRACE)\s*:\s*/i, '')
      .replace(/^.*?:\s*Executing\s+SQL:\s*/i, '')
      .replace(/^.*?---\s+\[.*?\]\s+/, '')
      .replace(/^Hibernate:\s*/i, '')
      .replace(/^.*?SQL\s*:\s*/i, '')
      .trim()

    if (/^(select|insert|update|delete|create|alter|drop|with|merge)\b/i.test(cleaned)) inSQL = true

    if (inSQL && cleaned) {
      sqlLines.push(cleaned)
      lineCount += 1
      if (cleaned.endsWith(';') || /rows only$/i.test(cleaned) || /fetch first/i.test(cleaned)) inSQL = false
    }
  })

  let sql = sqlLines.join('\n')
  bindings.sort((a, b) => a.index - b.index).forEach((binding) => {
    let formattedValue: string
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(binding.value)) {
      formattedValue = `TIMESTAMP '${binding.value.replace('T', ' ').replace(/\[.*?\]$/, '')}'`
    } else if (/^-?\d+(\.\d+)?$/.test(binding.value)) {
      formattedValue = binding.value
    } else {
      formattedValue = `'${binding.value.replace(/'/g, "''")}'`
    }
    sql = sql.replace('?', formattedValue)
  })

  return { sql, lines: lineCount }
}

export function formatSQL(sql: string) {
  let formatted = sql.replace(/\s+/g, ' ').trim()
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
    'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
    'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE', 'ALTER', 'DROP', 'WITH',
  ]

  keywords.forEach((keyword) => {
    formatted = formatted.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), `\n${keyword}`)
  })

  return formatted
    .replace(/SELECT\s+/gi, 'SELECT\n  ')
    .replace(/,\s*(?![^()]*\))/g, ',\n  ')
    .replace(/\bAND\b/gi, '\n  AND')
    .replace(/\bOR\b/gi, '\n  OR')
    .replace(/\bON\b/gi, '\n    ON')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}
