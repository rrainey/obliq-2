// lib/signalTypePropagation.ts

import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { parseType, ParsedType, typeToString } from './typeValidator'

/**
 * Represents the type information for a signal (wire)
 */
export interface SignalType {
  wireId: string
  sourceBlockId: string
  sourcePortIndex: number
  targetBlockId: string
  targetPortIndex: number
  type: string
  parsedType: ParsedType
}

/**
 * Map of block output port to its signal type
 */
export type BlockOutputTypes = Map<string, string> // key: "blockId:portIndex"

/**
 * Map of all signal types in the model
 */
export type SignalTypeMap = Map<string, SignalType> // key: wireId

/**
 * Result of type propagation analysis
 */
export interface TypePropagationResult {
  signalTypes: SignalTypeMap
  blockOutputTypes: BlockOutputTypes
  errors: TypePropagationError[]
}

/**
 * Type propagation error information
 */
export interface TypePropagationError {
  wireId?: string
  blockId?: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Gets the output type for a block based on its type and parameters
 */
function getBlockOutputType(block: BlockData): string | null {
  switch (block.type) {
    case 'source':
    case 'input_port':
      // These blocks have explicit dataType parameter
      return block.parameters?.dataType || 'double'
    
    case 'sum':
    case 'multiply':
    case 'scale':
    case 'transfer_function':
    case 'lookup_1d':
    case 'lookup_2d':
      // These blocks output type depends on their inputs
      // Will be determined during propagation
      return null
    
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
      // These blocks don't have outputs
      return null
    
    case 'subsystem':
      // Subsystem outputs depend on internal implementation
      // For now, we'll need to analyze the subsystem sheet
      return null

    case 'sheet_label_sink':
      // Sheet label sinks don't have outputs
      return null
    
    case 'sheet_label_source':
      // Sheet label sources will get their type from the associated sink
      // This will be determined during propagation
      return null
    
    default:
      return null
  }
}

/**
 * Determines the output type for arithmetic and processing blocks based on input types
 */
function determineProcessingBlockOutputType(
  blockType: string,
  inputTypes: string[]
): string | null {
  if (inputTypes.length === 0) return null
  
  // Parse all input types
  const parsedTypes = inputTypes.map(type => {
    try {
      return parseType(type)
    } catch {
      return null
    }
  }).filter(t => t !== null) as ParsedType[]
  
  if (parsedTypes.length === 0) return null
  
  switch (blockType) {
    case 'sum':
    case 'multiply':
      // For arithmetic operations, all inputs must have the same type
      // Output type matches input type
      const firstType = parsedTypes[0]
      const allSameType = parsedTypes.every(t => 
        t.baseType === firstType.baseType &&
        t.isArray === firstType.isArray &&
        t.arraySize === firstType.arraySize
      )
      
      if (allSameType) {
        return typeToString(firstType)
      }
      return null // Type mismatch
    
    case 'scale':
      // Scale block: output type matches input type
      return typeToString(parsedTypes[0])
    
    case 'transfer_function':
      // Transfer function: output type matches input type
      // Arrays are processed element-wise
      return typeToString(parsedTypes[0])
    
    case 'lookup_1d':
    case 'lookup_2d':
      // Lookup blocks: output type matches input type
      // Must be scalar (not array)
      if (!parsedTypes[0].isArray) {
        return typeToString(parsedTypes[0])
      }
      return null // Lookup blocks don't accept arrays
    
    default:
      return null
  }
}

/**
 * Propagates signal types through the model
 */
export function propagateSignalTypes(
  blocks: BlockData[],
  wires: WireData[]
): TypePropagationResult {
  const signalTypes: SignalTypeMap = new Map()
  const blockOutputTypes: BlockOutputTypes = new Map()
  const errors: TypePropagationError[] = []
  
  // Create maps for quick lookup
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  const wiresByTarget = new Map<string, WireData[]>() // key: "targetBlockId:targetPortIndex"
  const wiresBySource = new Map<string, WireData[]>() // key: "sourceBlockId:sourcePortIndex"
  
  for (const wire of wires) {
    const targetKey = `${wire.targetBlockId}:${wire.targetPortIndex}`
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    
    if (!wiresByTarget.has(targetKey)) {
      wiresByTarget.set(targetKey, [])
    }
    wiresByTarget.get(targetKey)!.push(wire)
    
    if (!wiresBySource.has(sourceKey)) {
      wiresBySource.set(sourceKey, [])
    }
    wiresBySource.get(sourceKey)!.push(wire)
  }
  
  // Step 1: Initialize types for source blocks (blocks with explicit types)
  for (const block of blocks) {
    const outputType = getBlockOutputType(block)
    if (outputType) {
      // Validate the type
      try {
        const parsedType = parseType(outputType)
        const key = `${block.id}:0` // Source blocks have single output at port 0
        blockOutputTypes.set(key, outputType)
      } catch (error) {
        errors.push({
          blockId: block.id,
          message: `Invalid data type in ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error'
        })
      }
    }
  }
  
  // Step 2: Propagate types through the network
  // Use a queue-based approach to handle dependencies
  const processingQueue: string[] = [] // Block IDs to process
  const processedBlocks = new Set<string>()
  
  // Start with blocks that have known output types
  for (const [key, _] of blockOutputTypes) {
    const blockId = key.split(':')[0]
    if (!processedBlocks.has(blockId)) {
      processingQueue.push(blockId)
      processedBlocks.add(blockId)
    }
  }
  
  // Process blocks in topological order
  while (processingQueue.length > 0) {
    const currentBlockId = processingQueue.shift()!
    const currentBlock = blockMap.get(currentBlockId)
    if (!currentBlock) continue
    
    // Process all output ports of the current block
    const outputPortCount = getBlockOutputPortCount(currentBlock)
    
    for (let portIndex = 0; portIndex < outputPortCount; portIndex++) {
      const outputKey = `${currentBlockId}:${portIndex}`
      const outputType = blockOutputTypes.get(outputKey)
      
      if (!outputType) {
        // Try to determine output type based on inputs
        const inputTypes = getBlockInputTypes(currentBlock, wiresByTarget, blockOutputTypes)
        const determinedType = determineProcessingBlockOutputType(currentBlock.type, inputTypes)
        
        if (determinedType) {
          blockOutputTypes.set(outputKey, determinedType)
        } else if (inputTypes.length > 0) {
          // We have inputs but couldn't determine output type
          errors.push({
            blockId: currentBlock.id,
            message: `Cannot determine output type for ${currentBlock.name}. Check input type compatibility.`,
            severity: 'error'
          })
          continue
        }
      }
      
      // Propagate type to connected wires
      const connectedWires = wiresBySource.get(outputKey) || []
      for (const wire of connectedWires) {
        const wireType = blockOutputTypes.get(outputKey)
        if (wireType) {
          try {
            const parsedType = parseType(wireType)
            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: wireType,
              parsedType
            })
            
            // Add target block to processing queue if not already processed
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              // Check if all inputs are available before processing
              const targetInputs = getBlockInputTypes(targetBlock, wiresByTarget, blockOutputTypes)
              const expectedInputs = getBlockInputPortCount(targetBlock)
              
              if (targetInputs.length === expectedInputs || 
                  ['signal_display', 'signal_logger', 'output_port'].includes(targetBlock.type)) {
                processingQueue.push(wire.targetBlockId)
                processedBlocks.add(wire.targetBlockId)
              }
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      }
    }
  }
  
  // Step 3: Check for type mismatches on multi-input blocks
  for (const block of blocks) {
    if (['sum', 'multiply'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 1) {
        const firstType = inputTypes[0]
        const allSame = inputTypes.every(t => t === firstType)
        if (!allSame) {
          errors.push({
            blockId: block.id,
            message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${inputTypes.join(', ')}`,
            severity: 'error'
          })
        }
      }
    }
  }
  
