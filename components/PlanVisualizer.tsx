'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import {
  flattenPlan,
  getBottlenecks,
  getCriticalPathIds,
  getMetricLabel,
  getMetricValue,
  isDeadNode,
  type PlanEntry,
  type PlanMetric,
  type PlanNode,
} from '@/lib/execution-plan'

interface Props {
  plan: PlanNode
  comparison?: {
    addedIds: string[]
    changedIds: string[]
  }
}

type LayoutDirection = 'TB' | 'LR'
type NodeStyle = 'detailed' | 'simple'
type NodeFilter = 'all' | 'full-scan' | 'index-scan' | 'dead' | 'highest-cost' | 'misestimate'
type SidePanel = 'details' | 'bottlenecks'

const colors = {
  background: 'var(--cds-background)',
  layer: 'var(--cds-layer-01)',
  layerAccent: 'var(--cds-layer-accent-01)',
  textPrimary: 'var(--cds-text-primary)',
  textSecondary: 'var(--cds-text-secondary)',
  borderSubtle: 'var(--cds-border-subtle)',
  interactive: 'var(--cds-interactive)',
  success: 'var(--cds-success)',
  danger: 'var(--cds-danger)',
  warning: 'var(--cds-warning)',
  cyan: '#1192e8',
  highestCost: '#ff832b',
  changed: '#8a3ffc',
}

function getCssColor(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function getTreeTransform(
  root: d3.HierarchyPointNode<PlanNode>,
  isHorizontal: boolean,
  containerWidth: number,
  containerHeight: number
) {
  const margin = { top: 60, right: 120, bottom: 60, left: 120 }
  const availableWidth = Math.max(containerWidth - margin.left - margin.right, 1)
  const availableHeight = Math.max(containerHeight - margin.top - margin.bottom, 1)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  root.descendants().forEach((node) => {
    const x = isHorizontal ? node.y : node.x
    const y = isHorizontal ? node.x : node.y
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  })

  const treeWidth = Math.max(maxX - minX, 1)
  const treeHeight = Math.max(maxY - minY, 1)
  const scale = Math.min(availableWidth / treeWidth, availableHeight / treeHeight, 1)
  const offsetX = margin.left + (availableWidth - treeWidth * scale) / 2 - minX * scale
  const offsetY = margin.top + (availableHeight - treeHeight * scale) / 2 - minY * scale
  return d3.zoomIdentity.translate(offsetX, offsetY).scale(scale)
}

function getBoundsTransform(bounds: DOMRect | SVGRect, width: number, height: number) {
  const margin = { top: 60, right: 120, bottom: 60, left: 120 }
  const availableWidth = Math.max(width - margin.left - margin.right, 1)
  const availableHeight = Math.max(height - margin.top - margin.bottom, 1)
  const contentWidth = Math.max(bounds.width, 1)
  const contentHeight = Math.max(bounds.height, 1)
  const scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1)
  const offsetX = margin.left + (availableWidth - contentWidth * scale) / 2 - bounds.x * scale
  const offsetY = margin.top + (availableHeight - contentHeight * scale) / 2 - bounds.y * scale
  return d3.zoomIdentity.translate(offsetX, offsetY).scale(scale)
}

function formatNumber(value: number | undefined) {
  if (value === undefined) return 'N/A'
  if (!Number.isFinite(value)) return 'Infinity'
  return value.toLocaleString()
}

function formatRatio(value: number | undefined) {
  if (value === undefined) return 'N/A'
  if (!Number.isFinite(value)) return 'Infinity'
  return `${value.toFixed(value >= 10 ? 0 : 2)}x`
}

function isLargeMisestimate(entry: PlanEntry) {
  const ratio = entry.misestimateRatio
  return ratio !== undefined && (ratio >= 10 || ratio <= 0.1)
}

function heatColor(value: number, maxValue: number) {
  const ratio = maxValue > 0 ? value / maxValue : 0
  if (ratio >= 0.75) return '#ff8389'
  if (ratio >= 0.5) return '#ff832b'
  if (ratio >= 0.25) return '#f1c21b'
  return '#78a9ff'
}

function recommendations(entry: PlanEntry, bottleneckIds: Set<string>) {
  const result: string[] = []
  if (isDeadNode(entry.node)) result.push('This branch is unreachable and should not affect runtime work.')
  if (entry.node.operation === 'TABLE ACCESS' && entry.node.options === 'FULL') {
    result.push('Review predicate selectivity and available indexes for this full table scan.')
  }
  if (isLargeMisestimate(entry)) {
    result.push('Estimated and actual rows differ significantly; review statistics and predicate correlation.')
  }
  if (bottleneckIds.has(entry.id)) result.push('This operation ranks among the highest-cost active nodes.')
  return result
}

