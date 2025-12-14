// components/BlockNode.tsx - Simplified without custom context menu handling

'use client'

import { memo, CSSProperties, useEffect, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { PortCountAdapter } from '@/lib/validation/PortCountAdapter'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { IconMathIntegral, IconMathMaxMin } from '@tabler/icons-react'

export interface BlockData {
  id: string
  type: string
  name: string
  position: { x: number; y: number }
  parameters?: Record<string, any>
  inputs?: string[]   // Input port names for this block
  outputs?: string[]  // Output port names for this block
}

export interface PortInfo {
  blockId: string
  portIndex: number
  isOutput: boolean
}

export interface BlockNodeProps {
  data: BlockData & Partial<Pick<BlockNodeData, 'allWires' | 'allBlocks'>>
  selected?: boolean
}

// Wire data interface (imported from Wire.tsx but redefined here to avoid circular deps)
interface WireDataRef {
  id: string
  sourceBlockId: string
  sourcePortIndex: number
  targetBlockId: string
  targetPortIndex: number
}

// Define custom node data structure that extends BlockData
export interface BlockNodeData extends Omit<BlockData, 'position'> {
  // Additional data for port name rendering
  allWires?: WireDataRef[]
  allBlocks?: BlockData[]
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

/**
 * Get the name of a connected Input/Output Port block for port label display
 * @param blockId - The current block's ID
 * @param portIndex - The port index on the current block
 * @param isInput - Whether this is an input port (true) or output port (false)
 * @param wires - All wires in the sheet
 * @param allBlocks - All blocks in the sheet
 * @returns The port name if connected to an input_port or output_port block, null otherwise
 */
const getConnectedPortName = (
  blockId: string,
  portIndex: number,
  isInput: boolean,
  wires: WireDataRef[],
  allBlocks: BlockData[]
): string | null => {
  if (!wires || !allBlocks) return null

  // Find the wire connected to this port
  const wire = wires.find(w => {
    if (isInput) {
      // For inputs: find wire where this block is the target
      return w.targetBlockId === blockId && w.targetPortIndex === portIndex
    } else {
      // For outputs: find wire where this block is the source
      return w.sourceBlockId === blockId && w.sourcePortIndex === portIndex
    }
  })

  if (!wire) return null

  // Get the connected block
  const connectedBlockId = isInput ? wire.sourceBlockId : wire.targetBlockId
  const connectedBlock = allBlocks.find(b => b.id === connectedBlockId)

  if (!connectedBlock) return null

  // Only return name if connected to an input_port or output_port block
  if (connectedBlock.type === 'input_port' || connectedBlock.type === 'output_port') {
    return connectedBlock.parameters?.portName || connectedBlock.parameters?.signalName || connectedBlock.name
  }

  return null
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

  if (data.type === 'transpose') {
    return (
      <div className="text-sm font-mono">
        Aᵀ
      </div>
    )
  }

  // Handle integrator block with Tabler icon
  if (data.type === 'integrator') {
    return <IconMathIntegral size={24} stroke={1.5} />
  }

  // Handle limit block with Tabler icon
  if (data.type === 'limit') {
    return <IconMathMaxMin size={24} stroke={1.5} />
  }

  // Handle source blocks with constant values
  if (data.type === 'source' && data.parameters?.value !== undefined) {
    // Check if this source uses a parameter reference
    if (data.parameters.useParameter && data.parameters.parameterName) {
      return (
        <div className="text-sm font-mono px-1 text-purple-700 font-semibold">
          {data.parameters.parameterName}
        </div>
      )
    }

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

  // Handle evaluate block - show expression with truncation
  if (data.type === 'evaluate') {
    const expression = data.parameters?.expression || 'in(0)'
    const displayExpression = truncateExpression(expression, 30)
    return (
      <div 
        className="text-xs font-mono px-2 text-center"
        title={expression} // Show full expression on hover
      >
        {displayExpression}
      </div>
    )
  }

  // Handle condition block - show condition with truncation
  if (data.type === 'condition') {
    const condition = data.parameters?.condition || '> 0'
    const fullText = `x1 ${condition}`
    const displayText = truncateExpression(fullText, 20)
    return (
      <div 
        className="text-xs font-mono px-2 text-center"
        title={fullText}
      >
        {displayText}
      </div>
    )
  }

  if (data.type === 'trig') {
    type TrigFunc = 'sin' | 'cos' | 'tan' | 'atan' | 'atan2' | 'sincos'
    const func: string = data.parameters?.function || 'sin'
    const funcDisplay: Record<TrigFunc, string> = {
      'sin': 'sin(x)',
      'cos': 'cos(x)',
      'tan': 'tan(x)',
      'atan': 'atan(x)',
      'atan2': 'atan2(y,x)',
      'sincos': 'sincos(x)'
    }
    return (
      <div className="text-sm font-mono">
        { funcDisplay[func as TrigFunc] || func }
      </div>
    )
  }

  // Handle orientation conversion block
  if (data.type === 'orientation_conversion') {
    type ConversionType = 'euler_to_dcm' | 'dcm_to_euler' | 'euler_to_quat' | 'dcm_to_quat' | 'quat_to_euler' | 'quat_to_dcm'
    const convType: string = data.parameters?.conversionType || 'euler_to_dcm'
    const convDisplay: Record<ConversionType, string> = {
      'euler_to_dcm': 'E→DCM',
      'dcm_to_euler': 'DCM→E',
      'euler_to_quat': 'E→q',
      'dcm_to_quat': 'DCM→q',
      'quat_to_euler': 'q→E',
      'quat_to_dcm': 'q→DCM'
    }
    return (
      <div className="text-xs font-mono">
        { convDisplay[convType as ConversionType] || convType }
      </div>
    )
  }

  // Regular symbols for other blocks
  const symbols: Record<string, string> = {
    'sum': '∑',
    'multiply': '×',
    'scale': data.parameters?.gain || 'K',
    'abs': '|x|',
    'uminus': '-x',
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
    'trig': 'sin(x)',
    'cross': 'A×B',
    'dot': 'A·B',
    'mag': '‖v‖',
    'if': '?:',
    'transpose': 'Aᵀ',
    'evaluate': 'f(x)', // Fallback if no expression
    'condition': 'x1?', // Fallback if no condition
    'orientation_conversion': 'E↔DCM', // Fallback for orientation conversion
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

  // Handle evaluate block - adjust width based on expression length
  if (data.type === 'evaluate') {
    const expression = data.parameters?.expression || 'in(0)'
    // Estimate width based on expression length
    // Use monospace font metrics: ~7px per character at text-xs
    const estimatedWidth = expression.length * 7 + 40 // Add padding
    return Math.max(100, Math.min(300, estimatedWidth)) // Min 100px, max 300px
  }

  // Handle condition block similarly
  if (data.type === 'condition') {
    const condition = data.parameters?.condition || '> 0'
    const fullText = `x1 ${condition}`
    const estimatedWidth = fullText.length * 7 + 40
    return Math.max(80, Math.min(200, estimatedWidth))
  }
  
  return 80 // Default width
}

const truncateExpression = (expr: string, maxLength: number = 30): string => {
  if (expr.length <= maxLength) return expr
  return expr.substring(0, maxLength - 3) + '...'
}

// Add this CSS for port signs
const portSignStyles = `
  .port-sign {
    position: absolute;
    font-size: 0.60rem;
    font-weight: bold;
    pointer-events: none;
  }

  .port-sign.positive {
    color: #555555; /* green */
  }

  .port-sign.negative {
    color: #555555; /* red */
  }

  .port-name-label {
    position: absolute;
    font-size: 0.375rem;
    line-height: 0.5rem;
    color: #4b5563;
    pointer-events: none;
    white-space: nowrap;
  }

  .port-name-label.input {
    right: 100%;
    text-align: right;
    margin-right: 4px;
  }

  .port-name-label.output {
    left: 100%;
    text-align: left;
    margin-left: 4px;
  }
`

const getBlockStyle = (data: BlockNodeData, selected: boolean | undefined) => {
    const baseStyle = `
      relative rounded-lg border-2 flex items-center justify-center
      bg-white border-gray-400
      ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
      transition-shadow
    `

    // Add special styling for expression-based blocks
    if (data.type === 'evaluate' || data.type === 'condition') {
      return `${baseStyle} overflow-hidden` // Prevent text overflow
    }

    return baseStyle
  }

// Custom node component
export const BlockNode: React.FC<BlockNodeProps> = ({ data, selected }) => {
  const getPortCounts = () => {
    let x = PortCountAdapter.getPortCounts(data)
    if (data.type === 'output_port' ) {
      // spacial case: Output Block Node reports that it has an output; override that here.
      x.outputCount = 0
    }
    return x
  }

  const getPortLabels = () => {
    return {
      inputs: PortCountAdapter.getInputPortLabels(data),
      outputs: PortCountAdapter.getOutputPortLabels(data)
    }
  }

  const { inputCount, outputCount } = getPortCounts()
  const portLabels = getPortLabels()
  const isTerminator = data.type === 'input_port' || data.type === 'output_port'
  const isSubsystem = data.type === 'subsystem'

  // For subsystems, use stored dimensions if available
  const blockWidth = isSubsystem && data.parameters?.width
    ? data.parameters.width
    : getBlockWidth(data)
  const minHeight = isTerminator
    ? TERMINATOR_HEIGHT
    : isSubsystem && data.parameters?.height
      ? data.parameters.height
      : Math.max(MIN_HEIGHT, Math.max(inputCount, outputCount) * PORT_SPACING + 20)
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Get sum block signs
  const getSumSigns = () => {
    if (data.type === 'sum' && data.parameters?.signs) {
      return data.parameters.signs.split('')
    }
    return null
  }

  const sumSigns = getSumSigns()

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

  // Special style for enable handle
  const enableHandleStyle: CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: '#7c3aed', // Purple color for enable
    border: '2px solid #ffffff',
    cursor: 'crosshair',
  }

  const enableHandleHoverStyle: CSSProperties = {
    backgroundColor: '#9333ea',
    boxShadow: '0 0 0 2px #c4b5fd',
  }

  // Special style for reset handle
  const resetHandleStyle: CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: '#dc2626', // Red color for reset
    border: '2px solid #ffffff',
    cursor: 'crosshair',
  }

  const resetHandleHoverStyle: CSSProperties = {
    backgroundColor: '#ef4444',
    boxShadow: '0 0 0 2px #fca5a5',
  }

  // CSS additions for port labels
  const blockNodeStyles = `
    .port-labels {
      position: absolute;
      font-size: 0.7rem;
      color: #6b7280;
    }
    
    .output-labels {
      right: -60px;
      top: 0;
    }
    
    .port-label {
      height: 20px;
      line-height: 20px;
    }
  `

  const expressionBlockStyles = `
    .expression-block {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    
    .expression-block:hover {
      background-color: #f3f4f6;
      cursor: help;
    }
  `

  // Function to render input ports with labels
  const renderInputPorts = () => {
    const ports = []
    for (let i = 0; i < inputCount; i++) {
      const label = portLabels.inputs?.[i]
      ports.push(
        <Handle
          key={`input-${i}`}
          type="target"
          position={Position.Left}
          id={`input-${i}`}
          style={{
            top: `${((i + 1) / (inputCount + 1)) * 100}%`,
            background: '#374151',
            width: 12,
            height: 12,
            border: '2px solid white',
          }}
          title={label || `Input ${i + 1}`}
        />
      )
    }
    return ports
  }

  // Function to render output ports with labels
  const renderOutputPorts = () => {
    const ports = []
    for (let i = 0; i < outputCount; i++) {
      const label = portLabels.outputs?.[i]
      ports.push(
        <Handle
          key={`output-${i}`}
          type="source"
          position={Position.Right}
          id={`output-${i}`}
          style={{
            top: `${((i + 1) / (outputCount + 1)) * 100}%`,
            background: '#374151',
            width: 12,
            height: 12,
            border: '2px solid white',
          }}
          title={label || `Output ${i + 1}`}
        />
      )
    }
    return ports
  }

  // Special handling for subsystem enable port
  const renderEnablePort = () => {
    if (data.type === 'subsystem' && data.parameters?.showEnableInput) {
      return (
        <Handle
          type="target"
          position={Position.Top}
          id="enable"
          style={{
            left: '50%',
            background: '#374151',
            width: 12,
            height: 12,
            border: '2px solid white',
          }}
          title="Enable"
        />
      )
    }
    return null
  }

  const proposedNewRender= () => {
    <div className={`block-node ${data.type} ${selected ? 'selected' : ''}`}>
      {/* Block content */}
      <div className="block-name">{data.name}</div>
      
      {/* Port labels for special blocks */}
      {data.type === 'demux' && portLabels.outputs && (
        <div className="port-labels output-labels">
          {portLabels.outputs.map((label, i) => (
            <div key={i} className="port-label">{label}</div>
          ))}
        </div>
      )}
      
      {/* Render ports */}
      {renderInputPorts()}
      {renderOutputPorts()}
      {renderEnablePort()}
    </div>
  }

  const oldRender = () => {
    return (
      <>
        <style>
          {portSignStyles}
        </style>

        {/* Block Name - positioned above the block */}
        <div
          className="absolute left-0 right-0 text-center text-gray-800 font-medium pointer-events-none"
          style={{ 
            width: blockWidth, 
            fontSize: '0.5rem', 
            lineHeight: '0.75rem',
            top: isTerminator ? '-0.7rem' : '-0.75rem'
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

        {/* Enable port indicator for blocks with showEnableInput (subsystem, integrator) */}
        {(data.type === 'subsystem' || data.type === 'integrator') && data.parameters?.showEnableInput && (
          <div
            className="absolute text-purple-700 font-bold pointer-events-none"
            style={{
              top: -8,
              left: blockWidth / 2 - 6,
              fontSize: '0.75rem',
              transform: 'translateX(-50%)',
            }}
          >
            ▼
          </div>
        )}

        {/* Reset port indicator for integrator blocks with showResetInput */}
        {data.type === 'integrator' && data.parameters?.showResetInput && (
          <div
            className="absolute text-red-600 font-bold pointer-events-none"
            style={{
              bottom: -8,
              left: blockWidth / 2 - 6,
              fontSize: '0.75rem',
              transform: 'translateX(-50%)',
            }}
          >
            ▲
          </div>
        )}



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
          /* Regular rectangular block */
          <div
            className={getBlockStyle(data, selected)}
            style={{
              width: blockWidth,
              height: minHeight,
            }}
          >
            {/* Block Symbol */}
            <div className="text-xl text-gray-900 pointer-events-none flex items-center justify-center w-full h-full">
              {getBlockSymbol(data)}
            </div>
          </div>
        )}

        {/* Sum block input signs */}
        {data.type === 'sum' && sumSigns && sumSigns.map((sign: any, index: number) => (
          <div
            key={`sign-${index}`}
            className={`port-sign ${sign === '+' ? 'positive' : 'negative'}`}
            style={{
              top: calculatePortPosition(index, inputCount, minHeight) - 8,
              left: 8,
            }}
          >
            {sign}
          </div>
        ))}

        {/* Port Name Labels - shown when showPortNames is enabled */}
        {/* Skip multiply blocks entirely, skip enable/reset ports */}
        {data.type !== 'multiply' && data.parameters?.showPortNames && (
          <>
            {/* Input port name labels */}
            {Array.from({ length: inputCount }).map((_, index) => {
              const portName = getConnectedPortName(
                data.id,
                index,
                true, // isInput
                data.allWires || [],
                data.allBlocks || []
              )
              if (!portName) return null
              return (
                <div
                  key={`input-label-${index}`}
                  className="port-name-label input"
                  style={{
                    top: calculatePortPosition(index, inputCount, minHeight) - 8,
                  }}
                >
                  {portName}
                </div>
              )
            })}

            {/* Output port name labels - skip for sum blocks */}
            {data.type !== 'sum' && Array.from({ length: outputCount }).map((_, index) => {
              const portName = getConnectedPortName(
                data.id,
                index,
                false, // isOutput
                data.allWires || [],
                data.allBlocks || []
              )
              if (!portName) return null
              return (
                <div
                  key={`output-label-${index}`}
                  className="port-name-label output"
                  style={{
                    top: calculatePortPosition(index, outputCount, minHeight) - 8,
                  }}
                >
                  {portName}
                </div>
              )
            })}
          </>
        )}

        {/* Enable Handle - Special port at top center for blocks with showEnableInput (subsystem, integrator) */}
        {(data.type === 'subsystem' || data.type === 'integrator') && data.parameters?.showEnableInput && (
          <Handle
            type="target"
            position={Position.Top}
            id="_enable_"
            style={{
              ...enableHandleStyle,
              top: -6,
              left: blockWidth / 2,
              transform: 'translateX(-50%)',
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, enableHandleHoverStyle)
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, enableHandleStyle)
            }}
          />
        )}

        {/* Reset Handle - Special port at bottom center for integrator blocks with showResetInput */}
        {data.type === 'integrator' && data.parameters?.showResetInput && (
          <Handle
            type="target"
            position={Position.Bottom}
            id="_reset_"
            style={{
              ...resetHandleStyle,
              bottom: -6,
              left: blockWidth / 2,
              transform: 'translateX(-50%)',
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, resetHandleHoverStyle)
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLElement
              Object.assign(target.style, resetHandleStyle)
            }}
          />
        )}

        {/* Input Handles with tooltips showing signs for sum blocks */}
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
            title={
              data.type === 'sum' && sumSigns && sumSigns[index]
                ? `Input ${index + 1} (${sumSigns[index] === '+' ? 'Add' : 'Subtract'})`
                : `Input ${index + 1}`
            }
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
  }

  // Update effect to re-render when parameters change (for dynamic ports)
  useEffect(() => {
    if (PortCountAdapter.hasDynamicPorts(data)) {
      // Force re-render when parameters change
      setUpdateTrigger(prev => prev + 1)
    }
  }, [data.parameters])

  return (
    <>
      {oldRender()}
    </>
  )
}

