'use client'

import { useState, useCallback, useRef, useMemo } from 'react'

// Inline SQL extraction logic
function extractSQL(input: string): { sql: string; lines: number } {
  const lines = input.split('\n')
  const sqlLines: string[] = []
  const bindings: Array<{ index: number; value: string }> = []
  let inSQL = false
  let lineCount = 0

  lines.forEach(line => {
    const bindMatch = line.match(/binding parameter \[(\d+)\] as \[.*?\] - \[(.+?)\]/)
    if (bindMatch) {
      bindings.push({ index: parseInt(bindMatch[1]), value: bindMatch[2] })
      return
    }

    let cleaned = line
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.,]\d+Z?\s+/, '')
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+\s+/, '')
      .replace(/^\[.*?\]\s*/, '')
      .replace(/^(INFO|DEBUG|WARN|ERROR|TRACE)\s*:\s*/i, '')
      .replace(/^.*?:\s*Executing\s+SQL:\s*/i, '')
      .replace(/^.*?---\s+\[.*?\]\s+/, '')
      .replace(/^Hibernate:\s*/i, '')
      .replace(/^.*?SQL:\s*/i, '')
      .trim()

    if (/^(select|insert|update|delete|create|alter|drop|with|merge)\b/i.test(cleaned)) {
      inSQL = true
    }

    if (inSQL && cleaned) {
      sqlLines.push(cleaned)
      lineCount++

      if (cleaned.endsWith(';') || /rows only$/i.test(cleaned) || /fetch first/i.test(cleaned)) {
        inSQL = false
      }
    }
  })

  let sql = sqlLines.join('\n')

  if (bindings.length > 0) {
    bindings.sort((a, b) => a.index - b.index)
    bindings.forEach(binding => {
      const value = binding.value
      let formattedValue: string

      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        const cleanDate = value.replace('T', ' ').replace(/\[.*?\]$/, '')
        formattedValue = `TIMESTAMP '${cleanDate}'`
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        formattedValue = value
      } else {
        formattedValue = `'${value.replace(/'/g, "''")}'`
      }

      sql = sql.replace('?', formattedValue)
    })
  }

  return { sql, lines: lineCount }
}

function formatSQL(sql: string): string {
  let formatted = sql.replace(/\s+/g, ' ').trim()

  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
    'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
    'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE', 'ALTER', 'DROP', 'WITH'
  ]

  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
    formatted = formatted.replace(regex, `\n${keyword}`)
  })

  formatted = formatted.replace(/SELECT\s+/gi, 'SELECT\n  ')
  formatted = formatted.replace(/,\s*(?![^()]*\))/g, ',\n  ')
  formatted = formatted.replace(/\bAND\b/gi, '\n  AND')
  formatted = formatted.replace(/\bOR\b/gi, '\n  OR')
  formatted = formatted.replace(/\bON\b/gi, '\n    ON')

  formatted = formatted
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')

  return formatted
}

