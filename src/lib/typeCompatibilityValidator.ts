// lib/typeCompatibilityValidator.ts

import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { parseType, ParsedType, areTypesCompatible } from './typeValidator'
import { propagateSignalTypes, TypePropagationResult, propagateSignalTypesMultiSheet } from './signalTypePropagation'
import { validateSheetLabels } from './sheetLabelUtils'

/**
 * Type compatibility validation error
 */
export interface TypeCompatibilityError {
  wireId?: string
  blockId?: string
  sourceBlockId?: string
  targetBlockId?: string
  message: string
  severity: 'error' | 'warning'
  details?: {
    expectedType?: string
    actualType?: string
    sourceType?: string
    targetType?: string
  }
}

/**
 * Result of type compatibility validation
 */
export interface TypeCompatibilityResult {
  isValid: boolean
  errors: TypeCompatibilityError[]
  warnings: TypeCompatibilityError[]
}

export interface ModelValidationResult {
  errors: TypeCompatibilityError[]
  warnings: TypeCompatibilityError[]
  valid: boolean
}

/**
 * Performs complete model validation including type compatibility and sheet labels
 */
export function validateModel(
  blocks: BlockData[],
  wires: WireData[]
): ModelValidationResult {
  // Run type compatibility validation
  const typeResult = validateModelTypeCompatibility(blocks, wires)
  
  // Run sheet label validation
  const sheetLabelIssues = validateSheetLabels(blocks)
  
  // Convert sheet label issues to type compatibility format
  const sheetLabelErrors: TypeCompatibilityError[] = sheetLabelIssues.map(issue => ({
    type: issue.type === 'empty_signal_name' ? 'warning' : 'error',
    message: issue.message,
    location: issue.blockName,
    blockId: issue.blockId,
    wireId: undefined,
    severity: (issue.type === 'empty_signal_name' ? 'warning' : 'error') as 'error' | 'warning',
    details: issue.signalName ? {
      expectedType: issue.type === 'unmatched_source' ? 'Existing Sheet Label Sink' : 'Unique Signal Name',
      actualType: issue.type === 'duplicate_sink' ? 'Duplicate' : issue.type === 'unmatched_source' ? 'None' : 'Empty',
      sourceType: undefined,
      targetType: undefined
    } : undefined
  }))
  
  // Combine results
  return {
    errors: [...typeResult.errors, ...sheetLabelErrors.filter(e => e.severity === 'error')],
    warnings: [...typeResult.warnings, ...sheetLabelErrors.filter(e => e.severity === 'warning')],
    valid: typeResult.errors.length === 0 && sheetLabelErrors.filter(e => e.severity === 'error').length === 0
  }
}

/**
 * Validates type compatibility for all connections in a model
 */
