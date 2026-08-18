'use client'

import { useMemo, useState } from 'react'
import { useToolSession } from '@/hooks/useToolSession'
import { copyText, toast } from '@/lib/toast'

type RedirectCode = '301' | '302' | '308'

interface RedirectParseResult {
  output: string
  warnings: string[]
  validCount: number
}

const sampleRedirects = `/old-home | https://example.com/
/outdated/* | https://example.com/archive/$1
/docs/start | https://docs.example.com/getting-started`

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isValidSourcePath(source: string) {
  return source.startsWith('/')
    && !source.startsWith('//')
    && !/\s/.test(source)
    && !/[;{}]/.test(source)
}

function isValidTargetUrl(target: string) {
  if (!/^https?:\/\/\S+$/i.test(target) || /[;{}]/.test(target)) return false

  try {
    new URL(target)
    return true
  } catch {
    return false
  }
}

function parseRedirects(input: string, code: RedirectCode): RedirectParseResult {
  const outputLines: string[] = []
  const warnings: string[] = []

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) return

    const separatorIndex = line.indexOf('|')
    if (separatorIndex === -1) {
      warnings.push(`Line ${lineNumber}: expected OLD PATH | NEW URL.`)
      return
    }

    if (line.indexOf('|', separatorIndex + 1) !== -1) {
      warnings.push(`Line ${lineNumber}: use exactly one | separator.`)
      return
    }

    const source = line.slice(0, separatorIndex).trim()
    const target = line.slice(separatorIndex + 1).trim()

    if (!source) {
      warnings.push(`Line ${lineNumber}: old path is required.`)
      return
    }

    if (!isValidSourcePath(source)) {
      warnings.push(`Line ${lineNumber}: old path must start with / and contain no spaces or Nginx delimiters.`)
      return
    }

    if (source.includes('*') && (!source.endsWith('/*') || source.slice(0, -2).includes('*'))) {
      warnings.push(`Line ${lineNumber}: wildcard is only supported once at the end as /*.`)
      return
    }

    if (!target) {
      warnings.push(`Line ${lineNumber}: new URL is required.`)
      return
    }

    if (!isValidTargetUrl(target)) {
      warnings.push(`Line ${lineNumber}: new URL must be an absolute http:// or https:// URL.`)
      return
    }

    if (source.endsWith('/*')) {
      const prefix = source.slice(0, -1)
      const pattern = `^${escapeRegex(prefix)}(.*)$`

      if (!target.includes('$1')) {
        warnings.push(`Line ${lineNumber}: wildcard target does not contain $1; the matched suffix will be discarded.`)
      }

      if (code === '308') {
        outputLines.push(`location ~ ${pattern} { return 308 ${target}; }`)
      } else {
        const flag = code === '302' ? 'redirect' : 'permanent'
        outputLines.push(`rewrite ${pattern} ${target} ${flag};`)
      }
      return
    }

    outputLines.push(`location = ${source} { return ${code} ${target}; }`)
  })

  return {
    output: outputLines.join('\n'),
    warnings,
    validCount: outputLines.length,
  }
}

function downloadText(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'nginx-redirects.conf'
  link.click()
  URL.revokeObjectURL(url)
}

