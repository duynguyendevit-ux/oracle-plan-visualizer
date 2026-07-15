'use client'

import { type KeyboardEvent, useMemo, useRef, useState } from 'react'

interface EnvVar {
  name: string
  value: string
}

const sampleEnv = `server.port=8082
server.tomcat.connection-timeout=10s
server.tomcat.threads.max=150
server.tomcat.threads.min-spare=20
server.tomcat.max-connections=2000
server.tomcat.accept-count=300
server.tomcat.keep-alive-timeout=15s

spring.servlet.multipart.enabled= true
spring.servlet.multipart.max-file-size= 100MB
spring.servlet.multipart.max-request-size= 100MB

schedule:
    reception:
        completed:
            enabled: true
            pageSize: 300
            fixedRate: 29000
            initialDelay: 10000
            minutes-back: PT30M

cloud:
    stream:
        kafka:
            bindings:
                elevateEventLevelConsumer-in-0:
                    consumer:
                        configuration:
                            max.poll.records: 50
                            fetch.max.wait.ms: 100`

function stripInlineComment(value: string) {
  let quote: string | null = null

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    const previous = value[i - 1]

    if ((char === '"' || char === "'") && previous !== '\\') {
      quote = quote === char ? null : quote ?? char
    }

    if (char === '#' && quote === null && /\s/.test(previous ?? '')) {
      return value.slice(0, i).trimEnd()
    }
  }

  return value.trim()
}

function unquote(value: string) {
  const trimmed = stripInlineComment(value)
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function toEnvName(key: string) {
  return key.trim().replace(/[.-]+/g, '_').toUpperCase()
}

function normalizeYamlLines(input: string) {
  const lines = input.split('\n').map((line) => line.replace(/\t/g, '    '))
  const significantLines = lines
    .map((line, index) => ({
      index,
      indent: line.match(/^\s*/)?.[0].length ?? 0,
      content: line.trim(),
    }))
    .filter((line) => line.content && !line.content.startsWith('#'))

  if (significantLines.length < 3) return lines

  const [firstLine, secondLine] = significantLines
  const positiveIndents = significantLines
    .map((line) => line.indent)
    .filter((indent) => indent > 0)
  const indentSize = positiveIndents.length > 0 ? Math.min(...positiveIndents) : 0
  const firstIsYamlContainer = /^[A-Za-z_][A-Za-z0-9_.-]*:\s*$/.test(firstLine.content)
  const hasSiblingAtBaseIndent = significantLines
    .slice(2)
    .some((line) => line.indent === indentSize)

  // Copying a YAML fragment often strips indentation from only its first line.
  if (
    firstIsYamlContainer &&
    firstLine.indent === 0 &&
    indentSize > 0 &&
    secondLine.indent >= indentSize * 2 &&
    hasSiblingAtBaseIndent
  ) {
    lines[firstLine.index] = `${' '.repeat(indentSize)}${lines[firstLine.index]}`
  }

  return lines
}

function parseEnv(input: string) {
  const vars: EnvVar[] = []
  const errors: string[] = []
  const yamlStack: Array<{ indent: number; key: string }> = []

  normalizeYamlLines(input).forEach((rawLine, index) => {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) return

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
    const separatorIndex = normalized.indexOf('=')

    if (separatorIndex >= 0) {
      const name = normalized.slice(0, separatorIndex).trim()
      const value = normalized.slice(separatorIndex + 1)

      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
        errors.push(`Line ${index + 1}: invalid property name "${name}"`)
        return
      }

      vars.push({ name: toEnvName(name), value: unquote(value) })
      return
    }

    const yamlMatch = rawLine.match(/^(\s*)([A-Za-z_][A-Za-z0-9_.-]*):\s*(.*)$/)

    if (!yamlMatch) {
      errors.push(`Line ${index + 1}: expected KEY=value or YAML key: value`)
      return
    }

    const [, indentText, key, rawValue] = yamlMatch
    const indent = indentText.length
    const value = unquote(rawValue)

    while (yamlStack.length > 0 && indent <= yamlStack[yamlStack.length - 1].indent) {
      yamlStack.pop()
    }

    const path = [...yamlStack.map((item) => item.key), key]

    if (value) {
      vars.push({ name: toEnvName(path.join('.')), value })
    } else {
      yamlStack.push({ indent, key })
    }
  })

  return { vars, errors }
}

function quoteYaml(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function toK8sEnv(vars: EnvVar[], includeEnvKey: boolean) {
  const indent = includeEnvKey ? '  ' : '            '
  const body = vars
    .map((item) => `${indent}- name: ${item.name}\n${indent}  value: ${quoteYaml(item.value)}`)
    .join('\n')

  return includeEnvKey ? `env:\n${body}` : body
}

function getCurrentLineRemoval(value: string, cursor: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(cursor - 1, 0)) + 1
  const nextLineBreak = value.indexOf('\n', cursor)
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak
  const lineText = value.slice(lineStart, lineEnd)

  if (nextLineBreak !== -1) {
    return {
      lineText,
      value: `${value.slice(0, lineStart)}${value.slice(nextLineBreak + 1)}`,
      cursor: lineStart,
    }
  }

  const removalStart = lineStart > 0 ? lineStart - 1 : lineStart
  return {
    lineText,
    value: `${value.slice(0, removalStart)}${value.slice(lineEnd)}`,
    cursor: removalStart,
  }
}

