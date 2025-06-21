// components/BlockNode.tsx - Simplified without custom context menu handling

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
const TERMINATOR_HEIGHT = 45 // Flatter height for terminator blocks

// Calculate port position helper
const calculatePortPosition = (index: number, count: number, blockHeight: number = MIN_HEIGHT): number => {
  if (count === 1) {
    return blockHeight / 2 // Center single port
  }
  const totalSpacing = (count - 1) * PORT_SPACING
  const startY = (blockHeight - totalSpacing) / 2
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
    case 'matrix_multiply':
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
    case 'matrix_multiply':
      return { inputs: 2, outputs: 1 }
    case 'mux':
      // Dynamic port count based on configured dimensions
      const rows = parameters?.rows || 2
      const cols = parameters?.cols || 2
      return { inputs: rows * cols, outputs: 1 }
    case 'demux':
      // Dynamic port count based on input signal dimensions
      // Default to 1 input, outputs determined at runtime
      const outputCount = parameters?.outputCount || 1
      return { inputs: 1, outputs: outputCount }
    default:
      return { inputs: 1, outputs: 1 }
  }
}

// Helper to render 1D lookup curve
const render1DLookupCurve = (parameters?: Record<string, any>) => {
  const inputValues = parameters?.inputValues || [0, 1, 2]
  const outputValues = parameters?.outputValues || [0, 1, 4]
  
  // Find min/max for scaling
  const xMin = Math.min(...inputValues)
  const xMax = Math.max(...inputValues)
  const yMin = Math.min(...outputValues)
  const yMax = Math.max(...outputValues)
  
  // Add padding
  const padding = 4
  const width = 60
  const height = 40
  const plotWidth = width - 2 * padding
  const plotHeight = height - 2 * padding
  
  // Scale values to SVG coordinates
  const xScale = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * plotWidth
  const yScale = (y: number) => padding + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight
  
  // Create path
  const pathPoints = inputValues.map((x: number, i: number) => {
    const y = outputValues[i] || 0
    return `${i === 0 ? 'M' : 'L'} ${xScale(x)} ${yScale(y)}`
  }).join(' ')
  
  return (
    <svg width={width} height={height} className="block">
      {/* Axes */}
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#9ca3af" strokeWidth="1" />
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#9ca3af" strokeWidth="1" />
      
      {/* Curve */}
      <path d={pathPoints} fill="none" stroke="#6b7280" strokeWidth="1.5" />
    </svg>
  )
}

// Helper to render 2D lookup curves
const render2DLookupCurves = (parameters?: Record<string, any>) => {
  const input1Values = parameters?.input1Values || [0, 1, 2]
  const input2Values = parameters?.input2Values || [0, 1]
  const outputTable = parameters?.outputTable || [[0, 1, 4], [1, 2, 5]]
  
  // Find min/max for scaling
  const xMin = Math.min(...input1Values)
  const xMax = Math.max(...input1Values)
  let yMin = Infinity
  let yMax = -Infinity
  outputTable.forEach((row: number[]) => {
    row.forEach(val => {
      yMin = Math.min(yMin, val)
      yMax = Math.max(yMax, val)
    })
  })
  
  // Add padding
  const padding = 4
  const width = 60
  const height = 40
  const plotWidth = width - 2 * padding
  const plotHeight = height - 2 * padding
  
  // Scale values to SVG coordinates
  const xScale = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * plotWidth
  const yScale = (y: number) => padding + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight
  
  // Create paths for each input2 value
  const paths = input2Values.map((input2Val: number, rowIdx: number) => {
    const row = outputTable[rowIdx] || []
    const pathPoints = input1Values.map((x: number, i: number) => {
      const y = row[i] || 0
      return `${i === 0 ? 'M' : 'L'} ${xScale(x)} ${yScale(y)}`
    }).join(' ')
    
    return <path key={rowIdx} d={pathPoints} fill="none" stroke="#6b7280" strokeWidth="1.5" opacity={0.7} />
  })
  
  return (
    <svg width={width} height={height} className="block">
      {/* Axes */}
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#9ca3af" strokeWidth="1" />
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#9ca3af" strokeWidth="1" />
      
      {/* Curves */}
      {paths}
    </svg>
  )
}

