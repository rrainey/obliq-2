// components/CustomEdge.tsx - Custom edge components for ReactFlow with enhanced matrix display

'use client'

import { FC, useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  MarkerType,
  getStraightPath,
  useStore,
} from 'reactflow'
import { TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'

// Wire routing type (matches modelSchema)
export interface WireRouting {
  midpointOffset?: number
  waypoints?: { x: number; y: number }[]
}

// Custom edge data structure
export interface CustomEdgeData {
  typeError?: TypeCompatibilityError | null
  sourceType?: string
  targetType?: string
  signalName?: string
  isEnableConnection?: boolean
  isResetConnection?: boolean
  // Custom routing data
  routing?: WireRouting
  // Callback for routing changes
  onRoutingChange?: (wireId: string, routing: WireRouting | undefined) => void
  // Net highlighting - true if this wire is part of the highlighted net
  isHighlighted?: boolean
}

// Helper to extract matrix dimensions from type string
const extractMatrixDimensions = (typeStr?: string): { rows: number; cols: number } | null => {
  if (!typeStr) return null
  const match = typeStr.match(/\[(\d+)\]\[(\d+)\]$/)
  if (match) {
    return { rows: parseInt(match[1]), cols: parseInt(match[2]) }
  }
  return null
}

// Helper to format type for display
const formatTypeForDisplay = (typeStr?: string): string => {
  if (!typeStr) return ''
  
  // Check for matrix type
  const matrixDims = extractMatrixDimensions(typeStr)
  if (matrixDims) {
    const baseType = typeStr.replace(/\[\d+\]\[\d+\]$/, '')
    return `${baseType}[${matrixDims.rows}×${matrixDims.cols}]`
  }
  
  // Check for 1D array
  const arrayMatch = typeStr.match(/^(\w+)\[(\d+)\]$/)
  if (arrayMatch) {
    return `${arrayMatch[1]}[${arrayMatch[2]}]`
  }
  
  return typeStr
}

// Default edge with enhanced visualization
export const DefaultEdge: FC<EdgeProps<CustomEdgeData>> = (props) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
    markerEnd,
    selected,
  } = props
  
  const [isHovered, setIsHovered] = useState(false)
  
  // Check if this is an enable or reset connection
  // ReactFlow passes the edge object which contains targetHandle
  const edge = (props as any)
  const isEnableConnection = edge.targetHandle === '_enable_' || data?.isEnableConnection === true
  const isResetConnection = edge.targetHandle === '_reset_' || data?.isResetConnection === true
  
  let edgePath: string
  let labelX: number
  let labelY: number
  
  if (isEnableConnection || isResetConnection) {
    // Custom path for enable/reset connections - drop vertically to the top/bottom port
    const midY = sourceY + (targetY - sourceY) * 0.7
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${midY} L ${targetX} ${targetY}`
    labelX = targetX
    labelY = (sourceY + targetY) / 2
  } else {
    // Use default bezier path for regular connections
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
  }

  const hasError = !!data?.typeError
  const isMatrix = !!extractMatrixDimensions(data?.sourceType)

  // Dynamic styles based on state
  const edgeStyle = {
    ...style,
    stroke: hasError ? '#ef4444' : (selected ? '#3b82f6' : (isHovered ? '#6b7280' : (isResetConnection ? '#dc2626' : (isEnableConnection ? '#7c3aed' : '#374151')))),
    strokeWidth: selected || isHovered ? 3 : (isMatrix ? 3 : 2),
    strokeDasharray: hasError ? '5,5' : (isMatrix && !isHovered && !selected ? '10,3' : 'none'),
    transition: 'stroke 0.2s, stroke-width 0.2s',
  }

  // Custom marker based on state and connection type
  const customMarkerEnd = hasError ? 'url(#arrow-error)' :
                         isResetConnection ? 'url(#arrow-reset)' :
                         isEnableConnection ? 'url(#arrow-enable)' :
                         selected ? 'url(#arrow-selected)' :
                         isHovered ? 'url(#arrow-hover)' :
                         isMatrix ? 'url(#arrow-matrix)' :
                         'url(#arrow-default)'

  return (
    <>
      {/* Invisible wider path for easier selection */}
      <path
        id={`${id}-interaction`}
        style={{ fill: 'none', strokeWidth: 15, stroke: 'transparent', cursor: 'pointer' }}
        d={edgePath}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      
      {/* Visible edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd={customMarkerEnd}
      />

      {/* Type Label - Always visible for matrix types */}
      <EdgeLabelRenderer>
        {(isMatrix || isHovered || hasError) && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="flex items-center"
          >
            {/* Error indicator */}
            {hasError && (
              <div className="relative">
                <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75" />
                <div className="relative bg-red-500 rounded-full w-3 h-3 border-2 border-white shadow-sm" />
              </div>
            )}
            
            {/* Type label for matrix or on hover */}
            {!hasError && data?.sourceType && (isMatrix || isHovered) && (
              <div className={`
                ${isMatrix ? 'bg-purple-100 border-purple-300' : 'bg-white border-gray-200'}
                px-2 py-1 rounded shadow-md border text-xs font-mono
                ${isMatrix && !isHovered ? 'opacity-90' : ''}
              `}>
                <div className={`${isMatrix ? 'text-purple-700 font-medium' : 'text-gray-700'}`}>
                  {formatTypeForDisplay(data.sourceType)}
                </div>
                {data.signalName && (
                  <div className="text-gray-500 text-xs mt-0.5">{data.signalName}</div>
                )}
              </div>
            )}

            {/* Error tooltip on hover */}
            {isHovered && hasError && data.typeError && (
              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 z-50">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
                  <div className="font-medium text-red-400">{data.typeError.message}</div>
                  {data.typeError.details && (
                    <div className="mt-1 text-gray-300">
                      Expected: {formatTypeForDisplay(data.typeError.details.expectedType)} | 
                      Actual: {formatTypeForDisplay(data.typeError.details.actualType)}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900" />
                </div>
              </div>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

// Animated edge for active signals during simulation
// Animated edge for active signals during simulation
export const AnimatedEdge: FC<EdgeProps<CustomEdgeData & { signalValue?: number | number[] }>> = (props) => {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const [offset, setOffset] = useState(0)
  
  // Check if this is an enable or reset connection
  const isEnableConnection = (props as any).targetHandle === '_enable_' || data?.isEnableConnection === true
  const isResetConnection = (props as any).targetHandle === '_reset_' || data?.isResetConnection === true

  let edgePath: string
  if (isEnableConnection || isResetConnection) {
    // Custom path for enable/reset connections
    const midY = sourceY + (targetY - sourceY) * 0.7
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${midY} L ${targetX} ${targetY}`
  } else {
    [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })
  }

  // Animate the dash offset for flowing effect
  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % 20)
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const isActive = data?.signalValue !== undefined && data.signalValue !== 0

  return (
    <>
      <DefaultEdge {...props} />
      
      {/* Animated overlay for active signals */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={3}
          strokeDasharray="5,15"
          strokeDashoffset={offset}
          opacity={0.6}
          pointerEvents="none"
        />
      )}
    </>
  )
}

