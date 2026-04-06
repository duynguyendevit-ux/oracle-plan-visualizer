'use client'

import { useState } from 'react'

export default function DiffViewer() {
  const [leftText, setLeftText] = useState('')
  const [rightText, setRightText] = useState('')

  const computeDiff = () => {
    const leftLines = leftText.split('\n')
    const rightLines = rightText.split('\n')
    const maxLines = Math.max(leftLines.length, rightLines.length)
    
    const diffs = []
    for (let i = 0; i < maxLines; i++) {
      const left = leftLines[i] || ''
      const right = rightLines[i] || ''
      
      if (left === right) {
        diffs.push({ type: 'equal', left, right, lineNum: i + 1 })
      } else if (!left) {
        diffs.push({ type: 'added', left: '', right, lineNum: i + 1 })
      } else if (!right) {
        diffs.push({ type: 'removed', left, right: '', lineNum: i + 1 })
      } else {
        diffs.push({ type: 'modified', left, right, lineNum: i + 1 })
      }
    }
    
    return diffs
  }

  const diffs = computeDiff()

  const loadSample = () => {
    setLeftText(`function hello() {
  console.log("Hello World");
  return true;
}`)
    setRightText(`function hello() {
  console.log("Hello Universe");
  console.log("Welcome!");
  return true;
}`)
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      <div className="mb-4 flex justify-end">
        <button
          onClick={loadSample}
          className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
        >
          Load Sample
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left Input */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Original Text</h3>
          </div>
          
          <div className="p-4">
            <textarea
              value={leftText}
              onChange={(e) => setLeftText(e.target.value)}
              placeholder="Paste original text here..."
              className="w-full h-64 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
            />
          </div>
        </div>

        {/* Right Input */}
        <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
          <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60">
            <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Modified Text</h3>
          </div>
          
          <div className="p-4">
            <textarea
              value={rightText}
              onChange={(e) => setRightText(e.target.value)}
              placeholder="Paste modified text here..."
              className="w-full h-64 p-3 border border-warm-300/60 rounded bg-white font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-warm-800 placeholder-warm-400"
            />
          </div>
        </div>
      </div>

      {/* Diff Output */}
      <div className="bg-warm-50 rounded-lg shadow-warm border border-warm-300/60 overflow-hidden">
        <div className="bg-warm-100/50 px-4 py-3 border-b border-warm-300/60">
          <h3 className="text-sm font-serif font-semibold text-warm-800 uppercase tracking-wide">Differences</h3>
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {diffs.map((diff, idx) => {
              const bgColor = 
                diff.type === 'equal' ? 'bg-white' :
                diff.type === 'added' ? 'bg-green-50' :
                diff.type === 'removed' ? 'bg-red-50' :
                'bg-yellow-50'
              
              return (
                <div key={idx} className="contents">
                  {/* Left side */}
                  <div className={`p-2 border border-warm-300/60 ${bgColor} flex`}>
                    <span className="text-warm-400 mr-3 select-none">{diff.lineNum}</span>
                    <span className={diff.type === 'removed' || diff.type === 'modified' ? 'text-red-700' : 'text-warm-800'}>
                      {diff.left || <span className="text-warm-300">∅</span>}
                    </span>
                  </div>
                  
                  {/* Right side */}
                  <div className={`p-2 border border-warm-300/60 ${bgColor} flex`}>
                    <span className="text-warm-400 mr-3 select-none">{diff.lineNum}</span>
                    <span className={diff.type === 'added' || diff.type === 'modified' ? 'text-green-700' : 'text-warm-800'}>
                      {diff.right || <span className="text-warm-300">∅</span>}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
