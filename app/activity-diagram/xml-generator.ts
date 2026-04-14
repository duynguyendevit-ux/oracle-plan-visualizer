import { parseActivityDiagram } from './diagram-generator'

export function generateDrawioXML(input: string): string {
  const data = parseActivityDiagram(input)
  let cellId = 2
  
  const createCell = (id: string, value: string, style: string, parent: string, vertex: boolean, x: number, y: number, width: number, height: number): string => {
    return `        <mxCell id="${id}" value="${escapeXml(value)}" style="${style}" parent="${parent}" vertex="${vertex ? '1' : '0'}">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>`
  }
  
  const createEdge = (id: string, value: string, source: string, target: string, parent: string): string => {
    return `        <mxCell id="${id}" value="${escapeXml(value)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#FF0000;endArrow=open;endFill=1;" edge="1" parent="${parent}" source="${source}" target="${target}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`
  }
  
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
  
  let cells = ''
  const laneWidth = 280
  const nodeHeight = 50
  const nodeWidth = 110
  const verticalSpacing = 110
  const headerHeight = 60
  
  // Create swimlanes
  data.lanes.forEach((lane, index) => {
    const laneId = `lane_${index}`
    const x = 164.5 + (index * laneWidth)
    const y = 128
    
    cells += createCell(
      laneId,
      lane.label,
      'swimlane;whiteSpace=wrap',
      '1',
      true,
      x,
      y,
      laneWidth,
      570
    ) + '\n'
  })
  
  // Create nodes
  const nodeIdMap = new Map<string, string>()
  data.nodes.forEach((node, index) => {
    const laneIndex = parseInt(node.lane.split('_')[1])
    const laneId = `lane_${laneIndex}`
    const laneX = 164.5 + (laneIndex * laneWidth)
    
    // Calculate position within lane
    const nodesInLane = data.nodes.filter(n => n.lane === node.lane)
    const nodeIndexInLane = nodesInLane.indexOf(node)
    const x = 60
    const y = headerHeight + (nodeIndexInLane * verticalSpacing)
    
    const xmlId = `cell_${cellId++}`
    nodeIdMap.set(node.id, xmlId)
    
    if (node.type === 'start' || node.type === 'end') {
      cells += createCell(
        xmlId,
        '',
        `ellipse;shape=${node.type}State;fillColor=#000000;strokeColor=#ff0000;`,
        laneId,
        true,
        x + 40,
        y,
        30,
        30
      ) + '\n'
    } else if (node.type === 'decision' || node.type === 'merge') {
      cells += createCell(
        xmlId,
        node.label,
        'rhombus;fillColor=#ffffc0;strokeColor=#ff0000;',
        laneId,
        true,
        x + 15,
        y,
        80,
        40
      ) + '\n'
    } else if (node.type === 'fork' || node.type === 'join') {
      cells += createCell(
        xmlId,
        '',
        'shape=line;strokeWidth=6;strokeColor=#ff0000;rotation=90',
        laneId,
        true,
        x + 30,
        y + 17.5,
        50,
        15
      ) + '\n'
    } else {
      cells += createCell(
        xmlId,
        node.label,
        '',
        laneId,
        true,
        x,
        y,
        nodeWidth,
        nodeHeight
      ) + '\n'
    }
  })
  
  // Create edges
  data.edges.forEach((edge) => {
    const sourceId = nodeIdMap.get(edge.from)
    const targetId = nodeIdMap.get(edge.to)
    if (sourceId && targetId) {
      const edgeId = `edge_${cellId++}`
      cells += createEdge(
        edgeId,
        edge.label || '',
        sourceId,
        targetId,
        '1'
      ) + '\n'
    }
  })
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="Activity Diagram" id="activity-diagram">
    <mxGraphModel dx="1993" dy="1129" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`
}