// Step edge for orthogonal routing
export const StepEdge: FC<EdgeProps<CustomEdgeData>> = (props) => {
  const { sourceX, sourceY, targetX, targetY, id, data, selected, style = {} } = props
  const [isHovered, setIsHovered] = useState(false)
  
  // Calculate step path
  const midX = sourceX + (targetX - sourceX) / 2
  const path = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`
  
  const hasError = !!data?.typeError
  const isMatrix = !!extractMatrixDimensions(data?.sourceType)

  const edgeStyle = {
    ...style,
    stroke: hasError ? '#ef4444' : (selected ? '#3b82f6' : (isHovered ? '#6b7280' : '#374151')),
    strokeWidth: selected || isHovered ? 3 : (isMatrix ? 3 : 2),
    strokeDasharray: hasError ? '5,5' : (isMatrix && !isHovered && !selected ? '10,3' : 'none'),
    transition: 'stroke 0.2s, stroke-width 0.2s',
  }

  // Custom marker based on state
  const customMarkerEnd = hasError ? 'url(#arrow-error)' : 
                         selected ? 'url(#arrow-selected)' : 
                         isHovered ? 'url(#arrow-hover)' : 
                         isMatrix ? 'url(#arrow-matrix)' :
                         'url(#arrow-default)'

  return (
    <>
      <path
        id={`${id}-interaction`}
        style={{ fill: 'none', strokeWidth: 15, stroke: 'transparent', cursor: 'pointer' }}
        d={path}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      
      <path
        id={id}
        d={path}
        fill="none"
        style={edgeStyle}
        markerEnd={customMarkerEnd}
      />
      
      {/* Type label for matrix types */}
      <EdgeLabelRenderer>
        {(isMatrix || isHovered) && data?.sourceType && !hasError && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px,${(sourceY + targetY) / 2}px)`,
            }}
            className={`
              ${isMatrix ? 'bg-purple-100 border-purple-300' : 'bg-white border-gray-200'}
              px-2 py-1 rounded shadow-md border text-xs font-mono
            `}
          >
            <div className={`${isMatrix ? 'text-purple-700 font-medium' : 'text-gray-700'}`}>
              {formatTypeForDisplay(data.sourceType)}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

