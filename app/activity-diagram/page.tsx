'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { parseActivityDiagram, generateSVG } from './diagram-generator'
import { generateDrawioXML } from './xml-generator'

export default function ActivityDiagram() {
  const [input, setInput] = useState(`lane Thread 1
start
-> idle
-> user action
-> post command

lane Thread 2
start
-> idle
-> check for new commands
-> command queue
if (queue empty?) then
  -> [yes] back to idle
else
  -> [no] dispatch command
endif

lane Thread 3
-> process command
end

# Cross-lane connections
Thread 1: post command -> Thread 2: command queue
Thread 2: dispatch command -> Thread 3: process command`)

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

  const exportXML = () => {
    if (!input) return
    const xml = generateDrawioXML(input)
    
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'activity-diagram.xml'
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyInput = () => {
    navigator.clipboard.writeText(input)
  }

  const copySVG = () => {
    if (!svg) return
    navigator.clipboard.writeText(svg)
  }

  const copyXML = () => {
    if (!input) return
    const xml = generateDrawioXML(input)
    navigator.clipboard.writeText(xml)
  }

  return (
    <div className="min-h-screen bg-background dark:bg-dark-surface">
      <div className="max-w-[1800px] mx-auto p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-on-surface dark:text-dark-on-surface mb-2 font-serif">
            UML Activity Diagram
          </h1>
          <p className="text-on-surface-variant dark:text-dark-on-secondary-container">
            Create activity diagrams from text descriptions
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface-container-low dark:bg-dark-surface-container-low rounded-lg p-6 shadow-editorial border border-outline-variant/60"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-on-surface dark:text-dark-on-surface">
                Diagram Definition
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={copyInput}
                  className="px-3 py-2 bg-surface-container dark:bg-dark-surface-container text-on-surface dark:text-dark-on-surface rounded-md hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high transition-colors text-sm"
                  title="Copy definition"
                >
                  📋 Copy
                </button>
                <button
                  onClick={generateDiagram}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md transition-colors font-medium"
                >
                  Generate
                </button>
              </div>
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-[600px] p-4 bg-surface-container-lowest dark:bg-dark-surface-container-lowest border border-outline-variant/60 dark:border-dark-outline-variant rounded-md font-mono text-sm text-on-surface dark:text-dark-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
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
            <div className="mt-4 p-4 bg-surface-container dark:bg-dark-surface-container rounded-md">
              <h3 className="text-sm font-semibold text-on-surface dark:text-dark-on-surface mb-2">
                Syntax Guide:
              </h3>
              <ul className="text-xs text-on-surface-variant dark:text-dark-on-secondary-container space-y-1 font-mono">
                <li>• <code>lane Name</code> - Define swimlane</li>
                <li>• <code>start</code> - Start node</li>
                <li>• <code>end</code> - End node</li>
                <li>• <code>-&gt; Action</code> - Activity</li>
                <li>• <code>if (condition?) then ... else ... endif</code> - Decision</li>
                <li>• <code>fork ... join</code> - Parallel activities</li>
                <li>• <code>-&gt; [label] Action</code> - Activity with edge label</li>
              </ul>
            </div>
          </motion.div>

          {/* Preview Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface-container-low dark:bg-dark-surface-container-low rounded-lg p-6 shadow-editorial border border-outline-variant/60"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-on-surface dark:text-dark-on-surface">
                Preview
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={copySVG}
                  disabled={!svg}
                  className="px-3 py-1 text-sm bg-surface-container dark:bg-dark-surface-container text-on-surface dark:text-dark-on-surface rounded-md hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy SVG code"
                >
                  📋 Copy SVG
                </button>
                <button 
                  onClick={copyXML}
                  disabled={!input}
                  className="px-3 py-1 text-sm bg-surface-container dark:bg-dark-surface-container text-on-surface dark:text-dark-on-surface rounded-md hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy XML code"
                >
                  📋 Copy XML
                </button>
                <button 
                  onClick={exportSVG}
                  disabled={!svg}
                  className="px-3 py-1 text-sm bg-surface-container dark:bg-dark-surface-container text-on-surface dark:text-dark-on-surface rounded-md hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export SVG
                </button>
                <button 
                  onClick={exportPNG}
                  disabled={!svg}
                  className="px-3 py-1 text-sm bg-surface-container dark:bg-dark-surface-container text-on-surface dark:text-dark-on-surface rounded-md hover:bg-surface-container-high dark:hover:bg-dark-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export PNG
                </button>
                <button 
                  onClick={exportXML}
                  disabled={!input}
                  className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Export XML
                </button>
              </div>
            </div>

            <div className="bg-surface-container-lowest dark:bg-dark-surface-container-lowest border border-outline-variant/60 dark:border-dark-outline-variant rounded-md p-4 min-h-[600px] overflow-auto">
              {svg ? (
                <div dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <div className="flex items-center justify-center h-full text-on-surface-variant dark:text-dark-on-secondary-container">
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
