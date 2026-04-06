'use client'

import { useState } from 'react'

interface LogEntry {
  line: number
  level: string
  timestamp: string
  message: string
  stackTrace?: string[]
}

export default function LogAnalyzer() {
  const [input, setInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('ALL')
  const [results, setResults] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<any>(null)

  const analyzeLogs = () => {
    const lines = input.split('\n')
    const entries: LogEntry[] = []
    let currentEntry: LogEntry | null = null
    
    const levels = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 }
    
    lines.forEach((line, index) => {
      if (!line.trim()) return
      
      // Try JSON format first (Logstash/ELK)
      try {
        const json = JSON.parse(line)
        const level = (json.level || 'INFO').toUpperCase()
        if (levels.hasOwnProperty(level)) {
          levels[level as keyof typeof levels]++
        }
        
        entries.push({
          line: index + 1,
          level,
          timestamp: json['@timestamp'] || json.timestamp || '',
          message: json.message || line,
          stackTrace: json.stack_trace ? [json.stack_trace] : []
        })
        return
      } catch (e) {
        // Not JSON, try standard log format
      }
      
      // Detect standard log line (timestamp + level)
      const logMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.,]\d+)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+(.+)/)
      
      if (logMatch) {
        // Save previous entry
        if (currentEntry) {
          entries.push(currentEntry)
        }
        
        const [, timestamp, level, message] = logMatch
        levels[level as keyof typeof levels]++
        
        currentEntry = {
          line: index + 1,
          level,
          timestamp,
          message,
          stackTrace: []
        }
      } else if (currentEntry && line.trim()) {
        // Stack trace or continuation
        currentEntry.stackTrace!.push(line)
      }
    })
    
    // Save last entry
    if (currentEntry) {
      entries.push(currentEntry)
    }
    
    // Filter by level
    let filtered = entries
    if (filterLevel !== 'ALL') {
      filtered = entries.filter(e => e.level === filterLevel)
    }
    
    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(e => 
        e.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.stackTrace?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    }
    
    setResults(filtered)
    setStats({
      total: entries.length,
      ...levels,
      filtered: filtered.length
    })
  }

  const loadSample = () => {
    const sample = `2026-04-06T04:56:28.540Z ERROR 72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Error: 904, SQLState: 42000
2026-04-06T04:56:28.540Z ERROR 72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : ORA-00904: "E2_0"."ZONE": invalid identifier
2026-04-06T04:56:28.541Z WARN  72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Warning Code: -1, SQLState: null
2026-04-06T04:56:28.541Z INFO  72378 --- [nio-8088-exec-1] c.e.service.EventService                  : Processing event batch: 20 items
2026-04-06T04:56:28.542Z DEBUG 72378 --- [nio-8088-exec-1] o.h.SQL                                   : select e1_0.event_id from events e1_0`
    setInput(sample)
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3 mb-4">
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">Total</div>
            <div className="text-2xl font-serif font-semibold text-warm-800">{stats.total}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">Filtered</div>
            <div className="text-2xl font-serif font-semibold text-primary">{stats.filtered}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">ERROR</div>
            <div className="text-2xl font-serif font-semibold text-red-600">{stats.ERROR}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">WARN</div>
            <div className="text-2xl font-serif font-semibold text-orange-600">{stats.WARN}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">INFO</div>
            <div className="text-2xl font-serif font-semibold text-blue-600">{stats.INFO}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">DEBUG</div>
            <div className="text-2xl font-serif font-semibold text-gray-600">{stats.DEBUG}</div>
          </div>
          <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
            <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">TRACE</div>
            <div className="text-2xl font-serif font-semibold text-gray-500">{stats.TRACE}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Log File</h3>
            <button
              onClick={loadSample}
              className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
            >
              Load Sample
            </button>
          </div>
          
          <div className="p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Spring Boot logs here..."
              className="w-full h-96 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
            />
            
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search keyword..."
                className="flex-1 p-2 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent text-warm-800 placeholder-warm-400"
              />
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="p-2 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent text-warm-800"
              >
                <option value="ALL">All Levels</option>
                <option value="ERROR">ERROR</option>
                <option value="WARN">WARN</option>
                <option value="INFO">INFO</option>
                <option value="DEBUG">DEBUG</option>
                <option value="TRACE">TRACE</option>
              </select>
            </div>
            
            <button
              onClick={analyzeLogs}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded hover:bg-primary/90 font-semibold transition-colors shadow-warm"
            >
              Analyze Logs
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Results</h3>
          </div>
          
          <div className="p-4 overflow-auto h-[500px]">
            {results.length === 0 ? (
              <div className="h-full flex items-center justify-center text-warm-400">
                <p className="text-sm font-serif">No logs to display</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((entry, idx) => (
                  <div key={idx} className="bg-white rounded border border-warm-300/60 p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        entry.level === 'ERROR' ? 'bg-red-100 text-red-700' :
                        entry.level === 'WARN' ? 'bg-orange-100 text-orange-700' :
                        entry.level === 'INFO' ? 'bg-blue-100 text-blue-700' :
                        entry.level === 'DEBUG' ? 'bg-gray-100 text-gray-700' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {entry.level}
                      </span>
                      <span className="text-xs text-warm-600 font-mono">{entry.timestamp}</span>
                      <span className="text-xs text-warm-500 ml-auto">Line {entry.line}</span>
                    </div>
                    <div className="text-sm font-mono text-warm-800 mb-2">{entry.message}</div>
                    {entry.stackTrace && entry.stackTrace.length > 0 && (
                      <details className="text-xs font-mono text-warm-600">
                        <summary className="cursor-pointer hover:text-primary">Stack trace ({entry.stackTrace.length} lines)</summary>
                        <pre className="mt-2 p-2 bg-warm-100 rounded overflow-x-auto">
                          {entry.stackTrace.join('\n')}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
