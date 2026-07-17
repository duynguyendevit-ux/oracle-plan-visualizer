'use client'

import { useEffect, useState } from 'react'
import { TOAST_EVENT, type ToastOptions, type ToastTone } from '@/lib/toast'

interface ToastItem extends ToastOptions {
  id: number
  message: string
  tone: ToastTone
}

const toneClasses: Record<ToastTone, string> = {
  success: 'border-l-[#24a148]',
  error: 'border-l-[#da1e28]',
  info: 'border-l-primary',
  warning: 'border-l-[#f1c21b]',
}

export default function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<Omit<ToastItem, 'id'>>).detail
      const id = Date.now() + Math.random()
      const item: ToastItem = {
        id,
        message: detail.message,
        description: detail.description,
        duration: detail.duration ?? 3500,
        tone: detail.tone ?? 'info',
      }

      setItems((current) => [...current.slice(-3), item])
      window.setTimeout(() => {
        setItems((current) => current.filter((toast) => toast.id !== id))
      }, item.duration)
    }

    window.addEventListener(TOAST_EVENT, handleToast)
    return () => window.removeEventListener(TOAST_EVENT, handleToast)
  }, [])

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto border border-outline-variant/60 border-l-4 bg-surface-container-low p-4 text-on-surface shadow-warm-lg ${toneClasses[item.tone]}`}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.message}</p>
              {item.description && <p className="mt-1 text-sm text-on-surface-variant">{item.description}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}
              className="inline-flex h-7 w-7 flex-none items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
