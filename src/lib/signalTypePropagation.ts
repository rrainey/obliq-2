// lib/signalTypePropagation.ts - Updated to handle enable port type validation

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { areTypesCompatible, getTypeCompatibilityError, parseType, ParsedType, typeToString, isMatrixType, getMatrixDimensions } from './typeValidator'
import { ca } from 'zod/v4/locales'

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

type SheetLabelSinkTypes = Map<string, string> // key: signalName, value: type


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
    case 'matrix_multiply':  // New: matrix multiply output depends on inputs
      // These blocks output type depends on their inputs
      // Will be determined during propagation
      return null
    
    case 'mux':  // New: mux output type depends on configuration
      // Mux output type is determined by its configuration
      if (block.parameters?.outputType === 'matrix' && 
          block.parameters?.rows && 
          block.parameters?.cols) {
        const baseType = block.parameters?.baseType || 'double'
        return `${baseType}[${block.parameters.rows}][${block.parameters.cols}]`
      } else if (block.parameters?.outputType === 'vector' && 
                 block.parameters?.size) {
        const baseType = block.parameters?.baseType || 'double'
        return `${baseType}[${block.parameters.size}]`
      }
      return null
    
    case 'demux':  // New: demux always outputs scalars
      // Demux always outputs scalars of the input base type
      // Type will be determined from input
      return null
    
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
      // These blocks don't have outputs
      return null
    
    case 'subsystem':
      // Subsystem outputs depend on internal implementation
      return null

    case 'sheet_label_sink':
      // Sheet label sinks don't have outputs
      return null
    
    case 'sheet_label_source':
      // Sheet label sources will get their type from the associated sink
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
      // Output type matches input type (works for scalars, arrays, and matrices)
      const firstType = parsedTypes[0]
      const allSameType = parsedTypes.every(t => 
        t.baseType === firstType.baseType &&
        t.isArray === firstType.isArray &&
        t.arraySize === firstType.arraySize &&
        t.isMatrix === firstType.isMatrix &&
        t.rows === firstType.rows &&
        t.cols === firstType.cols
      )
      
      if (allSameType) {
        return typeToString(firstType)
      }
      return null // Type mismatch
    
    case 'scale':
      // Scale block: output type matches input type (scalar, array, or matrix)
      return typeToString(parsedTypes[0])
    
    case 'transfer_function':
      // Transfer function: output type matches input type
      // Arrays and matrices are processed element-wise
      return typeToString(parsedTypes[0])
    
    case 'lookup_1d':
    case 'lookup_2d':
      // Lookup blocks: output type matches input type
      // Must be scalar (not array or matrix)
      if (!parsedTypes[0].isArray && !parsedTypes[0].isMatrix) {
        return typeToString(parsedTypes[0])
      }
      return null // Lookup blocks don't accept arrays or matrices
    
    case 'matrix_multiply':
      // Matrix multiply has special rules
      if (inputTypes.length < 2) return null
      
      const input1 = parsedTypes[0]
      const input2 = parsedTypes[1]
      
      // Both inputs must have the same base type
      if (input1.baseType !== input2.baseType) return null
      
      // Handle different multiplication scenarios
      if (!input1.isMatrix && !input1.isArray && !input2.isMatrix && !input2.isArray) {
        // Scalar × Scalar = Scalar
        return typeToString(input1)
      }
      
      if (!input1.isMatrix && !input1.isArray && input2.isMatrix) {
        // Scalar × Matrix = Matrix (same size)
        return typeToString(input2)
      }
      
      if (input1.isMatrix && !input2.isMatrix && !input2.isArray) {
        // Matrix × Scalar = Matrix (same size)
        return typeToString(input1)
      }
      
      if (input1.isArray && input2.isMatrix) {
        // Vector × Matrix: [1×n] × [n×m] = [1×m]
        if (input1.arraySize === input2.rows) {
          return `${input1.baseType}[${input2.cols}]`
        }
        return null // Dimension mismatch
      }
      
      if (input1.isMatrix && input2.isArray) {
        // Matrix × Vector: [m×n] × [n×1] = [m×1]
        if (input1.cols === input2.arraySize) {
          return `${input1.baseType}[${input1.rows}]`
        }
        return null // Dimension mismatch
      }
      
      if (input1.isMatrix && input2.isMatrix) {
        // Matrix × Matrix: [m×n] × [n×p] = [m×p]
        if (input1.cols === input2.rows) {
          return `${input1.baseType}[${input1.rows}][${input2.cols}]`
        }
        return null // Dimension mismatch
      }
      
      return null // Unsupported combination
    
    case 'demux':
      // Demux always outputs the base type as scalar
      const inputType = parsedTypes[0]
      return inputType.baseType
    
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
  const sheetLabelSinkTypes: SheetLabelSinkTypes = new Map() 
  
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

    // Special handling for Sheet Label Sink blocks
    if (currentBlock.type === 'sheet_label_sink') {
      const signalName = currentBlock.parameters?.signalName
      if (signalName) {
        // Get the input type from connected wire
        const inputTypes = getBlockInputTypes(currentBlock, wiresByTarget, blockOutputTypes)
        if (inputTypes.length > 0) {
          // Store the sink's input type indexed by signal name
          sheetLabelSinkTypes.set(signalName, inputTypes[0])
        }
      }
      continue // Sinks don't have outputs
    }
    
    // Special handling for Sheet Label Source blocks
    if (currentBlock.type === 'sheet_label_source') {
      const signalName = currentBlock.parameters?.signalName
      if (signalName && sheetLabelSinkTypes.has(signalName)) {
        // Get type from associated sink
        const sinkType = sheetLabelSinkTypes.get(signalName)!
        const outputKey = `${currentBlockId}:0`
        blockOutputTypes.set(outputKey, sinkType)
        
        // Continue processing connected blocks
        const connectedWires = wiresBySource.get(outputKey) || []
        for (const wire of connectedWires) {
          try {
            const parsedType = parseType(sinkType)
            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: sinkType,
              parsedType
            })
            
            // Add target block to processing queue
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              processingQueue.push(wire.targetBlockId)
              processedBlocks.add(wire.targetBlockId)
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type from sheet label: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      } else if (signalName) {
        // Source references non-existent sink
        errors.push({
          blockId: currentBlock.id,
          message: `Sheet Label Source "${currentBlock.name}" references non-existent signal "${signalName}"`,
          severity: 'error'
        })
      }
      continue
    }
    
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
            
            // Special validation for enable port connections
            if (wire.targetPortIndex === -1) {
              // This is an enable port connection
              const targetBlock = blockMap.get(wire.targetBlockId)
              if (targetBlock && targetBlock.type === 'subsystem' && targetBlock.parameters?.showEnableInput) {
                // Validate that the signal is boolean
                if (parsedType.baseType !== 'bool') {
                  errors.push({
                    wireId: wire.id,
                    message: `Enable port on ${targetBlock.name} requires boolean signal but received ${wireType}`,
                    severity: 'error'
                  })
                  continue
                }
              } else {
                errors.push({
                  wireId: wire.id,
                  message: `Invalid enable port connection`,
                  severity: 'error'
                })
                continue
              }
            }
            
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

  // Step 3.5: Check for matrix-specific constraints
  for (const block of blocks) {
    // Check matrix multiply dimension compatibility
    if (block.type === 'matrix_multiply') {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length === 2) {
        try {
          const type1 = parseType(inputTypes[0])
          const type2 = parseType(inputTypes[1])
          
          // Check if dimensions are compatible for multiplication
          if (type1.isMatrix && type2.isMatrix) {
            if (type1.cols !== type2.rows) {
              errors.push({
                blockId: block.id,
                message: `Matrix dimension mismatch at ${block.name}: Cannot multiply ${type1.rows}×${type1.cols} matrix by ${type2.rows}×${type2.cols} matrix. Inner dimensions must match.`,
                severity: 'error'
              })
            }
          } else if (type1.isArray && type2.isMatrix) {
            if (type1.arraySize !== type2.rows) {
              errors.push({
                blockId: block.id,
                message: `Vector-matrix dimension mismatch at ${block.name}: Cannot multiply vector[${type1.arraySize}] by ${type2.rows}×${type2.cols} matrix.`,
                severity: 'error'
              })
            }
          } else if (type1.isMatrix && type2.isArray) {
            if (type1.cols !== type2.arraySize) {
              errors.push({
                blockId: block.id,
                message: `Matrix-vector dimension mismatch at ${block.name}: Cannot multiply ${type1.rows}×${type1.cols} matrix by vector[${type2.arraySize}].`,
                severity: 'error'
              })
            }
          }
        } catch {
          // Type parsing errors already reported
        }
      }
    }
    
    // Check mux inputs are all scalars
    if (block.type === 'mux') {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      for (let i = 0; i < inputTypes.length; i++) {
        try {
          const parsed = parseType(inputTypes[i])
          if (parsed.isArray || parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} input ${i + 1} must be scalar but received ${inputTypes[i]}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
    
    // Validate demux input is vector or matrix
    if (block.type === 'demux') {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 0) {
        try {
          const parsed = parseType(inputTypes[0])
          if (!parsed.isArray && !parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires vector or matrix input but received scalar ${inputTypes[0]}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
    
    // Update validation for sum and multiply blocks to include matrices
    if (['sum', 'multiply'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 1) {
        const firstType = inputTypes[0]
        const allSame = inputTypes.every(t => t === firstType)
        if (!allSame) {
          // Provide more detailed error for matrix mismatches
          try {
            const parsed = inputTypes.map(t => parseType(t))
            const hasMatrix = parsed.some(p => p.isMatrix)
            if (hasMatrix) {
              const descriptions = inputTypes.map((t, i) => {
                const p = parsed[i]
                if (p.isMatrix) return `${p.rows}×${p.cols} matrix`
                if (p.isArray) return `vector[${p.arraySize}]`
                return `scalar`
              })
              errors.push({
                blockId: block.id,
                message: `Type mismatch at ${block.name}: All inputs must have the same dimensions. Found: ${descriptions.join(', ')}`,
                severity: 'error'
              })
            } else {
              errors.push({
                blockId: block.id,
                message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${inputTypes.join(', ')}`,
                severity: 'error'
              })
            }
          } catch {
            // Fallback to original error
            errors.push({
              blockId: block.id,
              message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${inputTypes.join(', ')}`,
              severity: 'error'
            })
          }
        }
      }
    }
    
    // Check that lookup blocks don't receive matrices
    if (['lookup_1d', 'lookup_2d'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      for (const inputType of inputTypes) {
        try {
          const parsed = parseType(inputType)
          if (parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires scalar inputs but received matrix type: ${inputType}`,
              severity: 'error'
            })
          } else if (parsed.isArray) {
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
    
    // Validate that signal display and logger blocks don't receive matrices
    if (['signal_display', 'signal_logger'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 0) {
        try {
          const parsed = parseType(inputTypes[0])
          if (parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} cannot display matrix signals. Use a demux block to extract individual elements.`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
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

export function propagateSignalTypesMultiSheet(
  sheets: Array<{ blocks: BlockData[], connections: WireData[] }>
): TypePropagationResult {
  const allErrors: TypePropagationError[] = []
  const signalTypes: SignalTypeMap = new Map()
  const blockOutputTypes: BlockOutputTypes = new Map()
  
  // First pass: propagate types within each sheet and collect sheet label sink types
  const sheetLabelSinkTypes: Map<string, string> = new Map()
  
  for (const sheet of sheets) {
    // Run type propagation on each sheet
    const sheetResult = propagateSignalTypes(sheet.blocks, sheet.connections)
    
    // Merge results
    for (const [key, value] of sheetResult.blockOutputTypes) {
      blockOutputTypes.set(key, value)
    }
    for (const [key, value] of sheetResult.signalTypes) {
      signalTypes.set(key, value)
    }
    allErrors.push(...sheetResult.errors)
    
    // Collect sheet label sink types
    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
        // Find the input wire to this sink
        const inputWire = sheet.connections.find(w => w.targetBlockId === block.id)
        if (inputWire) {
          const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
          const sourceType = blockOutputTypes.get(sourceKey)
          if (sourceType) {
            sheetLabelSinkTypes.set(block.parameters.signalName, sourceType)
          }
        }
      }
    }
  }
  
  // Second pass: propagate sheet label source types and re-propagate affected blocks
  let changed = true
  while (changed) {
    changed = false
    
    for (const sheet of sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'sheet_label_source' && block.parameters?.signalName) {
          const sinkType = sheetLabelSinkTypes.get(block.parameters.signalName)
          if (sinkType) {
            const outputKey = `${block.id}:0`
            const currentType = blockOutputTypes.get(outputKey)
            
            if (currentType !== sinkType) {
              changed = true
              blockOutputTypes.set(outputKey, sinkType)
              
              // Update any wires from this source
              const outputWires = sheet.connections.filter(w => w.sourceBlockId === block.id)
              for (const wire of outputWires) {
                try {
                  const parsedType = parseType(sinkType)
                  signalTypes.set(wire.id, {
                    wireId: wire.id,
                    sourceBlockId: wire.sourceBlockId,
                    sourcePortIndex: wire.sourcePortIndex,
                    targetBlockId: wire.targetBlockId,
                    targetPortIndex: wire.targetPortIndex,
                    type: sinkType,
                    parsedType
                  })
                  
                  // Re-propagate to connected blocks
                  const targetBlock = sheet.blocks.find(b => b.id === wire.targetBlockId)
                  if (targetBlock) {
                    // This will be handled in the next iteration
                  }
                } catch (error) {
                  allErrors.push({
                    wireId: wire.id,
                    message: `Invalid signal type from sheet label: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    severity: 'error'
                  })
                }
              }
            }
          }
        }
      }
    }
  }
  
  return {
    signalTypes,
    blockOutputTypes,
    errors: allErrors
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
    case 'matrix_multiply':
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
    case 'matrix_multiply':
      return 2
    case 'input_port':
    case 'source':
      return 0
    case 'subsystem':
      // Don't count enable port in regular input count
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
  
  // Handle regular input ports
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
  
  // Handle enable port separately if it exists
  if (block.type === 'subsystem' && block.parameters?.showEnableInput) {
    const enableKey = `${block.id}:-1`
    const enableWires = wiresByTarget.get(enableKey) || []
    
    for (const wire of enableWires) {
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceType = blockOutputTypes.get(sourceKey)
      if (sourceType) {
        // Enable port type is handled separately in validation
        // Don't include it in regular input types
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

/**
 * Calculates the output dimensions for matrix multiplication
 * @param type1 - First input type
 * @param type2 - Second input type
 * @returns Output type string or null if incompatible
 */
export function calculateMatrixMultiplyOutputType(type1: string, type2: string): string | null {
  try {
    const parsed1 = parseType(type1)
    const parsed2 = parseType(type2)
    
    // Must have same base type
    if (parsed1.baseType !== parsed2.baseType) return null
    
    // Scalar × Scalar
    if (!parsed1.isMatrix && !parsed1.isArray && !parsed2.isMatrix && !parsed2.isArray) {
      return type1
    }
    
    // Scalar × Matrix or Matrix × Scalar
    if (!parsed1.isMatrix && !parsed1.isArray && parsed2.isMatrix) {
      return type2
    }
    if (parsed1.isMatrix && !parsed2.isMatrix && !parsed2.isArray) {
      return type1
    }
    
    // Vector × Matrix: [1×n] × [n×m] = [1×m]
    if (parsed1.isArray && parsed2.isMatrix) {
      if (parsed1.arraySize === parsed2.rows) {
        return `${parsed1.baseType}[${parsed2.cols}]`
      }
    }
    
    // Matrix × Vector: [m×n] × [n×1] = [m×1]
    if (parsed1.isMatrix && parsed2.isArray) {
      if (parsed1.cols === parsed2.arraySize) {
        return `${parsed1.baseType}[${parsed1.rows}]`
      }
    }
    
    // Matrix × Matrix: [m×n] × [n×p] = [m×p]
    if (parsed1.isMatrix && parsed2.isMatrix) {
      if (parsed1.cols === parsed2.rows) {
        return `${parsed1.baseType}[${parsed1.rows}][${parsed2.cols}]`
      }
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Gets a detailed error message for matrix multiply incompatibility
 * @param type1 - First input type
 * @param type2 - Second input type
 * @returns Error message explaining the incompatibility
 */
export function getMatrixMultiplyError(type1: string, type2: string): string {
  try {
    const parsed1 = parseType(type1)
    const parsed2 = parseType(type2)
    
    if (parsed1.baseType !== parsed2.baseType) {
      return `Cannot multiply ${parsed1.baseType} and ${parsed2.baseType} - types must match`
    }
    
    const desc1 = parsed1.isMatrix ? `${parsed1.rows}×${parsed1.cols} matrix` :
                  parsed1.isArray ? `vector[${parsed1.arraySize}]` : 'scalar'
    const desc2 = parsed2.isMatrix ? `${parsed2.rows}×${parsed2.cols} matrix` :
                  parsed2.isArray ? `vector[${parsed2.arraySize}]` : 'scalar'
    
    if (parsed1.isArray && parsed2.isMatrix) {
      if (parsed1.arraySize !== parsed2.rows) {
        return `Cannot multiply ${desc1} by ${desc2}: vector size (${parsed1.arraySize}) must match matrix rows (${parsed2.rows})`
      }
    }
    
    if (parsed1.isMatrix && parsed2.isArray) {
      if (parsed1.cols !== parsed2.arraySize) {
        return `Cannot multiply ${desc1} by ${desc2}: matrix columns (${parsed1.cols}) must match vector size (${parsed2.arraySize})`
      }
    }
    
    if (parsed1.isMatrix && parsed2.isMatrix) {
      if (parsed1.cols !== parsed2.rows) {
        return `Cannot multiply ${desc1} by ${desc2}: first matrix columns (${parsed1.cols}) must match second matrix rows (${parsed2.rows})`
      }
    }
    
    return `Cannot multiply ${desc1} by ${desc2}`
  } catch {
    return 'Invalid types for matrix multiplication'
  }
}

/**
 * Determines output type rules for matrix-specific blocks
 */
export function getMatrixBlockOutputType(
  block: BlockData,
  inputTypes: string[]
): string | null {
  const parsedInputs = inputTypes.map(type => {
    try {
      return parseType(type)
    } catch {
      return null
    }
  }).filter(t => t !== null) as ParsedType[]

  switch (block.type) {
    case 'matrix_multiply':
      return getMatrixMultiplyOutputType(inputTypes)
    
    case 'mux':
      return getMuxOutputType(block, parsedInputs)
    
    case 'demux':
      return getDemuxOutputType(parsedInputs)
    
    // Element-wise operations maintain input dimensions
    case 'sum':
    case 'multiply':
    case 'scale':
      return getElementWiseOutputType(block.type, parsedInputs)
    
    case 'transfer_function':
      // Transfer functions process each element independently
      return parsedInputs.length > 0 ? typeToString(parsedInputs[0]) : null
    
    default:
      return null
  }
}

/**
 * Get output type for matrix multiply operation
 */
function getMatrixMultiplyOutputType(inputTypes: string[]): string | null {
  if (inputTypes.length < 2) return null
  return calculateMatrixMultiplyOutputType(inputTypes[0], inputTypes[1])
}

/**
 * Get output type for mux block based on configuration
 */
function getMuxOutputType(block: BlockData, inputs: ParsedType[]): string | null {
  // All inputs must be scalars of the same base type
  if (inputs.length === 0) return null
  
  const baseType = inputs[0].baseType
  const allScalars = inputs.every(t => 
    !t.isArray && !t.isMatrix && t.baseType === baseType
  )
  
  if (!allScalars) return null
  
  // Output type depends on mux configuration
  if (block.parameters?.outputType === 'matrix') {
    const rows = block.parameters?.rows
    const cols = block.parameters?.cols
    if (rows && cols && inputs.length === rows * cols) {
      return `${baseType}[${rows}][${cols}]`
    }
  } else if (block.parameters?.outputType === 'vector') {
    const size = block.parameters?.size || inputs.length
    if (inputs.length === size) {
      return `${baseType}[${size}]`
    }
  }
  
  return null
}

/**
 * Get output type for demux block
 */
function getDemuxOutputType(inputs: ParsedType[]): string | null {
  if (inputs.length !== 1) return null
  
  const input = inputs[0]
  // Demux always outputs the base type as scalars
  return input.baseType
}

/**
 * Get output type for element-wise operations
 */
function getElementWiseOutputType(
  operation: string,
  inputs: ParsedType[]
): string | null {
  if (inputs.length === 0) return null
  
  const first = inputs[0]
  
  if (operation === 'scale') {
    // Scale preserves input type exactly
    return typeToString(first)
  }
  
  // For sum and multiply, all inputs must have identical dimensions
  const allSame = inputs.every(t => 
    t.baseType === first.baseType &&
    t.isArray === first.isArray &&
    t.arraySize === first.arraySize &&
    t.isMatrix === first.isMatrix &&
    t.rows === first.rows &&
    t.cols === first.cols
  )
  
  return allSame ? typeToString(first) : null
}

/**
 * Matrix operation validation rules
 */
export interface MatrixOperationRule {
  operation: string
  validate: (inputs: ParsedType[]) => { valid: boolean; error?: string }
  getOutputType: (inputs: ParsedType[]) => ParsedType | null
}

export const matrixOperationRules: Record<string, MatrixOperationRule> = {
  'matrix_multiply': {
    operation: 'matrix_multiply',
    validate: (inputs) => {
      if (inputs.length !== 2) {
        return { valid: false, error: 'Matrix multiply requires exactly 2 inputs' }
      }
      
      const [a, b] = inputs
      
      // Check base type compatibility
      if (a.baseType !== b.baseType) {
        return { valid: false, error: 'Input types must match' }
      }
      
      // Check dimension compatibility
      if (a.isMatrix && b.isMatrix) {
        if (a.cols !== b.rows) {
          return { 
            valid: false, 
            error: `Inner dimensions must match: ${a.cols} ≠ ${b.rows}` 
          }
        }
      } else if (a.isArray && b.isMatrix) {
        if (a.arraySize !== b.rows) {
          return { 
            valid: false, 
            error: `Vector size must match matrix rows: ${a.arraySize} ≠ ${b.rows}` 
          }
        }
      } else if (a.isMatrix && b.isArray) {
        if (a.cols !== b.arraySize) {
          return { 
            valid: false, 
            error: `Matrix columns must match vector size: ${a.cols} ≠ ${b.arraySize}` 
          }
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => {
      const [a, b] = inputs
      
      // Scalar cases
      if (!a.isMatrix && !a.isArray && !b.isMatrix && !b.isArray) {
        return a
      }
      if (!a.isMatrix && !a.isArray && b.isMatrix) {
        return b
      }
      if (a.isMatrix && !b.isMatrix && !b.isArray) {
        return a
      }
      
      // Vector × Matrix
      if (a.isArray && b.isMatrix && a.arraySize === b.rows) {
        return {
          baseType: a.baseType,
          isArray: true,
          arraySize: b.cols,
          isMatrix: false
        }
      }
      
      // Matrix × Vector
      if (a.isMatrix && b.isArray && a.cols === b.arraySize) {
        return {
          baseType: a.baseType,
          isArray: true,
          arraySize: a.rows,
          isMatrix: false
        }
      }
      
      // Matrix × Matrix
      if (a.isMatrix && b.isMatrix && a.cols === b.rows) {
        return {
          baseType: a.baseType,
          isArray: false,
          isMatrix: true,
          rows: a.rows,
          cols: b.cols
        }
      }
      
      return null
    }
  },
  
  'element_wise': {
    operation: 'element_wise',
    validate: (inputs) => {
      if (inputs.length < 2) {
        return { valid: true } // Single input is always valid
      }
      
      const first = inputs[0]
      const allMatch = inputs.every(t => 
        t.baseType === first.baseType &&
        t.isArray === first.isArray &&
        t.arraySize === first.arraySize &&
        t.isMatrix === first.isMatrix &&
        t.rows === first.rows &&
        t.cols === first.cols
      )
      
      if (!allMatch) {
        return { 
          valid: false, 
          error: 'All inputs must have identical dimensions for element-wise operations' 
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => inputs[0]
  },
  
  'mux': {
    operation: 'mux',
    validate: (inputs) => {
      // All inputs must be scalars of the same type
      if (inputs.length === 0) {
        return { valid: false, error: 'Mux requires at least one input' }
      }
      
      const baseType = inputs[0].baseType
      const allScalars = inputs.every(t => 
        !t.isArray && !t.isMatrix && t.baseType === baseType
      )
      
      if (!allScalars) {
        return { 
          valid: false, 
          error: 'All mux inputs must be scalars of the same type' 
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => {
      // Output type depends on mux configuration, handled elsewhere
      return null
    }
  },
  
  'demux': {
    operation: 'demux',
    validate: (inputs) => {
      if (inputs.length !== 1) {
        return { valid: false, error: 'Demux requires exactly one input' }
      }
      
      const input = inputs[0]
      if (!input.isArray && !input.isMatrix) {
        return { 
          valid: false, 
          error: 'Demux input must be a vector or matrix' 
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => ({
      baseType: inputs[0].baseType,
      isArray: false,
      isMatrix: false
    })
  }
}

/**
 * Validates matrix operation inputs according to rules
 */
export function validateMatrixOperation(
  operation: string,
  inputTypes: string[]
): { valid: boolean; error?: string; outputType?: string } {
  const rule = matrixOperationRules[operation]
  if (!rule) {
    return { valid: false, error: `Unknown operation: ${operation}` }
  }
  
  const parsedInputs = inputTypes.map(type => {
    try {
      return parseType(type)
    } catch {
      return null
    }
  }).filter(t => t !== null) as ParsedType[]
  
  if (parsedInputs.length !== inputTypes.length) {
    return { valid: false, error: 'Invalid input types' }
  }
  
  const validation = rule.validate(parsedInputs)
  if (!validation.valid) {
    return validation
  }
  
  const outputType = rule.getOutputType(parsedInputs)
  if (outputType) {
    return { valid: true, outputType: typeToString(outputType) }
  }
  
  return { valid: true }
}

/**
 * Checks if a source type can be connected to a target type with detailed rules
 */
export function canConnect(
  sourceType: string,
  targetType: string,
  targetBlockType?: string
): { canConnect: boolean; error?: string } {
  try {
    const source = parseType(sourceType)
    const target = parseType(targetType)
    
    // Special cases for specific block types
    if (targetBlockType) {
      switch (targetBlockType) {
        case 'signal_display':
        case 'signal_logger':
          if (source.isMatrix) {
            return {
              canConnect: false,
              error: 'Display blocks cannot accept matrix inputs. Use a demux block to extract individual signals.'
            }
          }
          break
          
        case 'lookup_1d':
        case 'lookup_2d':
          if (source.isMatrix || source.isArray) {
            return {
              canConnect: false,
              error: 'Lookup blocks require scalar inputs'
            }
          }
          break
          
        case 'mux':
          if (source.isMatrix || source.isArray) {
            return {
              canConnect: false,
              error: 'Mux blocks require scalar inputs'
            }
          }
          break
          
        case 'demux':
          if (!source.isMatrix && !source.isArray) {
            return {
              canConnect: false,
              error: 'Demux blocks require vector or matrix inputs'
            }
          }
          break
      }
    }
    
    // General compatibility rules
    if (areTypesCompatible(sourceType, targetType)) {
      return { canConnect: true }
    }
    
    // Get detailed error message
    const error = getTypeCompatibilityError(sourceType, targetType)
    return { canConnect: false, error }
    
  } catch (error) {
    return {
      canConnect: false,
      error: `Invalid type: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Get dimension string for display
 */
export function getDimensionString(typeString: string): string {
  try {
    const parsed = parseType(typeString)
    
    if (parsed.isMatrix) {
      return `${parsed.rows}×${parsed.cols}`
    }
    
    if (parsed.isArray) {
      return `[${parsed.arraySize}]`
    }
    
    return 'scalar'
  } catch {
    return 'invalid'
  }
}

/**
 * Check if two matrix types have compatible dimensions for operations
 */
export function areMatrixDimensionsCompatible(
  type1: string,
  type2: string,
  operation: 'add' | 'multiply' | 'matrix_multiply'
): { compatible: boolean; error?: string } {
  try {
    const parsed1 = parseType(type1)
    const parsed2 = parseType(type2)
    
    // Must have same base type
    if (parsed1.baseType !== parsed2.baseType) {
      return {
        compatible: false,
        error: `Cannot ${operation} ${parsed1.baseType} and ${parsed2.baseType}`
      }
    }
    
    switch (operation) {
      case 'add':
      case 'multiply':
        // Element-wise operations require exact dimension match
        if (parsed1.isMatrix && parsed2.isMatrix) {
          if (parsed1.rows !== parsed2.rows || parsed1.cols !== parsed2.cols) {
            return {
              compatible: false,
              error: `Cannot ${operation} ${parsed1.rows}×${parsed1.cols} and ${parsed2.rows}×${parsed2.cols} matrices - dimensions must match`
            }
          }
        } else if (parsed1.isArray && parsed2.isArray) {
          if (parsed1.arraySize !== parsed2.arraySize) {
            return {
              compatible: false,
              error: `Cannot ${operation} arrays of different sizes: [${parsed1.arraySize}] and [${parsed2.arraySize}]`
            }
          }
        } else if (parsed1.isMatrix !== parsed2.isMatrix || parsed1.isArray !== parsed2.isArray) {
          return {
            compatible: false,
            error: `Cannot ${operation} different types: ${getDimensionString(type1)} and ${getDimensionString(type2)}`
          }
        }
        return { compatible: true }
        
      case 'matrix_multiply':
        // Matrix multiply has special rules
        const result = calculateMatrixMultiplyOutputType(type1, type2)
        if (!result) {
          return {
            compatible: false,
            error: getMatrixMultiplyError(type1, type2)
          }
        }
        return { compatible: true }
        
      default:
        return { compatible: false, error: `Unknown operation: ${operation}` }
    }
  } catch (error) {
    return {
      compatible: false,
      error: error instanceof Error ? error.message : 'Invalid types'
    }
  }
}

/**
 * Matrix-specific validation error types
 */
export enum MatrixErrorType {
  DIMENSION_MISMATCH = 'DIMENSION_MISMATCH',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  INVALID_INPUT = 'INVALID_INPUT',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION'
}

/**
 * Enhanced error message generator for matrix operations
 */
export class MatrixValidationError {
  static dimensionMismatch(
    blockName: string,
    operation: string,
    input1: string,
    input2: string,
    details?: string
  ): string {
    const dim1 = getDimensionString(input1)
    const dim2 = getDimensionString(input2)
    
    switch (operation) {
      case 'add':
      case 'sum':
        return `Cannot add ${dim1} and ${dim2} at ${blockName}. Matrix addition requires identical dimensions.`
        
      case 'multiply':
        return `Cannot element-wise multiply ${dim1} and ${dim2} at ${blockName}. Element-wise operations require identical dimensions.`
        
      case 'matrix_multiply':
        try {
          const p1 = parseType(input1)
          const p2 = parseType(input2)
          
          if (p1.isMatrix && p2.isMatrix) {
            return `Cannot multiply ${p1.rows}×${p1.cols} by ${p2.rows}×${p2.cols} at ${blockName}. ` +
                   `Matrix multiplication requires inner dimensions to match: ` +
                   `first matrix columns (${p1.cols}) must equal second matrix rows (${p2.rows}).`
          } else if (p1.isArray && p2.isMatrix) {
            return `Cannot multiply vector[${p1.arraySize}] by ${p2.rows}×${p2.cols} matrix at ${blockName}. ` +
                   `Vector length (${p1.arraySize}) must match matrix rows (${p2.rows}).`
          } else if (p1.isMatrix && p2.isArray) {
            return `Cannot multiply ${p1.rows}×${p1.cols} matrix by vector[${p2.arraySize}] at ${blockName}. ` +
                   `Matrix columns (${p1.cols}) must match vector length (${p2.arraySize}).`
          }
        } catch {
          // Fallback
        }
        return `Cannot multiply ${dim1} by ${dim2} at ${blockName}. ${details || ''}`
        
      default:
        return `Dimension mismatch for ${operation} at ${blockName}: ${dim1} and ${dim2} are incompatible. ${details || ''}`
    }
  }
  
  static typeMismatch(
    blockName: string,
    expectedType: string,
    actualType: string,
    portName?: string
  ): string {
    const expected = getDimensionString(expectedType)
    const actual = getDimensionString(actualType)
    const port = portName ? ` on port "${portName}"` : ''
    
    try {
      const parsedExpected = parseType(expectedType)
      const parsedActual = parseType(actualType)
      
      if (parsedExpected.isMatrix && !parsedActual.isMatrix) {
        return `${blockName}${port} expects a ${parsedExpected.rows}×${parsedExpected.cols} matrix ` +
               `but received ${actual}.`
      }
      
      if (!parsedExpected.isMatrix && parsedActual.isMatrix) {
        return `${blockName}${port} expects ${expected} ` +
               `but received a ${parsedActual.rows}×${parsedActual.cols} matrix.`
      }
      
      if (parsedExpected.baseType !== parsedActual.baseType) {
        return `${blockName}${port} expects ${parsedExpected.baseType} type ` +
               `but received ${parsedActual.baseType}.`
      }
    } catch {
      // Fallback
    }
    
    return `Type mismatch at ${blockName}${port}: expected ${expected}, got ${actual}.`
  }
  
  static invalidMatrixInput(
    blockName: string,
    blockType: string,
    actualType: string
  ): string {
    const actual = getDimensionString(actualType)
    
    switch (blockType) {
      case 'signal_display':
      case 'signal_logger':
        return `${blockName} cannot display matrix signals (received ${actual}). ` +
               `Use a Demux block to extract individual scalar signals for display.`
        
      case 'lookup_1d':
      case 'lookup_2d':
        return `${blockName} requires scalar inputs but received ${actual}. ` +
               `Lookup tables operate on scalar values only.`
        
      case 'mux':
        return `${blockName} requires scalar inputs but received ${actual}. ` +
               `Mux combines multiple scalar signals into a vector or matrix.`
        
      case 'demux':
        return `${blockName} requires vector or matrix input but received ${actual}. ` +
               `Demux splits a vector or matrix into individual scalar signals.`
        
      default:
        return `${blockName} cannot accept ${actual} input.`
    }
  }
  
  static matrixOperationHint(operation: string): string {
    switch (operation) {
      case 'matrix_multiply':
        return 'Hint: For matrix multiplication A×B, the number of columns in A must equal the number of rows in B. ' +
               'The result will have dimensions (rows of A) × (columns of B).'
        
      case 'element_wise':
        return 'Hint: Element-wise operations (addition, multiplication) require matrices with exactly the same dimensions.'
        
      case 'transpose':
        return 'Hint: Matrix transpose swaps rows and columns. An m×n matrix becomes n×m after transpose.'
        
      default:
        return ''
    }
  }
}

/**
 * Generate helpful suggestions for fixing matrix errors
 */
export function getMatrixErrorSuggestion(
  error: TypePropagationError,
  blocks: BlockData[]
): string | null {
  if (!error.blockId) return null
  
  const block = blocks.find(b => b.id === error.blockId)
  if (!block) return null
  
  // Check for common matrix error patterns
  if (error.message.includes('cannot display matrix')) {
    return 'Solution: Insert a Demux block between the matrix signal and the display block to extract individual elements.'
  }
  
  if (error.message.includes('inner dimensions must match')) {
    return 'Solution: Check matrix dimensions. For A×B multiplication, columns of A must equal rows of B. ' +
           'You may need to transpose one of the matrices.'
  }
  
  if (error.message.includes('dimensions must match') && block.type === 'sum') {
    return 'Solution: Ensure all inputs to the sum block have identical dimensions. ' +
           'Use Scale blocks to resize matrices if needed.'
  }
  
  if (error.message.includes('requires scalar inputs') && block.type === 'mux') {
    return 'Solution: Connect only scalar signals to Mux inputs. ' +
           'If you have a matrix, use a Demux block first to extract scalars.'
  }
  
  return null
}