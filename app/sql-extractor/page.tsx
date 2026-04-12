'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import Editor from '@monaco-editor/react'

export default function SQLExtractor() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [stats, setStats] = useState({ lines: 0, size: 0, time: 0 })
  const workerRef = useRef<Worker | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('./sql-worker.ts', import.meta.url))
    
    workerRef.current.onmessage = (e) => {
      const { type, sql, stats } = e.data
      
      if (type === 'result') {
        setOutput(sql)
        setStats(stats)
        setIsProcessing(false)
      }
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  // Debounced extraction for auto-process
  const debouncedInput = useDebounce(input, 500)

  useEffect(() => {
    if (debouncedInput && debouncedInput.length > 100) {
      extractSQL()
    }
  }, [debouncedInput])

  const extractSQL = useCallback(() => {
    if (!input.trim()) return
    
    setIsProcessing(true)
    const startTime = performance.now()
    
    workerRef.current?.postMessage({
      type: 'extract',
      input,
      startTime
    })
  }, [input])

  const formatSQL = useCallback(() => {
    if (!output.trim()) return
    
    setIsProcessing(true)
    
    workerRef.current?.postMessage({
      type: 'format',
      sql: output
    })
  }, [output])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File too large! Maximum size is 50MB')
      return
    }

    setIsProcessing(true)
    const reader = new FileReader()

    reader.onload = (event) => {
      const text = event.target?.result as string
      setInput(text)
      setIsProcessing(false)
    }

    reader.onerror = () => {
      alert('Error reading file')
      setIsProcessing(false)
    }

    // Use streaming for large files
    if (file.size > 5 * 1024 * 1024) {
      const stream = file.stream()
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let chunks = ''

      const processChunk = async () => {
        const { done, value } = await reader.read()
        
        if (done) {
          setInput(chunks)
          setIsProcessing(false)
          return
        }

        chunks += decoder.decode(value, { stream: true })
        processChunk()
      }

      processChunk()
    } else {
      reader.readAsText(file)
    }
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

  return (
    <div className="p-4 max-w-full mx-auto">
      {/* Stats Bar */}
      {stats.lines > 0 && (
        <div className="mb-4 p-3 bg-surface-container rounded-lg flex gap-6 text-sm text-on-surface-variant">
          <span>Lines: <strong className="text-on-surface">{stats.lines.toLocaleString()}</strong></span>
          <span>Size: <strong className="text-on-surface">{(stats.size / 1024).toFixed(2)} KB</strong></span>
          <span>Time: <strong className="text-on-surface">{stats.time.toFixed(2)} ms</strong></span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input Panel */}
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
            <Editor
              height="384px"
              defaultLanguage="plaintext"
              value={input}
              onChange={(value) => setInput(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                readOnly: isProcessing,
                automaticLayout: true,
              }}
            />
            
            <button
              onClick={extractSQL}
              disabled={isProcessing || !input.trim()}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded-lg hover:bg-primary/90 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Extract SQL'}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden">
          <div className="bg-surface-container px-4 py-3 flex justify-between items-center">
            <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">
              Extracted SQL
            </h3>
            <div className="flex gap-2">
              <button
                onClick={formatSQL}
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
            <Editor
              height="384px"
              defaultLanguage="sql"
              value={output}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                readOnly: true,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
