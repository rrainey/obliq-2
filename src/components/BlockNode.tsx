// components/BlockNode.tsx - ReactFlow custom node implementation

'use client'

import { memo, CSSProperties } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { BlockData } from './Block'

// Define custom node data structure that extends BlockData
export interface BlockNodeData extends Omit<BlockData, 'position'> {
  // Additional data can be added here if needed
}

// Port spacing configuration
const PORT_SPACING = 20
const MIN_HEIGHT = 64

// Calculate port position helper
const calculatePortPosition = (index: number, count: number): number => {
  if (count === 1) {
    return MIN_HEIGHT / 2 // Center single port
  }
  const totalSpacing = (count - 1) * PORT_SPACING
  const startY = (MIN_HEIGHT - totalSpacing) / 2
  return startY + index * PORT_SPACING
}

// Get port counts based on block type
const getPortCounts = (blockType: string, parameters?: Record<string, any>) => {
  switch (blockType) {
    case 'sum':
    case 'multiply':
      return { inputs: 2, outputs: 1 }
    case 'scale':
    case 'transfer_function':
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
      const inputPorts = parameters?.inputPorts || ['Input1']
      const outputPorts = parameters?.outputPorts || ['Output1']
      return { inputs: inputPorts.length, outputs: outputPorts.length }
    case 'sheet_label_sink':
      return { inputs: 1, outputs: 0 }
    case 'sheet_label_source':
      return { inputs: 0, outputs: 1 }
    default:
      return { inputs: 1, outputs: 1 }
  }
}

// Get block symbol based on type
const getBlockSymbol = (data: BlockNodeData) => {
  // Handle transfer function special case
  if (data.type === 'transfer_function') {
    return renderTransferFunction(data.parameters)
  }

  // Handle source blocks with constant values
  if (data.type === 'source' && data.parameters?.value !== undefined) {
    const value = data.parameters.value
    return (
      <div className="text-sm font-mono px-1">
        {Array.isArray(value) ? `[${value.join(', ')}]` : String(value)}
      </div>
    )
  }

  // Handle sheet label blocks
  if (data.type === 'sheet_label_sink' || data.type === 'sheet_label_source') {
    const signalName = data.parameters?.signalName || ''
    if (signalName) {
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="text-lg font-bold">
            {data.type === 'sheet_label_sink' ? '↓' : '↑'}
          </div>
          <div className="text-xs text-gray-600 mt-0.5">
            {signalName.length > 8 ? signalName.substring(0, 8) + '...' : signalName}
          </div>
        </div>
      )
    }
  }

  // Regular symbols for other blocks
  const symbols: Record<string, string> = {
    'sum': '∑',
    'multiply': '×',
    'scale': data.parameters?.gain || 'K',
    'signal_display': '📊',
    'signal_logger': '📝',
    'input_port': '▶',
    'output_port': '▶',
    'source': '~',
    'lookup_1d': '1D',
    'lookup_2d': '2D',
    'subsystem': '□',
    'sheet_label_sink': '↓',
    'sheet_label_source': '↑',
  }

  return symbols[data.type] || '?'
}

