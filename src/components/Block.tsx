// components/Block.tsx - Fix port spacing and click handling

'use client'

import { useState, useRef, useEffect } from 'react'

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

export default function Block({ 
  block, 
  isSelected = false,
  onMove,
  onSelect,
  onDoubleClick,
  onPortClick
}: BlockProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const blockRef = useRef<HTMLDivElement>(null)

  // Determine number of ports based on block type
  const getPortCounts = () => {
    switch (block.type) {
      case 'sum':
      case 'multiply':
        return { inputs: 2, outputs: 1 }
      case 'scale':
      case 'transfer_function':  // Transfer function should have 1 input and 1 output
        return { inputs: 1, outputs: 1 }
      case 'signal_display':
      case 'signal_logger':
      case 'output_port':
        return { inputs: 1, outputs: 0 }
      case 'lookup_1d':
        return { inputs: 1, outputs: 1 }
      case 'lookup_2d':
        return { inputs: 2, outputs: 1 }
      case 'input_port':
      case 'source':
        return { inputs: 0, outputs: 1 }
      case 'subsystem':
        const inputPorts = block.parameters?.inputPorts || ['Input1']
        const outputPorts = block.parameters?.outputPorts || ['Output1']
        return { inputs: inputPorts.length, outputs: outputPorts.length }
      default:
        return { inputs: 1, outputs: 1 }
    }
  }

  const { inputs: inputCount, outputs: outputCount } = getPortCounts()

  // Increased port spacing for better visibility
  const PORT_SPACING = 20 // Increased from 12 to 20
  const BLOCK_HEIGHT = 16 // Height in tailwind h-16 = 64px
  const BLOCK_HEIGHT_PX = 64

  // Calculate port positions to center them vertically
  const calculatePortPosition = (index: number, count: number): number => {
    if (count === 1) {
      return BLOCK_HEIGHT_PX / 2 - 6 // Center single port (6px is half port size)
    }
    const totalSpacing = (count - 1) * PORT_SPACING
    const startY = (BLOCK_HEIGHT_PX - totalSpacing) / 2
    return startY + index * PORT_SPACING - 6
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // Check if the target is a port by looking at the element and its parents
    let element = e.target as HTMLElement
    while (element && element !== e.currentTarget) {
      if (element.classList.contains('port')) {
        // Don't start dragging if clicking on a port
        return
      }
      element = element.parentElement as HTMLElement
    }

    e.preventDefault()
    e.stopPropagation()

    // Store the offset from the mouse to the block's top-left corner
    // We'll use the block's actual position and the mouse position in canvas coordinates
    const blockElement = e.currentTarget as HTMLElement
    const rect = blockElement.getBoundingClientRect()
    
    // Get the canvas container
    const canvas = blockElement.closest('[style*="transform"]')
    if (!canvas) return
    
    const canvasRect = canvas.getBoundingClientRect()
    
    // Get the transform scale
    const transform = window.getComputedStyle(canvas).transform
    let scale = 1
    
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrix(transform)
      scale = matrix.a
    }
    
    // Calculate mouse position in canvas coordinates
    const mouseInCanvas = {
      x: (e.clientX - canvasRect.left) / scale,
      y: (e.clientY - canvasRect.top) / scale
    }
    
    // The offset is the difference between mouse position and block position
    const offsetX = mouseInCanvas.x - block.position.x
    const offsetY = mouseInCanvas.y - block.position.y

    setDragOffset({ x: offsetX, y: offsetY })
    setIsDragging(true)
    
    if (onSelect) {
      onSelect(block.id)
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!blockRef.current) return

      // Get the canvas container (the one with transform)
      const canvas = blockRef.current.closest('[style*="transform"]')
      if (!canvas) return
      
      const canvasRect = canvas.getBoundingClientRect()
      
      // Get the transform scale
      const transform = window.getComputedStyle(canvas).transform
      let scale = 1
      
      if (transform && transform !== 'none') {
        const matrix = new DOMMatrix(transform)
        scale = matrix.a
      }
      
      // Calculate mouse position in canvas coordinates
      const mouseInCanvas = {
        x: (e.clientX - canvasRect.left) / scale,
        y: (e.clientY - canvasRect.top) / scale
      }
      
      // New position is mouse position minus the original offset
      const newX = mouseInCanvas.x - dragOffset.x
      const newY = mouseInCanvas.y - dragOffset.y

      if (onMove) {
        onMove(block.id, { x: newX, y: newY })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, block.id, onMove])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onDoubleClick) {
      onDoubleClick(block.id)
    }
  }

  const handlePortClick = (portInfo: PortInfo) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Port clicked:', portInfo)
    if (onPortClick) {
      onPortClick(portInfo)
    }
  }

  // Get block color based on type
  const getBlockColor = () => {
    switch (block.type) {
      case 'sum':
      case 'multiply':
      case 'scale':
        return 'bg-blue-100 border-blue-300'
      case 'transfer_function':
        return 'bg-purple-100 border-purple-300'
      case 'signal_display':
      case 'signal_logger':
        return 'bg-green-100 border-green-300'
      case 'input_port':
      case 'output_port':
        return 'bg-gray-100 border-gray-300'
      case 'source':
        return 'bg-yellow-100 border-yellow-300'
      case 'lookup_1d':
      case 'lookup_2d':
        return 'bg-orange-100 border-orange-300'
      case 'subsystem':
        return 'bg-indigo-100 border-indigo-300'
      default:
        return 'bg-white border-gray-300'
    }
  }

  // Get block symbol
  const getBlockSymbol = () => {
    switch (block.type) {
      case 'sum':
        return '∑'
      case 'multiply':
        return '×'
      case 'scale':
        return block.parameters?.gain || 'K'
      case 'transfer_function':
        return 'H(s)'
      case 'signal_display':
        return '📊'
      case 'signal_logger':
        return '📝'
      case 'input_port':
        return '▶'
      case 'output_port':
        return '▶'
      case 'source':
        return '~'
      case 'lookup_1d':
        return '1D'
      case 'lookup_2d':
        return '2D'
      case 'subsystem':
        return '□'
      default:
        return '?'
    }
  }

  // Adjust block height based on number of ports
  const minHeight = Math.max(64, Math.max(inputCount, outputCount) * PORT_SPACING + 20)

  return (
    <div
      ref={blockRef}
      className={`absolute cursor-move select-none ${isDragging ? 'z-50' : 'z-10'}`}
      style={{ 
        left: `${block.position.x}px`, 
        top: `${block.position.y}px`,
        touchAction: 'none' // Prevent touch scrolling when dragging
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div 
        className={`
          relative w-20 rounded-lg border-2 flex items-center justify-center
          ${getBlockColor()}
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
          ${isDragging ? 'opacity-75' : ''}
          transition-shadow
        `}
        style={{ height: `${minHeight}px` }}
      >
        {/* Input Ports */}
        {Array.from({ length: inputCount }).map((_, index) => (
          <div
            key={`input-${index}`}
            className="port absolute w-3 h-3 bg-gray-600 rounded-full cursor-crosshair hover:bg-blue-500 hover:ring-2 hover:ring-blue-300 transition-all"
            style={{ 
              left: '-6px', 
              top: `${calculatePortPosition(index, inputCount)}px` 
            }}
            onClick={handlePortClick({ blockId: block.id, portIndex: index, isOutput: false })}
            onMouseDown={(e) => e.stopPropagation()} // Prevent block drag when clicking port
            title={`Input ${index + 1}`}
          />
        ))}

        {/* Block Symbol */}
        <div className="text-lg font-semibold pointer-events-none">
          {getBlockSymbol()}
        </div>

        {/* Output Ports */}
        {Array.from({ length: outputCount }).map((_, index) => (
          <div
            key={`output-${index}`}
            className="port absolute w-3 h-3 bg-gray-600 rounded-full cursor-crosshair hover:bg-blue-500 hover:ring-2 hover:ring-blue-300 transition-all"
            style={{ 
              right: '-6px', 
              top: `${calculatePortPosition(index, outputCount)}px` 
            }}
            onClick={handlePortClick({ blockId: block.id, portIndex: index, isOutput: true })}
            onMouseDown={(e) => e.stopPropagation()} // Prevent block drag when clicking port
            title={`Output ${index + 1}`}
          />
        ))}
      </div>

      {/* Block Name */}
      <div className="absolute -bottom-5 left-0 right-0 text-xs text-center text-gray-600 pointer-events-none">
        {block.name}
      </div>
    </div>
  )
}