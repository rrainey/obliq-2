// src/lib/connectionValidation.ts
import { BlockData, PortInfo } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

export interface ValidationResult {
  isValid: boolean
  errorMessage?: string
}

/**
 * Get the output type of a block port
 */
function getBlockOutputType(block: BlockData, portIndex: number): string | null {
  // For blocks with explicit types
  if (block.type === 'source' || block.type === 'input_port') {
    return block.parameters?.dataType || 'double'
  }
  
  // For other blocks, we'd need full type propagation
  // This is a simplified version
  return null
}

/**
 * Check if a type is boolean
 */
function isBooleanType(type: string): boolean {
  return type === 'bool' || type.startsWith('bool[')
}

/**
 * Validates if a new wire connection is allowed
 */
export function validateConnection(
  sourcePort: PortInfo,
  targetPort: PortInfo,
  blocks: BlockData[],
  existingWires: WireData[]
): ValidationResult {
  // Rule 1: Cannot connect to the same block
  if (sourcePort.blockId === targetPort.blockId) {
    return {
      isValid: false,
      errorMessage: "Cannot connect a block to itself"
    }
  }

  // Rule 2: Source must be an output port, target must be an input port
  if (!sourcePort.isOutput || targetPort.isOutput) {
    return {
      isValid: false,
      errorMessage: "Must connect from output port to input port"
    }
  }

  // Rule 3: Input ports can only have one connection
  const existingInputConnection = existingWires.find(wire => 
    wire.targetBlockId === targetPort.blockId && 
    wire.targetPortIndex === targetPort.portIndex
  )

  if (existingInputConnection) {
    return {
      isValid: false,
      errorMessage: "Input port already has a connection"
    }
  }

  // Rule 4: Check if blocks exist
  const sourceBlock = blocks.find(b => b.id === sourcePort.blockId)
  const targetBlock = blocks.find(b => b.id === targetPort.blockId)

  if (!sourceBlock) {
    return {
      isValid: false,
      errorMessage: "Source block not found"
    }
  }

  if (!targetBlock) {
    return {
      isValid: false,
      errorMessage: "Target block not found"
    }
  }

  // Rule 5: Check if ports exist on the blocks
  const sourcePortCount = getOutputPortCount(sourceBlock.type, sourceBlock.parameters)
  const targetPortCount = getInputPortCount(targetBlock.type, targetBlock.parameters)
  
  // Special handling for enable port (port index -1)
  if (targetPort.portIndex === -1) {
    // Verify this is a subsystem with enable input
    if (targetBlock.type !== 'subsystem' || !targetBlock.parameters?.showEnableInput) {
      return {
        isValid: false,
        errorMessage: "Block does not have an enable port"
      }
    }
    
    // Rule 5a: Enable port must receive boolean signal
    const sourceType = getBlockOutputType(sourceBlock, sourcePort.portIndex)
    if (sourceType && !isBooleanType(sourceType)) {
      return {
        isValid: false,
        errorMessage: `Enable port requires boolean signal, but source provides ${sourceType}`
      }
    }
  } else {
    // Regular port validation
    if (sourcePort.portIndex >= sourcePortCount) {
      return {
        isValid: false,
        errorMessage: "Source port index out of range"
      }
    }

    if (targetPort.portIndex >= targetPortCount) {
      return {
        isValid: false,
        errorMessage: "Target port index out of range"
      }
    }
  }

  // Rule 6: Prevent duplicate connections
  const duplicateConnection = existingWires.find(wire =>
    wire.sourceBlockId === sourcePort.blockId &&
    wire.sourcePortIndex === sourcePort.portIndex &&
    wire.targetBlockId === targetPort.blockId &&
    wire.targetPortIndex === targetPort.portIndex
  )

  if (duplicateConnection) {
    return {
      isValid: false,
      errorMessage: "Connection already exists"
    }
  }

  return { isValid: true }
}

/**
 * Validates if a port can start a connection
 */
export function validatePortForConnection(
  port: PortInfo,
  blocks: BlockData[],
  existingWires: WireData[]
): ValidationResult {
  const block = blocks.find(b => b.id === port.blockId)
  
  if (!block) {
    return {
      isValid: false,
      errorMessage: "Block not found"
    }
  }

  // Input ports that already have connections cannot start new connections
  if (!port.isOutput) {
    const hasConnection = existingWires.some(wire =>
      wire.targetBlockId === port.blockId && 
      wire.targetPortIndex === port.portIndex
    )
    
    if (hasConnection) {
      return {
        isValid: false,
        errorMessage: "Input port already connected"
      }
    }
  }

  return { isValid: true }
}

/**
 * Check for potential algebraic loops (basic detection)
 */
export function detectAlgebraicLoop(
  newWire: WireData,
  existingWires: WireData[]
): ValidationResult {
  // Enable connections don't participate in algebraic loops
  if (newWire.targetPortIndex === -1) {
    return { isValid: true }
  }

  // Create a simple path from the new connection's target back to its source
  const visited = new Set<string>()
  const stack = [newWire.targetBlockId]

  while (stack.length > 0) {
    const currentBlockId = stack.pop()!
    
    if (visited.has(currentBlockId)) {
      continue
    }
    
    visited.add(currentBlockId)
    
    // If we reach the source block, we have a loop
    if (currentBlockId === newWire.sourceBlockId) {
      return {
        isValid: false,
        errorMessage: "Connection would create an algebraic loop"
      }
    }

    // Find all blocks that this block connects to
    const outgoingWires = existingWires.filter(wire => 
      wire.sourceBlockId === currentBlockId
    )
    
    for (const wire of outgoingWires) {
      stack.push(wire.targetBlockId)
    }
  }

  return { isValid: true }
}

// Helper functions to get port counts
function getInputPortCount(blockType: string, parameters?: Record<string, any>): number {
  switch (blockType) {
    case 'sum':
    case 'multiply':
      return 2 // Can be extended for more inputs
    case 'scale':
    case 'transfer_function':
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
      return 1
    case 'lookup_1d':
      return 1
    case 'lookup_2d':
      return 2
    case 'matrix_multiply':
      return 2
    case 'input_port':
    case 'source':
      return 0 // No inputs
    case 'subsystem':
      // Count regular input ports, not the enable port
      const inputPorts = parameters?.inputPorts || ['Input1']
      return inputPorts.length
    case 'sheet_label_sink':
      return 1
    case 'sheet_label_source':
      return 0
    case 'mux':
      // Dynamic based on configuration
      const rows = parameters?.rows || 2
      const cols = parameters?.cols || 2
      return rows * cols
    case 'demux':
      return 1
    default:
      return 0
  }
}

function getOutputPortCount(blockType: string, parameters?: Record<string, any>): number {
  switch (blockType) {
    case 'sum':
    case 'multiply':
    case 'scale':
    case 'transfer_function':
    case 'input_port':
    case 'source':
    case 'lookup_1d':
    case 'lookup_2d':
      return 1
    case 'matrix_multiply':
      return 1
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
      return 0 // No outputs
    case 'subsystem':
      const outputPorts = parameters?.outputPorts || ['Output1']
      return outputPorts.length
    case 'sheet_label_sink':
      return 0
    case 'sheet_label_source':
      return 1
    case 'mux':
      return 1
    case 'demux':
      // Dynamic based on input signal dimensions
      const outputCount = parameters?.outputCount || 1
      return outputCount
    default:
      return 0
  }
}

// Export the helper functions for use in other modules
export { getInputPortCount, getOutputPortCount }