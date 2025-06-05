// components/Wire.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'

export interface WireData {
  id: string
  sourceBlockId: string
  sourcePortIndex: number
  targetBlockId: string
  targetPortIndex: number
}

interface WireProps {
  wire: WireData
  sourcePosition: { x: number; y: number }
  targetPosition: { x: number; y: number }
  isSelected?: boolean
  typeError?: TypeCompatibilityError | null
  onSelect?: (wireId: string) => void
  onDelete?: (wireId: string) => void
}

export default function Wire({
  wire,
  sourcePosition,
  targetPosition,
  isSelected = false,
  typeError = null,
  onSelect,
  onDelete
}: WireProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const pathRef = useRef<SVGPathElement>(null)

  // Calculate the path for the wire using a cubic bezier curve
  const calculatePath = () => {
    const dx = targetPosition.x - sourcePosition.x
    const dy = targetPosition.y - sourcePosition.y
    
    // Control point offset for the bezier curve
    const controlOffset = Math.min(Math.abs(dx) * 0.5, 100)
    
    // Create a smooth curve
    const path = `
      M ${sourcePosition.x} ${sourcePosition.y}
      C ${sourcePosition.x + controlOffset} ${sourcePosition.y},
        ${targetPosition.x - controlOffset} ${targetPosition.y},
        ${targetPosition.x} ${targetPosition.y}
    `
    
    return path
  }

  // Handle mouse movement for tooltip positioning
  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>) => {
    if (typeError && pathRef.current) {
      const rect = pathRef.current.getBoundingClientRect()
      const svgRect = pathRef.current.ownerSVGElement?.getBoundingClientRect()
      
      if (svgRect) {
        setTooltipPosition({
          x: e.clientX - svgRect.left,
          y: e.clientY - svgRect.top - 10 // Offset above cursor
        })
      }
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(wire.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' && isSelected && onDelete) {
      onDelete(wire.id)
    }
  }

  // Determine wire color based on state
  const getWireColor = () => {
    if (typeError) {
      return '#ef4444' // Red for type errors
    }
    if (isSelected) {
      return '#3b82f6' // Blue for selected
    }
    if (isHovered) {
      return '#6b7280' // Gray for hover
    }
    return '#374151' // Dark gray default
  }

  // Get stroke properties based on state
  const getStrokeProps = () => {
    const color = getWireColor()
    const width = isSelected || isHovered ? 3 : 2
    const dashArray = typeError ? '5,5' : 'none' // Dashed line for errors
    
    return {
      stroke: color,
      strokeWidth: width,
      strokeDasharray: dashArray
    }
  }

  return (
    <g className="wire-group">
      {/* Invisible wider path for easier selection */}
      <path
        d={calculatePath()}
        fill="none"
        stroke="transparent"
        strokeWidth={10}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseMove={handleMouseMove}
        onKeyDown={handleKeyDown}
        tabIndex={isSelected ? 0 : -1}
      />
      
      {/* Visible wire path */}
      <path
        ref={pathRef}
        d={calculatePath()}
        fill="none"
        {...getStrokeProps()}
        style={{ 
          cursor: 'pointer',
          transition: 'stroke 0.2s, stroke-width 0.2s',
          pointerEvents: 'none'
        }}
      />
      
      {/* Error indicator dot at midpoint */}
      {typeError && (
        <circle
          cx={(sourcePosition.x + targetPosition.x) / 2}
          cy={(sourcePosition.y + targetPosition.y) / 2}
          r={6}
          fill="#ef4444"
          stroke="#ffffff"
          strokeWidth={2}
          style={{ cursor: 'pointer' }}
          onClick={handleClick}
        >
          <animate
            attributeName="r"
            values="6;8;6"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      
      {/* Tooltip for type error */}
      {typeError && isHovered && (
        <g
          transform={`translate(${tooltipPosition.x}, ${tooltipPosition.y})`}
          style={{ pointerEvents: 'none' }}
        >
          {/* Tooltip background */}
          <rect
            x={-150}
            y={-40}
            width={300}
            height={40}
            rx={4}
            fill="rgba(0, 0, 0, 0.9)"
            stroke="rgba(239, 68, 68, 0.5)"
            strokeWidth={1}
          />
          
          {/* Tooltip text */}
          <text
            x={0}
            y={-20}
            textAnchor="middle"
            fill="white"
            fontSize={12}
            fontFamily="sans-serif"
          >
            {typeError.message}
          </text>
          
          {/* Additional details if available */}
          {typeError.details && (
            <text
              x={0}
              y={-5}
              textAnchor="middle"
              fill="#fbbf24"
              fontSize={10}
              fontFamily="sans-serif"
            >
              {typeError.details.expectedType && typeError.details.actualType
                ? `Expected: ${typeError.details.expectedType}, Actual: ${typeError.details.actualType}`
                : ''}
            </text>
          )}
        </g>
      )}
    </g>
  )
}

// Helper component for rendering multiple wires
interface WireLayerProps {
  wires: WireData[]
  blockPositions: Map<string, { x: number; y: number }>
  selectedWireId?: string | null
  typeErrors?: Map<string, TypeCompatibilityError>
  onSelectWire?: (wireId: string) => void
  onDeleteWire?: (wireId: string) => void
}

export function WireLayer({
  wires,
  blockPositions,
  selectedWireId,
  typeErrors = new Map(),
  onSelectWire,
  onDeleteWire
}: WireLayerProps) {
  // Calculate port positions based on block positions
  const getPortPosition = (blockId: string, portIndex: number, isOutput: boolean) => {
    const blockPos = blockPositions.get(blockId)
    if (!blockPos) return { x: 0, y: 0 }
    
    // Block dimensions (matching Block.tsx)
    const blockWidth = 80 // w-20 in tailwind
    const blockHeight = 64 // h-16 in tailwind
    const portSpacing = 20
    
    // Calculate port position
    const x = isOutput ? blockPos.x + blockWidth : blockPos.x
    const y = blockPos.y + blockHeight / 2 + (portIndex * portSpacing)
    
    return { x, y }
  }
  
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <g className="wires">
        {wires.map(wire => {
          const sourcePos = getPortPosition(wire.sourceBlockId, wire.sourcePortIndex, true)
          const targetPos = getPortPosition(wire.targetBlockId, wire.targetPortIndex, false)
          const typeError = typeErrors.get(wire.id)
          
          return (
            <Wire
              key={wire.id}
              wire={wire}
              sourcePosition={sourcePos}
              targetPosition={targetPos}
              isSelected={wire.id === selectedWireId}
              typeError={typeError}
              onSelect={onSelectWire}
              onDelete={onDeleteWire}
            />
          )
        })}
      </g>
    </svg>
  )
}