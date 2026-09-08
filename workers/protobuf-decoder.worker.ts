/// <reference lib="webworker" />

import { Type, parse } from 'protobufjs'
import Long from 'long'

export type PayloadFormat = 'hex' | 'base64' | 'escaped'
export type KafkaFraming = 'auto' | 'raw' | 'confluent'

export interface ProtobufDecodeRequest {
  payload: string
  format: PayloadFormat
  schema: string
  messageType: string
  framing: KafkaFraming
}

export interface ProtobufDecodeResult {
  output: unknown
  byteLength: number
  schemaId: number | null
  messageIndexes: number[] | null
  messageType: string | null
  availableTypes: string[]
  mode: 'schema' | 'wire'
}

interface WireField {
  field: number
  wireType: number
  type: string
  value?: string | number
  length?: number
  utf8?: string
  hex?: string
  base64?: string
}

const MAX_PAYLOAD_TEXT = 8 * 1024 * 1024
const MAX_DECODED_BYTES = 4 * 1024 * 1024
const MAX_SCHEMA_TEXT = 512 * 1024

function parseHex(value: string) {
  const normalized = value
    .replace(/0x/gi, '')
    .replace(/[\s:_-]+/g, '')

  if (!normalized) throw new Error('Hex payload is empty.')
  if (!/^[0-9a-f]+$/i.test(normalized)) throw new Error('Hex payload contains non-hexadecimal characters.')
  if (normalized.length % 2 !== 0) throw new Error('Hex payload must contain an even number of digits.')

  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }
  return bytes
}

function parseBase64(value: string) {
  const normalized = value.replace(/\s+/g, '')
  if (!normalized) throw new Error('Base64 payload is empty.')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new Error('Base64 payload is invalid.')
  }

  try {
    const binary = atob(normalized)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new Error('Base64 payload is invalid.')
  }
}

function parseEscaped(value: string) {
  let normalized = value.trim()
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1)
  }
  if (!normalized) throw new Error('Escaped-byte payload is empty.')
  if (normalized.includes('\uFFFD')) {
    throw new Error('Payload contains the Unicode replacement character (�). The original protobuf bytes were already lost during text decoding. Export the Kafka value as Hex, Base64, or \\xNN escaped bytes and try again.')
  }

  const bytes: number[] = []
  const textEncoder = new TextEncoder()

  for (let index = 0; index < normalized.length;) {
    if (normalized[index] !== '\\') {
      const codePoint = normalized.codePointAt(index)
      if (codePoint === undefined) break
      bytes.push(...textEncoder.encode(String.fromCodePoint(codePoint)))
      index += codePoint > 0xffff ? 2 : 1
      continue
    }

    const escape = normalized[index + 1]
    if (escape === undefined) throw new Error('Escaped-byte payload ends with an incomplete escape.')

    if (escape.toLowerCase() === 'x') {
      const hex = normalized.slice(index + 2, index + 4)
      if (!/^[0-9a-f]{2}$/i.test(hex)) throw new Error(`Invalid hexadecimal escape at character ${index + 1}.`)
      bytes.push(Number.parseInt(hex, 16))
      index += 4
      continue
    }

    if (/[0-7]/.test(escape)) {
      const octal = normalized.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? ''
      const byte = Number.parseInt(octal, 8)
      if (byte > 255) throw new Error(`Octal escape at character ${index + 1} exceeds one byte.`)
      bytes.push(byte)
      index += octal.length + 1
      continue
    }

    const commonEscapes: Record<string, number> = {
      '0': 0,
      n: 10,
      r: 13,
      t: 9,
      b: 8,
      f: 12,
      v: 11,
      '\\': 92,
      '"': 34,
      "'": 39,
    }
    const byte = commonEscapes[escape]
    if (byte === undefined) throw new Error(`Unsupported escape \\${escape} at character ${index + 1}.`)
    bytes.push(byte)
    index += 2
  }

  return Uint8Array.from(bytes)
}