// Get block symbol based on type
const getBlockSymbol = (data: BlockNodeData) => {
  // Handle transfer function special case
  if (data.type === 'transfer_function') {
    return renderTransferFunction(data.parameters)
  }

  // Handle 1D lookup block
  if (data.type === 'lookup_1d') {
    return render1DLookupCurve(data.parameters)
  }

  // Handle 2D lookup block
  if (data.type === 'lookup_2d') {
    return render2DLookupCurves(data.parameters)
  }

  // Handle source blocks with constant values
  if (data.type === 'source' && data.parameters?.value !== undefined) {
    const value = data.parameters.value
    // Check if it's a matrix
    if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
      const rows = value.length
      const cols = value[0].length
      return (
        <div className="text-sm font-mono px-1">
          {rows}×{cols} matrix
        </div>
      )
    }
    // Regular array or scalar
    return (
      <div className="text-sm font-mono px-1">
        {Array.isArray(value) ? `[${value.join(', ')}]` : String(value)}
      </div>
    )
  }

  // Handle input/output port blocks - show port name
  if (data.type === 'input_port' || data.type === 'output_port') {
    const portName = data.parameters?.portName || data.parameters?.signalName || data.name
    return (
      <div className="text-sm font-medium text-gray-900 px-2 text-center">
        {portName}
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

  // Handle mux block - show dimensions
  if (data.type === 'mux') {
    const rows = data.parameters?.rows || 2
    const cols = data.parameters?.cols || 2
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="text-lg font-bold">▦</div>
        <div className="text-xs text-gray-600 mt-0.5">
          {rows}×{cols}
        </div>
      </div>
    )
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
    'matrix_multiply': '⊗',
    'mux': '▦',
    'demux': '▥',
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
  
  // Input/Output port blocks need width based on port name
  if (data.type === 'input_port' || data.type === 'output_port') {
    const portName = data.parameters?.portName || data.parameters?.signalName || data.name || ''
    const estimatedWidth = Math.max(100, portName.length * 8 + 40) // Extra padding for terminator shape
    return Math.min(200, estimatedWidth)
  }
  
  // Lookup blocks need space for the SVG diagram
  if (data.type === 'lookup_1d' || data.type === 'lookup_2d') {
    return 80 // Slightly wider to accommodate the 60px SVG
  }
  
  // Matrix blocks might need extra width for dimension display
  if (data.type === 'mux' || data.type === 'matrix_multiply') {
    return 90 // Slightly wider for dimension info
  }
  
  return 80 // Default width
}

// Custom node component
const BlockNode = memo(({ data, selected }: NodeProps<BlockNodeData>) => {
  const { inputs: inputCount, outputs: outputCount } = getPortCounts(data.type, data.parameters)
  const blockWidth = getBlockWidth(data)
  const isTerminator = data.type === 'input_port' || data.type === 'output_port'
  const minHeight = isTerminator ? TERMINATOR_HEIGHT : Math.max(MIN_HEIGHT, Math.max(inputCount, outputCount) * PORT_SPACING + 20)

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
        className="absolute left-0 right-0 text-center text-gray-800 font-medium pointer-events-none"
        style={{ 
          width: blockWidth, 
          fontSize: '0.5rem', 
          lineHeight: '0.75rem',
          top: isTerminator ? '-0.7rem' : '-0.75rem' // Adjust position based on block type
        }}
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
      {(data.type === 'input_port' || data.type === 'output_port') ? (
        // Terminator shape for input/output ports
        <div style={{ position: 'relative', width: blockWidth, height: minHeight }}>
          <svg
            width={blockWidth}
            height={minHeight}
            style={{ position: 'absolute', top: 0, left: 0 }}
            className={`${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
          >
            {/* Terminator shape path - stadium/pill shape */}
            <path
              d={`
                M ${minHeight/2} 2
                L ${blockWidth - minHeight/2} 2
                A ${minHeight/2 - 2} ${minHeight/2 - 2} 0 0 1 ${blockWidth - minHeight/2} ${minHeight - 2}
                L ${minHeight/2} ${minHeight - 2}
                A ${minHeight/2 - 2} ${minHeight/2 - 2} 0 0 1 ${minHeight/2} 2
                Z
              `}
              fill="white"
              stroke="#9ca3af"
              strokeWidth="2"
            />
          </svg>
          
          {/* Port name text overlay */}
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ width: blockWidth, height: minHeight }}
          >
            {getBlockSymbol(data)}
          </div>
        </div>
      ) : (
        // Regular rectangular block
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
          {/* Block Symbol */}
          <div className="text-xl font-bold text-gray-900 pointer-events-none">
            {getBlockSymbol(data)}
          </div>
        </div>
      )}

      {/* Input Handles */}
      {Array.from({ length: inputCount }).map((_, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          style={{
            ...handleStyle,
            top: calculatePortPosition(index, inputCount, minHeight),
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

      {/* Output Handles */}
      {Array.from({ length: outputCount }).map((_, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          style={{
            ...handleStyle,
            top: calculatePortPosition(index, outputCount, minHeight),
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