// components/Block.tsx - Fix port spacing and click handling

'use client'

import { useState, useRef, useEffect, JSX } from 'react'

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
      case 'sheet_label_sink':
        return { inputs: 1, outputs: 0 }  // Sink has 1 input, no outputs
      case 'sheet_label_source':
        return { inputs: 0, outputs: 1 }  // Source has no inputs, 1 output
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

  // Simple block coloring
  const getBlockColor = () => {
    return 'bg-white border-gray-400'
  }

  // Helper to render transfer function polynomial
  const renderTransferFunction = () => {
    if (block.type !== 'transfer_function') return null
    
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1, 1]
    
    // Helper to format a polynomial
    const formatPolynomial = (coeffs: number[]): JSX.Element => {
      const terms: JSX.Element[] = []
      const degree = coeffs.length - 1
      
      coeffs.forEach((coeff, index) => {
        if (coeff === 0) return // Skip zero terms
        
        const power = degree - index
        const isFirst = terms.length === 0
        const sign = coeff >= 0 && !isFirst ? '+' : ''
        const absCoeff = Math.abs(coeff)
        
        // Format coefficient (omit 1 for non-constant terms)
        const coeffStr = (absCoeff === 1 && power > 0) ? '' : absCoeff.toString()
        
        if (power === 0) {
          // Constant term
          terms.push(
            <span key={index}>
              {sign}{coeff < 0 && isFirst ? '-' : ''}{absCoeff}
            </span>
          )
        } else if (power === 1) {
          // Linear term
          terms.push(
            <span key={index}>
              {sign}{coeff < 0 && isFirst ? '-' : ''}{coeffStr}s
            </span>
          )
        } else {
          // Higher order terms with superscript
          terms.push(
            <span key={index}>
              {sign}{coeff < 0 && isFirst ? '-' : ''}{coeffStr}s<sup>{power}</sup>
            </span>
          )
        }
      })
      
      // Handle case where all coefficients are zero
      if (terms.length === 0) {
        return <span>0</span>
      }
      
      return <>{terms}</>
    }
    
    return (
      <div className="flex flex-col items-center justify-center text-xs">
        <div className="border-b border-gray-800 px-1 pb-0.5">
          {formatPolynomial(numerator)}
        </div>
        <div className="px-1 pt-0.5">
          {formatPolynomial(denominator)}
        </div>
      </div>
    )
  }

  // Get block symbol
  const getBlockSymbol = () => {
    // Special handling for transfer function
    if (block.type === 'transfer_function') {
      return renderTransferFunction()
    }

    if (block.type === 'source' && block.parameters?.value) {
      if (Array.isArray(block?.parameters?.value)) {
        return '[' + block.parameters?.value.join(', ') + ']';
      } else {
        return String(block?.parameters?.value || 0);
      }
    }

    // Special handling for sheet label blocks to show signal name
    if (block.type === 'sheet_label_sink' || block.type === 'sheet_label_source') {
      const signalName = block.parameters?.signalName || ''
      if (signalName) {
        // Show the signal name if available
        return (
          <div className="flex flex-col items-center justify-center">
            <div className="text-lg font-bold">
              {block.type === 'sheet_label_sink' ? '↓' : '↑'}
            </div>
            <div className="text-xs text-gray-600 mt-0.5">
              {signalName.length > 8 ? signalName.substring(0, 8) + '...' : signalName}
            </div>
          </div>
        )
      }
    }
    
    // Regular symbols for other blocks
    switch (block.type) {
      case 'sum':
        return '∑'
      case 'multiply':
        return '×'
      case 'scale':
        return block.parameters?.gain || 'K'
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
      case 'sheet_label_sink':
        return '↓'  // Down arrow indicating signal going "into" the label
      case 'sheet_label_source':
        return '↑'  // Up arrow indicating signal coming "from" the label
      default:
        return '?'
    }
  }

  const getBlockWidth = () => {
    if (block.type === 'transfer_function') {
      // Calculate width based on polynomial complexity
      const numerator = block.parameters?.numerator || [1]
      const denominator = block.parameters?.denominator || [1, 1]
      const maxLength = Math.max(numerator.length, denominator.length)
      
      // Base width of 80px (w-20) plus extra for complex polynomials
      return Math.max(80, 60 + maxLength * 15)
    }

    // Sheet labels might need more width for signal names
    if (block.type === 'sheet_label_sink' || block.type === 'sheet_label_source') {
      const signalName = block.parameters?.signalName || ''
      if (signalName.length > 5) {
        return Math.min(120, 80 + signalName.length * 4)
      }
    }

    if (block.type === 'source' && block.parameters?.value) {
      let v = '';
      if (Array.isArray(block?.parameters?.value)) {
        v = '[' + block.parameters?.value.join(', ') + ']';
      } else {
        v = String(block?.parameters?.value || 0);
      }
      if (v.length > 5) {
        return Math.min(120, 75 + v.length * 4)
      }
    }
    
    return 80 // Default width (w-20)
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
          relative rounded-lg border-2 flex items-center justify-center
          ${getBlockColor()}
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
          ${isDragging ? 'opacity-75' : ''}
          transition-shadow
        `}
        style={{ 
          height: `${minHeight}px`,
          width: `${getBlockWidth()}px`
        }}
      >
        {/* Input Ports */}
        {Array.from({ length: inputCount }).map((_, index) => (
          <div
            key={`input-${index}`}
            className="port absolute w-3 h-3 bg-gray-700 rounded-full cursor-crosshair hover:bg-blue-600 hover:ring-2 hover:ring-blue-400 transition-all"
            style={{ 
              left: '-6px', 
              top: `${calculatePortPosition(index, inputCount)}px` 
            }}
            onClick={handlePortClick({ blockId: block.id, portIndex: index, isOutput: false })}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Input ${index + 1}`}
          />
        ))}

        {/* Block Symbol - with increased contrast */}
        <div className="text-xl font-bold text-gray-900 pointer-events-none">
          {getBlockSymbol()}
        </div>

        {/* Output Ports */}
        {Array.from({ length: outputCount }).map((_, index) => (
          <div
            key={`output-${index}`}
            className="port absolute w-3 h-3 bg-gray-700 rounded-full cursor-crosshair hover:bg-blue-600 hover:ring-2 hover:ring-blue-400 transition-all"
            style={{ 
              right: '-6px', 
              top: `${calculatePortPosition(index, outputCount)}px` 
            }}
            onClick={handlePortClick({ blockId: block.id, portIndex: index, isOutput: true })}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Output ${index + 1}`}
          />
        ))}
      </div>

      {/* Block Name - with increased contrast */}
      <div className="absolute -bottom-5 left-0 right-0 text-xs text-center text-gray-800 font-medium pointer-events-none">
        {block.name}
        {/* Add signal name indicator for sheet labels */}
        {(block.type === 'sheet_label_sink' || block.type === 'sheet_label_source') && 
        block.parameters?.signalName && (
          <div className="text-xs text-purple-600 mt-0.5">
            "{block.parameters.signalName}"
          </div>
        )}
      </div>
    </div>
  )
}