export default function EnvToK8s() {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [includeEnvKey, setIncludeEnvKey] = useState(false)
  const [sortKeys, setSortKeys] = useState(false)
  const [clipboardError, setClipboardError] = useState('')

  const parsed = useMemo(() => parseEnv(input), [input])
  const envVars = useMemo(() => {
    const vars = [...parsed.vars]
    return sortKeys ? vars.sort((a, b) => a.name.localeCompare(b.name)) : vars
  }, [parsed.vars, sortKeys])

  const loadSample = () => {
    setInput(sampleEnv)
    setOutput('')
    setClipboardError('')
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setInput(text)
      setOutput('')
      setClipboardError('')
    } catch {
      setClipboardError('Browser blocked clipboard access. Use Ctrl+V inside the input box.')
    }
  }

  const convertToYaml = () => {
    setOutput(toK8sEnv(envVars, includeEnvKey))
  }

  const copyToClipboard = () => {
    if (!output) return
    navigator.clipboard.writeText(output)
  }

  const clearAll = () => {
    setInput('')
    setOutput('')
    setClipboardError('')
  }

  const removeCurrentLine = (cursor: number) => {
    const removal = getCurrentLineRemoval(input, cursor)
    setInput(removal.value)
    setOutput('')
    setClipboardError('')

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(removal.cursor, removal.cursor)
    })

    return removal
  }

  const handleEditorKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return

    const key = event.key.toLowerCase()
    const hasSelection = event.currentTarget.selectionStart !== event.currentTarget.selectionEnd

    if (key === 'k') {
      event.preventDefault()
      removeCurrentLine(event.currentTarget.selectionStart)
      return
    }

    if (key === 'x' && !hasSelection) {
      event.preventDefault()
      const cursor = event.currentTarget.selectionStart
      const removal = getCurrentLineRemoval(input, cursor)

      try {
        await navigator.clipboard.writeText(`${removal.lineText}\n`)
        removeCurrentLine(cursor)
      } catch {
        setClipboardError('Browser blocked clipboard access. Select text before using Ctrl+X.')
      }
    }
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
          <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">Variables</div>
          <div className="text-2xl font-serif font-semibold text-warm-800">{envVars.length}</div>
        </div>
        <div className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60">
          <div className="text-xs font-medium text-warm-600 uppercase tracking-wide mb-1">Errors</div>
          <div className="text-2xl font-serif font-semibold text-tertiary">{parsed.errors.length}</div>
        </div>
        <label className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={includeEnvKey}
            onChange={(event) => setIncludeEnvKey(event.target.checked)}
            className="w-4 h-4 rounded border-warm-300 text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-warm-800">Include env:</span>
        </label>
        <label className="bg-warm-50 rounded-lg p-4 shadow-warm border border-warm-300/60 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sortKeys}
            onChange={(event) => setSortKeys(event.target.checked)}
            className="w-4 h-4 rounded border-warm-300 text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-warm-800">Sort keys</span>
        </label>
      </div>

      {parsed.errors.length > 0 && (
        <div className="mb-4 bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Parse Warnings</h3>
          </div>
          <div className="p-4 space-y-1">
            {parsed.errors.map((error) => (
              <p key={error} className="text-sm text-tertiary font-mono">
                {error}
              </p>
            ))}
          </div>
        </div>
      )}

      {clipboardError && (
        <div className="mb-4 bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="p-4">
            <p className="text-sm text-tertiary font-mono">{clipboardError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Environment Variables</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="px-3 py-1.5 bg-primary text-white text-sm rounded hover:bg-primary/90 font-medium transition-colors"
              >
                Paste
              </button>
              <button
                type="button"
                onClick={loadSample}
                className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
              >
                Load Sample
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={!input}
                className="px-3 py-1.5 bg-surface-container text-on-surface text-sm rounded hover:bg-surface-container-high font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="p-4">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setOutput('')
              }}
              onKeyDown={handleEditorKeyDown}
              placeholder="Paste properties or YAML here, for example: spring.servlet.multipart.enabled= true"
              className="w-full h-[520px] p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
            />
            <button
              type="button"
              onClick={convertToYaml}
              disabled={!input.trim()}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded hover:bg-primary/90 font-semibold transition-colors shadow-warm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Convert to K8s YAML
            </button>
          </div>
        </div>

        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Kubernetes Env YAML</h3>
            <button
              type="button"
              onClick={copyToClipboard}
              disabled={!output}
              className="px-3 py-1.5 bg-primary text-white text-sm rounded hover:bg-primary/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy
            </button>
          </div>

          <div className="p-4">
            <textarea
              value={output}
              readOnly
              placeholder="Kubernetes env YAML will appear here..."
              className="w-full h-[520px] p-3 border border-warm-300/60 rounded bg-white font-mono text-sm resize-none text-warm-800 placeholder-warm-400"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
