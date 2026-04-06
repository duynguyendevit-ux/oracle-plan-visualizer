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
  NodeProps,
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

interface CustomNodeData {
  operation: string
  options?: string
  objectName?: string
  cost?: number
  cardinality?: number
  filterPredicates?: string
  styleType: NodeStyle
}

// Custom Node Component
function CustomNode({ data }: NodeProps<CustomNodeData>) {
  const { operation, options, objectName, cost, cardinality, filterPredicates, styleType } = data
  
  const isDeadCode = filterPredicates?.includes('NULL IS NOT NULL')
  const isFullScan = operation === 'TABLE ACCESS' && options === 'FULL'
  const isIndex = operation === 'INDEX'
  
  return (
    <div style={{ fontSize: '12px', fontFamily: 'monospace', lineHeight: '1.4' }}>
      <div>{operation}{options ? ` ${options}` : ''}</div>
      
      {objectName && (
        <div style={{ fontWeight: 'bold', marginTop: '4px' }}>
          {styleType === 'detailed' ? `📦 ${objectName}` : objectName}
        </div>
      )}
      
      {cost !== undefined && (
        <div style={{ marginTop: '4px' }}>
          {styleType === 'detailed' ? `💰 Cost: ${cost}` : `Cost: ${cost}`}
          {cardinality ? ` | Rows: ${cardinality}` : ''}
        </div>
      )}
      
      {filterPredicates && (
        <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
          {isDeadCode 
            ? (styleType === 'detailed' ? `⚠️ Dead Code: ${filterPredicates}` : `Dead: ${filterPredicates}`)
            : (styleType === 'detailed' ? `🔍 ${filterPredicates}` : filterPredicates)
          }
        </div>
      )}
      
      {isFullScan && (
        <div style={{ marginTop: '4px', color: '#DC143C' }}>
          {styleType === 'detailed' ? '⚠️ Full Table Scan' : 'Full Scan'}
        </div>
      )}
      
      {isIndex && (
        <div style={{ marginTop: '4px', color: '#32CD32' }}>
          {styleType === 'detailed' ? '✅ Using Index' : 'Index'}
        </div>
      )}
    </div>
  )
}

const nodeTypes = {
  custom: CustomNode,
}

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

// Build label for node with HTML
const getNodeLabel = (data: PlanNode, styleType: NodeStyle = 'detailed') => {
  const parts = []
  
  let label = data.operation
  if (data.options) label += ` ${data.options}`
  parts.push(`<div>${label}</div>`)
  
  if (data.objectName) {
    const objectLabel = styleType === 'detailed' ? `📦 ${data.objectName}` : data.objectName
    parts.push(`<div style="font-weight: bold; margin-top: 4px;">${objectLabel}</div>`)
  }
  
  if (data.cost !== undefined) {
    const costLine = styleType === 'detailed' ? `💰 Cost: ${data.cost}` : `Cost: ${data.cost}`
    if (data.cardinality) {
      parts.push(`<div style="margin-top: 4px;">${costLine} | Rows: ${data.cardinality}</div>`)
    } else {
      parts.push(`<div style="margin-top: 4px;">${costLine}</div>`)
    }
  }
  
  if (data.filterPredicates) {
    const filterLabel = styleType === 'detailed' ? `🔍 ${data.filterPredicates}` : data.filterPredicates
    if (data.filterPredicates.includes('NULL IS NOT NULL')) {
      const deadLabel = styleType === 'detailed' ? `⚠️ Dead Code: ${data.filterPredicates}` : `Dead: ${data.filterPredicates}`
      parts.push(`<div style="margin-top: 4px;">${deadLabel}</div>`)
    } else {
      parts.push(`<div style="margin-top: 4px; font-style: italic;">${filterLabel}</div>`)
    }
  }
  
  // Add performance hints
  if (data.operation === 'TABLE ACCESS' && data.options === 'FULL') {
    const hint = styleType === 'detailed' ? '⚠️ Full Table Scan' : 'Full Scan'
    parts.push(`<div style="margin-top: 4px; color: #DC143C;">${hint}</div>`)
  }
  
  if (data.operation === 'INDEX') {
    const hint = styleType === 'detailed' ? '✅ Using Index' : 'Index'
    parts.push(`<div style="margin-top: 4px; color: #32CD32;">${hint}</div>`)
  }
  
  return parts.join('')
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
      type: 'custom',
      data: {
        operation: node.operation,
        options: node.options,
        objectName: node.objectName,
        cost: node.cost,
        cardinality: node.cardinality,
        filterPredicates: node.filterPredicates,
        styleType,
      },
      position: { x: 0, y: 0 }, // Will be set by Dagre
      style: {
        ...getNodeStyle(node, styleType),
        width: 'auto',
        minWidth: '250px',
        maxWidth: '400px',
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
        nodeTypes={nodeTypes}
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
