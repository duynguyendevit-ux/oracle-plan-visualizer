/// <reference lib="webworker" />

import { analyzeLogText, type LogAnalysisResult } from '@/lib/log-analyzer'

export interface LogWorkerRequest {
  input: string
  filterLevel: string
  searchTerm: string
}

export type LogWorkerResult = LogAnalysisResult

self.onmessage = (event: MessageEvent<{ id: number; payload: LogWorkerRequest }>) => {
  const { id, payload } = event.data
  try {
    const result = analyzeLogText(payload.input, payload.filterLevel, payload.searchTerm, (progress) => {
      self.postMessage({ id, progress })
    })
    self.postMessage({ id, result })
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : 'Log analysis failed.' })
  }
}

export {}