export default function SQLExtractor() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [stats, setStats] = useState({ lines: 0, size: 0, time: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExtractSQL = useCallback(() => {
    if (!input.trim()) return
    
    setIsProcessing(true)
    const startTime = performance.now()
    
    // Use requestIdleCallback for better performance
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        const result = extractSQL(input)
        const endTime = performance.now()
        
        setOutput(result.sql)
        setStats({
          lines: result.lines,
          size: result.sql.length,
          time: endTime - startTime
        })
        setIsProcessing(false)
      })
    } else {
      setTimeout(() => {
        const result = extractSQL(input)
        const endTime = performance.now()
        
        setOutput(result.sql)
        setStats({
          lines: result.lines,
          size: result.sql.length,
          time: endTime - startTime
        })
        setIsProcessing(false)
      }, 10)
    }
  }, [input])

  const handleFormatSQL = useCallback(() => {
    if (!output.trim()) return
    
    setIsProcessing(true)
    
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        const formatted = formatSQL(output)
        
        setOutput(formatted)
        setStats(prev => ({
          ...prev,
          lines: formatted.split('\n').length,
          size: formatted.length
        }))
        setIsProcessing(false)
      })
    } else {
      setTimeout(() => {
        const formatted = formatSQL(output)
        
        setOutput(formatted)
        setStats(prev => ({
          ...prev,
          lines: formatted.split('\n').length,
          size: formatted.length
        }))
        setIsProcessing(false)
      }, 10)
    }
  }, [output])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 50 * 1024 * 1024) {
      alert('File too large! Maximum size is 50MB')
      return
    }

    setIsProcessing(true)
    setStats({ lines: 0, size: 0, time: 0 })
    
    const reader = new FileReader()

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = (event.loaded / event.total) * 100
        setStats(prev => ({ ...prev, time: percentComplete }))
      }
    }

    reader.onload = (event) => {
      const text = event.target?.result as string
      setInput(text)
      setIsProcessing(false)
      setStats({ lines: 0, size: 0, time: 0 })
    }

    reader.onerror = () => {
      alert('Error reading file')
      setIsProcessing(false)
    }

    reader.readAsText(file)
  }, [])

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(output)
  }, [output])

  const downloadSQL = useCallback(() => {
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extracted-sql-${Date.now()}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }, [output])

  // Show file size warning
  const fileSizeWarning = useMemo(() => {
    const sizeInMB = input.length / (1024 * 1024)
    if (sizeInMB > 10) {
      return `⚠️ Large file (${sizeInMB.toFixed(1)}MB) - scrolling may be slow`
    }
    return null
  }, [input.length])

  return (
    <div className="p-4 max-w-full mx-auto">
      {/* Stats Bar with Loading */}
      {(stats.lines > 0 || isProcessing) && (
        <div className="mb-4 p-3 bg-surface-container rounded-lg flex gap-6 text-sm text-on-surface-variant">
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <strong className="text-on-surface">
                {stats.time > 0 && stats.time < 100 ? `Loading... ${stats.time.toFixed(0)}%` : 'Processing...'}
              </strong>
            </span>
          ) : (
            <>
              <span>Lines: <strong className="text-on-surface">{stats.lines.toLocaleString()}</strong></span>
              <span>Size: <strong className="text-on-surface">{(stats.size / 1024).toFixed(2)} KB</strong></span>
              <span>Time: <strong className="text-on-surface">{stats.time.toFixed(2)} ms</strong></span>
            </>
          )}
        </div>
      )}

      {/* File Size Warning */}
      {fileSizeWarning && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          {fileSizeWarning}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden">
          <div className="bg-surface-container px-4 py-3 flex justify-between items-center">
            <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">
              Input (Logs/Code)
            </h3>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.log,.sql"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
              >
                Upload File
              </button>
              <button
                onClick={() => setInput('')}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste logs, code, or text containing SQL statements... (or upload a file)"
              className="w-full h-96 p-3 border border-outline-variant/15 rounded-lg bg-surface-container-lowest font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-on-surface placeholder-on-surface-variant/50"
              disabled={isProcessing}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              style={{ willChange: 'scroll-position' }}
            />
            
            <button
              onClick={handleExtractSQL}
              disabled={isProcessing || !input.trim()}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded-lg hover:bg-primary/90 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Extract SQL'}
            </button>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden">
          <div className="bg-surface-container px-4 py-3 flex justify-between items-center">
            <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">
              Extracted SQL
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleFormatSQL}
                disabled={isProcessing || !output.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
              >
                Format
              </button>
              <button
                onClick={copyToClipboard}
                disabled={!output.trim()}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium transition-colors disabled:opacity-50"
              >
                Copy
              </button>
              <button
                onClick={downloadSQL}
                disabled={!output.trim()}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 font-medium transition-colors disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>
          
          <div className="p-4">
            <textarea
              value={output}
              readOnly
              placeholder="Extracted SQL will appear here..."
              className="w-full h-96 p-3 border border-outline-variant/15 rounded-lg bg-surface-container-lowest font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-on-surface placeholder-on-surface-variant/50"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              style={{ willChange: 'scroll-position' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
