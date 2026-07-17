import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}

export default function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center ${compact ? 'min-h-[10rem]' : 'min-h-[18rem]'}`}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center bg-surface-container text-on-surface-variant">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M5 7h14M5 12h14M5 17h8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-on-surface-variant">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
