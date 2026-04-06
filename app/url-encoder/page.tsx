'use client'

import { useState } from 'react'

export default function URLEncoder() {
  const [input, setInput] = useState('')

  const encodeURL = (text: string) => {
    try {
      return encodeURIComponent(text)
    } catch {
      return 'Error encoding URL'
    }
  }

  const decodeURL = (text: string) => {
    try {
      return decodeURIComponent(text)
    } catch {
      return 'Error decoding URL'
    }
  }

  const encodeBase64 = (text: string) => {
    try {
      return btoa(text)
    } catch {
      return 'Error encoding Base64'
    }
  }

  const decodeBase64 = (text: string) => {
    try {
      return atob(text)
    } catch {
      return 'Error decoding Base64'
    }
  }

  const operations = [
    { name: 'URL Encode', fn: encodeURL, example: 'hello%20world%20%26%20more' },
    { name: 'URL Decode', fn: decodeURL, example: 'hello world & more' },
    { name: 'Base64 Encode', fn: encodeBase64, example: 'aGVsbG8gd29ybGQ=' },
    { name: 'Base64 Decode', fn: decodeBase64, example: 'hello world' },
  ]

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const loadSample = () => {
    setInput('hello world & special chars: @#$%')
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden mb-4">
        <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
          <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Input Text</h3>
          <button
            onClick={loadSample}
            className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
          >
            Load Sample
          </button>
        </div>
        
        <div className="p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter text to encode/decode..."
            className="w-full h-32 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {operations.map(({ name, fn, example }) => {
          const result = input ? fn(input) : example
          return (
            <div key={name} className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
              <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
                <h3 className="text-sm font-serif font-semibold text-warm-800">{name}</h3>
                <button
                  onClick={() => copyToClipboard(result)}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium transition-colors"
                >
                  Copy
                </button>
              </div>
              
              <div className="p-4">
                <div className="p-3 bg-white border border-warm-300/60 rounded font-mono text-sm text-warm-800 break-all min-h-[100px]">
                  {result}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
