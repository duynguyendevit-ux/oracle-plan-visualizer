'use client'

import { useEffect, useRef, useState } from 'react'

interface ToolSessionOptions<T> {
  debounceMs?: number
  maxBytes?: number
  validate?: (value: unknown) => value is T
}

export function useToolSession<T>(
  toolId: string,
  value: T,
  restore: (value: T) => void,
  options: ToolSessionOptions<T> = {},
) {
  const [isRestored, setIsRestored] = useState(false)
  const restoreRef = useRef(restore)
  restoreRef.current = restore

  const storageKey = `mydevtools:session:${toolId}:v1`
  const debounceMs = options.debounceMs ?? 300
  const maxBytes = options.maxBytes ?? 750_000
  const validate = options.validate

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as unknown
        if (!validate || validate(parsed)) {
          restoreRef.current(parsed as T)
        } else {
          localStorage.removeItem(storageKey)
        }
      }
    } catch {
      localStorage.removeItem(storageKey)
    } finally {
      setIsRestored(true)
    }
  }, [storageKey, validate])

  useEffect(() => {
    if (!isRestored) return

    const timer = window.setTimeout(() => {
      try {
        const serialized = JSON.stringify(value)
        if (new Blob([serialized]).size <= maxBytes) {
          localStorage.setItem(storageKey, serialized)
        } else {
          localStorage.removeItem(storageKey)
        }
      } catch {
        // Session persistence is best effort and must not block the tool.
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [debounceMs, isRestored, maxBytes, storageKey, value])

  return isRestored
}