export default function PlanVisualizer({ plan, comparison }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const minimapRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const currentTransformRef = useRef(d3.zoomIdentity)
  const previousLayoutRef = useRef<{
    plan: PlanNode
    direction: LayoutDirection
    nodeStyle: NodeStyle
    metric: PlanMetric
    width: number
    height: number
  } | null>(null)
  const positionsRef = useRef(new Map<string, { x: number; y: number }>())
  const pendingFocusRef = useRef<string | null>(null)
  const keyboardFocusRef = useRef<string | null>(null)
  const [direction, setDirection] = useState<LayoutDirection>('TB')
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>('detailed')
  const [nodeFilter, setNodeFilter] = useState<NodeFilter>('all')
  const [metric, setMetric] = useState<PlanMetric>('cost')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(-1)
  const [heatmapEnabled, setHeatmapEnabled] = useState(true)
  const [selectedNodeId, setSelectedNodeId] = useState('0')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [sidePanel, setSidePanel] = useState<SidePanel>('details')
  const [dimensions, setDimensions] = useState({ width: 0, height: 680 })

  const entries = useMemo(() => flattenPlan(plan), [plan])
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const idByNode = useMemo(() => new Map(entries.map((entry) => [entry.node, entry.id])), [entries])
  const highestCostIds = useMemo(() => new Set(getCriticalPathIds(plan, metric)), [metric, plan])
  const bottlenecks = useMemo(() => getBottlenecks(plan, 10, metric), [metric, plan])
  const bottleneckIds = useMemo(() => new Set(bottlenecks.map((entry) => entry.id)), [bottlenecks])
  const collapsibleIds = useMemo(
    () => entries.filter((entry) => (entry.node.children?.length ?? 0) > 0).map((entry) => entry.id),
    [entries]
  )
  const addedIds = useMemo(() => new Set(comparison?.addedIds ?? []), [comparison?.addedIds])
  const changedIds = useMemo(() => new Set(comparison?.changedIds ?? []), [comparison?.changedIds])
  const maxMetricValue = useMemo(() => Math.max(0, ...entries.map((entry) => getMetricValue(entry.node, metric))), [entries, metric])
  const selectedEntry = entryById.get(selectedNodeId) ?? entries[0]
  const breadcrumbEntries = useMemo(() => {
    if (!selectedEntry) return []
    const result: PlanEntry[] = []
    let current: PlanEntry | undefined = selectedEntry
    while (current) {
      result.unshift(current)
      current = current.parentId ? entryById.get(current.parentId) : undefined
    }
    return result
  }, [entryById, selectedEntry])

  const matchingEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return entries.filter((entry) => {
      const matchesQuery = !query || `${entry.label} ${entry.node.filterPredicates ?? ''}`.toLowerCase().includes(query)
      if (!matchesQuery) return false

      switch (nodeFilter) {
        case 'full-scan':
          return entry.node.operation === 'TABLE ACCESS' && entry.node.options === 'FULL'
        case 'index-scan':
          return entry.node.operation === 'INDEX'
        case 'dead':
          return isDeadNode(entry.node)
        case 'highest-cost':
          return highestCostIds.has(entry.id)
        case 'misestimate':
          return isLargeMisestimate(entry)
        default:
          return true
      }
    })
  }, [entries, highestCostIds, nodeFilter, searchQuery])

  const matchingIds = useMemo(() => new Set(matchingEntries.map((entry) => entry.id)), [matchingEntries])

  useEffect(() => {
    setSelectedNodeId('0')
    setCollapsedIds(new Set())
    setSearchQuery('')
    setNodeFilter('all')
    setSearchIndex(-1)
  }, [plan])

  useEffect(() => {
    setSearchIndex(-1)
  }, [nodeFilter, searchQuery])

  useEffect(() => {
    if (!containerRef.current) return
    const updateDimensions = () => {
      if (!containerRef.current) return
      setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight || 680 })
    }
    updateDimensions()
    const observer = new ResizeObserver(updateDimensions)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const applyFocus = useCallback((id: string) => {
    const position = positionsRef.current.get(id)
    const svgElement = svgRef.current
    if (!position || !svgElement || !zoomRef.current) return false
    const width = containerRef.current?.clientWidth ?? dimensions.width
    const height = containerRef.current?.clientHeight ?? dimensions.height
    const scale = 1.35
    const transform = d3.zoomIdentity
      .translate(width / 2 - position.x * scale, height / 2 - position.y * scale)
      .scale(scale)
    d3.select(svgElement).transition().duration(450).call(zoomRef.current.transform, transform)
    return true
  }, [dimensions.height, dimensions.width])

  const focusNode = (id: string) => {
    setSelectedNodeId(id)
    const ancestors = id.split('.').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('.'))
    const hidden = ancestors.some((ancestor) => collapsedIds.has(ancestor))
    if (hidden) {
      pendingFocusRef.current = id
      setCollapsedIds((current) => {
        const next = new Set(current)
        ancestors.forEach((ancestor) => next.delete(ancestor))
        return next
      })
      return
    }
    applyFocus(id)
  }

  const focusSearchResult = (offset: number) => {
    if (matchingEntries.length === 0) return
    const nextIndex = (searchIndex + offset + matchingEntries.length) % matchingEntries.length
    setSearchIndex(nextIndex)
    focusNode(matchingEntries[nextIndex].id)
  }

  useEffect(() => {
    if (!svgRef.current) return
    const previousLayout = previousLayoutRef.current
    const preserveViewport = previousLayout !== null
      && previousLayout.plan === plan
      && previousLayout.direction === direction
      && previousLayout.nodeStyle === nodeStyle
      && previousLayout.metric === metric
      && previousLayout.width === dimensions.width
      && previousLayout.height === dimensions.height
    const previousScrollLeft = containerRef.current?.scrollLeft ?? 0
    d3.select(svgRef.current).selectAll('*').remove()

    const containerWidth = dimensions.width > 0 && dimensions.width < 768
      ? 900
      : dimensions.width || window.innerWidth
    const containerHeight = dimensions.height || 680
    const isHorizontal = direction === 'LR'
    const svg = d3.select(svgRef.current)
      .attr('width', containerWidth)
      .attr('height', containerHeight)
      .style('cursor', 'grab')
    const g = svg.append('g')
    let updateMinimapViewport: (transform: d3.ZoomTransform) => void = () => {}
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        currentTransformRef.current = event.transform
        g.attr('transform', event.transform)
        updateMinimapViewport(event.transform)
      })
    zoomRef.current = zoom
    svg.call(zoom)

    const root = d3.hierarchy(plan, (node) => {
      const id = idByNode.get(node)
      return id && collapsedIds.has(id) ? undefined : node.children
    })
    const treeLayout = d3.tree<PlanNode>()
      .nodeSize(isHorizontal ? [72, 220] : [220, 76])
      .separation((left, right) => left.parent === right.parent ? 1.15 : 1.4)
    const positionedRoot = treeLayout(root)
    positionsRef.current.clear()
    positionedRoot.descendants().forEach((node) => {
      const id = idByNode.get(node.data)
      if (!id) return
      positionsRef.current.set(id, isHorizontal ? { x: node.y, y: node.x } : { x: node.x, y: node.y })
    })

    const defs = svg.append('defs')
    const addMarker = (id: string, fill: string) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', fill)
    }
    addMarker('arrowhead', colors.borderSubtle)
    addMarker('arrowhead-high-cost', colors.highestCost)

    const linkGenerator = isHorizontal
      ? d3.linkHorizontal<d3.HierarchyPointLink<PlanNode>, d3.HierarchyPointNode<PlanNode>>()
          .x((node) => node.y)
          .y((node) => node.x)
      : d3.linkVertical<d3.HierarchyPointLink<PlanNode>, d3.HierarchyPointNode<PlanNode>>()
          .x((node) => node.x)
          .y((node) => node.y)

    g.selectAll('.link')
      .data(positionedRoot.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('data-source-id', (link) => idByNode.get(link.source.data) ?? '')
      .attr('data-target-id', (link) => idByNode.get(link.target.data) ?? '')
      .attr('fill', 'none')
      .attr('stroke', (link) => {
        const sourceId = idByNode.get(link.source.data) ?? ''
        const targetId = idByNode.get(link.target.data) ?? ''
        return highestCostIds.has(sourceId) && highestCostIds.has(targetId) ? colors.highestCost : colors.borderSubtle
      })
      .attr('stroke-width', (link) => {
        const sourceId = idByNode.get(link.source.data) ?? ''
        const targetId = idByNode.get(link.target.data) ?? ''
        return highestCostIds.has(sourceId) && highestCostIds.has(targetId) ? 3 : 1.5
      })
      .attr('opacity', 1)
      .attr('d', linkGenerator)
      .attr('marker-end', (link) => {
        const sourceId = idByNode.get(link.source.data) ?? ''
        const targetId = idByNode.get(link.target.data) ?? ''
        return highestCostIds.has(sourceId) && highestCostIds.has(targetId)
          ? 'url(#arrowhead-high-cost)'
          : 'url(#arrowhead)'
      })

    const nodeType = (node: PlanNode) => {
      if (isDeadNode(node)) return 'dead'
      if (node.operation === 'TABLE ACCESS' && node.options === 'FULL') return 'issue'
      if (node.operation === 'INDEX') return 'index'
      if ((node.children?.length ?? 0) > 0) return 'active'
      return 'default'
    }

    const node = g.selectAll('.node')
      .data(positionedRoot.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('data-node-id', (item) => idByNode.get(item.data) ?? '')
      .attr('data-highest-cost', (item) => highestCostIds.has(idByNode.get(item.data) ?? '') ? 'true' : 'false')
      .attr('data-comparison', 'unchanged')
      .attr('opacity', 1)
      .attr('transform', (item) => isHorizontal ? `translate(${item.y},${item.x})` : `translate(${item.x},${item.y})`)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (item) => `Execution plan node ${entryById.get(idByNode.get(item.data) ?? '')?.label ?? item.data.operation}`)
      .attr('aria-expanded', (item) => (item.data.children?.length ?? 0) > 0 ? String(!collapsedIds.has(idByNode.get(item.data) ?? '')) : null)
      .style('cursor', 'pointer')
      .on('click', (_, item) => setSelectedNodeId(idByNode.get(item.data) ?? '0'))
      .on('focus', (_, item) => setSelectedNodeId(idByNode.get(item.data) ?? '0'))
      .on('keydown', (event, item) => {
        const id = idByNode.get(item.data) ?? '0'
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setSelectedNodeId(id)
        if ((item.data.children?.length ?? 0) === 0) return
        keyboardFocusRef.current = id
        setCollapsedIds((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      })

    node.append('circle')
      .attr('class', 'heat-ring')
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', (item) => heatColor(getMetricValue(item.data, metric), maxMetricValue))
      .attr('stroke-width', 3)
      .attr('opacity', 0)

    node.append('circle')
      .attr('class', 'comparison-ring')
      .attr('r', 12)
      .attr('fill', 'none')
      .attr('stroke', 'none')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', null)

    node.append('circle')
      .attr('class', 'selected-ring')
      .attr('r', 20)
      .attr('fill', 'none')
      .attr('stroke', colors.interactive)
      .attr('stroke-width', 2)
      .attr('opacity', 0)

    node.append('circle')
      .attr('r', nodeStyle === 'simple' ? 8 : 6)
      .attr('fill', (item) => {
        if (nodeStyle === 'simple') return colors.layer
        switch (nodeType(item.data)) {
          case 'active': return colors.success
          case 'dead': return colors.warning
          case 'issue': return colors.danger
          case 'index': return colors.cyan
          default: return colors.layer
        }
      })
      .attr('stroke', (item) => highestCostIds.has(idByNode.get(item.data) ?? '') ? colors.highestCost : colors.textPrimary)
      .attr('stroke-width', (item) => highestCostIds.has(idByNode.get(item.data) ?? '') ? 3 : 1.5)
      .on('click', (event, item) => {
        event.stopPropagation()
        const id = idByNode.get(item.data) ?? '0'
        setSelectedNodeId(id)
        if ((item.data.children?.length ?? 0) === 0) return
        setCollapsedIds((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      })
      .append('title')
      .text((item) => {
        const entry = entryById.get(idByNode.get(item.data) ?? '')
        const lines = [`Operation: ${item.data.operation}`]
        if (item.data.options) lines.push(`Options: ${item.data.options}`)
        if (item.data.objectName) lines.push(`Object: ${item.data.objectName}`)
        if (item.data.cost !== undefined) lines.push(`Cost: ${item.data.cost}`)
        if (entry?.estimatedRows !== undefined) lines.push(`Estimated rows: ${entry.estimatedRows}`)
        if (entry?.actualRows !== undefined) lines.push(`Actual rows: ${entry.actualRows}`)
        return lines.join('\n')
      })

    node.filter((item) => (item.data.children?.length ?? 0) > 0)
      .append('text')
      .attr('x', -13)
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '13px')
      .attr('font-weight', '700')
      .attr('fill', colors.textPrimary)
      .attr('pointer-events', 'none')
      .text((item) => collapsedIds.has(idByNode.get(item.data) ?? '') ? '+' : '-')

    node.append('text')
      .attr('dy', '.35em')
      .attr('x', 24)
      .style('text-anchor', 'start')
      .style('font-size', '12px')
      .style('font-family', 'IBM Plex Mono, monospace')
      .style('fill', colors.textPrimary)
      .style('font-weight', (item) => highestCostIds.has(idByNode.get(item.data) ?? '') ? '600' : '400')
      .each(function (item) {
        const entry = entryById.get(idByNode.get(item.data) ?? '')
        if (!entry) return
        const text = d3.select(this)
        const label = [item.data.operation, item.data.options].filter(Boolean).join(' ')
        const lines = [label]
        if (item.data.objectName) lines.push(item.data.objectName)
        if (nodeStyle === 'detailed') {
          let metrics = `${getMetricLabel(metric)} ${formatNumber(getMetricValue(item.data, metric))}`
          if (metric !== 'rows' && entry.estimatedRows !== undefined) metrics += ` | Rows ${formatNumber(entry.estimatedRows)}`
          if (entry.actualRows !== undefined) metrics += ` -> ${formatNumber(entry.actualRows)} (${formatRatio(entry.misestimateRatio)})`
          if (metrics) lines.push(metrics)
        }
        lines.forEach((line, index) => {
          text.append('tspan')
            .attr('x', 24)
            .attr('dy', index === 0 ? 0 : '1.2em')
            .style('font-weight', index === 1 && item.data.objectName ? '600' : '')
            .text(line)
        })
      })

    const bounds = g.node()?.getBBox()
    if (bounds && minimapRef.current) {
      const minimapWidth = 180
      const minimapHeight = 112
      const minimapPadding = 6
      const minimap = d3.select(minimapRef.current)
        .attr('width', minimapWidth)
        .attr('height', minimapHeight)
      minimap.selectAll('*').remove()
      const minimapScale = Math.min(
        (minimapWidth - minimapPadding * 2) / Math.max(bounds.width, 1),
        (minimapHeight - minimapPadding * 2) / Math.max(bounds.height, 1)
      )
      const minimapOffsetX = (minimapWidth - bounds.width * minimapScale) / 2 - bounds.x * minimapScale
      const minimapOffsetY = (minimapHeight - bounds.height * minimapScale) / 2 - bounds.y * minimapScale
      const minimapGroup = minimap.append('g')
        .attr('transform', `translate(${minimapOffsetX},${minimapOffsetY}) scale(${minimapScale})`)
      minimapGroup.selectAll('.minimap-link')
        .data(positionedRoot.links())
        .enter()
        .append('path')
        .attr('fill', 'none')
        .attr('stroke', colors.borderSubtle)
        .attr('stroke-width', 1 / minimapScale)
        .attr('d', linkGenerator)
      minimapGroup.selectAll('.minimap-node')
        .data(positionedRoot.descendants())
        .enter()
        .append('circle')
        .attr('cx', (item) => isHorizontal ? item.y : item.x)
        .attr('cy', (item) => isHorizontal ? item.x : item.y)
        .attr('r', 2.5 / minimapScale)
        .attr('fill', (item) => heatColor(getMetricValue(item.data, metric), maxMetricValue))
      const viewport = minimap.append('rect')
        .attr('fill', 'none')
        .attr('stroke', colors.interactive)
        .attr('stroke-width', 1.5)
        .attr('pointer-events', 'none')
      updateMinimapViewport = (transform) => {
        const visibleX = -transform.x / transform.k
        const visibleY = -transform.y / transform.k
        viewport
          .attr('x', minimapOffsetX + visibleX * minimapScale)
          .attr('y', minimapOffsetY + visibleY * minimapScale)
          .attr('width', Math.min(minimapWidth, containerWidth / transform.k * minimapScale))
          .attr('height', Math.min(minimapHeight, containerHeight / transform.k * minimapScale))
      }
      minimap.on('click', (event) => {
        const [pointerX, pointerY] = d3.pointer(event)
        const contentX = (pointerX - minimapOffsetX) / minimapScale
        const contentY = (pointerY - minimapOffsetY) / minimapScale
        const scale = currentTransformRef.current.k
        svg.transition().duration(300).call(
          zoom.transform,
          d3.zoomIdentity.translate(containerWidth / 2 - contentX * scale, containerHeight / 2 - contentY * scale).scale(scale)
        )
      })
    }
    const initialTransform = bounds
      ? getBoundsTransform(bounds, containerWidth, containerHeight)
      : getTreeTransform(positionedRoot, isHorizontal, containerWidth, containerHeight)
    svg.call(zoom.transform, preserveViewport ? currentTransformRef.current : initialTransform)

    if (containerRef.current && preserveViewport) {
      requestAnimationFrame(() => {
        if (containerRef.current) containerRef.current.scrollLeft = previousScrollLeft
      })
    } else if (dimensions.width > 0 && dimensions.width < 768 && containerRef.current) {
      requestAnimationFrame(() => {
        if (!containerRef.current) return
        containerRef.current.scrollLeft = (containerRef.current.scrollWidth - containerRef.current.clientWidth) / 2
      })
    }

    const pendingId = pendingFocusRef.current
    if (pendingId && positionsRef.current.has(pendingId)) {
      pendingFocusRef.current = null
      requestAnimationFrame(() => applyFocus(pendingId))
    }

    const keyboardFocusId = keyboardFocusRef.current
    if (keyboardFocusId) {
      keyboardFocusRef.current = null
      requestAnimationFrame(() => {
        svgRef.current
          ?.querySelector<SVGGElement>(`.node[data-node-id="${keyboardFocusId}"]`)
          ?.focus()
      })
    }

    previousLayoutRef.current = {
      plan,
      direction,
      nodeStyle,
      metric,
      width: dimensions.width,
      height: dimensions.height,
    }
  }, [
    collapsedIds,
    dimensions,
    direction,
    entryById,
    highestCostIds,
    idByNode,
    maxMetricValue,
    metric,
    nodeStyle,
    plan,
    applyFocus,
  ])

  useEffect(() => {
    if (!svgRef.current) return
    const filterActive = searchQuery.trim().length > 0 || nodeFilter !== 'all'
    const svg = d3.select(svgRef.current)

    svg.selectAll<SVGGElement, unknown>('.node').each(function () {
      const node = d3.select(this)
      const id = node.attr('data-node-id')
      const comparisonState = addedIds.has(id) ? 'added' : changedIds.has(id) ? 'changed' : 'unchanged'
      node
        .attr('data-comparison', comparisonState)
        .attr('opacity', !filterActive || matchingIds.has(id) ? 1 : 0.18)
      node.select('.heat-ring').attr('opacity', heatmapEnabled ? 0.8 : 0)
      node.select('.comparison-ring')
        .attr('stroke', comparisonState === 'added' ? colors.success : comparisonState === 'changed' ? colors.changed : 'none')
        .attr('stroke-dasharray', comparisonState === 'changed' ? '3 2' : null)
      node.select('.selected-ring').attr('opacity', id === selectedNodeId ? 1 : 0)
    })

    svg.selectAll<SVGPathElement, unknown>('.link').attr('opacity', function () {
      if (!filterActive) return 1
      const link = d3.select(this)
      return matchingIds.has(link.attr('data-source-id')) || matchingIds.has(link.attr('data-target-id')) ? 0.9 : 0.12
    })
  }, [
    addedIds,
    changedIds,
    collapsedIds,
    dimensions,
    direction,
    heatmapEnabled,
    matchingIds,
    nodeFilter,
    nodeStyle,
    plan,
    searchQuery,
    selectedNodeId,
  ])

  const zoomToFit = () => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    const group = svg.select<SVGGElement>('g')
    const bounds = group.node()?.getBBox()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return
    svg.transition().duration(500).call(
      zoomRef.current.transform,
      getBoundsTransform(bounds, dimensions.width, dimensions.height)
    )
  }

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
      return
    }

    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svgRef.current?.clientWidth ?? dimensions.width
      canvas.height = svgRef.current?.clientHeight ?? dimensions.height
      const context = canvas.getContext('2d')
      if (!context) return
      context.fillStyle = getCssColor('--cds-background', '#f4f4f4')
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'execution-plan.png'
        link.click()
        URL.revokeObjectURL(url)
      })
      URL.revokeObjectURL(svgUrl)
    }
    image.src = svgUrl
  }

  const detailsRecommendations = selectedEntry ? recommendations(selectedEntry, bottleneckIds) : []

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 border border-outline-variant bg-surface-container p-2">
        <label className="min-w-52 flex-1">
          <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Search</span>
          <div className="flex">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Operation, table, index, predicate"
              aria-label="Search execution plan"
              className="h-9 min-w-0 flex-1 px-3 text-sm"
            />
            <button type="button" onClick={() => focusSearchResult(-1)} disabled={matchingEntries.length === 0} title="Previous result" aria-label="Previous search result" className="h-9 w-9 border border-l-0 border-outline-variant bg-surface-container-low text-on-surface disabled:opacity-40">‹</button>
            <button type="button" onClick={() => focusSearchResult(1)} disabled={matchingEntries.length === 0} title="Next result" aria-label="Next search result" className="h-9 w-9 border border-l-0 border-outline-variant bg-surface-container-low text-on-surface disabled:opacity-40">›</button>
          </div>
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Filter</span>
          <select value={nodeFilter} onChange={(event) => setNodeFilter(event.target.value as NodeFilter)} className="h-9 min-w-44 px-2 text-sm">
            <option value="all">All nodes</option>
            <option value="full-scan">Full table scans</option>
            <option value="index-scan">Index scans</option>
            <option value="dead">Dead branches</option>
            <option value="highest-cost">Highest cost path</option>
            <option value="misestimate">Row misestimates</option>
          </select>
        </label>

        <label>
          <span className="mb-1 block text-xs font-medium uppercase text-on-surface-variant">Metric</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value as PlanMetric)} className="h-9 min-w-36 px-2 text-sm" aria-label="Analysis metric">
            <option value="cost">Cost</option>
            <option value="cpu">CPU</option>
            <option value="elapsed">Elapsed</option>
            <option value="buffers">Buffers</option>
            <option value="rows">Rows</option>
          </select>
        </label>

        <div className="flex h-9 border border-outline-variant">
          <button type="button" onClick={() => setDirection('TB')} className={`px-3 text-xs font-medium ${direction === 'TB' ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface'}`}>Top down</button>
          <button type="button" onClick={() => setDirection('LR')} className={`border-l border-outline-variant px-3 text-xs font-medium ${direction === 'LR' ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface'}`}>Left right</button>
        </div>

        <div className="flex h-9 border border-outline-variant">
          <button type="button" onClick={() => setNodeStyle('detailed')} className={`px-3 text-xs font-medium ${nodeStyle === 'detailed' ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface'}`}>Detailed</button>
          <button type="button" onClick={() => setNodeStyle('simple')} className={`border-l border-outline-variant px-3 text-xs font-medium ${nodeStyle === 'simple' ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface'}`}>Simple</button>
        </div>

        <label className="flex h-9 items-center gap-2 border border-outline-variant bg-surface-container-low px-3 text-xs font-medium text-on-surface">
          <input type="checkbox" checked={heatmapEnabled} onChange={(event) => setHeatmapEnabled(event.target.checked)} />
          {getMetricLabel(metric)} heat
        </label>

        <button type="button" onClick={() => setCollapsedIds(new Set(collapsibleIds))} className="h-9 border border-outline-variant bg-surface-container-low px-3 text-xs font-medium text-on-surface">Collapse all</button>
        <button type="button" onClick={() => setCollapsedIds(new Set())} className="h-9 border border-outline-variant bg-surface-container-low px-3 text-xs font-medium text-on-surface">Expand all</button>
        <button type="button" onClick={zoomToFit} className="h-9 bg-primary px-3 text-xs font-medium text-white">Fit</button>
        <button type="button" onClick={() => exportToImage('png')} className="h-9 border border-outline-variant bg-surface-container-low px-3 text-xs font-medium text-on-surface">PNG</button>
        <button type="button" onClick={() => exportToImage('svg')} className="h-9 border border-outline-variant bg-surface-container-low px-3 text-xs font-medium text-on-surface">SVG</button>
      </div>

      <nav className="flex min-h-9 items-center gap-1 overflow-x-auto border border-outline-variant bg-surface-container-low px-2" aria-label="Selected node path">
        {breadcrumbEntries.map((entry, index) => (
          <div key={entry.id} className="flex shrink-0 items-center gap-1">
            {index > 0 && <span className="text-on-surface-variant">/</span>}
            <button type="button" onClick={() => focusNode(entry.id)} className={`px-1 py-2 font-mono text-xs ${entry.id === selectedNodeId ? 'font-semibold text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>{entry.node.operation}</button>
          </div>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={containerRef} className="relative h-[520px] min-w-0 overflow-auto border border-outline-variant bg-surface-container-lowest md:h-[680px]">
          <svg ref={svgRef} data-testid="execution-plan-svg" className="h-full"></svg>
          <svg ref={minimapRef} className="absolute bottom-2 left-2 hidden border border-outline-variant bg-surface-container-low/95 shadow-editorial md:block" aria-label="Execution plan minimap"></svg>
        </div>

        <aside className="border border-outline-variant bg-surface-container-low">
          <div className="flex border-b border-outline-variant">
            <button type="button" onClick={() => setSidePanel('details')} className={`h-10 flex-1 text-xs font-semibold uppercase ${sidePanel === 'details' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}>Node details</button>
            <button type="button" onClick={() => setSidePanel('bottlenecks')} className={`h-10 flex-1 text-xs font-semibold uppercase ${sidePanel === 'bottlenecks' ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant'}`}>Bottlenecks</button>
          </div>

          {sidePanel === 'details' && selectedEntry && (
            <div className="space-y-4 p-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase text-on-surface-variant">Operation</div>
                <div className="mt-1 font-mono font-semibold text-on-surface">{selectedEntry.label}</div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <dt className="text-on-surface-variant">Cost</dt><dd className="text-right font-mono text-on-surface">{formatNumber(selectedEntry.node.cost)}</dd>
                <dt className="text-on-surface-variant">Active metric</dt><dd className="text-right font-mono text-primary">{formatNumber(getMetricValue(selectedEntry.node, metric))}</dd>
                <dt className="text-on-surface-variant">CPU cost</dt><dd className="text-right font-mono text-on-surface">{formatNumber(selectedEntry.node.cpuCost)}</dd>
                <dt className="text-on-surface-variant">Estimated rows</dt><dd className="text-right font-mono text-on-surface">{formatNumber(selectedEntry.estimatedRows)}</dd>
                <dt className="text-on-surface-variant">Actual rows</dt><dd className="text-right font-mono text-on-surface">{formatNumber(selectedEntry.actualRows)}</dd>
                <dt className="text-on-surface-variant">Estimate ratio</dt><dd className={`text-right font-mono ${isLargeMisestimate(selectedEntry) ? 'text-tertiary' : 'text-on-surface'}`}>{formatRatio(selectedEntry.misestimateRatio)}</dd>
                <dt className="text-on-surface-variant">Elapsed</dt><dd className="text-right font-mono text-on-surface">{selectedEntry.node.elapsedTimeMs === undefined ? 'N/A' : `${formatNumber(selectedEntry.node.elapsedTimeMs)} ms`}</dd>
                <dt className="text-on-surface-variant">Buffers</dt><dd className="text-right font-mono text-on-surface">{formatNumber(selectedEntry.node.buffers)}</dd>
                <dt className="text-on-surface-variant">Starts</dt><dd className="text-right font-mono text-on-surface">{formatNumber(selectedEntry.node.starts)}</dd>
              </dl>
              {selectedEntry.node.filterPredicates && (
                <div>
                  <div className="text-xs font-medium uppercase text-on-surface-variant">Predicate</div>
                  <pre className="mt-1 whitespace-pre-wrap break-words bg-surface-container p-2 font-mono text-xs text-on-surface">{selectedEntry.node.filterPredicates}</pre>
                </div>
              )}
              {detailsRecommendations.length > 0 && (
                <div className="border-l-2 border-primary pl-3">
                  <div className="text-xs font-medium uppercase text-on-surface-variant">Recommendations</div>
                  <ul className="mt-2 space-y-2 text-on-surface">
                    {detailsRecommendations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {sidePanel === 'bottlenecks' && (
            <div className="divide-y divide-outline-variant">
              {bottlenecks.map((entry, index) => (
                <button key={entry.id} type="button" onClick={() => focusNode(entry.id)} className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto] gap-2 p-3 text-left hover:bg-surface-container">
                  <span className="font-mono text-xs text-on-surface-variant">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs font-semibold text-on-surface">{entry.label}</span>
                    <span className="mt-1 block text-xs text-on-surface-variant">Rows {formatNumber(entry.estimatedRows)}{entry.actualRows !== undefined ? ` -> ${formatNumber(entry.actualRows)}` : ''}</span>
                  </span>
                  <span className="font-mono text-xs font-semibold text-tertiary">{formatNumber(getMetricValue(entry.node, metric))}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
