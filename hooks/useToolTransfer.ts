'use client'

import { useEffect, useRef } from 'react'

export type ToolTransferTarget = 'sql-extractor' | 'execution-plan' | 'diff-viewer'

interface ToolTransferEnvelope<T> {
  createdAt: number
  payload: T
}

const transferPrefix = 'mydevtools:transfer:'

export function sendToolTransfer<T>(target: ToolTransferTarget, payload: T) {
  const envelope: ToolTransferEnvelope<T> = { createdAt: Date.now(), payload }
  localStorage.setItem(`${transferPrefix}${target}`, JSON.stringify(envelope))
}

export function useToolTransfer<T>(target: ToolTransferTarget, onReceive: (payload: T) => void) {
  const receiveRef = useRef(onReceive)
  receiveRef.current = onReceive

  useEffect(() => {
    const key = `${transferPrefix}${target}`
    const saved = localStorage.getItem(key)
    if (!saved) return
    localStorage.removeItem(key)

    try {
      const envelope = JSON.parse(saved) as ToolTransferEnvelope<T>
      if (typeof envelope.createdAt !== 'number' || Date.now() - envelope.createdAt > 10 * 60 * 1000) return
      receiveRef.current(envelope.payload)
    } catch {
      // Invalid handoff data is discarded instead of blocking the destination tool.
    }
  }, [target])
}
