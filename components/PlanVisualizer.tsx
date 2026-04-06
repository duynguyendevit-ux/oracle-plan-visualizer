'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
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
import dagre from 'dagre'
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
type NodeStyle = 'detailed' | 'simple'

// Custom node colors based on type
const getNodeStyle = (data: PlanNode, styleType: NodeStyle = 'detailed') => {
  if (styleType === 'simple') {
    return {
      background: '#fff',
      border: '2px solid #333',
      borderRadius: '50%',
      padding: '10px',
      fontSize: '12px',
      fontFamily: 'monospace',
      minWidth: '80px',
      minHeight: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center' as const,
    }
  }
  
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
const getNodeLabel = (data: PlanNode, styleType: NodeStyle = 'detailed') => {
  const lines = []
  
  let label = data.operation
  if (data.options) label += ` ${data.options}`
  lines.push(label)
  
  if (data.objectName) {
    lines.push(styleType === 'detailed' ? `📦 ${data.objectName}` : data.objectName)
  }
  
  if (data.cost !== undefined) {
    const costLine = styleType === 'detailed' ? `💰 Cost: ${data.cost}` : `Cost: ${data.cost}`
    if (data.cardinality) {
      lines.push(`${costLine} | Rows: ${data.cardinality}`)
    } else {
      lines.push(costLine)
    }
  }
  
  if (data.filterPredicates) {
    const filterLabel = styleType === 'detailed' ? `🔍 ${data.filterPredicates}` : data.filterPredicates
    if (data.filterPredicates.includes('NULL IS NOT NULL')) {
      lines.push(styleType === 'detailed' ? `⚠️ Dead Code: ${data.filterPredicates}` : `Dead: ${data.filterPredicates}`)
    } else {
      lines.push(filterLabel)
    }
  }
  
  // Add performance hints
  if (data.operation === 'TABLE ACCESS' && data.options === 'FULL') {
    lines.push(styleType === 'detailed' ? '⚠️ Full Table Scan' : 'Full Scan')
  }
  
  if (data.operation === 'INDEX') {
    lines.push(styleType === 'detailed' ? '✅ Using Index' : 'Index')
  }
  
  return lines.join('\n')
}

// Convert plan tree to ReactFlow nodes/edges with Dagre layout
const convertToFlow = (plan: PlanNode, direction: LayoutDirection = 'TB', styleType: NodeStyle = 'detailed') => {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeId = 0
  
  // First pass: create nodes and edges
  const traverse = (node: PlanNode, parentId: string | null) => {
    const id = `node-${nodeId++}`
    
    nodes.push({
      id,
      type: 'default',
      data: { label: getNodeLabel(node, styleType) },
      position: { x: 0, y: 0 }, // Will be set by Dagre
      style: {
        ...getNodeStyle(node, styleType),
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
      node.children.forEach((child) => {
        traverse(child, id)
      })
    }
  }
  
  traverse(plan, null)
  
  // Apply Dagre layout
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 150 })
  
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 250, height: 100 })
  })
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })
  
  dagre.layout(dagreGraph)
  
  // Update node positions from Dagre
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.position = {
      x: nodeWithPosition.x - 125,
      y: nodeWithPosition.y - 50,
    }
  })
  
  return { nodes, edges }
}

export default function PlanVisualizer({ plan }: Props) {
  const [direction, setDirection] = useState<LayoutDirection>('TB')
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>('detailed')
  
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertToFlow(plan, direction, nodeStyle), 
    [plan, direction, nodeStyle]
  )
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  
  // Update nodes when direction or style changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = convertToFlow(plan, direction, nodeStyle)
    setNodes(newNodes)
    setEdges(newEdges)
  }, [direction, nodeStyle, plan, setNodes, setEdges])
  
  return (
    <div style={{ width: '100%', height: '800px', position: 'relative' }}>
      {/* Layout Toggle */}
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
