// lib/typeCompatibilityValidator.ts

import { BlockData } from '@/components/BlockNode'
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
    
    // Validate vector operation blocks
    for (const block of blocks) {
      if (['cross', 'dot'].includes(block.type)) {
        const vectorErrors = validateVectorOperationBlock(block, wires, propagationResult)
        errors.push(...vectorErrors)
      }
    }
    
    // Validate if blocks
    for (const block of blocks) {
      if (block.type === 'if') {
        const ifErrors = validateIfBlock(block, wires, propagationResult)
        errors.push(...ifErrors)
      }
    }
    
    // Validate matrix multiply blocks
    for (const block of blocks) {
      if (block.type === 'matrix_multiply') {
        const matrixErrors = validateMatrixMultiplyBlock(block, wires, propagationResult)
        errors.push(...matrixErrors)
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
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
      if (parsedInputType.isArray || parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires scalar inputs but received ${inputType} from ${sourceBlock.name}`,
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

    case 'transpose':
      // Transpose accepts vectors or matrices (not scalars)
      // Actually, we'll allow scalars too - they just pass through
      if (parsedInputType.baseType === 'bool') {
        return {
          blockId: block.id,
          message: `${block.name} cannot process boolean signals`,
          severity: 'error',
          details: {
            expectedType: 'numeric vector or matrix',
            actualType: inputType
          }
        }
      }
      break;

    case 'abs':
      // Absolute value only accepts scalar inputs
      if (parsedInputType.isArray || parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires scalar input but received ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: parsedInputType.baseType,
            actualType: inputType
          }
        }
      }
      break;

    case 'uminus':
      // Unary minus accepts any numeric type (scalar, vector, or matrix)
      if (parsedInputType.baseType === 'bool') {
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
      break;
      
    case 'trig':
      // Trig blocks only accept scalar double inputs
      if (parsedInputType.isArray || parsedInputType.isMatrix || parsedInputType.baseType !== 'double') {
        const func = block.parameters?.function || 'sin'
        const expectedPorts = func === 'atan2' ? 2 : 1
        
        return {
          blockId: block.id,
          message: `${block.name} (${func}) requires scalar double inputs but received ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: 'double',
            actualType: inputType
          }
        }
      }
      break
      
    case 'cross':
      // Cross product requires vector inputs (not scalars or matrices)
      if (!parsedInputType.isArray || parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires vector inputs but received ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: 'vector (double[n])',
            actualType: inputType
          }
        }
      }
      // Must be 2D or 3D vectors
      if (parsedInputType.arraySize !== 2 && parsedInputType.arraySize !== 3) {
        return {
          blockId: block.id,
          message: `${block.name} requires 2D or 3D vectors but received ${parsedInputType.arraySize}D vector from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: 'double[2] or double[3]',
            actualType: inputType
          }
        }
      }
      break
      
    case 'dot':
      // Dot product requires vector inputs of the same dimension
      if (!parsedInputType.isArray || parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires vector inputs but received ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: 'vector (double[n])',
            actualType: inputType
          }
        }
      }
      break
      
    case 'mag':
      // Magnitude requires vector input
      if (!parsedInputType.isArray || parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires vector input but received ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: 'vector (double[n])',
            actualType: inputType
          }
        }
      }
      break
      
    case 'if':
      // If block requires:
      // - Port 0 (input1) and Port 2 (input2) must have matching types
      // - Port 1 (control) should be scalar (bool or numeric)
      if (portIndex === 1) {
        // Control input should be scalar
        if (parsedInputType.isArray || parsedInputType.isMatrix) {
          return {
            blockId: block.id,
            message: `${block.name} control input must be scalar but received ${inputType} from ${sourceBlock.name}`,
            severity: 'error',
            details: {
              expectedType: 'scalar (bool or numeric)',
              actualType: inputType
            }
          }
        }
      }
      // For ports 0 and 2, type matching is validated separately
      break
      
    case 'matrix_multiply':
      // Matrix multiply can accept scalars, vectors, or matrices
      // Dimension compatibility is checked separately
      break
      
    case 'mux':
      // Mux only accepts scalar inputs
      if (parsedInputType.isArray || parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires scalar inputs but received ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: parsedInputType.baseType,
            actualType: inputType
          }
        }
      }
      break
      
    case 'demux':
      // Demux requires vector or matrix input
      if (!parsedInputType.isArray && !parsedInputType.isMatrix) {
        return {
          blockId: block.id,
          message: `${block.name} requires vector or matrix input but received scalar ${inputType} from ${sourceBlock.name}`,
          severity: 'error',
          details: {
            expectedType: 'vector or matrix',
            actualType: inputType
          }
        }
      }
      break
      
    case 'scale':
    case 'transfer_function':
    case 'signal_display':
    case 'signal_logger':
    case 'output_port':
    case 'sheet_label_sink':
    case 'sheet_label_source':
      // These blocks accept any numeric type (scalar, vector, or matrix)
      if (parsedInputType.baseType === 'bool' && 
          block.type !== 'signal_display' && 
          block.type !== 'signal_logger' &&
          block.type !== 'output_port' &&
          block.type !== 'sheet_label_sink') {
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

/**
 * Validates that vector operation blocks have matching input dimensions
 */
function validateVectorOperationBlock(
  block: BlockData,
  wires: WireData[],
  propagationResult: TypePropagationResult
): TypeCompatibilityError[] {
  const errors: TypeCompatibilityError[] = []
  
  if (block.type === 'cross' || block.type === 'dot') {
    // Get input wires
    const inputWires = wires.filter(w => w.targetBlockId === block.id)
    
    if (inputWires.length === 2) {
      const type1 = propagationResult.signalTypes.get(inputWires[0].id)?.type
      const type2 = propagationResult.signalTypes.get(inputWires[1].id)?.type
      
      if (type1 && type2) {
        try {
          const parsed1 = parseType(type1)
          const parsed2 = parseType(type2)
          
          // Check dimensions match
          if (parsed1.arraySize !== parsed2.arraySize) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires vectors of same dimension. Input 1: ${type1}, Input 2: ${type2}`,
              severity: 'error',
              details: {
                expectedType: type1,
                actualType: type2
              }
            })
          }
        } catch {
          // Type parsing error handled elsewhere
        }
      }
    }
  }
  
  return errors
}