BlockNode.displayName = 'BlockNode'

export default BlockNode

// Export node types configuration for ReactFlow
export const nodeTypes = {
  customBlock: BlockNode,
} as const

// Helper function to convert BlockData to ReactFlow node format
export const blockDataToNode = (
  block: BlockData,
  allWires?: WireDataRef[],
  allBlocks?: BlockData[]
) => {
  return {
    id: block.id,
    type: 'customBlock',
    position: block.position,
    data: {
      id: block.id,
      type: block.type,
      name: block.name,
      parameters: block.parameters,
      allWires,
      allBlocks,
    },
  }
}

// Helper function to convert WireData to ReactFlow edge format
export const wireDataToEdge = (wire: any) => {
  // Map special port indices to handle IDs
  // -1 = enable port (top edge)
  // -2 = reset port (bottom edge)
  let targetHandle: string
  if (wire.targetPortIndex === -1) {
    targetHandle = '_enable_'
  } else if (wire.targetPortIndex === -2) {
    targetHandle = '_reset_'
  } else {
    targetHandle = `input-${wire.targetPortIndex}`
  }

  const edge = {
    id: wire.id,
    source: wire.sourceBlockId,
    target: wire.targetBlockId,
    sourceHandle: `output-${wire.sourcePortIndex}`,
    targetHandle,
    type: 'default',
  }

  // Important: ReactFlow needs the targetHandle to be accessible for our custom edge
  // to detect enable/reset connections
  return edge
}


