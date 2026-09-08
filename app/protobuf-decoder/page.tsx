'use client'

import { useMemo, useState } from 'react'
import { useToolSession } from '@/hooks/useToolSession'
import { useWorkerRpc } from '@/hooks/useWorkerRpc'
import { copyText, toast } from '@/lib/toast'
import type { KafkaFraming, PayloadFormat, ProtobufDecodeRequest, ProtobufDecodeResult } from '@/workers/protobuf-decoder.worker'

const sampleSchema = `syntax = "proto3";

message UserProfile {
  string userId = 1;
  string username = 2;
  string email = 3;
  bool active = 4;
}`

const sampleHex = '0a09757365722d313034321208616c65782e6c65651a14616c65782e6c6565406578616d706c652e636f6d2001'

interface DecoderSession {
  payload: string
  format: PayloadFormat
  schema: string
  messageType: string
  framing: KafkaFraming
}

function downloadJson(output: string) {
  const url = URL.createObjectURL(new Blob([output], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'protobuf-decoded.json'
  link.click()
  URL.revokeObjectURL(url)
}

export default function ProtobufDecoder() {
  const [payload, setPayload] = useState('')
  const [format, setFormat] = useState<PayloadFormat>('hex')
  const [schema, setSchema] = useState('')
  const [messageType, setMessageType] = useState('')
  const [framing, setFraming] = useState<KafkaFraming>('auto')
  const [result, setResult] = useState<ProtobufDecodeResult | null>(null)
  const [error, setError] = useState('')
  const [isDecoding, setIsDecoding] = useState(false)

  const runWorker = useWorkerRpc<ProtobufDecodeRequest, ProtobufDecodeResult>(() => new Worker(new URL('../../workers/protobuf-decoder.worker.ts', import.meta.url), { type: 'module' }))

  useToolSession<DecoderSession>('protobuf-decoder', { payload, format, schema, messageType, framing }, (saved) => {
    if (typeof saved.payload === 'string') setPayload(saved.payload)
    if (saved.format === 'hex' || saved.format === 'base64' || saved.format === 'escaped') setFormat(saved.format)
    if (typeof saved.schema === 'string') setSchema(saved.schema)
    if (typeof saved.messageType === 'string') setMessageType(saved.messageType)
    if (saved.framing === 'auto' || saved.framing === 'raw' || saved.framing === 'confluent') setFraming(saved.framing)
  }, { maxBytes: 1_500_000 })

  const output = useMemo(() => result ? JSON.stringify(result.output, null, 2) : '', [result])
  const hasLostBytes = payload.includes('\uFFFD')

  const decode = async () => {
    setError('')
    setIsDecoding(true)
    try {
      const decoded = await runWorker({ payload, format, schema, messageType, framing })
      setResult(decoded)
      if (!messageType && decoded.messageType) setMessageType(decoded.messageType)
      toast.success(`Decoded ${decoded.byteLength.toLocaleString()} protobuf byte${decoded.byteLength === 1 ? '' : 's'}`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to decode protobuf payload.'
      setResult(null)
      setError(message)
      toast.error('Unable to decode payload', message)
    } finally {
      setIsDecoding(false)
    }
  }

  const loadSample = () => {
    setPayload(sampleHex)
    setFormat('hex')
    setSchema(sampleSchema)
    setMessageType('UserProfile')
    setFraming('raw')
    setResult(null)
    setError('')
  }

  const clearAll = () => {
    setPayload('')
    setSchema('')
    setMessageType('')
    setResult(null)
    setError('')
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-5 flex flex-col gap-4 border-b border-outline-variant/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Binary message utility</p>
          <h1 className="text-2xl font-semibold text-on-surface md:text-3xl">Protobuf / Kafka Decoder</h1>
          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">Decode protobuf bytes locally with an optional inline schema. No payload leaves the browser.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={loadSample} className="h-10 border border-outline-variant/60 bg-surface-container px-3 text-sm font-medium text-on-surface hover:bg-surface-container-high">Load sample</button>
          <button type="button" onClick={clearAll} disabled={!payload && !schema} className="h-10 border border-outline-variant/60 px-3 text-sm font-medium text-on-surface disabled:cursor-not-allowed disabled:opacity-50">Clear</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden border border-outline-variant/60 bg-surface-container-low" aria-labelledby="decoder-input-heading">
          <div className="border-b border-outline-variant/60 bg-surface-container px-4 py-3">
            <h2 id="decoder-input-heading" className="text-sm font-semibold text-on-surface">Input</h2>
          </div>
          <div className="space-y-5 p-4">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Payload format</legend>
              <div className="inline-flex flex-wrap border border-outline-variant/60 bg-surface-container-lowest">
                {([['hex', 'Hex'], ['base64', 'Base64'], ['escaped', 'Escaped bytes']] as const).map(([value, label]) => (
                  <label key={value} className={`cursor-pointer px-3 py-2 text-sm font-medium ${format === value ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container'}`}>
                    <input type="radio" name="payload-format" value={value} checked={format === value} onChange={() => { setFormat(value); setResult(null); setError('') }} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Payload</span>
              <textarea
                value={payload}
                onChange={(event) => { setPayload(event.target.value); setResult(null); setError('') }}
                placeholder={format === 'hex' ? '0a09757365722d31303432...' : format === 'base64' ? 'Cgl1c2VyLTEwNDI...' : '\\x0a\\x09user-1042...'}
                aria-label="Protobuf payload"
                spellCheck={false}
                className="h-52 w-full resize-y border border-outline-variant/60 p-3 font-mono text-sm leading-6 text-on-surface"
              />
            </label>

            {hasLostBytes && (
              <div role="alert" className="border-l-4 border-[var(--cds-warning)] bg-surface-container p-3 text-sm text-on-surface-variant">
                <strong className="block text-on-surface">Original bytes are missing</strong>
                <span className="mt-1 block">The character � means this payload was already converted to text with invalid UTF-8 bytes replaced. Export the Kafka value as Hex, Base64, or <code className="font-mono text-on-surface">\\xNN</code> escaped bytes.</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Kafka framing</span>
                <select value={framing} onChange={(event) => { setFraming(event.target.value as KafkaFraming); setResult(null) }} aria-label="Kafka framing" className="h-10 w-full border border-outline-variant/60 px-3 text-sm text-on-surface">
                  <option value="auto">Auto detect</option>
                  <option value="raw">Raw protobuf</option>
                  <option value="confluent">Confluent wire format</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Message type</span>
                <input value={messageType} onChange={(event) => { setMessageType(event.target.value); setResult(null) }} placeholder="package.MessageName" aria-label="Protobuf message type" list="protobuf-message-types" className="h-10 w-full border border-outline-variant/60 px-3 font-mono text-sm text-on-surface" />
                <datalist id="protobuf-message-types">{result?.availableTypes.map((type) => <option key={type} value={type} />)}</datalist>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Proto schema <span className="font-normal normal-case tracking-normal">(optional)</span></span>
              <textarea
                value={schema}
                onChange={(event) => { setSchema(event.target.value); setResult(null); setError('') }}
                placeholder={'syntax = "proto3";\nmessage UserProfile {\n  string userId = 1;\n}'}
                aria-label="Proto schema"
                spellCheck={false}
                className="h-60 w-full resize-y border border-outline-variant/60 p-3 font-mono text-sm leading-6 text-on-surface"
              />
              <span className="mt-2 block text-xs text-on-surface-variant">Without a schema, the decoder returns raw protobuf field numbers and wire values.</span>
            </label>

            {error && <div role="alert" className="border-l-4 border-tertiary bg-surface-container p-3 text-sm text-tertiary">{error}</div>}

            <button type="button" onClick={() => void decode()} disabled={!payload.trim() || hasLostBytes || isDecoding} className="w-full bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {isDecoding ? 'Decoding...' : 'Decode'}
            </button>
          </div>
        </section>

        <section className="flex min-w-0 flex-col overflow-hidden border border-outline-variant/60 bg-surface-container-low" aria-labelledby="decoder-output-heading">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 bg-surface-container px-4 py-3">
            <div>
              <h2 id="decoder-output-heading" className="text-sm font-semibold text-on-surface">Output</h2>
              {result && <p className="mt-1 text-xs text-on-surface-variant">{result.mode === 'schema' ? result.messageType : 'Raw wire fields'} · {result.byteLength.toLocaleString()} bytes{result.schemaId !== null ? ` · schema ID ${result.schemaId}` : ''}{result.messageIndexes ? ` · indexes [${result.messageIndexes.join(', ')}]` : ''}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void copyText(output, 'Decoded JSON copied')} disabled={!output} className="h-9 border border-outline-variant/60 px-3 text-xs font-medium text-on-surface disabled:opacity-50">Copy</button>
              <button type="button" onClick={() => { if (output) { downloadJson(output); toast.success('Decoded JSON downloaded') } }} disabled={!output} className="h-9 bg-primary px-3 text-xs font-medium text-white disabled:opacity-50">Download</button>
            </div>
          </div>
          <div className="flex flex-1 p-4">
            <textarea value={output} readOnly aria-label="Decoded protobuf output" placeholder={'{\n  "userId": "user-1042",\n  "username": "alex.lee"\n}'} className="min-h-[42rem] w-full flex-1 resize-y border border-outline-variant/60 p-3 font-mono text-sm leading-6 text-on-surface" />
          </div>
        </section>
      </div>

      <div className="mt-4 border-l-4 border-[var(--cds-warning)] bg-surface-container p-3 text-xs text-on-surface-variant">
        Kafka headers, compression, Avro, and JSON envelopes are not protobuf payload bytes. Extract the protobuf value first. Confluent mode removes the magic byte, schema ID, and Protobuf message-index array.
      </div>
    </div>
  )
}