export default function NginxRedirectGenerator() {
  const [input, setInput] = useState('')
  const [code, setCode] = useState<RedirectCode>('301')

  useToolSession('nginx-redirect', { input, code }, (saved) => {
    if (typeof saved.input === 'string') setInput(saved.input)
    if (saved.code === '301' || saved.code === '302' || saved.code === '308') setCode(saved.code)
  })

  const parsed = useMemo(() => parseRedirects(input, code), [code, input])
  const hasInput = input.trim().length > 0
  const hasOutput = parsed.output.length > 0

  const loadSample = () => {
    setInput(sampleRedirects)
    setCode('301')
  }

  const copyResult = () => {
    if (!hasOutput) return
    void copyText(parsed.output, 'Nginx redirects copied')
  }

  const downloadResult = () => {
    if (!hasOutput) return
    downloadText(parsed.output)
    toast.success('Nginx config downloaded')
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 border-b border-outline-variant/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Server config utility</p>
          <h1 className="text-2xl font-semibold text-on-surface md:text-3xl">Nginx Redirect Generator</h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">Turn path mappings into reviewable Nginx redirect rules.</p>
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

      <section className="mb-4 flex flex-col gap-3 border border-outline-variant/60 bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Redirect operation">
        <div>
          <label htmlFor="redirect-code" className="block text-sm font-semibold text-on-surface">Operation</label>
          <p className="mt-1 text-xs text-on-surface-variant">Choose the status code for generated redirects.</p>
        </div>
        <select
          id="redirect-code"
          value={code}
          onChange={(event) => setCode(event.target.value as RedirectCode)}
          className="h-10 w-full border border-outline-variant/60 px-3 text-sm font-medium text-on-surface sm:w-52"
        >
          <option value="301">301 permanent</option>
          <option value="302">302 temporary</option>
          <option value="308">308 permanent</option>
        </select>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col border border-outline-variant/60 bg-surface-container-low" aria-labelledby="redirect-input-label">
          <div className="flex min-h-14 items-center border-b border-outline-variant/60 px-4">
            <label id="redirect-input-label" htmlFor="redirect-input" className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface">REDIRECTS — ONE PER LINE: OLD PATH | NEW URL</label>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <textarea
              id="redirect-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="/old-path | https://example.com/new-path"
              className="min-h-[22rem] w-full flex-1 resize-y border border-outline-variant/60 p-3 font-mono text-sm leading-6 text-on-surface placeholder:text-on-surface-variant/70"
              spellCheck={false}
              aria-describedby="redirect-input-help"
            />
            <p id="redirect-input-help" className="mt-3 text-xs text-on-surface-variant">Blank lines and lines beginning with # are ignored. Use /* to preserve a trailing path with $1.</p>
          </div>
        </section>

        <section className="flex min-w-0 flex-col border border-outline-variant/60 bg-surface-container-low" aria-labelledby="redirect-result-label">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 px-4">
            <label id="redirect-result-label" htmlFor="redirect-result" className="text-xs font-semibold uppercase tracking-[0.12em] text-on-surface">RESULT</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyResult}
                disabled={!hasOutput}
                className="inline-flex min-h-9 items-center gap-1.5 border border-outline-variant/60 bg-surface-container px-2.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M8 8h10v12H8zM6 16H4V4h10v2" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                Copy result
              </button>
              <button
                type="button"
                onClick={downloadResult}
                disabled={!hasOutput}
                className="inline-flex min-h-9 items-center gap-1.5 bg-primary px-2.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download
              </button>
            </div>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <textarea
              id="redirect-result"
              value={parsed.output}
              readOnly
              placeholder="Generated Nginx rules will appear here."
              className="min-h-[22rem] w-full flex-1 resize-y border border-outline-variant/60 p-3 font-mono text-sm leading-6 text-on-surface placeholder:text-on-surface-variant/70"
              spellCheck={false}
              aria-describedby="redirect-result-status"
            />
            <p id="redirect-result-status" className="mt-3 text-xs text-on-surface-variant" aria-live="polite">
              {parsed.validCount > 0 ? `${parsed.validCount} rule${parsed.validCount === 1 ? '' : 's'} generated.` : hasInput ? 'No valid rules generated.' : 'Waiting for redirect mappings.'}
            </p>
          </div>
        </section>
      </div>

      {parsed.warnings.length > 0 && (
        <section className="mt-4 border-l-4 border-[var(--cds-warning)] bg-surface-container p-4" aria-live="polite" aria-labelledby="parse-warnings-heading">
          <h2 id="parse-warnings-heading" className="text-sm font-semibold text-on-surface">Parse warnings</h2>
          <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
            {parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </section>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-on-surface-variant">
        <svg className="mt-0.5 h-4 w-4 flex-none text-[var(--cds-warning)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M12 4 3 20h18L12 4Z" strokeWidth="2" strokeLinejoin="round" /><path d="M12 9v5m0 3h.01" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Review the generated rules and run <code className="font-mono text-on-surface">nginx -t</code> before reloading Nginx.
      </p>
    </div>
  )
}
