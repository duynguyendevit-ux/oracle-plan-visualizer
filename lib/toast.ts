export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  description?: string
  duration?: number
  tone?: ToastTone
}

export const TOAST_EVENT = 'mydevtools:toast'

export function notify(message: string, options: ToastOptions = {}) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: {
      message,
      description: options.description,
      duration: options.duration ?? 3500,
      tone: options.tone ?? 'info',
    },
  }))
}

export const toast = {
  success: (message: string, description?: string) => notify(message, { description, tone: 'success' }),
  error: (message: string, description?: string) => notify(message, { description, tone: 'error', duration: 5000 }),
  info: (message: string, description?: string) => notify(message, { description, tone: 'info' }),
  warning: (message: string, description?: string) => notify(message, { description, tone: 'warning', duration: 4500 }),
}

export async function copyText(text: string, successMessage = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
    return true
  } catch {
    toast.error('Unable to copy', 'Your browser blocked clipboard access.')
    return false
  }
}
