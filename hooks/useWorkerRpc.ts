'use client'

import { useCallback, useEffect, useRef } from 'react'

interface WorkerRequest<T> {
  id: number
  payload: T
}

interface WorkerResponse<T> {
  id: number
  result?: T
  error?: string
  progress?: number
}

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (reason: Error) => void
  onProgress?: (progress: number) => void
}

export function useWorkerRpc<Request, Response>(createWorker: () => Worker) {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef(new Map<number, PendingRequest<Response>>())
  const createWorkerRef = useRef(createWorker)

  useEffect(() => {
    const worker = createWorkerRef.current()
    const pendingRequests = pendingRef.current
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse<Response>>) => {
      const message = event.data
      const pending = pendingRequests.get(message.id)
      if (!pending) return

      if (typeof message.progress === 'number') {
        pending.onProgress?.(message.progress)
        return
      }

      pendingRequests.delete(message.id)
      if (message.error) pending.reject(new Error(message.error))
      else pending.resolve(message.result as Response)
    }

    worker.onerror = (event) => {
      const error = new Error(event.message || 'Background worker failed.')
      pendingRequests.forEach((pending) => pending.reject(error))
      pendingRequests.clear()
    }

    return () => {
      worker.terminate()
      workerRef.current = null
      pendingRequests.forEach((pending) => pending.reject(new Error('Background task was cancelled.')))
      pendingRequests.clear()
    }
  }, [])

  return useCallback((payload: Request, options: { onProgress?: (progress: number) => void; transfer?: Transferable[] } = {}) => {
    return new Promise<Response>((resolve, reject) => {
      const worker = workerRef.current
      if (!worker) {
        reject(new Error('Background worker is not ready.'))
        return
      }

      const id = ++requestIdRef.current
      pendingRef.current.set(id, { resolve, reject, onProgress: options.onProgress })
      const request: WorkerRequest<Request> = { id, payload }
      worker.postMessage(request, options.transfer ?? [])
    })
  }, [])
}