function decodePayload(payload: string, format: PayloadFormat) {
  if (payload.length > MAX_PAYLOAD_TEXT) throw new Error('Payload text is larger than 8 MB.')
  const bytes = format === 'hex' ? parseHex(payload) : format === 'base64' ? parseBase64(payload) : parseEscaped(payload)
  if (bytes.length > MAX_DECODED_BYTES) throw new Error('Decoded payload is larger than 4 MB.')
  return bytes
}

function removeKafkaFraming(bytes: Uint8Array, framing: KafkaFraming) {
  const hasConfluentHeader = bytes.length >= 5 && bytes[0] === 0
  if (framing === 'confluent' && !hasConfluentHeader) {
    throw new Error('Confluent framing requires magic byte 0 followed by a 4-byte schema ID.')
  }
  if (framing === 'raw' || (framing === 'auto' && !hasConfluentHeader)) {
    return { bytes, schemaId: null, messageIndexes: null }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const schemaId = view.getUint32(1, false)
  const sizeResult = readVarint(bytes, 5)
  let cursor = sizeResult.offset
  const encodedSize = zigZagNumber(sizeResult.value, 'Confluent message-index length')

  if (encodedSize === 0) {
    return { bytes: bytes.slice(cursor), schemaId, messageIndexes: [0] }
  }
  if (encodedSize < 0 || encodedSize > 100) {
    throw new Error('Confluent message-index array length must be between 1 and 100.')
  }

  const messageIndexes: number[] = []
  for (let index = 0; index < encodedSize; index += 1) {
    const indexResult = readVarint(bytes, cursor)
    cursor = indexResult.offset
    const messageIndex = zigZagNumber(indexResult.value, `Confluent message index ${index + 1}`)
    if (messageIndex < 0) throw new Error('Confluent message indexes cannot be negative.')
    messageIndexes.push(messageIndex)
  }
  return { bytes: bytes.slice(cursor), schemaId, messageIndexes }
}

function readVarint(bytes: Uint8Array, offset: number) {
  let value = Long.UZERO
  let shift = 0
  let cursor = offset

  while (cursor < bytes.length && shift <= 63) {
    const byte = bytes[cursor]
    if (shift === 63 && (byte & 0x7f) > 1) throw new Error(`Varint at byte ${offset} exceeds uint64.`)
    value = value.or(Long.fromInt(byte & 0x7f, true).shiftLeft(shift))
    cursor += 1
    if ((byte & 0x80) === 0) return { value, offset: cursor }
    shift += 7
  }
  throw new Error(`Invalid varint at byte ${offset}.`)
}

function zigZagNumber(value: Long, label: string) {
  const raw = value.toNumber()
  if (!Number.isSafeInteger(raw)) throw new Error(`${label} exceeds the supported safe integer range.`)
  return raw % 2 === 0 ? raw / 2 : -((raw + 1) / 2)
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function printableUtf8(bytes: Uint8Array) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (!text || Array.from(text).some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code < 32 && character !== '\n' && character !== '\r' && character !== '\t'
    })) return undefined
    return text
  } catch {
    return undefined
  }
}