/**
 * Validates that if block has matching types for input1 and input2
 */
function validateIfBlock(
  block: BlockData,
  wires: WireData[],
  propagationResult: TypePropagationResult
): TypeCompatibilityError[] {
  const errors: TypeCompatibilityError[] = []
  
  if (block.type !== 'if') return errors
  
  // Get input wires
  const inputWires = wires.filter(w => w.targetBlockId === block.id)
  
  // Find wires for port 0 (input1) and port 2 (input2)
  const input1Wire = inputWires.find(w => w.targetPortIndex === 0)
  const input2Wire = inputWires.find(w => w.targetPortIndex === 2)
  
  if (input1Wire && input2Wire) {
    const type1 = propagationResult.signalTypes.get(input1Wire.id)?.type
    const type2 = propagationResult.signalTypes.get(input2Wire.id)?.type
    
    if (type1 && type2 && !areTypesCompatible(type1, type2)) {
      errors.push({
        blockId: block.id,
        message: `${block.name} requires input1 and input2 to have matching types. Input1: ${type1}, Input2: ${type2}`,
        severity: 'error',
        details: {
          expectedType: type1,
          actualType: type2
        }
      })
    }
  }
  
  return errors
}

/**
 * Validates matrix multiply dimension compatibility
 */
function validateMatrixMultiplyBlock(
  block: BlockData,
  wires: WireData[],
  propagationResult: TypePropagationResult
): TypeCompatibilityError[] {
  const errors: TypeCompatibilityError[] = []
  
  if (block.type !== 'matrix_multiply') return errors
  
  const inputWires = wires.filter(w => w.targetBlockId === block.id)
  
  if (inputWires.length === 2) {
    const type1 = propagationResult.signalTypes.get(inputWires[0].id)?.type
    const type2 = propagationResult.signalTypes.get(inputWires[1].id)?.type
    
    if (type1 && type2) {
      try {
        const parsed1 = parseType(type1)
        const parsed2 = parseType(type2)
        
        // Validate dimension compatibility for matrix multiplication
        if (parsed1.isMatrix && parsed2.isMatrix) {
          // Matrix × Matrix: inner dimensions must match
          if (parsed1.cols !== parsed2.rows) {
            errors.push({
              blockId: block.id,
              message: `${block.name}: Matrix dimensions incompatible. ${type1} × ${type2} requires inner dimensions to match`,
              severity: 'error',
              details: {
                expectedType: `${parsed1.baseType}[${parsed1.rows}][${parsed2.cols}]`,
                actualType: 'incompatible dimensions'
              }
            })
          }
        } else if (parsed1.isArray && parsed2.isMatrix) {
          // Vector × Matrix: vector size must match matrix rows
          if (parsed1.arraySize !== parsed2.rows) {
            errors.push({
              blockId: block.id,
              message: `${block.name}: Vector-matrix dimensions incompatible. ${type1} × ${type2}`,
              severity: 'error'
            })
          }
        } else if (parsed1.isMatrix && parsed2.isArray) {
          // Matrix × Vector: matrix cols must match vector size
          if (parsed1.cols !== parsed2.arraySize) {
            errors.push({
              blockId: block.id,
              message: `${block.name}: Matrix-vector dimensions incompatible. ${type1} × ${type2}`,
              severity: 'error'
            })
          }
        }
        // Scalar × anything is always valid
      } catch {
        // Type parsing error handled elsewhere
      }
    }
  }
  
  return errors
}