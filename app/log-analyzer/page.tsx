'use client'

import { useState, useEffect } from 'react'

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
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [utcPlus7, setUtcPlus7] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

  // Render single log entry
  const renderLogEntry = (entry: LogEntry, idx: number) => (
    <div key={idx} className="bg-white rounded border border-warm-300/60 p-3 relative group mb-3">
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
        <span className="text-xs text-warm-600 font-mono font-bold">{utcPlus7 ? convertToUTC7(entry.timestamp) : entry.timestamp}</span>
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
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter: Analyze logs
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!loading && input) {
          analyzeLogs()
        }
      }
      
      // Ctrl+K or Cmd+K: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
        searchInput?.focus()
        searchInput?.select()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading, input])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processFile(file)
  }

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large! Maximum size is 50MB. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }

    setError('')
    setUploadProgress(1) // Start at 1% to ensure visibility
    const startTime = Date.now()
    const reader = new FileReader()
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100)
        setUploadProgress(Math.max(1, progress)) // Never go below 1%
      }
    }
    
    reader.onload = (event) => {
      setInput(event.target?.result as string)
      setUploadProgress(100)
      
      // Ensure progress bar shows for at least 500ms
      const elapsed = Date.now() - startTime
      const minDelay = Math.max(500 - elapsed, 0)
      
      setTimeout(() => setUploadProgress(0), minDelay + 1000)
    }
    
    reader.onerror = () => {
      setError('Error reading file')
      setUploadProgress(0)
    }
    
    reader.readAsText(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const analyzeLogs = () => {
    setLoading(true)
    setError('')
    setAnalyzeProgress(1) // Start at 1% for visibility
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const lines = input.split('\n')
        const entries: LogEntry[] = []
        let currentEntry: LogEntry | null = null
        
        const levels = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 }
        
        const totalLines = lines.length
        let processedLines = 0
        
        // Calculate update interval based on file size
        const updateInterval = Math.max(1, Math.floor(totalLines / 100)) // Update every 1%
        
        // Simple loop - faster than forEach for large arrays
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index]
          processedLines++
          
          // Update progress at calculated intervals
          if (processedLines % updateInterval === 0 || processedLines === totalLines) {
            const progress = Math.min(99, Math.round((processedLines / totalLines) * 100))
            setAnalyzeProgress(progress)
          }
          
          if (!line.trim()) continue
          
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
            continue
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
        }
        
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
        setAnalyzeProgress(100)
        setTimeout(() => setAnalyzeProgress(0), 1000)
      } catch (err) {
        setError('Error parsing logs: ' + (err as Error).message)
        setAnalyzeProgress(0)
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
    const displayTimestamp = utcPlus7 ? convertToUTC7(entry.timestamp) : entry.timestamp
    let text = `[${entry.level}] ${displayTimestamp}\nLine ${entry.line}: ${entry.message}`
    if (entry.stackTrace && entry.stackTrace.length > 0) {
      text += '\n' + entry.stackTrace.join('\n')
    }
    navigator.clipboard.writeText(text)
  }

  const convertToUTC7 = (timestamp: string): string => {
    if (!timestamp) return timestamp
    try {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return timestamp
      
      // Get UTC time in milliseconds and add 7 hours (7 * 60 * 60 * 1000)
      const utc7Time = new Date(date.getTime() + (7 * 60 * 60 * 1000))
      
      // Format: YYYY-MM-DD HH:mm:ss.SSS (UTC+7)
      const year = utc7Time.getUTCFullYear()
      const month = String(utc7Time.getUTCMonth() + 1).padStart(2, '0')
      const day = String(utc7Time.getUTCDate()).padStart(2, '0')
      const hours = String(utc7Time.getUTCHours()).padStart(2, '0')
      const minutes = String(utc7Time.getUTCMinutes()).padStart(2, '0')
      const seconds = String(utc7Time.getUTCSeconds()).padStart(2, '0')
      const ms = String(utc7Time.getUTCMilliseconds()).padStart(3, '0')
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms} (UTC+7)`
    } catch (e) {
      return timestamp
    }
  }

  const clearAll = () => {
    setInput('')
    setSearchTerm('')
    setFilterLevel('ALL')
    setResults([])
    setStats(null)
    setError('')
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
            
            {analyzeProgress > 0 && analyzeProgress < 100 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-warm-600 mb-1">
                  <span>Analyzing logs...</span>
                  <span>{analyzeProgress}%</span>
                </div>
                <div className="w-full bg-warm-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300 ease-out"
                    style={{ width: `${analyzeProgress}%` }}
                  />
                </div>
              </div>
            )}
            
            <div className="mb-3">
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Upload Log File (Max 50MB)
              </label>
              
              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[1.02]'
                    : 'border-warm-300 hover:border-primary hover:bg-warm-50'
                }`}
              >
                <input
                  type="file"
                  accept=".log,.txt,.json"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <div className="pointer-events-none">
                  <svg
                    className={`mx-auto h-12 w-12 mb-3 transition-colors ${
                      isDragging ? 'text-primary' : 'text-warm-400'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  
                  <p className={`text-sm font-medium mb-1 ${
                    isDragging ? 'text-primary' : 'text-warm-700'
                  }`}>
                    {isDragging ? 'Drop file here' : 'Drag & drop your log file here'}
                  </p>
                  
                  <p className="text-xs text-warm-500">
                    or click to browse • .log, .txt, .json • Max 50MB
                  </p>
                </div>
              </div>
            </div>
            
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Spring Boot logs here or upload a file..."
              className="w-full h-48 md:h-64 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
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
            
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button
                onClick={analyzeLogs}
                disabled={loading}
                data-analyze
                className="flex-1 bg-primary text-white py-3 sm:py-2.5 rounded hover:bg-primary/90 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
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
              
              <button
                onClick={clearAll}
                disabled={loading || (!input && results.length === 0)}
                className="sm:w-auto w-full px-6 bg-warm-200 text-warm-800 py-3 sm:py-2.5 rounded hover:bg-warm-300 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
                title="Clear all data"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            </div>
            
            <p className="mt-2 text-xs text-warm-500 text-center hidden sm:block">
              💡 Tip: Press <kbd className="px-2 py-1 bg-warm-100 border border-warm-300 rounded text-warm-700 font-mono">Ctrl+Enter</kbd> to analyze, <kbd className="px-2 py-1 bg-warm-100 border border-warm-300 rounded text-warm-700 font-mono">Ctrl+K</kbd> to search
            </p>
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Results</h3>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {results.length > 0 && (
                <>
                  <label className="flex items-center gap-2 text-xs sm:text-sm text-warm-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={utcPlus7}
                      onChange={(e) => setUtcPlus7(e.target.checked)}
                      className="rounded border-warm-300 text-primary focus:ring-primary w-4 h-4"
                    />
                    <span className="font-medium">UTC+7</span>
                  </label>
                  <button
                    onClick={exportResults}
                    className="text-xs sm:text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1 active:scale-95 transition-transform px-2 py-1 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="p-4 overflow-auto h-full">
            {results.length === 0 ? (
              <div className="h-full flex items-center justify-center text-warm-400">
                <p className="text-sm font-serif">No logs to display</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((entry, idx) => renderLogEntry(entry, idx))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