function readWireFields(bytes: Uint8Array) {
  const fields: WireField[] = []
  let offset = 0

  while (offset < bytes.length) {
    const keyResult = readVarint(bytes, offset)
    const field = keyResult.value.shiftRightUnsigned(3).toNumber()
    const wireType = keyResult.value.low & 7
    offset = keyResult.offset

    if (field <= 0) throw new Error(`Invalid field number at byte ${offset}.`)

    if (wireType === 0) {
      const result = readVarint(bytes, offset)
      fields.push({ field, wireType, type: 'varint', value: result.value.toString() })
      offset = result.offset
    } else if (wireType === 1) {
      if (offset + 8 > bytes.length) throw new Error(`Truncated fixed64 field ${field}.`)
      const value = bytes.slice(offset, offset + 8)
      fields.push({ field, wireType, type: 'fixed64', hex: bytesToHex(value) })
      offset += 8
    } else if (wireType === 2) {
      const lengthResult = readVarint(bytes, offset)
      const length = Number(lengthResult.value)
      offset = lengthResult.offset
      if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) {
        throw new Error(`Invalid length-delimited field ${field}.`)
      }
      const value = bytes.slice(offset, offset + length)
      fields.push({
        field,
        wireType,
        type: 'length-delimited',
        length,
        utf8: printableUtf8(value),
        hex: bytesToHex(value),
        base64: bytesToBase64(value),
      })
      offset += length
    } else if (wireType === 5) {
      if (offset + 4 > bytes.length) throw new Error(`Truncated fixed32 field ${field}.`)
      const value = bytes.slice(offset, offset + 4)
      fields.push({ field, wireType, type: 'fixed32', hex: bytesToHex(value) })
      offset += 4
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType} on field ${field}.`)
    }
  }

  return { fields }
}

function collectMessageTypes(namespace: { nested?: Record<string, unknown> }, prefix = ''): string[] {
  const types: string[] = []
  for (const [name, value] of Object.entries(namespace.nested ?? {})) {
    const qualifiedName = prefix ? `${prefix}.${name}` : name
    if (value instanceof Type) types.push(qualifiedName)
    if (value && typeof value === 'object' && 'nested' in value) {
      types.push(...collectMessageTypes(value as { nested?: Record<string, unknown> }, qualifiedName))
    }
  }
  return types
}

function decodeWithSchema(bytes: Uint8Array, schema: string, requestedType: string) {
  if (schema.length > MAX_SCHEMA_TEXT) throw new Error('Proto schema is larger than 512 KB.')
  if (/^\s*import\s+/m.test(schema)) {
    throw new Error('Imported .proto files are not supported. Paste a self-contained schema.')
  }

  const parsed = parse(schema, { keepCase: true })
  parsed.root.resolveAll()
  const availableTypes = collectMessageTypes(parsed.root).sort()
  if (availableTypes.length === 0) throw new Error('Proto schema does not define a message type.')

  const normalizedRequested = requestedType.trim().replace(/^\./, '')
  const selectedType = normalizedRequested || (availableTypes.length === 1 ? availableTypes[0] : '')
  if (!selectedType) {
    throw new Error(`Schema defines multiple messages. Enter one of: ${availableTypes.join(', ')}.`)
  }
  if (!availableTypes.includes(selectedType)) {
    throw new Error(`Message type "${selectedType}" was not found. Available types: ${availableTypes.join(', ')}.`)
  }

  const messageType = parsed.root.lookupType(selectedType)
  const message = messageType.decode(bytes)
  return {
    output: messageType.toObject(message, {
      longs: String,
      enums: String,
      bytes: String,
      oneofs: true,
    }),
    availableTypes,
    messageType: selectedType,
  }
}

self.onmessage = (event: MessageEvent<{ id: number; payload: ProtobufDecodeRequest }>) => {
  const { id, payload } = event.data
  try {
    const originalBytes = decodePayload(payload.payload, payload.format)
    const framed = removeKafkaFraming(originalBytes, payload.framing)
    if (framed.bytes.length === 0) throw new Error('Payload contains no protobuf message bytes after removing framing.')

    let result: ProtobufDecodeResult
    if (payload.schema.trim()) {
      const decoded = decodeWithSchema(framed.bytes, payload.schema, payload.messageType)
      result = {
        output: decoded.output,
        byteLength: framed.bytes.length,
        schemaId: framed.schemaId,
        messageIndexes: framed.messageIndexes,
        messageType: decoded.messageType,
        availableTypes: decoded.availableTypes,
        mode: 'schema',
      }
    } else {
      result = {
        output: readWireFields(framed.bytes),
        byteLength: framed.bytes.length,
        schemaId: framed.schemaId,
        messageIndexes: framed.messageIndexes,
        messageType: null,
        availableTypes: [],
        mode: 'wire',
      }
    }
    self.postMessage({ id, result })
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : 'Unable to decode protobuf payload.' })
  }
}

export {}
