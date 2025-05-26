import { BlockData, PortInfo } from '@/components/Block'
import { WireData } from '@/components/Wire'

export interface ValidationResult {
  isValid: boolean
  errorMessage?: string
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
  const sourcePortCount = getOutputPortCount(sourceBlock.type)
  const targetPortCount = getInputPortCount(targetBlock.type)

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
function getInputPortCount(blockType: string): number {
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
    case 'input_port':
    case 'source':
      return 0 // No inputs
    case 'subsystem':
      return 1 // Can be configured
    default:
      return 0
  }
}

function getOutputPortCount(blockType: string): number {
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
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
      return 0 // No outputs
    case 'subsystem':
      return 1 // Can be configured
    default:
      return 0
  }
}