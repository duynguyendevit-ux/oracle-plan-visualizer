/// <reference lib="webworker" />

import ExcelJS from 'exceljs'
import Papa from 'papaparse'
import { evaluateFormula } from '@/lib/formula-evaluator'

type DataRow = Record<string, unknown>

interface FilePayload {
  name: string
  data: ArrayBuffer
}

export type ExcelWorkerRequest =
  | { action: 'formula'; input: string }
  | { action: 'analyze'; file: FilePayload }
  | { action: 'compare'; left: FilePayload; right: FilePayload }
  | { action: 'load-calculator'; file: FilePayload }
  | { action: 'calculate'; col1: string; col2: string; operation: 'add' | 'subtract'; format: 'number' | 'currency' | 'percentage' }
  | { action: 'export-calculation'; results: CalculationRow[] }

interface ColumnStats {
  type: 'numeric' | 'text'
  nullCount: number
  uniqueCount: number
  min?: number
  max?: number
  avg?: number
}

export interface AnalyzerStats {
  rowCount: number
  columnCount: number
  columns: Record<string, ColumnStats>
}

export interface DiffResult {
  rowCountDiff: number
  added: DataRow[]
  removed: DataRow[]
  modified: Array<{ row: number; changes: Record<string, { old: unknown; new: unknown }> }>
}

export interface CalculationRow extends DataRow {
  row: number
  result: number
  formatted: string
}

export type ExcelWorkerResult =
  | { action: 'formula'; result: number }
  | { action: 'analyze'; stats: AnalyzerStats }
  | { action: 'compare'; result: DiffResult }
  | { action: 'load-calculator'; columns: string[]; rowCount: number }
  | { action: 'calculate'; results: CalculationRow[] }
  | { action: 'export-calculation'; buffer: ArrayBuffer }

let calculatorRows: DataRow[] = []

function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value
  if ('result' in value) return normalizeCellValue(value.result as ExcelJS.CellValue)
  if ('text' in value) return value.text
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  return String(value)
}

async function readSpreadsheet(file: FilePayload): Promise<DataRow[]> {
  const fileName = file.name.toLowerCase()
  if (fileName.endsWith('.csv')) {
    const text = new TextDecoder().decode(file.data)
    const parsed = Papa.parse<DataRow>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    })
    if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message)
    return parsed.data
  }

  if (!fileName.endsWith('.xlsx')) throw new Error('Only .xlsx and .csv files are supported.')
  const bytes = new Uint8Array(file.data)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The selected file is not a valid .xlsx workbook.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(file.data as never)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('The workbook does not contain a readable worksheet.')

  const headerRow = worksheet.getRow(1)
  const headers: string[] = []
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const header = normalizeCellValue(headerRow.getCell(column).value)
    headers.push(String(header ?? `Column ${column}`).trim() || `Column ${column}`)
  }

  const rows: DataRow[] = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const item: DataRow = {}
    headers.forEach((header, index) => {
      item[header] = normalizeCellValue(row.getCell(index + 1).value)
    })
    rows.push(item)
  })
  return rows
}

function analyzeRows(data: DataRow[]): AnalyzerStats {
  const columns = data.length > 0 ? Object.keys(data[0]) : []
  const stats: AnalyzerStats = { rowCount: data.length, columnCount: columns.length, columns: {} }

  columns.forEach((column) => {
    const values = data.map((row) => row[column]).filter((value) => value !== null && value !== undefined && value !== '')
    const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const columnStats: ColumnStats = {
      type: numericValues.length > values.length * 0.8 ? 'numeric' : 'text',
      nullCount: data.length - values.length,
      uniqueCount: new Set(values.map((value) => JSON.stringify(value))).size,
    }
    if (numericValues.length > 0) {
      columnStats.min = Math.min(...numericValues)
      columnStats.max = Math.max(...numericValues)
      columnStats.avg = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
    }
    stats.columns[column] = columnStats
  })

  return stats
}

