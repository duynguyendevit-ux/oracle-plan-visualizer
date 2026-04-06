'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const PlanVisualizer = dynamic(() => import('@/components/PlanVisualizer'), {
  ssr: false
})

export default function Home() {
  const [planJson, setPlanJson] = useState('')
  const [parsedPlan, setParsedPlan] = useState(null)
  const [error, setError] = useState('')

  const handleParse = () => {
    try {
      const parsed = JSON.parse(planJson)
      setParsedPlan(parsed)
      setError('')
    } catch (e) {
      setError('Invalid JSON format')
      setParsedPlan(null)
    }
  }

  const loadSample = () => {
    const sample = {
      "operation": "SELECT STATEMENT",
      "cardinality": 3,
      "cost": 4,
      "cpuCost": 32026,
      "children": [{
        "operation": "VIEW",
        "cost": 4,
        "children": [{
          "operation": "UNION-ALL",
          "children": [
            {
              "operation": "NESTED LOOPS",
              "cost": 4,
              "cardinality": 1,
              "children": [
                {
                  "operation": "TABLE ACCESS",
                  "options": "BY INDEX ROWID",
                  "objectName": "facilities",
                  "cost": 3,
                  "children": [{
                    "operation": "INDEX",
                    "options": "UNIQUE SCAN",
                    "objectName": "SYS_C0028304",
                    "cost": 2
                  }]
                },
                {
                  "operation": "TABLE ACCESS",
                  "options": "BY INDEX ROWID BATCHED",
                  "objectName": "customers",
                  "cost": 1,
                  "children": [{
                    "operation": "INDEX",
                    "options": "RANGE SCAN",
                    "objectName": "idx_customer",
                    "cost": 0
                  }]
                }
              ]
            },
            {
              "operation": "FILTER",
              "filterPredicates": "NULL IS NOT NULL",
              "children": [{
                "operation": "TABLE ACCESS",
                "objectName": "facility_contact_persons",
                "cost": 2
              }]
            }
          ]
        }]
      }]
    }
    setPlanJson(JSON.stringify(sample, null, 2))
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">🔍 Oracle Execution Plan Visualizer</h1>
        <p className="text-gray-600 mb-8">Paste your execution plan JSON to visualize performance bottlenecks</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Panel */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Execution Plan JSON</h2>
              <button
                onClick={loadSample}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Load Sample
              </button>
            </div>
            
            <textarea
              value={planJson}
              onChange={(e) => setPlanJson(e.target.value)}
              placeholder="Paste your Oracle execution plan JSON here..."
              className="w-full h-96 p-4 border rounded font-mono text-sm"
            />
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
                {error}
              </div>
            )}
            
            <button
              onClick={handleParse}
              className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              Visualize Plan
            </button>
          </div>

          {/* Visualization Panel */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Visualization</h2>
            
            {parsedPlan ? (
              <PlanVisualizer plan={parsedPlan} />
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-400">
                Paste JSON and click "Visualize Plan" to see the tree
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        {parsedPlan && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Legend</h3>
            <div className="flex gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-400 border-2 border-gray-800 rounded"></div>
                <span>Active Branch</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-pink-300 border-2 border-gray-800 rounded"></div>
                <span>Dead Code</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-400 border-2 border-gray-800 rounded"></div>
                <span>Performance Issue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-300 border-2 border-gray-800 rounded"></div>
                <span>Index Scan</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
