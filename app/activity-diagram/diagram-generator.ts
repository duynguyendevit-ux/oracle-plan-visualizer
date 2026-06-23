interface Node {
  id: string
  type: 'start' | 'end' | 'activity' | 'decision' | 'merge' | 'fork' | 'join'
  label: string
  lane: string
  x?: number
  y?: number
  branch?: 'then' | 'else' // Track branch type
}

interface Edge {
  from: string
  to: string
  label?: string
}

interface Lane {
  id: string
  label: string
}

interface DiagramData {
  lanes: Lane[]
  nodes: Node[]
  edges: Edge[]
}

export function parseActivityDiagram(input: string): DiagramData {
  const lines = input.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const lanes: Lane[] = []
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nodeId = 0
  let currentLane = ''
  const nodesByLabel = new Map<string, string>()
  
  const createNode = (type: Node['type'], label: string, lane: string, branch?: 'then' | 'else'): string => {
    const id = `node_${nodeId++}`
    nodes.push({ id, type, label, lane, branch })
    if (label) {
      nodesByLabel.set(label.toLowerCase(), id)
    }
    return id
  }

  let currentNode: string | null = null
  let decisionStack: Array<{ decisionId: string; thenNodes: string[]; elseNodes: string[] }> = []
  let currentBranch: 'then' | 'else' | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Cross-lane connection
    if (line.includes(':') && line.includes('->')) {
      const parts = line.split('->')
      if (parts.length === 2) {
        const fromPart = parts[0].trim()
        const toPart = parts[1].trim()
        
        const fromColonIndex = fromPart.indexOf(':')
        const toColonIndex = toPart.indexOf(':')
        
        if (fromColonIndex > 0 && toColonIndex > 0) {
          const fromLabel = fromPart.substring(fromColonIndex + 1).trim()
          const toLabel = toPart.substring(toColonIndex + 1).trim()
          
          const fromNodeId = nodesByLabel.get(fromLabel.toLowerCase())
          const toNodeId = nodesByLabel.get(toLabel.toLowerCase())
          
          if (fromNodeId && toNodeId) {
            edges.push({ from: fromNodeId, to: toNodeId })
          }
          continue
        }
      }
    }

    // Lane definition
    if (line.startsWith('lane')) {
      const match = line.match(/lane\s+(.+)/)
      if (match) {
        const laneLabel = match[1]
        const laneId = `lane_${lanes.length}`
        lanes.push({ id: laneId, label: laneLabel })
        currentLane = laneId
        currentNode = null
      }
      continue
    }

    // Start node
    if (line === 'start') {
      currentNode = createNode('start', 'Start', currentLane)
      continue
    }

    // End node
    if (line === 'end') {
      const endNode = createNode('end', 'End', currentLane)
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
      
      const activityNode = createNode('activity', activityLabel, currentLane, currentBranch || undefined)
      if (currentNode) {
        edges.push({ from: currentNode, to: activityNode, label: edgeLabel })
      }
      
      // Track branch nodes
      if (currentBranch && decisionStack.length > 0) {
        const decision = decisionStack[decisionStack.length - 1]
        if (currentBranch === 'then') {
          decision.thenNodes.push(activityNode)
        } else {
          decision.elseNodes.push(activityNode)
        }
      }
      
      currentNode = activityNode
      continue
    }

    // Decision (if)
    if (line.startsWith('if')) {
      const condition = line.match(/if\s*\((.+?)\)/)?.[1] || 'Condition'
      const decisionNode = createNode('decision', condition, currentLane)
      if (currentNode) {
        edges.push({ from: currentNode, to: decisionNode })
      }
      currentNode = decisionNode
      decisionStack.push({ decisionId: decisionNode, thenNodes: [], elseNodes: [] })
      continue
    }

    // Then branch
    if (line === 'then') {
      currentBranch = 'then'
      continue
    }

    // Else branch
    if (line === 'else') {
      currentBranch = 'else'
      // Reset currentNode to decision for else branch
      if (decisionStack.length > 0) {
        currentNode = decisionStack[decisionStack.length - 1].decisionId
      }
      continue
    }

    // End if
    if (line === 'endif') {
      const mergeNode = createNode('merge', '', currentLane)
      
      if (decisionStack.length > 0) {
        const decision = decisionStack.pop()!
        
        // Connect last node of then branch to merge
        if (decision.thenNodes.length > 0) {
          const lastThen = decision.thenNodes[decision.thenNodes.length - 1]
          edges.push({ from: lastThen, to: mergeNode, label: 'yes' })
        } else {
          edges.push({ from: decision.decisionId, to: mergeNode, label: 'yes' })
        }
        
        // Connect last node of else branch to merge
        if (decision.elseNodes.length > 0) {
          const lastElse = decision.elseNodes[decision.elseNodes.length - 1]
          edges.push({ from: lastElse, to: mergeNode, label: 'no' })
        } else {
          edges.push({ from: decision.decisionId, to: mergeNode, label: 'no' })
        }
      }
      
      currentNode = mergeNode
      currentBranch = null
      continue
    }

    // Fork
    if (line === 'fork') {
      const forkNode = createNode('fork', '', currentLane)
      if (currentNode) {
        edges.push({ from: currentNode, to: forkNode })
      }
      currentNode = forkNode
      continue
    }

    // Join
    if (line === 'join') {
      const joinNode = createNode('join', '', currentLane)
      if (currentNode) {
        edges.push({ from: currentNode, to: joinNode })
      }
      currentNode = joinNode
      continue
    }
  }

  // If no lanes defined, create default lane
  if (lanes.length === 0) {
    lanes.push({ id: 'lane_0', label: 'Default' })
    nodes.forEach(n => n.lane = 'lane_0')
  }

  return { lanes, nodes, edges }
}

