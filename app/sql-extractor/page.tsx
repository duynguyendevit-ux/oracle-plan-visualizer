'use client'

import { useState } from 'react'

export default function SQLExtractor() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  const extractSQL = () => {
    // Extract SQL from various formats (logs, code, etc.)
    const lines = input.split('\n')
    const sqlLines: string[] = []
    const bindings: Array<{ index: number, value: string }> = []
    let inSQL = false
    
    lines.forEach(line => {
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
        .trim()
      
      // Detect SQL keywords
      if (/^(select|insert|update|delete|create|alter|drop|with)\b/i.test(cleaned)) {
        inSQL = true
      }
      
      if (inSQL && cleaned) {
        sqlLines.push(cleaned)
        
        // End of SQL statement
        if (cleaned.endsWith(';') || /rows only$/i.test(cleaned)) {
          inSQL = false
        }
      }
    })
    
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
        else if (/^\d+$/.test(value)) {
          formattedValue = value
        }
        // String value
        else {
          formattedValue = `'${value}'`
        }
        
        sql = sql.replace('?', formattedValue)
      })
    }
    
    setOutput(sql)
  }

  const formatSQL = () => {
    // Basic SQL formatting
    let formatted = output
      .replace(/\s+/g, ' ') // normalize whitespace
      .replace(/\s*,\s*/g, ',\n  ') // commas on new lines
      .replace(/\bFROM\b/gi, '\nFROM')
      .replace(/\bWHERE\b/gi, '\nWHERE')
      .replace(/\bAND\b/gi, '\n  AND')
      .replace(/\bOR\b/gi, '\n  OR')
      .replace(/\bJOIN\b/gi, '\nJOIN')
      .replace(/\bLEFT JOIN\b/gi, '\nLEFT JOIN')
      .replace(/\bRIGHT JOIN\b/gi, '\nRIGHT JOIN')
      .replace(/\bINNER JOIN\b/gi, '\nINNER JOIN')
      .replace(/\bON\b/gi, '\n  ON')
      .replace(/\bGROUP BY\b/gi, '\nGROUP BY')
      .replace(/\bORDER BY\b/gi, '\nORDER BY')
      .replace(/\bHAVING\b/gi, '\nHAVING')
      .replace(/\bLIMIT\b/gi, '\nLIMIT')
      .trim()
    
    setOutput(formatted)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output)
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input Panel */}
        <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden">
          <div className="bg-surface-container px-4 py-3 flex justify-between items-center">
            <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">Input (Logs/Code)</h3>
            <button
              onClick={() => setInput('')}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 font-medium transition-colors"
            >
              Clear
            </button>
          </div>
          
          <div className="p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste logs, code, or text containing SQL statements..."
              className="w-full h-96 p-3 border border-outline-variant/15 rounded-lg bg-surface-container-lowest font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-on-surface placeholder-on-surface-variant/50"
            />
            
            <button
              onClick={extractSQL}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded-lg hover:bg-primary/90 font-semibold transition-colors shadow-warm"
            >
              Extract SQL
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden">
          <div className="bg-surface-container px-4 py-3 flex justify-between items-center">
            <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">Extracted SQL</h3>
            <div className="flex gap-2">
              <button
                onClick={formatSQL}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium transition-colors"
              >
                Format
              </button>
              <button
                onClick={copyToClipboard}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
          
          <div className="p-4">
            <textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              placeholder="Extracted SQL will appear here..."
              className="w-full h-96 p-3 border border-outline-variant/15 rounded-lg bg-surface-container-lowest font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-on-surface placeholder-on-surface-variant/50"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
