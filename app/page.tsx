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
  const [stats, setStats] = useState<any>(null)

  const analyzePlan = (plan: any) => {
    let totalCost = 0
    let totalCpu = 0
    let deadBranches = 0
    let fullScans = 0
    let indexScans = 0

    const traverse = (node: any) => {
      if (node.cost) totalCost += node.cost
      if (node.cpuCost) totalCpu += node.cpuCost
      if (node.filterPredicates?.includes('NULL IS NOT NULL')) deadBranches++
      if (node.operation === 'TABLE ACCESS' && node.options === 'FULL') fullScans++
      if (node.operation === 'INDEX') indexScans++
      
      if (node.children) {
        node.children.forEach((child: any) => traverse(child))
      }
    }

    traverse(plan)
    return { totalCost, totalCpu, deadBranches, fullScans, indexScans }
  }

  const handleParse = () => {
    try {
      const parsed = JSON.parse(planJson)
      setParsedPlan(parsed)
      setStats(analyzePlan(parsed))
      setError('')
    } catch (e) {
      setError('Invalid JSON format. Please check your input.')
      setParsedPlan(null)
      setStats(null)
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
            },
            {
              "operation": "FILTER",
              "filterPredicates": "NULL IS NOT NULL",
              "children": [{
                "operation": "NESTED LOOPS",
                "cost": 4,
                "children": [
                  {
                    "operation": "TABLE ACCESS",
                    "options": "BY INDEX ROWID",
                    "objectName": "responsible_persons",
                    "cost": 1
                  },
                  {
                    "operation": "TABLE ACCESS",
                    "options": "FULL",
                    "objectName": "responsible_facilities",
                    "cost": 3,
                    "cpuCost": 46812
                  }
                ]
              }]
            }
          ]
        }]
      }]
    }
    setPlanJson(JSON.stringify(sample, null, 2))
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-surface-container-low rounded-lg p-4 shadow-editorial">
            <div className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide mb-1">Total Cost</div>
            <div className="text-2xl font-serif font-semibold text-on-surface">{stats.totalCost}</div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-4 shadow-editorial">
            <div className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide mb-1">CPU Cost</div>
            <div className="text-2xl font-serif font-semibold text-on-surface">{stats.totalCpu.toLocaleString()}</div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-4 shadow-editorial">
            <div className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide mb-1">Dead Branches</div>
            <div className="text-2xl font-serif font-semibold text-tertiary">{stats.deadBranches}</div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-4 shadow-editorial">
            <div className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide mb-1">Full Scans</div>
            <div className="text-2xl font-serif font-semibold text-tertiary">{stats.fullScans}</div>
          </div>
          <div className="bg-surface-container-low rounded-lg p-4 shadow-editorial">
            <div className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide mb-1">Index Scans</div>
            <div className="text-2xl font-serif font-semibold text-primary">{stats.indexScans}</div>
          </div>
        </div>
      )}

      {/* Input Panel */}
      <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden mb-4">
        <div className="bg-surface-container px-4 py-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">Execution Plan JSON</h3>
            <button
              onClick={loadSample}
              className="text-sm text-primary hover:text-primary/80 font-medium underline decoration-primary/30 hover:decoration-primary transition-colors"
            >
              Load Sample
            </button>
          </div>
        </div>
        
        <div className="p-4">
          <textarea
            value={planJson}
            onChange={(e) => setPlanJson(e.target.value)}
            placeholder="Paste your Oracle execution plan JSON here..."
            className="w-full h-32 p-3 border border-outline-variant/15 rounded-lg bg-surface-container-lowest font-mono text-sm focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-on-surface placeholder-on-surface-variant/50"
          />
          
          {error && (
            <div className="mt-3 p-3 bg-tertiary-container/30 border border-tertiary/30 text-tertiary rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={handleParse}
            className="mt-3 w-full bg-gradient-to-r from-primary to-primary-container text-white py-2.5 rounded-lg hover:opacity-90 font-semibold transition-opacity shadow-editorial"
          >
            Visualize Plan
          </button>
        </div>
      </div>

      {/* Visualization Panel */}
      <div className="bg-surface-container-low rounded-lg shadow-editorial overflow-hidden">
        <div className="bg-surface-container px-4 py-3 flex justify-between items-center">
          <h3 className="text-sm font-label font-semibold text-on-surface uppercase tracking-wide">Execution Tree</h3>
          
          {/* Legend */}
          {parsedPlan && (
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 border border-on-surface rounded-full"></div>
                <span className="text-xs font-label text-on-surface-variant">Active Branch</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-pink-300 border border-on-surface rounded-full"></div>
                <span className="text-xs font-label text-on-surface-variant">Dead Code (NULL IS NOT NULL)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-tertiary border border-on-surface rounded-full"></div>
                <span className="text-xs font-label text-on-surface-variant">Full Table Scan</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary border border-on-surface rounded-full"></div>
                <span className="text-xs font-label text-on-surface-variant">Index Scan</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-2">
          {parsedPlan ? (
            <PlanVisualizer plan={parsedPlan} />
          ) : (
            <div className="h-96 flex flex-col items-center justify-center text-on-surface-variant">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <p className="text-sm font-serif">Paste JSON and click "Visualize Plan"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