export function generateSVG(data: DiagramData, width: number = 1200, height: number = 800): string {
  const laneWidth = width / data.lanes.length
  const nodeWidth = 140
  const nodeHeight = 50
  const verticalSpacing = 100
  const horizontalBranchOffset = 120
  const headerHeight = 60

  // Group nodes by lane
  const nodesByLane = new Map<string, Node[]>()
  data.lanes.forEach(lane => nodesByLane.set(lane.id, []))
  data.nodes.forEach(node => {
    const laneNodes = nodesByLane.get(node.lane) || []
    laneNodes.push(node)
    nodesByLane.set(node.lane, laneNodes)
  })

  // Layout nodes with horizontal branching
  const nodePositions = new Map<string, { x: number; y: number }>()
  data.lanes.forEach((lane, laneIndex) => {
    const laneNodes = nodesByLane.get(lane.id) || []
    const laneX = laneIndex * laneWidth + laneWidth / 2
    let currentY = headerHeight + 50

    laneNodes.forEach(node => {
      let x = laneX
      
      // Horizontal offset for branches
      if (node.branch === 'then') {
        x = laneX + horizontalBranchOffset
      } else if (node.branch === 'else') {
        x = laneX - horizontalBranchOffset
      }
      
      nodePositions.set(node.id, { x, y: currentY })
      node.x = x
      node.y = currentY
      
      // Only increment Y for non-branch nodes or last node in branch
      if (!node.branch || node.type === 'merge') {
        currentY += verticalSpacing
      } else {
        currentY += verticalSpacing * 0.8 // Smaller spacing within branches
      }
    })
  })

  const totalHeight = Math.max(height, headerHeight + (Math.max(...Array.from(nodesByLane.values()).map(n => n.length)) * verticalSpacing) + 100)

  // Create SVG
  let svg = `<svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">`
  
  // Add styles
  svg += `<defs>
    <style>
      .lane { fill: #f4f4f4; stroke: #c6c6c6; stroke-width: 2; }
      .lane-header { fill: #e0e0e0; stroke: #161616; stroke-width: 2; }
      .lane-text { fill: #161616; font-family: 'IBM Plex Sans', sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; }
      .activity-node { fill: #ffffff; stroke: #161616; stroke-width: 2; }
      .decision-node { fill: #0f62fe; stroke: #161616; stroke-width: 2; }
      .start-end-node { fill: #161616; stroke: #161616; stroke-width: 2; }
      .node-text { fill: #161616; font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; text-anchor: middle; }
      .decision-node + .node-text { fill: #ffffff; }
      .edge { stroke: #161616; stroke-width: 2; fill: none; marker-end: url(#arrowhead); }
      .edge-label { fill: #525252; font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; font-weight: bold; text-anchor: middle; }
    </style>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#161616" />
    </marker>
  </defs>`

  // Draw lanes
  data.lanes.forEach((lane, index) => {
    const x = index * laneWidth
    svg += `<rect class="lane" x="${x}" y="${headerHeight}" width="${laneWidth}" height="${totalHeight - headerHeight}" />`
    svg += `<rect class="lane-header" x="${x}" y="0" width="${laneWidth}" height="${headerHeight}" />`
    svg += `<text class="lane-text" x="${x + laneWidth/2}" y="${headerHeight/2 + 5}">${lane.label}</text>`
  })

  // Draw edges
  data.edges.forEach(edge => {
    const from = nodePositions.get(edge.from)
    const to = nodePositions.get(edge.to)
    if (from && to) {
      const fromNode = data.nodes.find(n => n.id === edge.from)
      const toNode = data.nodes.find(n => n.id === edge.to)
      
      let startY = from.y + nodeHeight/2
      let endY = to.y - nodeHeight/2
      
      if (fromNode?.type === 'start' || fromNode?.type === 'end') startY = from.y + 25
      if (fromNode?.type === 'decision') startY = from.y + 35
      if (toNode?.type === 'start' || toNode?.type === 'end') endY = to.y - 25
      if (toNode?.type === 'merge') endY = to.y - 35
      
      // Draw edge with proper routing
      if (from.x === to.x) {
        // Straight vertical line
        svg += `<path class="edge" d="M ${from.x} ${startY} L ${to.x} ${endY}" />`
      } else {
        // Horizontal branching or cross-lane
        const midY = (startY + endY) / 2
        svg += `<path class="edge" d="M ${from.x} ${startY} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${endY}" />`
      }
      
      if (edge.label) {
        const midX = (from.x + to.x) / 2
        const midY = (startY + endY) / 2
        svg += `<text class="edge-label" x="${midX + 15}" y="${midY - 5}">${edge.label}</text>`
      }
    }
  })

  // Draw nodes
  data.nodes.forEach(node => {
    const pos = nodePositions.get(node.id)
    if (!pos) return

    if (node.type === 'start' || node.type === 'end') {
      svg += `<circle class="start-end-node" cx="${pos.x}" cy="${pos.y}" r="25" />`
      svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 5}" fill="white">${node.label}</text>`
    } else if (node.type === 'decision' || node.type === 'merge') {
      const size = 35
      svg += `<polygon class="decision-node" points="${pos.x},${pos.y - size} ${pos.x + size},${pos.y} ${pos.x},${pos.y + size} ${pos.x - size},${pos.y}" />`
      if (node.label) {
        const words = node.label.split(' ')
        if (words.length > 2) {
          svg += `<text class="node-text" x="${pos.x}" y="${pos.y - 5}" font-size="11">${words.slice(0, 2).join(' ')}</text>`
          svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 8}" font-size="11">${words.slice(2).join(' ')}</text>`
        } else {
          svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 5}">${node.label}</text>`
        }
      }
    } else if (node.type === 'fork' || node.type === 'join') {
      svg += `<rect class="start-end-node" x="${pos.x - 60}" y="${pos.y - 4}" width="120" height="8" />`
    } else {
      svg += `<rect class="activity-node" x="${pos.x - nodeWidth/2}" y="${pos.y - nodeHeight/2}" width="${nodeWidth}" height="${nodeHeight}" rx="5" />`
      
      const words = node.label.split(' ')
      if (words.length > 3) {
        svg += `<text class="node-text" x="${pos.x}" y="${pos.y - 8}" font-size="12">${words.slice(0, 2).join(' ')}</text>`
        svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 8}" font-size="12">${words.slice(2).join(' ')}</text>`
      } else {
        svg += `<text class="node-text" x="${pos.x}" y="${pos.y + 5}">${node.label}</text>`
      }
    }
  })

  svg += '</svg>'
  return svg
}
