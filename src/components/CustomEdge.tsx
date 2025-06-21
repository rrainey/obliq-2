// components/CustomEdge.tsx - Custom edge components for ReactFlow with enhanced matrix display

'use client'

import { FC, useState, useRef, useEffect } from 'react'
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  MarkerType,
  getStraightPath,
} from 'reactflow'
import { TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'

// Custom edge data structure
export interface CustomEdgeData {
  typeError?: TypeCompatibilityError | null
  sourceType?: string
  targetType?: string
  signalName?: string
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
export const DefaultEdge: FC<EdgeProps<CustomEdgeData>> = ({
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
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const hasError = !!data?.typeError
  const isMatrix = !!extractMatrixDimensions(data?.sourceType)

  // Dynamic styles based on state
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
export const AnimatedEdge: FC<EdgeProps<CustomEdgeData & { signalValue?: number | number[] }>> = (props) => {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const [offset, setOffset] = useState(0)
  
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
  })

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

// Export edge types configuration
export const edgeTypes = {
  default: DefaultEdge,
  animated: AnimatedEdge,
  step: StepEdge,
  smart: SmartEdge,
}

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
      </defs>
    </svg>
  )
}