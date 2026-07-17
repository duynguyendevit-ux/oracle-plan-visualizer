'use client'

import { useState } from 'react'
import crypto from 'crypto'
import { useToolSession } from '@/hooks/useToolSession'
import { copyText } from '@/lib/toast'

export default function HashGenerator() {
  const [input, setInput] = useState('')

  useToolSession('hash-generator', { input }, (saved) => {
    if (typeof saved.input === 'string') setInput(saved.input)
  })

  const generateHash = (algorithm: string, text: string) => {
    if (!text) return ''
    try {
      return crypto.createHash(algorithm).update(text, 'utf8').digest('hex')
    } catch {
      return 'Error generating hash'
    }
  }

  const hashes = [
    { name: 'MD5', algorithm: 'md5', description: '128-bit hash (32 hex chars)' },
    { name: 'SHA-1', algorithm: 'sha1', description: '160-bit hash (40 hex chars)' },
    { name: 'SHA-256', algorithm: 'sha256', description: '256-bit hash (64 hex chars)' },
    { name: 'SHA-384', algorithm: 'sha384', description: '384-bit hash (96 hex chars)' },
    { name: 'SHA-512', algorithm: 'sha512', description: '512-bit hash (128 hex chars)' },
  ]

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden mb-4">
        <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60">
          <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Input Text</h3>
        </div>
        
        <div className="p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter text to hash..."
            className="w-full h-32 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
          />
        </div>
      </div>

      <div className="space-y-4">
        {hashes.map(({ name, algorithm, description }) => {
          const hash = generateHash(algorithm, input)
          return (
            <div key={algorithm} className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
              <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-serif font-semibold text-warm-800">{name}</h3>
                  <p className="text-xs text-warm-600 mt-0.5">{description}</p>
                </div>
                <button
                  onClick={() => void copyText(hash, `${name} hash copied`)}
                  disabled={!hash}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Copy
                </button>
              </div>
              
              <div className="p-4">
                <div className="p-3 bg-white border border-warm-300/60 rounded font-mono text-xs text-warm-800 break-all">
                  {hash || <span className="text-warm-400">Hash will appear here...</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
