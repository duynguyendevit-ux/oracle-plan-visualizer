'use client'

import { useState } from 'react'
import EmptyState from '@/components/EmptyState'
import { useToolSession } from '@/hooks/useToolSession'
import { useWorkerRpc } from '@/hooks/useWorkerRpc'
import { toast } from '@/lib/toast'
import type {
  AnalyzerStats,
  CalculationRow,
  DiffResult,
  ExcelWorkerRequest,
  ExcelWorkerResult,
} from '@/workers/excel-tools.worker'

type Tool = 'analyzer' | 'formula' | 'diff' | 'calculator'

export default function ExcelTools() {
  const [activeTool, setActiveTool] = useState<Tool>('analyzer')
  
  // Data Analyzer state
  const [analyzerStats, setAnalyzerStats] = useState<AnalyzerStats | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  // Formula Tester state
  const [formulaInput, setFormulaInput] = useState('')
  const [formulaResult, setFormulaResult] = useState('')
  const [formulaError, setFormulaError] = useState('')
  
  // Diff Viewer state
  const [diffFile1, setDiffFile1] = useState<File | null>(null)
  const [diffFile2, setDiffFile2] = useState<File | null>(null)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)

  // Calculator state
  const [calcColumns, setCalcColumns] = useState<string[]>([])
  const [calcCol1, setCalcCol1] = useState('')
  const [calcCol2, setCalcCol2] = useState('')
  const [calcOperation, setCalcOperation] = useState<'add' | 'subtract'>('add')
  const [calcFormat, setCalcFormat] = useState<'number' | 'currency' | 'percentage'>('number')
  const [calcResult, setCalcResult] = useState<CalculationRow[]>([])
  const [calcFilter, setCalcFilter] = useState('')
  const [calcPage, setCalcPage] = useState(1)
  const [calcPageSize, setCalcPageSize] = useState(50)
  const [workerAction, setWorkerAction] = useState<ExcelWorkerRequest['action'] | null>(null)
  const runExcelTask = useWorkerRpc<ExcelWorkerRequest, ExcelWorkerResult>(() => (
    new Worker(new URL('../../workers/excel-tools.worker.ts', import.meta.url), { type: 'module' })
  ))

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

  const runTask = async (request: ExcelWorkerRequest, transfer: Transferable[] = []) => {
    setWorkerAction(request.action)
    try {
      return await runExcelTask(request, { transfer })
    } finally {
      setWorkerAction(null)
    }
  }

  const processAnalyzerFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer()
      const result = await runTask({ action: 'analyze', file: { name: file.name, data } }, [data])
      if (result.action === 'analyze') {
        setAnalyzerStats(result.stats)
        toast.success('Spreadsheet analyzed', `${result.stats.rowCount.toLocaleString()} rows loaded.`)
      }
    } catch (cause) {
      toast.error('Unable to analyze spreadsheet', cause instanceof Error ? cause.message : undefined)
    }
  }

  const handleAnalyzerUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void processAnalyzerFile(file)
    event.target.value = ''
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void processAnalyzerFile(file)
  }

  const testFormula = async () => {
    setFormulaError('')
    try {
      const result = await runTask({ action: 'formula', input: formulaInput })
      if (result.action === 'formula') {
        setFormulaResult(`Result: ${result.result}`)
        toast.success('Formula evaluated')
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Formula evaluation failed.'
      setFormulaResult('')
      setFormulaError(message)
      toast.error('Formula evaluation failed', message)
    }
  }

  const handleDiffCompare = async () => {
    if (!diffFile1 || !diffFile2) return
    try {
      const [leftData, rightData] = await Promise.all([diffFile1.arrayBuffer(), diffFile2.arrayBuffer()])
      const result = await runTask({
        action: 'compare',
        left: { name: diffFile1.name, data: leftData },
        right: { name: diffFile2.name, data: rightData },
      }, [leftData, rightData])
      if (result.action === 'compare') {
        setDiffResult(result.result)
        toast.success('Spreadsheets compared')
      }
    } catch (cause) {
      toast.error('Unable to compare spreadsheets', cause instanceof Error ? cause.message : undefined)
    }
  }

  const handleCalcUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const data = await file.arrayBuffer()
      const result = await runTask({ action: 'load-calculator', file: { name: file.name, data } }, [data])
      if (result.action === 'load-calculator') {
        setCalcColumns(result.columns)
        setCalcCol1('')
        setCalcCol2('')
        setCalcResult([])
        toast.success('Calculator data loaded', `${result.rowCount.toLocaleString()} rows available.`)
      }
    } catch (cause) {
      toast.error('Unable to load calculator data', cause instanceof Error ? cause.message : undefined)
    } finally {
      event.target.value = ''
    }
  }

  const calculateColumns = async () => {
    if (!calcCol1 || !calcCol2 || calcColumns.length === 0) return
    try {
      const result = await runTask({ action: 'calculate', col1: calcCol1, col2: calcCol2, operation: calcOperation, format: calcFormat })
      if (result.action === 'calculate') {
        setCalcResult(result.results)
        toast.success('Columns calculated', `${result.results.length.toLocaleString()} rows processed.`)
      }
    } catch (cause) {
      toast.error('Unable to calculate columns', cause instanceof Error ? cause.message : undefined)
    }
  }

  const exportCalcResults = async () => {
    try {
      const result = await runTask({ action: 'export-calculation', results: calcResult })
      if (result.action !== 'export-calculation') return
      const url = URL.createObjectURL(new Blob([result.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `calculation-${Date.now()}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Calculation workbook downloaded')
    } catch (cause) {
      toast.error('Unable to export calculation', cause instanceof Error ? cause.message : undefined)
    }
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
                accept=".xlsx,.csv"
                onChange={handleAnalyzerUpload}
                disabled={workerAction !== null}
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
                  or click to browse • .xlsx, .csv
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
            disabled={workerAction !== null || !formulaInput.trim()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {workerAction === 'formula' ? 'Evaluating...' : 'Test Formula'}
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
                accept=".xlsx,.csv"
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
                accept=".xlsx,.csv"
                onChange={(e) => setDiffFile2(e.target.files?.[0] || null)}
                className="block w-full text-sm text-on-surface file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
              />
            </div>
          </div>
          
          <button
            onClick={handleDiffCompare}
            disabled={!diffFile1 || !diffFile2 || workerAction !== null}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {workerAction === 'compare' ? 'Comparing...' : 'Compare Files'}
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
                accept=".xlsx,.csv"
                onChange={handleCalcUpload}
                disabled={workerAction !== null}
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
                disabled={!calcCol1 || !calcCol2 || workerAction !== null}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {workerAction === 'calculate' ? 'Calculating...' : 'Calculate'}
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
                          disabled={workerAction !== null}
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
                              <td className="py-2 px-2 text-on-surface">{String(row[calcCol1] ?? '')}</td>
                              <td className="py-2 px-2 text-on-surface">{String(row[calcCol2] ?? '')}</td>
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
