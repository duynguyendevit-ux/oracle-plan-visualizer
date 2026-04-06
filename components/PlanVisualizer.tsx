'use client'

import { useCallback, useMemo, useState } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

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

// Custom node colors based on type
const getNodeStyle = (data: PlanNode) => {
  let backgroundColor = '#fff'
  let borderColor = '#333'
  
  // Dead code
  if (data.filterPredicates?.includes('NULL IS NOT NULL')) {
    backgroundColor = '#FFB6C1'
    borderColor = '#FF1493'
  }
  // Performance issue (full table scan)
  else if (data.operation === 'TABLE ACCESS' && data.options === 'FULL') {
    backgroundColor = '#FF6B6B'
    borderColor = '#DC143C'
  }
  // Index scan
  else if (data.operation === 'INDEX') {
    backgroundColor = '#87CEEB'
    borderColor = '#4682B4'
  }
  // Active branch
  else if (data.children && data.children.length > 0) {
    backgroundColor = '#90EE90'
    borderColor = '#32CD32'
  }
  
  return {
    background: backgroundColor,
    border: `2px solid ${borderColor}`,
    borderRadius: '8px',
    padding: '10px',
    fontSize: '12px',
    fontFamily: 'monospace',
    minWidth: '200px',
  }
}

// Build label for node
const getNodeLabel = (data: PlanNode) => {
  const lines = []
  
  let label = data.operation
  if (data.options) label += ` ${data.options}`
  lines.push(label)
  
  if (data.objectName) {
    lines.push(`📦 ${data.objectName}`)
  }
  
  if (data.cost !== undefined) {
    const costLine = `💰 Cost: ${data.cost}`
    if (data.cardinality) {
      lines.push(`${costLine} | Rows: ${data.cardinality}`)
    } else {
      lines.push(costLine)
    }
  }
  
  if (data.filterPredicates) {
    lines.push(`🔍 ${data.filterPredicates}`)
  }
  
  return lines.join('\n')
}

// Convert plan tree to ReactFlow nodes/edges
const convertToFlow = (plan: PlanNode, direction: LayoutDirection = 'TB') => {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeId = 0
  
  const isHorizontal = direction === 'LR'
  const primarySpacing = isHorizontal ? 350 : 180
  const secondarySpacing = isHorizontal ? 180 : 350
  
  const traverse = (node: PlanNode, parentId: string | null, depth: number, index: number) => {
    const id = `node-${nodeId++}`
    
    const position = isHorizontal 
      ? { x: depth * primarySpacing, y: index * secondarySpacing }
      : { x: index * secondarySpacing, y: depth * primarySpacing }
    
    nodes.push({
      id,
      type: 'default',
      data: { label: getNodeLabel(node) },
      position,
      style: {
        ...getNodeStyle(node),
        width: 'auto',
        minWidth: '250px',
        maxWidth: '400px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
      draggable: true,
    })
    
    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${id}`,
        source: parentId,
        target: id,
        type: 'smoothstep',
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: { stroke: '#999', strokeWidth: 2 },
      })
    }
    
    if (node.children) {
      node.children.forEach((child, idx) => {
        traverse(child, id, depth + 1, index * node.children!.length + idx)
      })
    }
  }
  
  traverse(plan, null, 0, 0)
  
  return { nodes, edges }
}

export default function PlanVisualizer({ plan }: Props) {
  const [direction, setDirection] = useState<LayoutDirection>('TB')
  
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertToFlow(plan, direction), 
    [plan, direction]
  )
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  
  return (
    <div style={{ width: '100%', height: '800px', position: 'relative' }}>
      {/* Layout Toggle */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 10,
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
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            const style = node.style as any
            return style?.background || '#fff'
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  )
}