// Helper to render transfer function polynomial
const renderTransferFunction = (parameters?: Record<string, any>) => {
  const numerator = parameters?.numerator || [1]
  const denominator = parameters?.denominator || [1, 1]
  
  const formatPolynomial = (coeffs: number[]) => {
    const terms: React.ReactNode[] = []
    const degree = coeffs.length - 1
    
    coeffs.forEach((coeff, index) => {
      if (coeff === 0) return
      
      const power = degree - index
      const isFirst = terms.length === 0
      const sign = coeff >= 0 && !isFirst ? '+' : ''
      const absCoeff = Math.abs(coeff)
      const coeffStr = (absCoeff === 1 && power > 0) ? '' : absCoeff.toString()
      
      if (power === 0) {
        terms.push(
          <span key={index}>
            {sign}{coeff < 0 && isFirst ? '-' : ''}{absCoeff}
          </span>
        )
      } else if (power === 1) {
        terms.push(
          <span key={index}>
            {sign}{coeff < 0 && isFirst ? '-' : ''}{coeffStr}s
          </span>
        )
      } else {
        terms.push(
          <span key={index}>
            {sign}{coeff < 0 && isFirst ? '-' : ''}{coeffStr}s<sup>{power}</sup>
          </span>
        )
      }
    })
    
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

// Calculate block width based on type and content
const getBlockWidth = (data: BlockNodeData): number => {
  if (data.type === 'transfer_function') {
    const numerator = data.parameters?.numerator || [1]
    const denominator = data.parameters?.denominator || [1, 1]
    const maxLength = Math.max(numerator.length, denominator.length)
    return Math.max(80, 60 + maxLength * 15)
  }

  if (data.type === 'source' && data.parameters?.value !== undefined) {
    const value = String(data.parameters.value)
    const estimatedWidth = value.length * 8 + 20
    return Math.max(80, Math.min(200, estimatedWidth))
  }

  if (data.type === 'sheet_label_sink' || data.type === 'sheet_label_source') {
    const signalName = data.parameters?.signalName || ''
    if (signalName.length > 5) {
      return Math.min(120, 80 + signalName.length * 4)
    }
  }
  
  return 80 // Default width
}

// Custom node component
const BlockNode = memo(({ data, selected }: NodeProps<BlockNodeData>) => {
  const { inputs: inputCount, outputs: outputCount } = getPortCounts(data.type, data.parameters)
  const blockWidth = getBlockWidth(data)
  const minHeight = Math.max(MIN_HEIGHT, Math.max(inputCount, outputCount) * PORT_SPACING + 20)

  // Handle styles for ReactFlow node
  const handleStyle: CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: '#374151',
    border: '2px solid #ffffff',
    cursor: 'crosshair',
  }

  const handleHoverStyle: CSSProperties = {
    backgroundColor: '#3b82f6',
    boxShadow: '0 0 0 2px #93bbfc',
  }

  return (
    <>
      {/* Block Name - positioned above the block */}
      <div
        className="absolute -top-3 left-0 right-0 text-center text-gray-800 font-medium pointer-events-none"
        style={{ width: blockWidth, fontSize: '0.5rem', lineHeight: '0.75rem' }}
      >
        {data.name}
        {/* Signal name indicator for sheet labels */}
        {(data.type === 'sheet_label_sink' || data.type === 'sheet_label_source') && 
        data.parameters?.signalName && (
          <div className="text-purple-600 mt-0.5" style={{ fontSize: '0.5rem' }}>
            "{data.parameters.signalName}"
          </div>
        )}
      </div>

      {/* Main block body */}
      <div
        className={`
          relative rounded-lg border-2 flex items-center justify-center
          bg-white border-gray-400
          ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
          transition-shadow
        `}
        style={{
          width: blockWidth,
          height: minHeight,
        }}
      >
        {/* Input Handles */}
        {Array.from({ length: inputCount }).map((_, index) => (
          <Handle
            key={`input-${index}`}
            type="target"
            position={Position.Left}
            id={`input-${index}`}
            style={{
              ...handleStyle,
              top: calculatePortPosition(index, inputCount),
              left: -6,
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, handleHoverStyle)
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, handleStyle)
            }}
          />
        ))}

        {/* Block Symbol */}
        <div className="text-xl font-bold text-gray-900 pointer-events-none">
          {getBlockSymbol(data)}
        </div>

        {/* Output Handles */}
        {Array.from({ length: outputCount }).map((_, index) => (
          <Handle
            key={`output-${index}`}
            type="source"
            position={Position.Right}
            id={`output-${index}`}
            style={{
              ...handleStyle,
              top: calculatePortPosition(index, outputCount),
              right: -6,
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, handleHoverStyle)
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, handleStyle)
            }}
          />
        ))}
      </div>
    </>
  )
})

BlockNode.displayName = 'BlockNode'

export default BlockNode

// Export node types configuration for ReactFlow
export const nodeTypes = {
  customBlock: BlockNode,
}

// Helper function to convert BlockData to ReactFlow node format
export const blockDataToNode = (block: BlockData) => {
  return {
    id: block.id,
    type: 'customBlock',
    position: block.position,
    data: {
      id: block.id,
      type: block.type,
      name: block.name,
      parameters: block.parameters,
    },
  }
}

// Helper function to convert WireData to ReactFlow edge format
export const wireDataToEdge = (wire: any) => {
  return {
    id: wire.id,
    source: wire.sourceBlockId,
    target: wire.targetBlockId,
    sourceHandle: `output-${wire.sourcePortIndex}`,
    targetHandle: `input-${wire.targetPortIndex}`,
    type: 'default',
  }
}