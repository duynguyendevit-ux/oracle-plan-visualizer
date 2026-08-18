'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import EmptyState from '@/components/EmptyState'
import { useToolSession } from '@/hooks/useToolSession'
import { useWorkerRpc } from '@/hooks/useWorkerRpc'
import { sendToolTransfer, useToolTransfer } from '@/hooks/useToolTransfer'
import { copyText, toast } from '@/lib/toast'
import type { SqlWorkerRequest, SqlWorkerResult } from '@/workers/sql-extractor.worker'

export default function SQLExtractor() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [stats, setStats] = useState({ lines: 0, size: 0, time: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const runSqlTask = useWorkerRpc<SqlWorkerRequest, SqlWorkerResult>(() => (
    new Worker(new URL('../../workers/sql-extractor.worker.ts', import.meta.url), { type: 'module' })
  ))

  useToolSession('sql-extractor', { input, output, stats }, (saved) => {
    if (typeof saved.input === 'string') setInput(saved.input)
    if (typeof saved.output === 'string') setOutput(saved.output)
    if (saved.stats && typeof saved.stats.lines === 'number' && typeof saved.stats.size === 'number' && typeof saved.stats.time === 'number') {
      setStats(saved.stats)
    }
  }, { maxBytes: 1_000_000 })

  useToolTransfer<{ input?: string }>('sql-extractor', (payload) => {
    if (typeof payload.input !== 'string') return
    setInput(payload.input)
    setOutput('')
    setStats({ lines: 0, size: 0, time: 0 })
    toast.info('Log input received from Log Analyzer')
  })

  const handleExtractSQL = useCallback(async () => {
    if (!input.trim()) return
    setIsProcessing(true)
    const startTime = performance.now()

    try {
      const result = await runSqlTask({ action: 'extract', input })
      if (result.action === 'extract') {
        setOutput(result.sql)
        setStats({
          lines: result.lines,
          size: result.sql.length,
          time: performance.now() - startTime,
        })
      }
    } catch (cause) {
      toast.error('Unable to extract SQL', cause instanceof Error ? cause.message : undefined)
    } finally {
      setIsProcessing(false)
    }
  }, [input, runSqlTask])

  // Keyboard shortcut handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleExtractSQL()
    }
  }, [handleExtractSQL])

  const handleFormatSQL = useCallback(async () => {
    if (!output.trim()) return
    setIsProcessing(true)

    try {
      const result = await runSqlTask({ action: 'format', input: output })
      if (result.action === 'format') {
        setOutput(result.sql)
        setStats(prev => ({
          ...prev,
          lines: result.sql.split('\n').length,
          size: result.sql.length,
        }))
      }
    } catch (cause) {
      toast.error('Unable to format SQL', cause instanceof Error ? cause.message : undefined)
    } finally {
      setIsProcessing(false)
    }
  }, [output, runSqlTask])

  const readFile = useCallback((file: File) => {
    if (!file) return

    if (file.size > 50 * 1024 * 1024) {
      toast.error('File is too large', 'Maximum supported size is 50 MB.')
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
      toast.error('Unable to read file')
      setIsProcessing(false)
    }

    reader.readAsText(file)
  }, [])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    readFile(file)
    e.target.value = ''
  }, [readFile])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    readFile(file)
  }, [readFile])

  const copyToClipboard = useCallback(() => {
    void copyText(output, 'SQL copied')
  }, [output])

  const downloadSQL = useCallback(() => {
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extracted-sql-${Date.now()}.sql`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('SQL file downloaded')
  }, [output])

  const openInExecutionPlan = () => {
    if (!output.trim()) return
    sendToolTransfer('execution-plan', { sourceSql: output })
    router.push('/')
  }

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
                onClick={() => {
                  setInput('')
                  setOutput('')
                  setStats({ lines: 0, size: 0, time: 0 })
                }}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="p-4">
            <div className="mb-3">
              <label className="block text-sm font-medium text-on-surface mb-2">
                Upload Source File (Max 50MB)
              </label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[1.02]'
                    : 'border-outline-variant/60 hover:border-primary hover:bg-surface-container'
                }`}
              >
                <input
                  type="file"
                  accept=".txt,.log,.sql"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isProcessing}
                />

                <div className="pointer-events-none">
                  <svg
                    className={`mx-auto h-12 w-12 mb-3 transition-colors ${
                      isDragging ? 'text-primary' : 'text-on-surface-variant'
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
                    isDragging ? 'text-primary' : 'text-on-surface'
                  }`}>
                    {isDragging ? 'Drop file here' : 'Drag & drop your SQL/log file here'}
                  </p>

                  <p className="text-xs text-on-surface-variant">
                    or click to browse • .sql, .log, .txt • Max 50MB
                  </p>
                </div>
              </div>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
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
              {isProcessing ? 'Processing...' : 'Extract SQL (Ctrl+Enter)'}
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
              <button
                onClick={openInExecutionPlan}
                disabled={!output.trim()}
                className="px-3 py-1.5 border border-primary text-primary text-sm rounded hover:bg-primary/10 font-medium transition-colors disabled:opacity-50"
              >
                Open in Plan
              </button>
            </div>
          </div>
          
          <div className="p-4">
            {output ? (
              <textarea
                value={output}
                readOnly
                aria-label="Extracted SQL output"
                className="w-full h-96 p-3 border border-outline-variant/15 rounded-lg bg-surface-container-lowest font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-on-surface"
                spellCheck={false}
                style={{ willChange: 'scroll-position' }}
              />
            ) : (
              <EmptyState title="No SQL extracted yet" description="Paste a log or drop a file, then run Extract SQL to populate this panel." />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