// Smart edge that avoids overlapping with nodes
export const SmartEdge: FC<EdgeProps<CustomEdgeData>> = (props) => {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props

  // Simple implementation - can be enhanced with actual pathfinding
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.75, // Increase curvature for better avoidance
  })

  return <DefaultEdge {...props} />
}

// Path segment for editable step edge
interface PathSegment {
  index: number
  start: { x: number; y: number }
  end: { x: number; y: number }
  orientation: 'horizontal' | 'vertical'
  path: string
}

// Calculate default midpoint X for step edge
const calculateDefaultMidpointX = (sourceX: number, targetX: number): number => {
  return sourceX + (targetX - sourceX) / 2
}

// Generate path segments for step edge with optional routing
const generatePathSegments = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  routing?: WireRouting
): PathSegment[] => {
  // If we have explicit waypoints, use them
  if (routing?.waypoints && routing.waypoints.length > 0) {
    const segments: PathSegment[] = []
    const allPoints = [
      { x: sourceX, y: sourceY },
      ...routing.waypoints,
      { x: targetX, y: targetY }
    ]

    for (let i = 0; i < allPoints.length - 1; i++) {
      const start = allPoints[i]
      const end = allPoints[i + 1]
      const orientation = Math.abs(end.y - start.y) < 1 ? 'horizontal' : 'vertical'
      segments.push({
        index: i,
        start,
        end,
        orientation,
        path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`
      })
    }
    return segments
  }

  // Standard 3-segment step path with optional midpoint offset
  const defaultMidX = calculateDefaultMidpointX(sourceX, targetX)
  const midX = defaultMidX + (routing?.midpointOffset ?? 0)

  return [
    {
      index: 0,
      start: { x: sourceX, y: sourceY },
      end: { x: midX, y: sourceY },
      orientation: 'horizontal',
      path: `M ${sourceX} ${sourceY} L ${midX} ${sourceY}`
    },
    {
      index: 1,
      start: { x: midX, y: sourceY },
      end: { x: midX, y: targetY },
      orientation: 'vertical',
      path: `M ${midX} ${sourceY} L ${midX} ${targetY}`
    },
    {
      index: 2,
      start: { x: midX, y: targetY },
      end: { x: targetX, y: targetY },
      orientation: 'horizontal',
      path: `M ${midX} ${targetY} L ${targetX} ${targetY}`
    }
  ]
}

// Generate full SVG path string from segments
const segmentsToPath = (segments: PathSegment[]): string => {
  if (segments.length === 0) return ''
  let path = `M ${segments[0].start.x} ${segments[0].start.y}`
  for (const segment of segments) {
    path += ` L ${segment.end.x} ${segment.end.y}`
  }
  return path
}

// Editable step edge with segment dragging support
export const EditableStepEdge: FC<EdgeProps<CustomEdgeData>> = (props) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    selected,
  } = props

  // Get viewport zoom to correctly scale mouse movement
  const zoom = useStore((state) => state.transform[2])

  const [isHovered, setIsHovered] = useState(false)
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [currentOffset, setCurrentOffset] = useState<number>(0)

  // Use refs for values that change during drag to avoid effect re-runs
  const dragStateRef = useRef<{
    segmentIndex: number | null
    startPos: { x: number; y: number } | null
    startZoom: number
    baseOffset: number
  }>({
    segmentIndex: null,
    startPos: null,
    startZoom: 1,
    baseOffset: 0,
  })

  // Track current offset in a ref for use in handleMouseUp without state callback
  const currentOffsetRef = useRef<number>(0)

  // Ref to track hover clear timeout - prevents losing hover when moving to drag handle
  const hoverClearTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clear any pending hover timeout
  const clearHoverTimeout = useCallback(() => {
    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current)
      hoverClearTimeoutRef.current = null
    }
  }, [])

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverClearTimeoutRef.current) {
        clearTimeout(hoverClearTimeoutRef.current)
      }
    }
  }, [])

  // Memoize segments to avoid recalculating on every render
  const segments = useMemo(() => {
    const effectiveOffset = isDragging ? currentOffset : (data?.routing?.midpointOffset ?? 0)
    return generatePathSegments(
      sourceX,
      sourceY,
      targetX,
      targetY,
      { ...data?.routing, midpointOffset: effectiveOffset }
    )
  }, [sourceX, sourceY, targetX, targetY, data?.routing, isDragging, currentOffset])

  const fullPath = segmentsToPath(segments)
  const hasError = !!data?.typeError
  const isMatrix = !!extractMatrixDimensions(data?.sourceType)
  const isHighlighted = !!data?.isHighlighted

  // Determine which segment can be dragged (middle vertical segment for simple step)
  const canDragSegment = useCallback((segmentIndex: number): boolean => {
    // For simple 3-segment step path, only the middle vertical segment is draggable
    if (!data?.routing?.waypoints && segments.length === 3) {
      return segmentIndex === 1 // Middle vertical segment
    }
    // For waypoint-based paths, any segment could potentially be draggable
    // (future enhancement)
    return false
  }, [data?.routing?.waypoints, segments.length])

  // Handle left-click on drag handle to start drag
  const handleDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to left mouse button
    if (e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    // Clear any pending hover timeout to prevent state changes during drag
    clearHoverTimeout()

    // Store drag state in ref
    const initialOffset = data?.routing?.midpointOffset ?? 0
    dragStateRef.current = {
      segmentIndex: 1, // Always the middle segment for now
      startPos: { x: e.clientX, y: e.clientY },
      startZoom: zoom,
      baseOffset: initialOffset,
    }

    // Initialize both state and ref
    currentOffsetRef.current = initialOffset
    setCurrentOffset(initialOffset)
    setIsDragging(true)
  }, [zoom, data?.routing?.midpointOffset, clearHoverTimeout])

  // Handle mouse move during drag - use effect that only depends on isDragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const { segmentIndex, startPos, startZoom, baseOffset } = dragStateRef.current
      if (segmentIndex === null || !startPos) return

      // For vertical segments, drag horizontally
      // Divide by zoom to convert screen pixels to canvas coordinates
      const delta = (e.clientX - startPos.x) / startZoom

      // Update the offset (both state and ref)
      const newOffset = baseOffset + delta
      currentOffsetRef.current = newOffset
      setCurrentOffset(newOffset)
    }

    const handleMouseUp = () => {
      // Read the final offset from the ref (avoids setState callback during render)
      const finalOffset = currentOffsetRef.current

      // Commit the routing change
      if (data?.onRoutingChange) {
        const newRouting: WireRouting = {
          ...data?.routing,
          midpointOffset: finalOffset,
        }
        data.onRoutingChange(id, newRouting)
      }

      // Reset drag state
      dragStateRef.current = {
        segmentIndex: null,
        startPos: null,
        startZoom: 1,
        baseOffset: 0,
      }
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, data, id])

  // Dynamic styles based on state
  const getSegmentStyle = (segmentIndex: number) => {
    const isDragTarget = canDragSegment(segmentIndex)
    const dragSegmentIndex = dragStateRef.current.segmentIndex
    const isSegmentHovered = hoveredSegmentIndex === segmentIndex
    const isBeingDragged = isDragging && dragSegmentIndex === segmentIndex

    // Determine stroke color with highlighting priority
    let strokeColor = '#374151' // default gray
    if (hasError) {
      strokeColor = '#ef4444' // red for errors
    } else if (isHighlighted) {
      strokeColor = '#d946ef' // magenta for highlighted nets
    } else if (isBeingDragged) {
      strokeColor = '#2563eb' // blue when dragging
    } else if (selected || isSegmentHovered) {
      strokeColor = '#3b82f6' // blue when selected/hovered
    } else if (isHovered) {
      strokeColor = '#6b7280' // gray on hover
    }

    return {
      stroke: strokeColor,
      strokeWidth: (selected || isSegmentHovered || isBeingDragged || isHighlighted) ? 3 : (isMatrix ? 3 : 2),
      strokeDasharray: hasError ? '5,5' : (isMatrix && !isHovered && !selected ? '10,3' : 'none'),
      cursor: isDragTarget ? (isBeingDragged ? 'grabbing' : 'ew-resize') : 'pointer',
      transition: isBeingDragged ? 'none' : 'stroke 0.2s, stroke-width 0.2s',
    }
  }

  // Custom marker based on state
  const customMarkerEnd = hasError ? 'url(#arrow-error)' :
                         isHighlighted ? 'url(#arrow-highlighted)' :
                         selected ? 'url(#arrow-selected)' :
                         isHovered ? 'url(#arrow-hover)' :
                         isMatrix ? 'url(#arrow-matrix)' :
                         'url(#arrow-default)'

  // Calculate label position (midpoint of path)
  const labelX = (sourceX + targetX) / 2
  const labelY = (sourceY + targetY) / 2

  return (
    <>
      {/* Invisible wider path for easier selection */}
      <path
        id={`${id}-interaction`}
        style={{ fill: 'none', strokeWidth: 20, stroke: 'transparent', cursor: 'pointer' }}
        d={fullPath}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          // Don't clear hover state during drag - mouse may leave segment while dragging
          if (!isDragging) {
            setIsHovered(false)
            setHoveredSegmentIndex(null)
          }
        }}
      />

      {/* Render each segment separately for individual interaction */}
      {segments.map((segment, index) => (
        <path
          key={`${id}-segment-${index}`}
          d={segment.path}
          fill="none"
          style={getSegmentStyle(index)}
          markerEnd={index === segments.length - 1 ? customMarkerEnd : undefined}
          onMouseEnter={() => {
            clearHoverTimeout()
            setIsHovered(true)
            if (canDragSegment(index)) {
              setHoveredSegmentIndex(index)
            }
          }}
          onMouseLeave={() => {
            // Don't clear hover state during drag - mouse may leave segment while dragging
            if (!isDragging && hoveredSegmentIndex === index) {
              // Use a small delay to allow mouse to reach the drag handle
              // before clearing the hover state
              clearHoverTimeout()
              hoverClearTimeoutRef.current = setTimeout(() => {
                setHoveredSegmentIndex(null)
              }, 150)
            }
          }}
        />
      ))}

      {/* Draggable handle for middle segment */}
      {hoveredSegmentIndex !== null && canDragSegment(hoveredSegmentIndex) && !isDragging && (
        <g>
          {/* Drag handle at segment midpoint - LEFT CLICK to drag */}
          {(() => {
            const segment = segments[hoveredSegmentIndex]
            const midX = (segment.start.x + segment.end.x) / 2
            const midY = (segment.start.y + segment.end.y) / 2
            return (
              <>
                {/* Larger invisible hit area for easier grabbing */}
                <circle
                  cx={midX}
                  cy={midY}
                  r={12}
                  fill="transparent"
                  style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
                  onMouseEnter={clearHoverTimeout}
                  onMouseDown={handleDragHandleMouseDown}
                />
                {/* Visible handle */}
                <circle
                  cx={midX}
                  cy={midY}
                  r={6}
                  fill="#3b82f6"
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: 'ew-resize', pointerEvents: 'none' }}
                />
                {/* Arrows indicating drag direction */}
                <path
                  d={`M ${midX - 10} ${midY} L ${midX - 6} ${midY - 3} L ${midX - 6} ${midY + 3} Z`}
                  fill="#3b82f6"
                  style={{ pointerEvents: 'none' }}
                />
                <path
                  d={`M ${midX + 10} ${midY} L ${midX + 6} ${midY - 3} L ${midX + 6} ${midY + 3} Z`}
                  fill="#3b82f6"
                  style={{ pointerEvents: 'none' }}
                />
              </>
            )
          })()}
        </g>
      )}

      {/* Type label for matrix types */}
      <EdgeLabelRenderer>
        {(isMatrix || isHovered) && data?.sourceType && !hasError && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            className={`
              ${isMatrix ? 'bg-purple-100 border-purple-300' : 'bg-white border-gray-200'}
              px-2 py-1 rounded shadow-md border text-xs font-mono
            `}
          >
            <div className={`${isMatrix ? 'text-purple-700 font-medium' : 'text-gray-700'}`}>
              {formatTypeForDisplay(data.sourceType)}
            </div>
          </div>
        )}

        {/* Drag instruction tooltip */}
        {hoveredSegmentIndex !== null && canDragSegment(hoveredSegmentIndex) && !isDragging && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${
                (segments[hoveredSegmentIndex].start.x + segments[hoveredSegmentIndex].end.x) / 2
              }px,${
                Math.min(segments[hoveredSegmentIndex].start.y, segments[hoveredSegmentIndex].end.y) - 10
              }px)`,
              pointerEvents: 'none',
            }}
            className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap"
          >
            Drag to move
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

// Export edge types configuration
export const edgeTypes = {
  default: DefaultEdge,
  animated: AnimatedEdge,
  step: StepEdge,
  smart: SmartEdge,
  editableStep: EditableStepEdge,
} as const

// Helper function to create edge with custom data
export const createCustomEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  data?: CustomEdgeData
) => {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'default',
    data: data || {},
  }
}

// Helper function to update edge data
export const updateEdgeData = (
  edges: any[],
  edgeId: string,
  newData: Partial<CustomEdgeData>
) => {
  return edges.map(edge => 
    edge.id === edgeId 
      ? { ...edge, data: { ...edge.data, ...newData } }
      : edge
  )
}

// Marker definitions component
export function CustomEdgeWrapper() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker
          id="arrow-default"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#374151" />
        </marker>
        <marker
          id="arrow-matrix"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#7c3aed" />
        </marker>
        <marker
          id="arrow-selected"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#3b82f6" />
        </marker>
        <marker
          id="arrow-error"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#ef4444" />
        </marker>
        <marker
          id="arrow-hover"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#6b7280" />
        </marker>
        <marker
          id="arrow-enable"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#7c3aed" />
        </marker>
        <marker
          id="arrow-reset"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#dc2626" />
        </marker>
        <marker
          id="arrow-highlighted"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 5 L 20 10 L 0 15 Z" fill="#d946ef" />
        </marker>
      </defs>
    </svg>
  )
}