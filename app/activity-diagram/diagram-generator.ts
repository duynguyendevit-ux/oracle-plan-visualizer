import * as d3 from 'd3'

interface Node {
  id: string
  type: 'start' | 'end' | 'activity' | 'decision' | 'merge' | 'fork' | 'join'
  label: string
  x?: number
  y?: number
}

interface Edge {
  from: string
  to: string
  label?: string
}

interface DiagramData {
  nodes: Node[]
  edges: Edge[]
}

export function parseActivityDiagram(input: string): DiagramData {
  const lines = input.split('\n').map(l => l.trim()).filter(l => l)
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeId = 0
  const stack: string[] = []
  
  const createNode = (type: Node['type'], label: string): string => {
    const id = `node_${nodeId++}`
    nodes.push({ id, type, label })
    return id
  }

  let currentNode: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Start node
    if (line === 'start') {
      currentNode = createNode('start', 'Start')
      continue
    }

    // End node
    if (line === 'end') {
      const endNode = createNode('end', 'End')
      if (currentNode) {
        edges.push({ from: currentNode, to: endNode })
      }
      currentNode = endNode
      continue
    }

    // Activity
    if (line.startsWith('->')) {
      const label = line.substring(2).trim()
      const match = label.match(/^\[(.+?)\]\s*(.+)/)
      const activityLabel = match ? match[2] : label
      const edgeLabel = match ? match[1] : undefined
      
      const activityNode = createNode('activity', activityLabel)
      if (currentNode) {
        edges.push({ from: currentNode, to: activityNode, label: edgeLabel })
      }
      currentNode = activityNode
      continue
    }

    // Decision (if)
    if (line.startsWith('if')) {
      const condition = line.match(/if\s*\((.+?)\)/)?.[1] || 'Condition'
      const decisionNode = createNode('decision', condition)
      if (currentNode) {
        edges.push({ from: currentNode, to: decisionNode })
      }
      stack.push(currentNode || '')
      currentNode = decisionNode
      continue
    }

    // Then branch
    if (line === 'then') {
      continue
    }

    // Else branch
    if (line === 'else') {
      // Stay at decision node for else branch
      continue
    }

    // End if
    if (line === 'endif') {
      const mergeNode = createNode('merge', '')
      // Connect current node to merge
      if (currentNode) {
        edges.push({ from: currentNode, to: mergeNode })
      }
      currentNode = mergeNode
      continue
    }

    // Fork
    if (line === 'fork') {
      const forkNode = createNode('fork', '')
      if (currentNode) {
        edges.push({ from: currentNode, to: forkNode })
      }
      stack.push(currentNode || '')
      currentNode = forkNode
      continue
    }

    // Join
    if (line === 'join') {
      const joinNode = createNode('join', '')
      if (currentNode) {
        edges.push({ from: currentNode, to: joinNode })
      }
      currentNode = joinNode
      continue
    }
  }

  return { nodes, edges }
}

export function generateSVG(data: DiagramData, width: number = 800, height: number = 600): string {
  // Layout nodes
  const nodeWidth = 180
  const nodeHeight = 60
  const verticalSpacing = 100
  const horizontalSpacing = 250

  // Simple vertical layout
  let currentY = 50
  const nodePositions = new Map<string, { x: number; y: number }>()

  data.nodes.forEach((node, index) => {
    const x = width / 2
    const y = currentY
    nodePositions.set(node.id, { x, y })
    node.x = x
    node.y = y
    currentY += verticalSpacing
  })

  // Create SVG
  let svg = `<svg width="${width}" height="${Math.max(height, currentY + 100)}" xmlns="http://www.w3.org/2000/svg">`
  
  // Add styles
  svg += `<defs>
    <style>
      .activity-node { fill: #e8dcc8; stroke: #2c2416; stroke-width: 2; }
      .decision-node { fill: #d4a574; stroke: #2c2416; stroke-width: 2; }
      .start-end-node { fill: #2c2416; stroke: #2c2416; stroke-width: 2; }
      .node-text { fill: #2c2416; font-family: sans-serif; font-size: 14px; text-anchor: middle; }
      .edge { stroke: #2c2416; stroke-width: 2; fill: none; marker-end: url(#arrowhead); }
      .edge-label { fill: #6b5d4f; font-family: sans-serif; font-size: 12px; text-anchor: middle; }
    </style>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#2c2416" />
    </marker>
  </defs>`

  // Draw edges
  data.edges.forEach(edge => {
    const from = nodePositions.get(edge.from)
    const to = nodePositions.get(edge.to)
    if (from && to) {
      svg += `<path class="edge" d="M ${from.x} ${from.y + nodeHeight/2} L ${to.x} ${to.y - nodeHeight/2}" />`
      
      if (edge.label) {
        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2
        svg += `<text class="edge-label" x="${midX + 20}" y="${midY}">${edge.label}</text>`
      }
    }
  })

  // Draw nodes
  data.nodes.forEach(node => {
    const pos = nodePositions.get(node.id)
    if (!pos) return

    if (node.type === 'start' || node.type === 'end') {
      // Circle for start/end
      svg += `<circle class="start-end-node" cx="${pos.x}" cy="${pos.y}" r="25" />`
      svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 5}" fill="white">${node.label}</text>`
    } else if (node.type === 'decision' || node.type === 'merge') {
      // Diamond for decision/merge
      const size = 40
      svg += `<polygon class="decision-node" points="${pos.x},${pos.y - size} ${pos.x + size},${pos.y} ${pos.x},${pos.y + size} ${pos.x - size},${pos.y}" />`
      if (node.label) {
        svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 5}">${node.label}</text>`
      }
    } else if (node.type === 'fork' || node.type === 'join') {
      // Bar for fork/join
      svg += `<rect class="start-end-node" x="${pos.x - 60}" y="${pos.y - 5}" width="120" height="10" />`
    } else {
      // Rectangle for activity
      svg += `<rect class="activity-node" x="${pos.x - nodeWidth/2}" y="${pos.y - nodeHeight/2}" width="${nodeWidth}" height="${nodeHeight}" rx="5" />`
      svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 5}">${node.label}</text>`
    }
  })

  svg += '</svg>'
  return svg
}
