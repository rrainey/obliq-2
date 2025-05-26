'use client'

import { useState, useRef } from 'react'

export interface BlockData {
  id: string
  type: string
  name: string
  position: { x: number; y: number }
  parameters?: Record<string, any>
}

export interface PortInfo {
  blockId: string
  portIndex: number
  isOutput: boolean
}

interface BlockProps {
  block: BlockData
  isSelected?: boolean
  onMove?: (id: string, position: { x: number; y: number }) => void
  onSelect?: (id: string) => void
  onDoubleClick?: (id: string) => void
  onPortClick?: (portInfo: PortInfo) => void
}

const blockIcons: Record<string, string> = {
  sum: '∑',
  multiply: '×',
  scale: 'K',
  transfer_function: 'H(s)',
  input_port: '→',
  output_port: '⇥',
  source: '◦',
  signal_display: '📊',
  signal_logger: '📝',
  lookup_1d: '1D',
  lookup_2d: '2D',
  subsystem: '📦',
}

const blockColors: Record<string, { bg: string; border: string; text: string }> = {
  sum: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-700' },
  multiply: { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700' },
  scale: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-700' },
  transfer_function: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700' },
  input_port: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-700' },
  output_port: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-700' },
  source: { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-700' },
  signal_display: { bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-700' },
  signal_logger: { bg: 'bg-teal-100', border: 'border-teal-300', text: 'text-teal-700' },
  lookup_1d: { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-700' },
  lookup_2d: { bg: 'bg-lime-100', border: 'border-lime-300', text: 'text-lime-700' },
  subsystem: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' },
}

export default function Block({ 
  block, 
  isSelected = false, 
  onMove, 
  onSelect, 
  onDoubleClick,
  onPortClick
}: BlockProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [startPosition, setStartPosition] = useState({ x: 0, y: 0 })
  const blockRef = useRef<HTMLDivElement>(null)

  const colors = blockColors[block.type] || blockColors.sum
  const icon = blockIcons[block.type] || '?'

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (onSelect) {
      onSelect(block.id)
    }

    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setStartPosition(block.position)

    // Add global mouse listeners
    const handleMouseMove = (e: MouseEvent) => {
      if (onMove) {
        const deltaX = e.clientX - dragStart.x
        const deltaY = e.clientY - dragStart.y
        onMove(block.id, {
          x: startPosition.x + deltaX,
          y: startPosition.y + deltaY
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handlePortClick = (portIndex: number, isOutput: boolean) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onPortClick) {
      onPortClick({
        blockId: block.id,
        portIndex,
        isOutput
      })
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onDoubleClick) {
      onDoubleClick(block.id)
    }
  }

  return (
    <div
      ref={blockRef}
      className={`
        absolute select-none cursor-move
        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
        ${isDragging ? 'opacity-75' : ''}
      `}
      style={{
        transform: `translate(${block.position.x}px, ${block.position.y}px)`,
        zIndex: isSelected ? 10 : 1
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Block Body */}
      <div 
        className={`
          w-20 h-16 rounded-lg border-2 shadow-sm
          ${colors.bg} ${colors.border}
          flex flex-col items-center justify-center
          hover:shadow-md transition-shadow
        `}
      >
        {/* Icon */}
        <div className={`text-lg font-mono ${colors.text} mb-1`}>
          {icon}
        </div>
        
        {/* Block Name */}
        <div className={`text-xs font-medium ${colors.text} text-center px-1 truncate w-full`}>
          {block.name}
        </div>
      </div>

      {/* Input Ports (left side) */}
      <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1">
        {getInputPorts(block.type).map((_, index) => {
          const hasConnection = false // TODO: Check if port has connection
          return (
            <div
              key={`input-${index}`}
              className={`w-2 h-2 border rounded-full mb-1 cursor-pointer transition-colors ${
                hasConnection 
                  ? 'bg-blue-300 border-blue-500 hover:bg-blue-400' 
                  : 'bg-white border-gray-400 hover:bg-blue-200'
              }`}
              style={{ marginTop: index > 0 ? '4px' : '0' }}
              title={`Input ${index + 1}${hasConnection ? ' (connected)' : ''}`}
              onClick={handlePortClick(index, false)}
            />
          )
        })}
      </div>

      {/* Output Ports (right side) */}
      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1">
        {getOutputPorts(block.type).map((_, index) => (
          <div
            key={`output-${index}`}
            className="w-2 h-2 bg-white border border-gray-400 rounded-full mb-1 hover:bg-green-200 cursor-pointer transition-colors"
            style={{ marginTop: index > 0 ? '4px' : '0' }}
            title={`Output ${index + 1}`}
            onClick={handlePortClick(index, true)}
          />
        ))}
      </div>
    </div>
  )
}

// Helper functions to determine ports based on block type
function getInputPorts(blockType: string): string[] {
  switch (blockType) {
    case 'sum':
    case 'multiply':
      return ['input1', 'input2'] // Can be extended for more inputs
    case 'scale':
    case 'transfer_function':
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
      return ['input']
    case 'lookup_1d':
      return ['input']
    case 'lookup_2d':
      return ['input1', 'input2']
    case 'input_port':
    case 'source':
      return [] // No inputs
    case 'subsystem':
      return ['input'] // Can be configured
    default:
      return []
  }
}

function getOutputPorts(blockType: string): string[] {
  switch (blockType) {
    case 'sum':
    case 'multiply':
    case 'scale':
    case 'transfer_function':
    case 'input_port':
    case 'source':
    case 'lookup_1d':
    case 'lookup_2d':
      return ['output']
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
      return [] // No outputs
    case 'subsystem':
      return ['output'] // Can be configured
    default:
      return []
  }
}