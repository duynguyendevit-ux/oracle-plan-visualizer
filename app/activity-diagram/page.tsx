'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { parseActivityDiagram, generateSVG } from './diagram-generator'

export default function ActivityDiagram() {
  const [input, setInput] = useState(`start
-> Check user authentication
if (User logged in?) then
  -> [Yes] Load user profile
  -> Display dashboard
else
  -> [No] Show login form
  -> Validate credentials
  if (Valid?) then
    -> [Yes] Create session
    -> Load user profile
  else
    -> [No] Show error message
  endif
endif
-> end`)

  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  const generateDiagram = () => {
    try {
      setError('')
      const data = parseActivityDiagram(input)
      const svgString = generateSVG(data, 800, 600)
      setSvg(svgString)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate diagram')
      console.error('Error generating diagram:', err)
    }
  }

  const exportSVG = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'activity-diagram.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPNG = () => {
    if (!svg) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          const pngUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = pngUrl
          a.download = 'activity-diagram.png'
          a.click()
          URL.revokeObjectURL(pngUrl)
        }
      })
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] dark:bg-[#0a0a0a]">
      <div className="max-w-[1800px] mx-auto p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-[#2c2416] dark:text-[#e8dcc8] mb-2 font-serif">
            UML Activity Diagram
          </h1>
          <p className="text-[#6b5d4f] dark:text-[#a89985]">
            Create activity diagrams from text descriptions
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-[#1a1a1a] rounded-lg p-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[#2c2416] dark:text-[#e8dcc8]">
                Diagram Definition
              </h2>
              <button
                onClick={generateDiagram}
                className="px-4 py-2 bg-[#d4a574] hover:bg-[#c49564] text-white rounded-md transition-colors font-medium"
              >
                Generate
              </button>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-[600px] p-4 bg-[#faf8f5] dark:bg-[#0f0f0f] border border-[#e5dfd5] dark:border-[#2a2a2a] rounded-md font-mono text-sm text-[#2c2416] dark:text-[#e8dcc8] focus:outline-none focus:ring-2 focus:ring-[#d4a574] resize-none"
              placeholder="Enter activity diagram definition..."
              spellCheck={false}
            />

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Syntax Help */}
            <div className="mt-4 p-4 bg-[#f5f1eb] dark:bg-[#141414] rounded-md">
              <h3 className="text-sm font-semibold text-[#2c2416] dark:text-[#e8dcc8] mb-2">
                Syntax Guide:
              </h3>
              <ul className="text-xs text-[#6b5d4f] dark:text-[#a89985] space-y-1 font-mono">
                <li>• <code>start</code> - Start node</li>
                <li>• <code>end</code> - End node</li>
                <li>• <code>-&gt; Action</code> - Activity</li>
                <li>• <code>if (condition?) then ... else ... endif</code> - Decision</li>
                <li>• <code>fork ... join</code> - Parallel activities</li>
              </ul>
            </div>
          </motion.div>

          {/* Preview Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-[#1a1a1a] rounded-lg p-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-[#2c2416] dark:text-[#e8dcc8]">
                Preview
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={exportSVG}
                  disabled={!svg}
                  className="px-3 py-1 text-sm bg-[#f5f1eb] dark:bg-[#141414] text-[#2c2416] dark:text-[#e8dcc8] rounded-md hover:bg-[#e5dfd5] dark:hover:bg-[#1f1f1f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export SVG
                </button>
                <button 
                  onClick={exportPNG}
                  disabled={!svg}
                  className="px-3 py-1 text-sm bg-[#f5f1eb] dark:bg-[#141414] text-[#2c2416] dark:text-[#e8dcc8] rounded-md hover:bg-[#e5dfd5] dark:hover:bg-[#1f1f1f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export PNG
                </button>
              </div>
            </div>

            <div className="bg-[#faf8f5] dark:bg-[#0f0f0f] border border-[#e5dfd5] dark:border-[#2a2a2a] rounded-md p-4 min-h-[600px] overflow-auto">
              {svg ? (
                <div dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <div className="flex items-center justify-center h-full text-[#6b5d4f] dark:text-[#a89985]">
                  Click "Generate" to create diagram
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