function compareRows(left: DataRow[], right: DataRow[]): DiffResult {
  const result: DiffResult = {
    rowCountDiff: left.length - right.length,
    added: right.length > left.length ? right.slice(left.length) : [],
    removed: left.length > right.length ? left.slice(right.length) : [],
    modified: [],
  }

  const sharedLength = Math.min(left.length, right.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    const keys = new Set([...Object.keys(left[index]), ...Object.keys(right[index])])
    keys.forEach((key) => {
      if (JSON.stringify(left[index][key]) !== JSON.stringify(right[index][key])) {
        changes[key] = { old: left[index][key], new: right[index][key] }
      }
    })
    if (Object.keys(changes).length > 0) result.modified.push({ row: index + 1, changes })
  }
  return result
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value !== 'string') return null
  let match = value.match(/(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const [, hours, minutes, seconds, milliseconds, day, month, year] = match
    return new Date(+year, +month - 1, +day, +hours, +minutes, +seconds, +milliseconds)
  }
  match = value.match(/(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const [, hours, minutes, seconds, day, month, year] = match
    return new Date(+year, +month - 1, +day, +hours, +minutes, +seconds)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function calculateRows(col1: string, col2: string, operation: 'add' | 'subtract', format: 'number' | 'currency' | 'percentage') {
  return calculatorRows.map<CalculationRow>((row, index) => {
    const date1 = parseDate(row[col1])
    const date2 = parseDate(row[col2])
    const isDateCalculation = Boolean(date1 && date2)
    const value1 = date1?.getTime() ?? (Number.parseFloat(String(row[col1])) || 0)
    const value2 = date2?.getTime() ?? (Number.parseFloat(String(row[col2])) || 0)
    const result = operation === 'add' ? value1 + value2 : value1 - value2
    let formatted: string

    if (isDateCalculation && operation === 'subtract') {
      const difference = Math.abs(result)
      const days = Math.floor(difference / 86_400_000)
      const hours = Math.floor((difference % 86_400_000) / 3_600_000)
      const minutes = Math.floor((difference % 3_600_000) / 60_000)
      const seconds = Math.floor((difference % 60_000) / 1_000)
      const milliseconds = Math.floor(difference % 1_000)
      formatted = `${days > 0 ? `${days}d ` : ''}${hours > 0 || days > 0 ? `${hours}h ` : ''}${minutes > 0 || hours > 0 || days > 0 ? `${minutes}m ` : ''}${seconds}.${String(milliseconds).padStart(3, '0')}s`
    } else if (format === 'currency') {
      formatted = `$${result.toFixed(2)}`
    } else if (format === 'percentage') {
      formatted = `${result.toFixed(2)}%`
    } else {
      formatted = result.toFixed(2)
    }

    return { row: index + 1, [col1]: row[col1], [col2]: row[col2], result, formatted }
  })
}

async function exportCalculation(results: CalculationRow[]) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Results')
  if (results.length > 0) {
    const columns = Object.keys(results[0])
    worksheet.addRow(columns)
    results.forEach((result) => worksheet.addRow(columns.map((column) => result[column])))
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(buffer)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

self.onmessage = async (event: MessageEvent<{ id: number; payload: ExcelWorkerRequest }>) => {
  const { id, payload } = event.data
  try {
    let result: ExcelWorkerResult
    if (payload.action === 'formula') {
      result = { action: 'formula', result: evaluateFormula(payload.input) }
    } else if (payload.action === 'analyze') {
      result = { action: 'analyze', stats: analyzeRows(await readSpreadsheet(payload.file)) }
    } else if (payload.action === 'compare') {
      const [left, right] = await Promise.all([readSpreadsheet(payload.left), readSpreadsheet(payload.right)])
      result = { action: 'compare', result: compareRows(left, right) }
    } else if (payload.action === 'load-calculator') {
      calculatorRows = await readSpreadsheet(payload.file)
      result = { action: 'load-calculator', columns: calculatorRows.length > 0 ? Object.keys(calculatorRows[0]) : [], rowCount: calculatorRows.length }
    } else if (payload.action === 'calculate') {
      result = { action: 'calculate', results: calculateRows(payload.col1, payload.col2, payload.operation, payload.format) }
    } else {
      result = { action: 'export-calculation', buffer: await exportCalculation(payload.results) }
    }

    const transfer = result.action === 'export-calculation' ? [result.buffer] : []
    self.postMessage({ id, result }, transfer)
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : 'Spreadsheet processing failed.' })
  }
}

export {}