export function validateModelTypeCompatibility(
  blocks: BlockData[],
  wires: WireData[]
): TypeCompatibilityResult {
  const errors: TypeCompatibilityError[] = []
  const warnings: TypeCompatibilityError[] = []
  
  // First, propagate types through the model
  const propagationResult = propagateSignalTypes(blocks, wires)
  
  // Add any propagation errors
  for (const propError of propagationResult.errors) {
    if (propError.severity === 'error') {
      errors.push(propError)
    } else {
      warnings.push(propError)
    }
  }
  
  // Create block map for quick lookup
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  
  // Validate each wire connection
  for (const wire of wires) {
    const sourceBlock = blockMap.get(wire.sourceBlockId)
    const targetBlock = blockMap.get(wire.targetBlockId)
    
    if (!sourceBlock || !targetBlock) {
      errors.push({
        wireId: wire.id,
        message: `Invalid connection: Missing source or target block`,
        severity: 'error'
      })
      continue
    }
    
    // Get the signal type for this wire
    const signalType = propagationResult.signalTypes.get(wire.id)
    if (!signalType) {
      warnings.push({
        wireId: wire.id,
        sourceBlockId: sourceBlock.id,
        targetBlockId: targetBlock.id,
        message: `Unable to determine signal type for connection from ${sourceBlock.name} to ${targetBlock.name}`,
        severity: 'warning'
      })
      continue
    }
    
    // Validate based on target block requirements
    const validationError = validateBlockInputType(
      targetBlock,
      wire.targetPortIndex,
      signalType.type,
      sourceBlock
    )
    
    if (validationError) {
      errors.push({
        ...validationError,
        wireId: wire.id,
        sourceBlockId: sourceBlock.id,
        targetBlockId: targetBlock.id
      })
    }
  }
  
  // Validate multi-input blocks (Sum, Multiply)
  for (const block of blocks) {
    if (['sum', 'multiply'].includes(block.type)) {
      const inputErrors = validateMultiInputBlock(block, wires, propagationResult)
      errors.push(...inputErrors)
    }
  }
  
  // Validate lookup blocks for scalar inputs
  for (const block of blocks) {
    if (['lookup_1d', 'lookup_2d'].includes(block.type)) {
      const lookupErrors = validateLookupBlock(block, wires, propagationResult)
      errors.push(...lookupErrors)
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// lib/typeCompatibilityValidator.ts
// Fix the error objects by removing the 'type' property

export function validateModelTypeCompatibilityMultiSheet(
  sheets: Array<{ blocks: BlockData[], connections: WireData[] }>
): ModelValidationResult {
  const allErrors: TypeCompatibilityError[] = []
  const allWarnings: TypeCompatibilityError[] = []
  
  // Use multi-sheet type propagation
  const typeResult = propagateSignalTypesMultiSheet(sheets)
  
  // Process type propagation errors
  for (const error of typeResult.errors) {
    allErrors.push({
      message: error.message,
      blockId: error.blockId,
      wireId: error.wireId,
      severity: 'error'
    })
  }
  
  // Check each sheet's connections for type compatibility
  for (const sheet of sheets) {
    for (const wire of sheet.connections) {
      const signalType = typeResult.signalTypes.get(wire.id)
      
      if (!signalType) {
        // Unable to determine type
        const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
        const targetBlock = sheet.blocks.find(b => b.id === wire.targetBlockId)
        
        if (sourceBlock && targetBlock) {
          allWarnings.push({
            message: `Unable to determine signal type for connection from ${sourceBlock.name} to ${targetBlock.name}`,
            wireId: wire.id,
            severity: 'warning'
          })
        }
      }
    }
  }
  
  // Validate sheet labels across all sheets
  const allBlocks = sheets.flatMap(s => s.blocks)
  const sheetLabelIssues = validateSheetLabels(allBlocks)
  
  // Convert sheet label issues to TypeCompatibilityError format
  const sheetLabelErrors: TypeCompatibilityError[] = sheetLabelIssues.map(issue => ({
    message: issue.message,
    location: issue.blockName,
    blockId: issue.blockId,
    wireId: undefined,
    severity: (issue.type === 'empty_signal_name' ? 'warning' : 'error') as 'error' | 'warning',
    details: issue.signalName ? {
      expectedType: issue.type === 'unmatched_source' ? 'Existing Sheet Label Sink' : 'Unique Signal Name',
      actualType: issue.type === 'duplicate_sink' ? 'Duplicate' : issue.type === 'unmatched_source' ? 'None' : 'Empty',
      sourceType: undefined,
      targetType: undefined
    } : undefined
  }))
  
  // Separate errors and warnings
  allErrors.push(...sheetLabelErrors.filter(e => e.severity === 'error'))
  allWarnings.push(...sheetLabelErrors.filter(e => e.severity === 'warning'))
  
  return {
    errors: allErrors,
    warnings: allWarnings,
    valid: allErrors.length === 0
  }
}

/**
 * Validates that a block can accept the given input type
 */
function validateBlockInputType(
  block: BlockData,
  portIndex: number,
  inputType: string,
  sourceBlock: BlockData
): TypeCompatibilityError | null {
  let parsedInputType: ParsedType
  
  try {
    parsedInputType = parseType(inputType)
  } catch {
    return {
      blockId: block.id,
      message: `Invalid input type: ${inputType}`,
      severity: 'error',
      details: { actualType: inputType }
    }
  }
  
  switch (block.type) {
    case 'lookup_1d':
    case 'lookup_2d':
      // Lookup blocks only accept scalars
      if (parsedInputType.isArray) {
        return {
          blockId: block.id,
          message: `${block.name} requires scalar inputs but received array type ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: parsedInputType.baseType,
            actualType: inputType
          }
        }
      }
      break
      
    case 'sum':
    case 'multiply':
      // These blocks require all inputs to have the same type
      // This is validated separately in validateMultiInputBlock
      break
      
    case 'scale':
    case 'transfer_function':
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
      // These blocks accept any numeric type (scalar or vector)
      if (parsedInputType.baseType === 'bool' && block.type !== 'signal_display' && block.type !== 'signal_logger') {
        return {
          blockId: block.id,
          message: `${block.name} cannot process boolean signals`,
          severity: 'error',
          details: {
            expectedType: 'numeric type (float, double, long)',
            actualType: inputType
          }
        }
      }
      break
  }
  
  return null
}

/**
 * Validates that all inputs to a multi-input block have the same type
 */
function validateMultiInputBlock(
  block: BlockData,
  wires: WireData[],
  propagationResult: TypePropagationResult
): TypeCompatibilityError[] {
  const errors: TypeCompatibilityError[] = []
  
  // Get all input wires for this block
  const inputWires = wires.filter(w => w.targetBlockId === block.id)
  
  if (inputWires.length < 2) {
    // No type mismatch possible with less than 2 inputs
    return errors
  }
  
  // Get types of all inputs
  const inputTypes: { wire: WireData; type: string; parsed: ParsedType }[] = []
  
  for (const wire of inputWires) {
    const signalType = propagationResult.signalTypes.get(wire.id)
    if (signalType) {
      try {
        const parsed = parseType(signalType.type)
        inputTypes.push({ wire, type: signalType.type, parsed })
      } catch {
        // Invalid type, already reported elsewhere
      }
    }
  }
  
  if (inputTypes.length < 2) {
    return errors
  }
  
  // Check that all types match
  const firstType = inputTypes[0]
  const mismatchedTypes: string[] = []
  
  for (let i = 1; i < inputTypes.length; i++) {
    const currentType = inputTypes[i]
    
    if (!areTypesCompatible(firstType.type, currentType.type)) {
      if (!mismatchedTypes.includes(currentType.type)) {
        mismatchedTypes.push(currentType.type)
      }
    }
  }
  
  if (mismatchedTypes.length > 0) {
    const allTypes = [firstType.type, ...mismatchedTypes]
    errors.push({
      blockId: block.id,
      message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${allTypes.join(', ')}`,
      severity: 'error',
      details: {
        expectedType: firstType.type,
        actualType: mismatchedTypes.join(', ')
      }
    })
  }
  
  return errors
}

/**
 * Validates that lookup blocks only receive scalar inputs
 */
function validateLookupBlock(
  block: BlockData,
  wires: WireData[],
  propagationResult: TypePropagationResult
): TypeCompatibilityError[] {
  const errors: TypeCompatibilityError[] = []
  
  // Get all input wires for this block
  const inputWires = wires.filter(w => w.targetBlockId === block.id)
  
  for (const wire of inputWires) {
    const signalType = propagationResult.signalTypes.get(wire.id)
    if (signalType) {
      try {
        const parsed = parseType(signalType.type)
        if (parsed.isArray) {
          // Find source block for better error message
          const sourceBlock = propagationResult.signalTypes.get(wire.id)?.sourceBlockId
          
          errors.push({
            blockId: block.id,
            wireId: wire.id,
            sourceBlockId: sourceBlock,
            message: `${block.name} requires scalar inputs but received array type: ${signalType.type}`,
            severity: 'error',
            details: {
              expectedType: `scalar ${parsed.baseType}`,
              actualType: signalType.type
            }
          })
        }
      } catch {
        // Invalid type, already reported elsewhere
      }
    }
  }
  
  return errors
}

/**
 * Gets a human-readable description of type compatibility errors
 */
export function formatTypeError(error: TypeCompatibilityError): string {
  let message = error.message
  
  if (error.details) {
    if (error.details.expectedType && error.details.actualType) {
      message += ` (expected: ${error.details.expectedType}, actual: ${error.details.actualType})`
    } else if (error.details.sourceType && error.details.targetType) {
      message += ` (source: ${error.details.sourceType}, target: ${error.details.targetType})`
    }
  }
  
  return message
}

/**
 * Validates a single wire connection
 */
export function validateWireConnection(
  sourceBlock: BlockData,
  sourcePortIndex: number,
  targetBlock: BlockData,
  targetPortIndex: number,
  sourceType: string
): TypeCompatibilityError | null {
  // First check if the connection makes sense structurally
  if (targetBlock.type === 'source' || targetBlock.type === 'input_port') {
    return {
      sourceBlockId: sourceBlock.id,
      targetBlockId: targetBlock.id,
      message: `Cannot connect to ${targetBlock.name}: ${targetBlock.type} blocks have no inputs`,
      severity: 'error'
    }
  }
  
  if (sourceBlock.type === 'output_port' || sourceBlock.type === 'signal_display' || sourceBlock.type === 'signal_logger') {
    return {
      sourceBlockId: sourceBlock.id,
      targetBlockId: targetBlock.id,
      message: `Cannot connect from ${sourceBlock.name}: ${sourceBlock.type} blocks have no outputs`,
      severity: 'error'
    }
  }
  
  // Validate the type compatibility
  return validateBlockInputType(targetBlock, targetPortIndex, sourceType, sourceBlock)
}

/**
 * Checks if a block operation is valid for the given input types
 */
export function validateBlockOperation(
  block: BlockData,
  inputTypes: string[]
): TypeCompatibilityError | null {
  switch (block.type) {
    case 'sum':
    case 'multiply':
      // All inputs must be the same type
      if (inputTypes.length > 1) {
        const firstType = inputTypes[0]
        for (let i = 1; i < inputTypes.length; i++) {
          if (!areTypesCompatible(firstType, inputTypes[i])) {
            return {
              blockId: block.id,
              message: `${block.name} requires all inputs to have the same type`,
              severity: 'error',
              details: {
                expectedType: firstType,
                actualType: inputTypes[i]
              }
            }
          }
        }
      }
      break
      
    case 'lookup_1d':
    case 'lookup_2d':
      // Must have scalar inputs
      for (let i = 0; i < inputTypes.length; i++) {
        try {
          const parsed = parseType(inputTypes[i])
          if (parsed.isArray) {
            return {
              blockId: block.id,
              message: `${block.name} requires scalar inputs`,
              severity: 'error',
              details: {
                expectedType: `scalar ${parsed.baseType}`,
                actualType: inputTypes[i]
              }
            }
          }
        } catch {
          return {
            blockId: block.id,
            message: `Invalid input type for ${block.name}`,
            severity: 'error'
          }
        }
      }
      break
  }
  
  return null
}