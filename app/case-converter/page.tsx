'use client'

import { useState } from 'react'

export default function CaseConverter() {
  const [input, setInput] = useState('')

  const toCamelCase = (str: string) => {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => 
        index === 0 ? letter.toLowerCase() : letter.toUpperCase()
      )
      .replace(/\s+|_|-/g, '')
  }

  const toPascalCase = (str: string) => {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, letter => letter.toUpperCase())
      .replace(/\s+|_|-/g, '')
  }

  const toSnakeCase = (str: string) => {
    return str
      .replace(/([A-Z])/g, '_$1')
      .replace(/\s+|-/g, '_')
      .toLowerCase()
      .replace(/^_/, '')
  }

  const toKebabCase = (str: string) => {
    return str
      .replace(/([A-Z])/g, '-$1')
      .replace(/\s+|_/g, '-')
      .toLowerCase()
      .replace(/^-/, '')
  }

  const toConstantCase = (str: string) => {
    return toSnakeCase(str).toUpperCase()
  }

  const toDotCase = (str: string) => {
    return str
      .replace(/([A-Z])/g, '.$1')
      .replace(/\s+|_|-/g, '.')
      .toLowerCase()
      .replace(/^\./, '')
  }

  const toTitleCase = (str: string) => {
    return str
      .toLowerCase()
      .replace(/(?:^|\s)\w/g, letter => letter.toUpperCase())
  }

  const cases = [
    { name: 'camelCase', fn: toCamelCase, example: 'myVariableName' },
    { name: 'PascalCase', fn: toPascalCase, example: 'MyVariableName' },
    { name: 'snake_case', fn: toSnakeCase, example: 'my_variable_name' },
    { name: 'kebab-case', fn: toKebabCase, example: 'my-variable-name' },
    { name: 'CONSTANT_CASE', fn: toConstantCase, example: 'MY_VARIABLE_NAME' },
    { name: 'dot.case', fn: toDotCase, example: 'my.variable.name' },
    { name: 'Title Case', fn: toTitleCase, example: 'My Variable Name' },
  ]

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

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
            placeholder="Enter text to convert (e.g., 'my variable name' or 'MyVariableName')..."
            className="w-full h-32 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cases.map(({ name, fn, example }) => {
          const converted = input ? fn(input) : example
          return (
            <div key={name} className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
              <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60 flex justify-between items-center">
                <h3 className="text-sm font-serif font-semibold text-warm-800">{name}</h3>
                <button
                  onClick={() => copyToClipboard(converted)}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium transition-colors"
                >
                  Copy
                </button>
              </div>
              
              <div className="p-4">
                <div className="p-3 bg-white border border-warm-300/60 rounded font-mono text-sm text-warm-800 break-all">
                  {converted}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
