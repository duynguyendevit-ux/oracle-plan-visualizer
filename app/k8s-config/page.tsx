'use client'

import { useState } from 'react'

export default function K8sConfig() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  const convertToK8s = () => {
    const lines = input.split('\n')
    const envVars: string[] = []
    
    let currentPrefix = ''
    
    lines.forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      
      // Parse YAML-like structure
      const match = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)$/)
      if (!match) return
      
      const [, indent, key, value] = match
      const level = Math.floor(indent.length / 2)
      
      // Build prefix based on indentation
      if (level === 0) {
        currentPrefix = key.toUpperCase().replace(/-/g, '_')
      } else if (level === 1) {
        const parentKey = currentPrefix
        const childKey = key.toUpperCase().replace(/-/g, '_')
        
        if (value.trim()) {
          // Has value - create env var
          const envName = `${parentKey}_${childKey}`
          const envValue = value.trim()
          
          // Format boolean/number values
          let formattedValue = envValue
          if (envValue === 'true' || envValue === 'false') {
            formattedValue = `"${envValue}"`
          } else if (/^\d+$/.test(envValue)) {
            formattedValue = `"${envValue}"`
          } else if (!envValue.startsWith('"')) {
            formattedValue = `"${envValue}"`
          }
          
          envVars.push(`- name: ${envName}\n  value: ${formattedValue}`)
        } else {
          // No value - update prefix for nested keys
          currentPrefix = `${parentKey}_${childKey}`
        }
      } else if (level === 2) {
        const childKey = key.toUpperCase().replace(/-/g, '_')
        const envName = `${currentPrefix}_${childKey}`
        const envValue = value.trim()
        
        let formattedValue = envValue
        if (envValue === 'true' || envValue === 'false') {
          formattedValue = `"${envValue}"`
        } else if (/^\d+$/.test(envValue)) {
          formattedValue = `"${envValue}"`
        } else if (!envValue.startsWith('"')) {
          formattedValue = `"${envValue}"`
        }
        
        envVars.push(`- name: ${envName}\n  value: ${formattedValue}`)
      }
    })
    
    setOutput(envVars.join('\n'))
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output)
  }

  const loadSample = () => {
    const sample = `event-diary:
  v1:
    enabled: false
  v2:
    enabled: true
database:
  host: localhost
  port: 5432
  name: mydb`
    setInput(sample)
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">YAML Config</h3>
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
              placeholder="Paste YAML config here..."
              className="w-full h-96 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
            />
            
            <button
              onClick={convertToK8s}
              className="mt-3 w-full bg-primary text-white py-2.5 rounded hover:bg-primary/90 font-semibold transition-colors shadow-warm"
            >
              Convert to K8s
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">K8s Env Vars</h3>
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium transition-colors"
            >
              Copy
            </button>
          </div>
          
          <div className="p-4">
            <textarea
              value={output}
              readOnly
              placeholder="K8s environment variables will appear here..."
              className="w-full h-96 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm resize-none text-warm-800 placeholder-warm-400"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
