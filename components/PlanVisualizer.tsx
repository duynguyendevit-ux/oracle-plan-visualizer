'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface PlanNode {
  operation: string
  options?: string
  objectName?: string
  cost?: number
  cardinality?: number
  cpuCost?: number
  filterPredicates?: string
  children?: PlanNode[]
}

interface Props {
  plan: PlanNode
}

export default function PlanVisualizer({ plan }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !plan) return

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove()

    const width = 1400
    const height = 800
    const margin = { top: 20, right: 120, bottom: 20, left: 120 }

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Convert plan to hierarchy
    const root = d3.hierarchy(plan)
    
    // Create tree layout
    const treeLayout = d3.tree<PlanNode>()
      .size([height - margin.top - margin.bottom, width - margin.left - margin.right])

    treeLayout(root)

    // Determine node type for coloring
    const getNodeType = (node: d3.HierarchyNode<PlanNode>) => {
      const data = node.data
      
      // Dead code
      if (data.filterPredicates?.includes('NULL IS NOT NULL')) {
        return 'dead'
      }
      
      // Performance issue (full table scan)
      if (data.operation === 'TABLE ACCESS' && data.options === 'FULL') {
        return 'issue'
      }
      
      // Index scan
      if (data.operation === 'INDEX') {
        return 'index'
      }
      
      // Active branch (has children and not dead)
      if (node.children && node.children.length > 0) {
        const hasDeadChildren = node.children.some(c => 
          c.data.filterPredicates?.includes('NULL IS NOT NULL')
        )
        if (!hasDeadChildren) return 'active'
      }
      
      return 'default'
    }

    // Draw links
    svg.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#999')
      .attr('stroke-width', 2)
      .attr('d', d3.linkHorizontal<any, d3.HierarchyPointNode<PlanNode>>()
        .x(d => d.y)
        .y(d => d.x))

    // Draw nodes
    const node = svg.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)

    // Node circles
    node.append('circle')
      .attr('r', 6)
      .attr('fill', d => {
        const type = getNodeType(d)
        switch(type) {
          case 'active': return '#90EE90'
          case 'dead': return '#FFB6C1'
          case 'issue': return '#FF6B6B'
          case 'index': return '#87CEEB'
          default: return '#fff'
        }
      })
      .attr('stroke', '#333')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')

    // Node labels
    node.append('text')
      .attr('dy', '.35em')
      .attr('x', d => d.children ? -10 : 10)
      .style('text-anchor', d => d.children ? 'end' : 'start')
      .style('font-size', '11px')
      .style('font-family', 'monospace')
      .each(function(d) {
        const text = d3.select(this)
        const lines = []
        
        // Build label
        let label = d.data.operation
        if (d.data.options) label += ` ${d.data.options}`
        if (d.data.objectName) label += `\n${d.data.objectName}`
        if (d.data.cost !== undefined) label += `\nCost: ${d.data.cost}`
        if (d.data.cardinality) label += `, Rows: ${d.data.cardinality}`
        
        lines.push(...label.split('\n'))
        
        // Render multi-line
        lines.forEach((line, i) => {
          text.append('tspan')
            .attr('x', d.children ? -10 : 10)
            .attr('dy', i === 0 ? 0 : '1.2em')
            .text(line)
        })
      })

  }, [plan])

  return (
    <div className="overflow-auto">
      <svg ref={svgRef} className="border rounded"></svg>
    </div>
  )
}
