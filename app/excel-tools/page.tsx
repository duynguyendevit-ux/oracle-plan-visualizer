'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import EmptyState from '@/components/EmptyState'
import { useToolSession } from '@/hooks/useToolSession'
import { toast } from '@/lib/toast'

type Tool = 'analyzer' | 'formula' | 'diff' | 'calculator'

async function readSpreadsheet(file: File): Promise<any[]> {
  const isCsv = file.name.toLowerCase().endsWith('.csv')
  let workbook: XLSX.WorkBook

  if (isCsv) {
    workbook = XLSX.read(await file.text(), { type: 'string' })
  } else {
    const data = await file.arrayBuffer()
    const bytes = new Uint8Array(data)
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    if (!isZip && !isOle) throw new Error('The selected file is not a valid Excel workbook.')
    workbook = XLSX.read(data)
  }
  const sheetName = workbook.SheetNames[0]

  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('The spreadsheet does not contain a readable worksheet.')
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
}

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

  // Calculator state
  const [calcFile, setCalcFile] = useState<File | null>(null)
  const [calcData, setCalcData] = useState<any[]>([])
  const [calcColumns, setCalcColumns] = useState<string[]>([])
  const [calcCol1, setCalcCol1] = useState('')
  const [calcCol2, setCalcCol2] = useState('')
  const [calcOperation, setCalcOperation] = useState<'add' | 'subtract'>('add')
  const [calcFormat, setCalcFormat] = useState<'number' | 'currency' | 'percentage'>('number')
  const [calcResult, setCalcResult] = useState<any[]>([])
  const [calcFilter, setCalcFilter] = useState('')
  const [calcPage, setCalcPage] = useState(1)
  const [calcPageSize, setCalcPageSize] = useState(50)

  useToolSession('excel-tools', {
    activeTool,
    formulaInput,
    calcCol1,
    calcCol2,
    calcOperation,
    calcFormat,
    calcFilter,
    calcPageSize,
  }, (saved) => {
    if (['analyzer', 'formula', 'diff', 'calculator'].includes(saved.activeTool)) setActiveTool(saved.activeTool as Tool)
    if (typeof saved.formulaInput === 'string') setFormulaInput(saved.formulaInput)
    if (typeof saved.calcCol1 === 'string') setCalcCol1(saved.calcCol1)
    if (typeof saved.calcCol2 === 'string') setCalcCol2(saved.calcCol2)
    if (saved.calcOperation === 'add' || saved.calcOperation === 'subtract') setCalcOperation(saved.calcOperation)
    if (saved.calcFormat === 'number' || saved.calcFormat === 'currency' || saved.calcFormat === 'percentage') setCalcFormat(saved.calcFormat)
    if (typeof saved.calcFilter === 'string') setCalcFilter(saved.calcFilter)
    if (typeof saved.calcPageSize === 'number') setCalcPageSize(saved.calcPageSize)
  })

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

    try {
      const jsonData = await readSpreadsheet(file)
      setAnalyzerData(jsonData)
      analyzeData(jsonData)
      toast.success('Spreadsheet analyzed', `${jsonData.length.toLocaleString()} rows loaded.`)
    } catch (cause) {
      toast.error('Unable to analyze spreadsheet', cause instanceof Error ? cause.message : undefined)
    }
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
          toast.success('Formula evaluated')
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
          toast.success('Formula evaluated')
          return
        }
      }
      
      // Handle simple math
      const result = eval(formula)
      setFormulaResult(`Result: ${result}`)
      toast.success('Formula evaluated')
    } catch (err: any) {
      setFormulaError(err.message)
      toast.error('Formula evaluation failed', err.message)
    }
  }
  
  // Diff Viewer functions
  const handleDiffCompare = async () => {
    if (!diffFile1 || !diffFile2) return

    try {
      const [json1, json2] = await Promise.all([readSpreadsheet(diffFile1), readSpreadsheet(diffFile2)])
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
      toast.success('Spreadsheets compared')
    } catch (cause) {
      toast.error('Unable to compare spreadsheets', cause instanceof Error ? cause.message : undefined)
    }
  }

  // Calculator functions
  const handleCalcUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCalcFile(file)

    try {
      const jsonData = await readSpreadsheet(file)
      setCalcData(jsonData)
      setCalcColumns(jsonData.length > 0 ? Object.keys(jsonData[0]) : [])
      toast.success('Calculator data loaded', `${jsonData.length.toLocaleString()} rows available.`)
    } catch (cause) {
      toast.error('Unable to load calculator data', cause instanceof Error ? cause.message : undefined)
    }
  }

  const calculateColumns = () => {
    if (!calcCol1 || !calcCol2 || calcData.length === 0) return

    const results = calcData.map((row, idx) => {
      let val1: number
      let val2: number
      let isDateCalc = false
      
      // Helper function to parse custom date format: "HH:MM:SS.mmm DD/MM/YYYY" or "HH:MM:SS DD/MM/YYYY"
      const parseCustomDate = (dateStr: string): Date | null => {
        if (typeof dateStr !== 'string') return null
        
        // Match format with milliseconds: "16:16:32.123 20/03/2026"
        let match = dateStr.match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (match) {
          const [, hours, minutes, seconds, milliseconds, day, month, year] = match
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds), parseInt(milliseconds))
        }
        
        // Match format without milliseconds: "16:16:32 20/03/2026"
        match = dateStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (match) {
          const [, hours, minutes, seconds, day, month, year] = match
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes), parseInt(seconds))
        }
        
        // Try standard Date parsing as fallback
        const date = new Date(dateStr)
        return isNaN(date.getTime()) ? null : date
      }
      
      const date1 = parseCustomDate(row[calcCol1])
      const date2 = parseCustomDate(row[calcCol2])
      
      if (date1 && date2) {
        // Both are valid dates
        val1 = date1.getTime()
        val2 = date2.getTime()
        isDateCalc = true
      } else {
        // Fall back to number parsing
        val1 = parseFloat(row[calcCol1]) || 0
        val2 = parseFloat(row[calcCol2]) || 0
      }
      
      const result = calcOperation === 'add' ? val1 + val2 : val1 - val2

      let formatted = ''
      
      // Check if we're working with dates
      if (isDateCalc && calcOperation === 'subtract') {
        // Convert milliseconds to days/hours/minutes/seconds/milliseconds
        const diffMs = Math.abs(result)
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000)
        const diffMilliseconds = Math.floor(diffMs % 1000)
        
        if (diffDays > 0) {
          formatted = `${diffDays}d ${diffHours}h ${diffMinutes}m ${diffSeconds}.${diffMilliseconds.toString().padStart(3, '0')}s`
        } else if (diffHours > 0) {
          formatted = `${diffHours}h ${diffMinutes}m ${diffSeconds}.${diffMilliseconds.toString().padStart(3, '0')}s`
        } else if (diffMinutes > 0) {
          formatted = `${diffMinutes}m ${diffSeconds}.${diffMilliseconds.toString().padStart(3, '0')}s`
        } else {
          formatted = `${diffSeconds}.${diffMilliseconds.toString().padStart(3, '0')}s`
        }
      } else {
        // Regular number formatting
        switch (calcFormat) {
          case 'currency':
            formatted = `$${result.toFixed(2)}`
            break
          case 'percentage':
            formatted = `${result.toFixed(2)}%`
            break
          default:
            formatted = result.toFixed(2)
        }
      }

      return {
        row: idx + 1,
        [calcCol1]: row[calcCol1],
        [calcCol2]: row[calcCol2],
        result: result,
        formatted: formatted
      }
    })

    setCalcResult(results)
    toast.success('Columns calculated', `${results.length.toLocaleString()} rows processed.`)
  }

  const exportCalcResults = () => {
    const ws = XLSX.utils.json_to_sheet(calcResult)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `calculation-${Date.now()}.xlsx`)
    toast.success('Calculation workbook downloaded')
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
        <button
          onClick={() => setActiveTool('calculator')}
          className={`px-4 py-2 rounded-t font-medium transition-colors ${
            activeTool === 'calculator'
              ? 'bg-primary text-white'
              : 'bg-surface-container text-on-surface hover:bg-surface-container-low'
          }`}
        >
          🧮 Calculator
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
          
          {analyzerStats ? (
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
                    toast.success('Analysis JSON downloaded')
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
          ) : <EmptyState compact title="No spreadsheet analyzed" description="Drop an Excel or CSV file above to inspect rows, columns, nulls, and numeric ranges." />}
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

          {!formulaResult && !formulaError && <EmptyState compact title="No formula result" description="Enter a supported formula and select Test Formula." />}
          
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
          
          {diffResult ? (
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
          ) : <EmptyState compact title="No comparison yet" description="Select an original and modified spreadsheet, then compare them." />}
        </div>
      )}

      {/* Calculator */}
      {activeTool === 'calculator' && (
        <div className="bg-surface-container-low rounded-lg shadow-editorial p-4 md:p-6">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-on-surface mb-4">Column Calculator</h2>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-on-surface mb-2">
              Upload Excel/CSV File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleCalcUpload}
              className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
            />
          </div>

          {calcColumns.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Column 1</label>
                  <select
                    value={calcCol1}
                    onChange={(e) => setCalcCol1(e.target.value)}
                    className="w-full px-4 py-2 border border-outline-variant/60 rounded-lg bg-surface-container-lowest text-on-surface focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select column...</option>
                    {calcColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Column 2</label>
                  <select
                    value={calcCol2}
                    onChange={(e) => setCalcCol2(e.target.value)}
                    className="w-full px-4 py-2 border border-outline-variant/60 rounded-lg bg-surface-container-lowest text-on-surface focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select column...</option>
                    {calcColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Operation</label>
                  <select
                    value={calcOperation}
                    onChange={(e) => setCalcOperation(e.target.value as 'add' | 'subtract')}
                    className="w-full px-4 py-2 border border-outline-variant/60 rounded-lg bg-surface-container-lowest text-on-surface focus:ring-2 focus:ring-primary"
                  >
                    <option value="add">Add (+)</option>
                    <option value="subtract">Subtract (-)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-on-surface mb-2">Format</label>
                  <select
                    value={calcFormat}
                    onChange={(e) => setCalcFormat(e.target.value as 'number' | 'currency' | 'percentage')}
                    className="w-full px-4 py-2 border border-outline-variant/60 rounded-lg bg-surface-container-lowest text-on-surface focus:ring-2 focus:ring-primary"
                  >
                    <option value="number">Number</option>
                    <option value="currency">Currency ($)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={calculateColumns}
                disabled={!calcCol1 || !calcCol2}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Calculate
              </button>

              {calcResult.length > 0 && (() => {
                // Filter results
                const filteredResults = calcResult.filter(row => {
                  if (!calcFilter) return true
                  const searchLower = calcFilter.toLowerCase()
                  return (
                    row.row.toString().includes(searchLower) ||
                    row[calcCol1]?.toString().toLowerCase().includes(searchLower) ||
                    row[calcCol2]?.toString().toLowerCase().includes(searchLower) ||
                    row.formatted.toLowerCase().includes(searchLower)
                  )
                })

                // Pagination
                const totalPages = Math.ceil(filteredResults.length / calcPageSize)
                const startIdx = (calcPage - 1) * calcPageSize
                const endIdx = startIdx + calcPageSize
                const paginatedResults = filteredResults.slice(startIdx, endIdx)

                return (
                  <div className="mt-6 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex-1 w-full md:w-auto">
                        <input
                          type="text"
                          value={calcFilter}
                          onChange={(e) => {
                            setCalcFilter(e.target.value)
                            setCalcPage(1) // Reset to first page on filter
                          }}
                          placeholder="Filter results..."
                          className="w-full px-4 py-2 border border-outline-variant/60 rounded-lg bg-surface-container-lowest text-on-surface focus:ring-2 focus:ring-primary text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-on-surface/70">
                          {filteredResults.length} of {calcResult.length} rows
                        </span>
                        <button
                          onClick={exportCalcResults}
                          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span className="hidden sm:inline">Export Excel</span>
                        </button>
                      </div>
                    </div>

                    <div className="bg-surface-container rounded-lg p-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-outline-variant/60">
                          <tr>
                            <th className="text-left py-2 px-2 text-on-surface">Row</th>
                            <th className="text-left py-2 px-2 text-on-surface">{calcCol1}</th>
                            <th className="text-left py-2 px-2 text-on-surface">{calcCol2}</th>
                            <th className="text-left py-2 px-2 text-on-surface">Result</th>
                            <th className="text-left py-2 px-2 text-on-surface">Formatted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedResults.map((row, idx) => (
                            <tr key={idx} className="border-b border-outline-variant/30">
                              <td className="py-2 px-2 text-on-surface/70">{row.row}</td>
                              <td className="py-2 px-2 text-on-surface">{row[calcCol1]}</td>
                              <td className="py-2 px-2 text-on-surface">{row[calcCol2]}</td>
                              <td className="py-2 px-2 text-on-surface font-mono">{row.result.toFixed(2)}</td>
                              <td className="py-2 px-2 text-on-surface font-semibold">{row.formatted}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-on-surface">Rows per page:</label>
                          <select
                            value={calcPageSize}
                            onChange={(e) => {
                              setCalcPageSize(Number(e.target.value))
                              setCalcPage(1)
                            }}
                            className="px-3 py-1 border border-outline-variant/60 rounded bg-surface-container-lowest text-on-surface text-sm"
                          >
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                            <option value="200">200</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCalcPage(1)}
                            disabled={calcPage === 1}
                            className="px-3 py-1 border border-outline-variant/60 rounded bg-surface-container text-on-surface text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-low"
                          >
                            First
                          </button>
                          <button
                            onClick={() => setCalcPage(p => Math.max(1, p - 1))}
                            disabled={calcPage === 1}
                            className="px-3 py-1 border border-outline-variant/60 rounded bg-surface-container text-on-surface text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-low"
                          >
                            Previous
                          </button>
                          <span className="text-sm text-on-surface px-2">
                            Page {calcPage} of {totalPages}
                          </span>
                          <button
                            onClick={() => setCalcPage(p => Math.min(totalPages, p + 1))}
                            disabled={calcPage === totalPages}
                            className="px-3 py-1 border border-outline-variant/60 rounded bg-surface-container text-on-surface text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-low"
                          >
                            Next
                          </button>
                          <button
                            onClick={() => setCalcPage(totalPages)}
                            disabled={calcPage === totalPages}
                            className="px-3 py-1 border border-outline-variant/60 rounded bg-surface-container text-on-surface text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-low"
                          >
                            Last
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          {calcColumns.length === 0 && <EmptyState compact title="No calculator data" description="Upload an Excel or CSV file to choose columns and calculate results." />}
        </div>
      )}
    </div>
  )
}
