'use client'

import { useMemo, useState } from 'react'
import { useToolSession } from '@/hooks/useToolSession'
import { copyText, toast } from '@/lib/toast'

interface CronState {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  weekday: string
}

interface CronField {
  key: keyof CronState
  label: string
  placeholder: string
  description: string
  min: number
  max: number
}

const defaultCron: CronState = {
  minute: '0',
  hour: '9',
  dayOfMonth: '*',
  month: '*',
  weekday: '1-5',
}

const cronFields: CronField[] = [
  { key: 'minute', label: 'Minute', placeholder: '0-59', description: '0-59', min: 0, max: 59 },
  { key: 'hour', label: 'Hour (0-23)', placeholder: '0-23', description: '0-23', min: 0, max: 23 },
  { key: 'dayOfMonth', label: 'Day of month', placeholder: '1-31', description: '1-31', min: 1, max: 31 },
  { key: 'month', label: 'Month', placeholder: '1-12', description: '1-12', min: 1, max: 12 },
]

const weekdayOptions = [
  { value: '*', label: 'Every day' },
  { value: '1-5', label: 'Monday–Friday' },
  { value: '0,6', label: 'Saturday–Sunday' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const fieldPattern = /^[0-9*/,-]+$/

function fieldError(field: CronField, value: string) {
  const normalized = value.trim()
  if (!normalized) return `${field.label} cannot be empty.`
  if (!fieldPattern.test(normalized)) return `${field.label} contains unsupported characters.`
  if (/^\d+$/.test(normalized)) {
    const numericValue = Number(normalized)
    if (numericValue < field.min || numericValue > field.max) {
      return `${field.label} must be between ${field.min} and ${field.max}.`
    }
  }
  return null
}

function describeWeekday(value: string) {
  if (value === '*') return 'every day'
  if (value === '1-5') return 'Monday through Friday'
  if (value === '0,6') return 'Saturday and Sunday'
  return weekdayOptions.find((option) => option.value === value)?.label || `weekday ${value}`
}

function describeSchedule(cron: CronState) {
  const minute = cron.minute.trim()
  const hour = cron.hour.trim()
  const weekday = describeWeekday(cron.weekday)
  const dateScope = cron.dayOfMonth === '*' && cron.month === '*'
    ? weekday
    : `on day ${cron.dayOfMonth} of ${cron.month === '*' ? 'each month' : `month ${cron.month}`}`

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    return `At ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}, ${dateScope}.`
  }

  if (/^\*\/(\d+)$/.test(minute)) {
    return `Every ${minute.match(/^\*\/(\d+)$/)?.[1]} minutes, ${dateScope}.`
  }

  if (minute === '*' && hour === '*') return `Every minute, ${dateScope}.`
  return `When minute ${minute} and hour ${hour} match, ${dateScope}.`
}

function makeExpression(cron: CronState) {
  return [cron.minute.trim(), cron.hour.trim(), cron.dayOfMonth.trim(), cron.month.trim(), cron.weekday].join(' ')
}

export default function CronExpressionGenerator() {
  const [cron, setCron] = useState<CronState>(defaultCron)

  useToolSession('cron-expression', cron, (saved) => {
    if (!saved || typeof saved !== 'object') return
    const next = saved as Partial<CronState>
    setCron({
      minute: typeof next.minute === 'string' ? next.minute : defaultCron.minute,
      hour: typeof next.hour === 'string' ? next.hour : defaultCron.hour,
      dayOfMonth: typeof next.dayOfMonth === 'string' ? next.dayOfMonth : defaultCron.dayOfMonth,
      month: typeof next.month === 'string' ? next.month : defaultCron.month,
      weekday: typeof next.weekday === 'string' ? next.weekday : defaultCron.weekday,
    })
  })

  const validation = useMemo(() => {
    const errors = cronFields
      .map((field) => fieldError(field, cron[field.key]))
      .filter((error): error is string => Boolean(error))
    return errors
  }, [cron])

  const expression = makeExpression(cron)
  const description = validation.length > 0
    ? 'Fix the highlighted fields before using this expression.'
    : describeSchedule(cron)

  const updateField = (key: keyof CronState, value: string) => {
    setCron((current) => ({ ...current, [key]: value }))
  }

  const loadSample = () => {
    setCron(defaultCron)
    toast.info('Weekday morning sample loaded')
  }

  const copyExpression = () => {
    if (validation.length > 0) {
      toast.error('Cannot copy invalid cron expression', validation[0])
      return
    }
    void copyText(expression, 'Cron expression copied')
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 border-b border-outline-variant/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Developer tool</p>
          <h1 className="text-2xl font-semibold text-on-surface md:text-3xl">Cron Expression Generator</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Build a five-field cron schedule from readable time and date controls.</p>
        </div>
        <button
          type="button"
          onClick={loadSample}
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-outline-variant/60 bg-surface-container px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M4 4v5h5M20 20v-5h-5M5.2 15a7 7 0 0 0 11.9 2M18.8 9a7 7 0 0 0-11.9-2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Load sample
        </button>
      </div>

      <section className="overflow-hidden border border-outline-variant/60 bg-surface-container-low" aria-labelledby="cron-tool-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 bg-surface-container px-4 py-3">
          <h2 id="cron-tool-heading" className="text-sm font-semibold text-on-surface">Cron Expression Generator</h2>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-on-surface-variant"><span className="h-2 w-2 bg-green-600" />5-field cron</span>
        </div>

        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cronFields.map((field) => {
              const error = fieldError(field, cron[field.key])
              return (
                <label key={field.key} className="block min-w-0">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">{field.label}</span>
                  <input
                    value={cron[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    aria-label={field.label}
                    aria-invalid={Boolean(error)}
                    className={`h-10 w-full border px-3 font-mono text-sm text-on-surface ${error ? 'border-tertiary' : 'border-outline-variant/60'}`}
                    spellCheck={false}
                  />
                  <span className="mt-1 block text-[10px] text-on-surface-variant">{field.description}</span>
                </label>
              )
            })}
            <label className="block min-w-0 sm:col-span-2 lg:col-span-1">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Weekday</span>
              <select
                value={cron.weekday}
                onChange={(event) => updateField('weekday', event.target.value)}
                aria-label="Weekday"
                className="h-10 w-full border border-outline-variant/60 px-3 text-sm text-on-surface"
              >
                {weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="mt-1 block text-[10px] text-on-surface-variant">0-6</span>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 bg-[#161616] px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
            <code className="break-all font-mono text-base font-semibold tracking-[0.16em]" aria-label="Generated cron expression">{expression}</code>
            <button type="button" onClick={copyExpression} className="self-start text-xs text-[#78a9ff] underline decoration-[#78a9ff]/50 hover:decoration-[#78a9ff] sm:self-auto">Copy</button>
          </div>

          <p className="mt-3 text-sm text-on-surface" aria-live="polite">{description}</p>

          {validation.length > 0 && (
            <div className="mt-4 border-l-4 border-[var(--cds-warning)] bg-surface-container p-3 text-sm text-on-surface-variant" role="alert">
              {validation.map((error) => <p key={error}>{error}</p>)}
            </div>
          )}

          <div className="mt-5 border-l-4 border-[var(--cds-warning)] bg-[#f6f0d8] p-3 text-xs text-[#525252] dark:bg-[#393000] dark:text-[#f1c21b]">
            Cron weekday numbering and timezone behavior can vary by scheduler. Confirm both before deploying a job.
          </div>
        </div>
      </section>

      <section className="mt-8 max-w-3xl space-y-3" aria-labelledby="cron-help-heading">
        <h2 id="cron-help-heading" className="text-lg font-semibold text-on-surface">How to use this cron expression generator</h2>
        <p className="text-sm text-on-surface-variant">Choose the minute, hour, day, month, and weekday values that match the schedule you need.</p>
        <p className="text-sm text-on-surface-variant">Review the generated expression, then copy it into the scheduler that will run your job.</p>
      </section>
    </div>
  )
}
