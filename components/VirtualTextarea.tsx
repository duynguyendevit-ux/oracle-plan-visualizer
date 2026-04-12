'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface VirtualTextareaProps {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
  disabled?: boolean
}

export function VirtualTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  readOnly = false,
  disabled = false
}: VirtualTextareaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 100 })
  const [scrollTop, setScrollTop] = useState(0)
  
  const lines = value.split('\n')
  const lineHeight = 20 // pixels per line
  const totalHeight = lines.length * lineHeight
  const viewportHeight = 384 // h-96 = 24rem = 384px

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    setScrollTop(scrollTop)

    // Calculate visible range with buffer
    const buffer = 50
    const start = Math.max(0, Math.floor(scrollTop / lineHeight) - buffer)
    const end = Math.min(
      lines.length,
      Math.ceil((scrollTop + viewportHeight) / lineHeight) + buffer
    )

    setVisibleRange({ start, end })
  }, [lines.length, lineHeight, viewportHeight])

  const visibleLines = lines.slice(visibleRange.start, visibleRange.end)
  const offsetTop = visibleRange.start * lineHeight

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto ${className}`}
      style={{ height: viewportHeight }}
      onScroll={handleScroll}
    >
      {/* Spacer for total height */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible content */}
        <div
          style={{
            position: 'absolute',
            top: offsetTop,
            left: 0,
            right: 0
          }}
        >
          {visibleLines.map((line, idx) => {
            const lineNumber = visibleRange.start + idx + 1
            return (
              <div
                key={lineNumber}
                className="flex font-mono text-sm"
                style={{ height: lineHeight }}
              >
                <span className="inline-block w-12 text-right pr-2 text-on-surface-variant/50 select-none">
                  {lineNumber}
                </span>
                <span className="flex-1 text-on-surface whitespace-pre">
                  {line || ' '}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Placeholder */}
      {!value && placeholder && (
        <div className="absolute top-2 left-14 text-on-surface-variant/50 pointer-events-none">
          {placeholder}
        </div>
      )}

      {/* Hidden textarea for editing (if not readOnly) */}
      {!readOnly && (
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          className="absolute inset-0 opacity-0 pointer-events-auto"
          style={{ resize: 'none' }}
        />
      )}
    </div>
  )
}
