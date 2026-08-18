/// <reference lib="webworker" />

import { extractSQL, formatSQL } from '@/lib/sql-extractor'

export type SqlWorkerRequest =
  | { action: 'extract'; input: string }
  | { action: 'format'; input: string }

export type SqlWorkerResult =
  | { action: 'extract'; sql: string; lines: number }
  | { action: 'format'; sql: string }

self.onmessage = (event: MessageEvent<{ id: number; payload: SqlWorkerRequest }>) => {
  const { id, payload } = event.data
  try {
    const result: SqlWorkerResult = payload.action === 'extract'
      ? { action: 'extract', ...extractSQL(payload.input) }
      : { action: 'format', sql: formatSQL(payload.input) }
    self.postMessage({ id, result })
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : 'SQL processing failed.' })
  }
}

export {}
