'use client'

import { useState } from 'react'

export default function SQLExtractor() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  const extractSQL = () => {
    // Extract SQL from various formats (logs, code, etc.)
    const lines = input.split('\n')
    const sqlLines: string[] = []
    let inSQL = false
    
    lines.forEach(line => {
      // Remove common prefixes (timestamps, log levels, etc.)
      let cleaned = line
        .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d+\s+/, '') // timestamp
        .replace(/^\[.*?\]\s*/, '') // [INFO], [DEBUG], etc.
        .replace(/^(INFO|DEBUG|WARN|ERROR|TRACE)\s*:\s*/i, '') // log level
        .replace(/^.*?:\s*Executing\s+SQL:\s*/i, '') // "Executing SQL:"
        .trim()
      
      // Detect SQL keywords
      if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i.test(cleaned)) {
        inSQL = true
      }
      
      if (inSQL) {
        sqlLines.push(cleaned)
        
        // End of SQL statement
        if (cleaned.endsWith(';')) {
          inSQL = false
        }
      }
    })
    
    setOutput(sqlLines.join('\n'))
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
              className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
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
              className="mt-3 w-full bg-gradient-to-r from-primary to-primary-container text-white py-2.5 rounded-lg hover:opacity-90 font-semibold transition-opacity shadow-editorial"
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
                className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
              >
                Format
              </button>
              <button
                onClick={copyToClipboard}
                className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
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
