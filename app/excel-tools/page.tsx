'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'

type Tool = 'analyzer' | 'formula' | 'diff'

export default function ExcelTools() {
  const [activeTool, setActiveTool] = useState<Tool>('analyzer')
  
  // Data Analyzer state
  const [analyzerFile, setAnalyzerFile] = useState<File | null>(null)
  const [analyzerData, setAnalyzerData] = useState<any[]>([])
  const [analyzerStats, setAnalyzerStats] = useState<any>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  // Formula Tester state
  const [formulaInput, setFormulaInput] = useState('')
  const [formulaResult, setFormulaResult] = useState('')
  const [formulaError, setFormulaError] = useState('')
  
  // Diff Viewer state
  const [diffFile1, setDiffFile1] = useState<File | null>(null)
  const [diffFile2, setDiffFile2] = useState<File | null>(null)
  const [diffResult, setDiffResult] = useState<any>(null)

  // Data Analyzer functions
  const handleAnalyzerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processAnalyzerFile(file)
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
      processAnalyzerFile(file)
    }
  }

  const processAnalyzerFile = async (file: File) => {
    setAnalyzerFile(file)
    
    let jsonData: any[]
    
    if (file.name.endsWith('.csv')) {
      // Handle CSV
      const text = await file.text()
      const workbook = XLSX.read(text, { type: 'string' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      jsonData = XLSX.utils.sheet_to_json(worksheet)
    } else {
      // Handle Excel
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      jsonData = XLSX.utils.sheet_to_json(worksheet)
    }
    
    setAnalyzerData(jsonData)
    analyzeData(jsonData)
  }
  
  const analyzeData = (data: any[]) => {
    if (data.length === 0) return
    
    const stats: any = {
      rowCount: data.length,
      columnCount: Object.keys(data[0]).length,
      columns: {}
    }
    
    Object.keys(data[0]).forEach(col => {
      const values = data.map(row => row[col]).filter(v => v !== null && v !== undefined)
      const numericValues = values.filter(v => typeof v === 'number')
      
      stats.columns[col] = {
        type: numericValues.length > values.length * 0.8 ? 'numeric' : 'text',
        nullCount: data.length - values.length,
        uniqueCount: new Set(values).size
      }
      
      if (numericValues.length > 0) {
        stats.columns[col].min = Math.min(...numericValues)
        stats.columns[col].max = Math.max(...numericValues)
        stats.columns[col].avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
      }
    })
    
    setAnalyzerStats(stats)
  }
  
  // Formula Tester functions
  const testFormula = () => {
    try {
      setFormulaError('')
      // Simple formula evaluation (SUM, AVERAGE, etc.)
      let formula = formulaInput.trim()
      
      if (formula.startsWith('=')) {
        formula = formula.substring(1)
      }
      
      // Handle SUM
      if (formula.toUpperCase().startsWith('SUM(')) {
        const match = formula.match(/SUM\(([^)]+)\)/i)
        if (match) {
          const numbers = match[1].split(',').map(n => parseFloat(n.trim()))
          const result = numbers.reduce((a, b) => a + b, 0)
          setFormulaResult(`Result: ${result}`)
          return
        }
      }
      
      // Handle AVERAGE
      if (formula.toUpperCase().startsWith('AVERAGE(')) {
        const match = formula.match(/AVERAGE\(([^)]+)\)/i)
        if (match) {
          const numbers = match[1].split(',').map(n => parseFloat(n.trim()))
          const result = numbers.reduce((a, b) => a + b, 0) / numbers.length
          setFormulaResult(`Result: ${result.toFixed(2)}`)
          return
        }
      }
      
      // Handle simple math
      const result = eval(formula)
      setFormulaResult(`Result: ${result}`)
    } catch (err: any) {
      setFormulaError(err.message)
    }
  }
  
  // Diff Viewer functions
  const handleDiffCompare = async () => {
    if (!diffFile1 || !diffFile2) return
    
    let json1: any[], json2: any[]
    
    // Read file 1
    if (diffFile1.name.endsWith('.csv')) {
      const text1 = await diffFile1.text()
      const wb1 = XLSX.read(text1, { type: 'string' })
      json1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]])
    } else {
      const data1 = await diffFile1.arrayBuffer()
      const wb1 = XLSX.read(data1)
      json1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]])
    }
    
    // Read file 2
    if (diffFile2.name.endsWith('.csv')) {
      const text2 = await diffFile2.text()
      const wb2 = XLSX.read(text2, { type: 'string' })
      json2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]])
    } else {
      const data2 = await diffFile2.arrayBuffer()
      const wb2 = XLSX.read(data2)
      json2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]])
    }
    
    const differences = {
      rowCountDiff: json1.length - json2.length,
      added: json2.length > json1.length ? json2.slice(json1.length) : [],
      removed: json1.length > json2.length ? json1.slice(json2.length) : [],
      modified: [] as any[]
    }
    
    const minLength = Math.min(json1.length, json2.length)
    for (let i = 0; i < minLength; i++) {
      const row1 = json1[i] as any
      const row2 = json2[i] as any
      const diff: any = { row: i + 1, changes: {} }
      
      Object.keys(row1).forEach(key => {
        if (row1[key] !== row2[key]) {
          diff.changes[key] = { old: row1[key], new: row2[key] }
        }
      })
      
      if (Object.keys(diff.changes).length > 0) {
        differences.modified.push(diff)
      }
    }
    
    setDiffResult(differences)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Tool Tabs */}
      <div className="flex gap-2 mb-6 border-b border-outline-variant/60 pb-2">
        <button
          onClick={() => setActiveTool('analyzer')}
          className={`px-4 py-2 rounded-t font-medium transition-colors ${
            activeTool === 'analyzer'
              ? 'bg-primary text-white'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-low'
          }`}
        >
          📊 Data Analyzer
        </button>
        <button
          onClick={() => setActiveTool('formula')}
          className={`px-4 py-2 rounded-t font-medium transition-colors ${
            activeTool === 'formula'
              ? 'bg-primary text-white'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-low'
          }`}
        >
          🧮 Formula Tester
        </button>
        <button
          onClick={() => setActiveTool('diff')}
          className={`px-4 py-2 rounded-t font-medium transition-colors ${
            activeTool === 'diff'
              ? 'bg-primary text-white'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-low'
          }`}
        >
          🔍 Diff Viewer
        </button>
      </div>

      {/* Data Analyzer */}
      {activeTool === 'analyzer' && (
        <div className="bg-surface-container-low rounded-lg shadow-editorial p-4 md:p-6">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-on-surface mb-4">Excel Data Analyzer</h2>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-on-surface mb-2">
              Upload Excel/CSV File
            </label>
            
            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-lg p-6 md:p-8 text-center transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : 'border-outline-variant/60 hover:border-primary hover:bg-surface-container'
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleAnalyzerUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              <div className="pointer-events-none">
                <svg
                  className={`mx-auto h-10 md:h-12 w-10 md:w-12 mb-3 transition-colors ${
                    isDragging ? 'text-primary' : 'text-on-surface/40'
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
                  {isDragging ? 'Drop file here' : 'Drag & drop your Excel/CSV file here'}
                </p>
                
                <p className="text-xs text-on-surface/60">
                  or click to browse • .xlsx, .xls, .csv
                </p>
              </div>
            </div>
          </div>
          
          {analyzerStats && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-on-surface">Analysis Results</h3>
                <button
                  onClick={() => {
                    const dataStr = JSON.stringify(analyzerStats, null, 2)
                    const blob = new Blob([dataStr], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `analysis-${Date.now()}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors text-sm flex items-center gap-2 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
              
              <div className="bg-surface-container rounded-lg p-3 md:p-4">
                <h3 className="font-semibold text-on-surface mb-2 text-sm md:text-base">Overview</h3>
                <div className="grid grid-cols-2 gap-2 md:gap-4">
                  <div>
                    <p className="text-xs md:text-sm text-on-surface/70">Rows</p>
                    <p className="text-lg md:text-xl font-semibold text-on-surface">{analyzerStats.rowCount}</p>
                  </div>
                  <div>
                    <p className="text-xs md:text-sm text-on-surface/70">Columns</p>
                    <p className="text-lg md:text-xl font-semibold text-on-surface">{analyzerStats.columnCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-surface-container rounded-lg p-3 md:p-4">
                <h3 className="font-semibold text-on-surface mb-3 text-sm md:text-base">Column Statistics</h3>
                <div className="space-y-3">
                  {Object.entries(analyzerStats.columns).map(([col, stats]: [string, any]) => (
                    <div key={col} className="border-l-4 border-primary pl-3 bg-surface-container-low p-2 md:p-3 rounded">
                      <p className="font-medium text-on-surface text-sm md:text-base truncate">{col}</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                        <p className="text-xs md:text-sm text-on-surface/70">Type: <span className="font-medium">{stats.type}</span></p>
                        <p className="text-xs md:text-sm text-on-surface/70">Unique: <span className="font-medium">{stats.uniqueCount}</span></p>
                        <p className="text-xs md:text-sm text-on-surface/70">Nulls: <span className="font-medium">{stats.nullCount}</span></p>
                        {stats.type === 'numeric' && (
                          <>
                            <p className="text-xs md:text-sm text-on-surface/70">Min: <span className="font-medium">{stats.min}</span></p>
                            <p className="text-xs md:text-sm text-on-surface/70">Max: <span className="font-medium">{stats.max}</span></p>
                            <p className="text-xs md:text-sm text-on-surface/70">Avg: <span className="font-medium">{stats.avg.toFixed(2)}</span></p>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formula Tester */}
      {activeTool === 'formula' && (
        <div className="bg-surface-container-low rounded-lg shadow-editorial p-6">
          <h2 className="text-2xl font-serif font-semibold text-on-surface mb-4">Excel Formula Tester</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-on-surface mb-2">
              Enter Formula (e.g., =SUM(1,2,3) or =AVERAGE(10,20,30))
            </label>
            <input
              type="text"
              value={formulaInput}
              onChange={(e) => setFormulaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && testFormula()}
              placeholder="=SUM(1,2,3)"
              className="w-full px-4 py-2 border border-outline-variant/60 rounded-lg bg-surface-container-lowest text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          
          <button
            onClick={testFormula}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors"
          >
            Test Formula
          </button>
          
          {formulaResult && (
            <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
              <p className="text-green-800 font-medium">{formulaResult}</p>
            </div>
          )}
          
          {formulaError && (
            <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg">
              <p className="text-red-800 font-medium">Error: {formulaError}</p>
            </div>
          )}
          
          <div className="mt-6 bg-surface-container rounded-lg p-4">
            <h3 className="font-semibold text-on-surface mb-2">Supported Functions</h3>
            <ul className="list-disc list-inside text-on-surface/70 space-y-1">
              <li>SUM(n1, n2, ...) - Add numbers</li>
              <li>AVERAGE(n1, n2, ...) - Calculate average</li>
              <li>Basic math: +, -, *, /, ()</li>
            </ul>
          </div>
        </div>
      )}

      {/* Diff Viewer */}
      {activeTool === 'diff' && (
        <div className="bg-surface-container-low rounded-lg shadow-editorial p-6">
          <h2 className="text-2xl font-serif font-semibold text-on-surface mb-4">Excel Diff Viewer</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                File 1 (Original)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setDiffFile1(e.target.files?.[0] || null)}
                className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-on-surface mb-2">
                File 2 (Modified)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setDiffFile2(e.target.files?.[0] || null)}
                className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
              />
            </div>
          </div>
          
          <button
            onClick={handleDiffCompare}
            disabled={!diffFile1 || !diffFile2}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Compare Files
          </button>
          
          {diffResult && (
            <div className="mt-6 space-y-4">
              <div className="bg-surface-container rounded-lg p-4">
                <h3 className="font-semibold text-on-surface mb-2">Summary</h3>
                <p className="text-on-surface">Row Count Difference: {diffResult.rowCountDiff}</p>
                <p className="text-on-surface">Modified Rows: {diffResult.modified.length}</p>
                <p className="text-on-surface">Added Rows: {diffResult.added.length}</p>
                <p className="text-on-surface">Removed Rows: {diffResult.removed.length}</p>
              </div>
              
              {diffResult.modified.length > 0 && (
                <div className="bg-surface-container rounded-lg p-4">
                  <h3 className="font-semibold text-on-surface mb-3">Modified Rows</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {diffResult.modified.map((diff: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-yellow-500 pl-3">
                        <p className="font-medium text-on-surface">Row {diff.row}</p>
                        {Object.entries(diff.changes).map(([key, change]: [string, any]) => (
                          <div key={key} className="text-sm text-on-surface/70">
                            <span className="font-medium">{key}:</span>
                            <span className="text-red-600"> {JSON.stringify(change.old)}</span>
                            <span> → </span>
                            <span className="text-green-600">{JSON.stringify(change.new)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