  // Step 4: Check lookup blocks for scalar inputs
  for (const block of blocks) {
    if (['lookup_1d', 'lookup_2d'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      for (const inputType of inputTypes) {
        try {
          const parsed = parseType(inputType)
          if (parsed.isArray) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires scalar inputs but received array type: ${inputType}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
  }
  
  return {
    signalTypes,
    blockOutputTypes,
    errors
  }
}

/**
 * Gets the number of output ports for a block
 */
function getBlockOutputPortCount(block: BlockData): number {
  switch (block.type) {
    case 'sum':
    case 'multiply':
    case 'scale':
    case 'transfer_function':
    case 'lookup_1d':
    case 'lookup_2d':
    case 'input_port':
    case 'source':
      return 1
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
      return 0
    case 'subsystem':
      return block.parameters?.outputPorts?.length || 1
    case 'sheet_label_sink':
      return 0
    case 'sheet_label_source':
      return 1
    default:
      return 0
  }
}

/**
 * Gets the number of input ports for a block
 */
function getBlockInputPortCount(block: BlockData): number {
  switch (block.type) {
    case 'sum':
    case 'multiply':
      return 2 // Default, but can have more
    case 'scale':
    case 'transfer_function':
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
    case 'lookup_1d':
      return 1
    case 'lookup_2d':
      return 2
    case 'input_port':
    case 'source':
      return 0
    case 'subsystem':
      return block.parameters?.inputPorts?.length || 1
     case 'sheet_label_sink':
      return 1
    case 'sheet_label_source':
      return 0
    default:
      return 1
  }
}

/**
 * Gets the types of all inputs connected to a block
 */
function getBlockInputTypes(
  block: BlockData,
  wiresByTarget: Map<string, WireData[]>,
  blockOutputTypes: BlockOutputTypes
): string[] {
  const inputTypes: string[] = []
  const inputPortCount = getBlockInputPortCount(block)
  
  for (let portIndex = 0; portIndex < inputPortCount; portIndex++) {
    const targetKey = `${block.id}:${portIndex}`
    const wires = wiresByTarget.get(targetKey) || []
    
    for (const wire of wires) {
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceType = blockOutputTypes.get(sourceKey)
      if (sourceType) {
        inputTypes.push(sourceType)
      }
    }
  }
  
  return inputTypes
}

/**
 * Validates that all connections in the model have compatible types
 */
export function validateSignalTypes(result: TypePropagationResult): TypePropagationError[] {
  const additionalErrors: TypePropagationError[] = []
  
  // Check for any wires without determined types
  for (const [wireId, signalType] of result.signalTypes) {
    if (!signalType.type) {
      additionalErrors.push({
        wireId,
        message: 'Unable to determine signal type',
        severity: 'warning'
      })
    }
  }
  
  return [...result.errors, ...additionalErrors]
}