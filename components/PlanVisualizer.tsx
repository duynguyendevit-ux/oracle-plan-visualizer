'use client'

import { useEffect, useRef, useState } from 'react'
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

type LayoutDirection = 'TB' | 'LR'
type NodeStyle = 'detailed' | 'simple'

export default function PlanVisualizer({ plan }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [direction, setDirection] = useState<LayoutDirection>('TB')
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>('detailed')

  useEffect(() => {
    if (!svgRef.current || !plan) return

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove()

    const width = window.innerWidth - 100
    const height = 1200
    const margin = { top: 40, right: 200, bottom: 40, left: 200 }

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${margin.top})`)

    // Convert plan to hierarchy
    const root = d3.hierarchy(plan)
    
    // Create tree layout
    const isHorizontal = direction === 'LR'
    const treeLayout = d3.tree<PlanNode>()
      .size(isHorizontal 
        ? [height - margin.top - margin.bottom, width - margin.left - margin.right]
        : [width - margin.left - margin.right, height - margin.top - margin.bottom]
      )
      .nodeSize(isHorizontal ? [120, 300] : [300, 120])

    treeLayout(root)

    // Determine node type for coloring
    const getNodeType = (node: d3.HierarchyNode<PlanNode>) => {
      const data = node.data
      
      if (data.filterPredicates?.includes('NULL IS NOT NULL')) {
        return 'dead'
      }
      
      if (data.operation === 'TABLE ACCESS' && data.options === 'FULL') {
        return 'issue'
      }
      
      if (data.operation === 'INDEX') {
        return 'index'
      }
      
      if (node.children && node.children.length > 0) {
        const hasDeadChildren = node.children.some(c => 
          c.data.filterPredicates?.includes('NULL IS NOT NULL')
        )
        if (!hasDeadChildren) return 'active'
      }
      
      return 'default'
    }

    // Draw links with arrows
    const linkGenerator = isHorizontal
      ? d3.linkHorizontal<any, d3.HierarchyPointNode<PlanNode>>()
          .x(d => d.y)
          .y(d => d.x)
      : d3.linkVertical<any, d3.HierarchyPointNode<PlanNode>>()
          .x(d => d.x)
          .y(d => d.y)

    svg.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#999')
      .attr('stroke-width', 2)
      .attr('d', linkGenerator)
      .attr('marker-end', 'url(#arrowhead)')

    // Add arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#999')

    // Draw nodes
    const node = svg.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => isHorizontal ? `translate(${d.y},${d.x})` : `translate(${d.x},${d.y})`)

    // Node circles
    node.append('circle')
      .attr('r', nodeStyle === 'simple' ? 8 : 6)
      .attr('fill', d => {
        if (nodeStyle === 'simple') return '#fff'
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
      .append('title')
      .text(d => {
        const lines = []
        lines.push(`Operation: ${d.data.operation}`)
        if (d.data.options) lines.push(`Options: ${d.data.options}`)
        if (d.data.objectName) lines.push(`Object: ${d.data.objectName}`)
        if (d.data.cost !== undefined) lines.push(`Cost: ${d.data.cost}`)
        if (d.data.cardinality) lines.push(`Rows: ${d.data.cardinality}`)
        if (d.data.cpuCost) lines.push(`CPU Cost: ${d.data.cpuCost}`)
        if (d.data.filterPredicates) lines.push(`Filter: ${d.data.filterPredicates}`)
        return lines.join('\n')
      })

    // Node labels
    node.append('text')
      .attr('dy', '.35em')
      .attr('x', d => d.children ? -10 : 10)
      .style('text-anchor', d => d.children ? 'end' : 'start')
      .style('font-size', '12px')
      .style('font-family', 'monospace')
      .each(function(d) {
        const text = d3.select(this)
        const lines = []
        
        let label = d.data.operation
        if (d.data.options) label += ` ${d.data.options}`
        lines.push(label)
        
        if (d.data.objectName) {
          lines.push(nodeStyle === 'detailed' ? `📦 ${d.data.objectName}` : d.data.objectName)
        }
        
        if (d.data.cost !== undefined) {
          const costLine = nodeStyle === 'detailed' ? `💰 Cost: ${d.data.cost}` : `Cost: ${d.data.cost}`
          if (d.data.cardinality) {
            lines.push(`${costLine}, Rows: ${d.data.cardinality}`)
          } else {
            lines.push(costLine)
          }
        }
        
        if (d.data.filterPredicates) {
          if (d.data.filterPredicates.includes('NULL IS NOT NULL')) {
            lines.push(nodeStyle === 'detailed' ? `⚠️ Dead Code` : 'Dead Code')
          } else {
            lines.push(nodeStyle === 'detailed' ? `🔍 ${d.data.filterPredicates}` : d.data.filterPredicates)
          }
        }
        
        // Render multi-line
        lines.forEach((line, i) => {
          const tspan = text.append('tspan')
            .attr('x', d.children ? -10 : 10)
            .attr('dy', i === 0 ? 0 : '1.2em')
            .text(line)
          
          // Bold table/index names
          if (i === 1 && d.data.objectName) {
            tspan.style('font-weight', 'bold')
          }
          
          // Italic filters
          if (i > 1 && d.data.filterPredicates && !d.data.filterPredicates.includes('NULL IS NOT NULL')) {
            tspan.style('font-style', 'italic')
          }
        })
      })

  }, [plan, direction, nodeStyle])

  // Export to image
  const exportToImage = (format: 'png' | 'svg') => {
    if (!svgRef.current) return
    
    const svgData = new XMLSerializer().serializeToString(svgRef.current)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)
    
    if (format === 'svg') {
      const link = document.createElement('a')
      link.href = svgUrl
      link.download = 'execution-plan.svg'
      link.click()
      URL.revokeObjectURL(svgUrl)
    } else {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = svgRef.current!.clientWidth
        canvas.height = svgRef.current!.clientHeight
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fef7ff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = 'execution-plan.png'
            link.click()
            URL.revokeObjectURL(url)
          }
        })
        URL.revokeObjectURL(svgUrl)
      }
      img.src = svgUrl
    }
  }

  return (
    <div style={{ width: '100%', height: '1200px', position: 'relative' }}>
      {/* Controls */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {/* Layout Direction */}
        <div style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <button
            onClick={() => setDirection('TB')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              background: direction === 'TB' ? '#094cb2' : '#e8e1e8',
              color: direction === 'TB' ? 'white' : '#1d1b20',
              transition: 'all 0.2s'
            }}
          >
            ⬇️ Top to Bottom
          </button>
          <button
            onClick={() => setDirection('LR')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              background: direction === 'LR' ? '#094cb2' : '#e8e1e8',
              color: direction === 'LR' ? 'white' : '#1d1b20',
              transition: 'all 0.2s'
            }}
          >
            ➡️ Left to Right
          </button>
        </div>
        
        {/* Node Style */}
        <div style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <button
            onClick={() => setNodeStyle('detailed')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              background: nodeStyle === 'detailed' ? '#094cb2' : '#e8e1e8',
              color: nodeStyle === 'detailed' ? 'white' : '#1d1b20',
              transition: 'all 0.2s'
            }}
          >
            🎨 Detailed
          </button>
          <button
            onClick={() => setNodeStyle('simple')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              background: nodeStyle === 'simple' ? '#094cb2' : '#e8e1e8',
              color: nodeStyle === 'simple' ? 'white' : '#1d1b20',
              transition: 'all 0.2s'
            }}
          >
            ⚪ Simple
          </button>
        </div>
        
        {/* Export Options */}
        <div style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <button
            onClick={() => exportToImage('png')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              background: '#e8e1e8',
              color: '#1d1b20',
              transition: 'all 0.2s'
            }}
          >
            📷 PNG
          </button>
          <button
            onClick={() => exportToImage('svg')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              background: '#e8e1e8',
              color: '#1d1b20',
              transition: 'all 0.2s'
            }}
          >
            🎨 SVG
          </button>
        </div>
      </div>
      
      <div className="overflow-auto" style={{ width: '100%', height: '100%' }}>
        <svg ref={svgRef} className="border rounded"></svg>
      </div>
    </div>
  )
}
