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
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large! Maximum size is 20MB. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      e.target.value = ''
      return
    }

    setError('')
    setUploadProgress(0)
    const reader = new FileReader()
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100)
        setUploadProgress(progress)
      }
    }
    
    reader.onload = (event) => {
      setInput(event.target?.result as string)
      setUploadProgress(100)
      setTimeout(() => setUploadProgress(0), 1000)
    }
    
    reader.onerror = () => {
      setError('Error reading file')
      setUploadProgress(0)
    }
    
    reader.readAsText(file)
  }

  const analyzeLogs = () => {
    setLoading(true)
    setError('')
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
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
      } catch (err) {
        setError('Error parsing logs: ' + (err as Error).message)
      } finally {
        setLoading(false)
      }
    }, 100)
  }

  const loadSample = () => {
    const sample = `2026-04-06T04:56:28.540Z ERROR 72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Error: 904, SQLState: 42000
2026-04-06T04:56:28.540Z ERROR 72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : ORA-00904: "E2_0"."ZONE": invalid identifier
2026-04-06T04:56:28.541Z WARN  72378 --- [nio-8088-exec-1] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Warning Code: -1, SQLState: null
2026-04-06T04:56:28.541Z INFO  72378 --- [nio-8088-exec-1] c.e.service.EventService                  : Processing event batch: 20 items
2026-04-06T04:56:28.542Z DEBUG 72378 --- [nio-8088-exec-1] o.h.SQL                                   : select e1_0.event_id from events e1_0`
    setInput(sample)
  }

  const exportResults = () => {
    const text = results.map(entry => {
      let output = `[${entry.level}] ${entry.timestamp}\nLine ${entry.line}: ${entry.message}`
      if (entry.stackTrace && entry.stackTrace.length > 0) {
        output += '\n' + entry.stackTrace.join('\n')
      }
      return output
    }).join('\n\n---\n\n')
    
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `log-analysis-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyEntry = (entry: LogEntry) => {
    let text = `[${entry.level}] ${entry.timestamp}\nLine ${entry.line}: ${entry.message}`
    if (entry.stackTrace && entry.stackTrace.length > 0) {
      text += '\n' + entry.stackTrace.join('\n')
    }
    navigator.clipboard.writeText(text)
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[600px] lg:h-[calc(100vh-200px)]">
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
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm">
                <span className="mr-2">⚠</span>{error}
              </div>
            )}
            
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-warm-600 mb-1">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-warm-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            <div className="mb-3">
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Upload Log File (Max 20MB)
              </label>
              <input
                type="file"
                accept=".log,.txt,.json"
                onChange={handleFileUpload}
                className="block w-full text-sm text-warm-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90 cursor-pointer"
              />
            </div>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Spring Boot logs here or upload a file..."
              className="w-full h-64 md:h-96 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
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
              disabled={loading}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded hover:bg-primary/90 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Analyzing...</span>
                </>
              ) : (
                'Analyze Logs'
              )}
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Results</h3>
            {results.length > 0 && (
              <button
                onClick={exportResults}
                className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
            )}
          </div>
          
          <div className="p-4 overflow-auto h-full">
            {results.length === 0 ? (
              <div className="h-full flex items-center justify-center text-warm-400">
                <p className="text-sm font-serif">No logs to display</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((entry, idx) => (
                  <div key={idx} className="bg-white rounded border border-warm-300/60 p-3 relative group">
                    <button
                      onClick={() => copyEntry(entry)}
                      className="absolute top-2 right-2 p-1.5 rounded hover:bg-warm-100 text-warm-600 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy to clipboard"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
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
                      <span className="text-xs text-warm-600 font-mono font-bold">{entry.timestamp}</span>
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
