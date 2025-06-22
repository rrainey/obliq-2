// lib/codegen/CodeGenerationValidator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { BlockCodeGeneratorFactory } from '../blocks/BlockCodeGeneratorFactory'

/**
 * Validation error with severity and details
 */
export interface ValidationError {
  severity: 'error' | 'warning'
  code: string
  message: string
  blockId?: string
  details?: any
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
}

/**
 * Validator for code generation models
 */
export class CodeGenerationValidator {
  private errors: ValidationError[] = []
  private warnings: ValidationError[] = []
  
  /**
   * Validate a flattened model for code generation
   */
  validate(model: FlattenedModel): ValidationResult {
    this.errors = []
    this.warnings = []
    
    // Run all validation checks
    this.validateBlocks(model)
    this.validateConnections(model)
    this.validateEnableSignals(model)
    this.validateDataTypes(model)
    this.validateBlockParameters(model)
    this.validateSignalNames(model)
    
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    }
  }
  
  /**
   * Validate all blocks
   */
  private validateBlocks(model: FlattenedModel): void {
    for (const block of model.blocks) {
      // Check if block type is supported
      if (!BlockCodeGeneratorFactory.isSupported(block.block.type)) {
        // Some blocks don't generate code (like signal_display) - this is OK
        if (!['signal_display', 'signal_logger'].includes(block.block.type)) {
          this.addWarning({
            code: 'UNSUPPORTED_BLOCK',
            message: `Block type '${block.block.type}' is not supported for code generation`,
            blockId: block.originalId,
            details: { blockType: block.block.type, blockName: block.flattenedName }
          })
        }
      }
      
      // Validate block name
      /*
      if (!this.isValidCIdentifier(block.block.name)) {
        this.addError({
          code: 'INVALID_BLOCK_NAME',
          message: `Block name '${block.block.name}' is not a valid C identifier`,
          blockId: block.originalId
        })
      }
        */
      
      // Check for duplicate flattened names
      const duplicates = model.blocks.filter(b => 
        b.flattenedName === block.flattenedName && b.originalId !== block.originalId
      )
      if (duplicates.length > 0) {
        this.addError({
          code: 'DUPLICATE_NAME',
          message: `Duplicate flattened name '${block.flattenedName}'`,
          blockId: block.originalId,
          details: { duplicateIds: duplicates.map(d => d.originalId) }
        })
      }
    }
  }
  
  /**
   * Validate connections
   */
  private validateConnections(model: FlattenedModel): void {
    const blockIds = new Set(model.blocks.map(b => b.originalId))
    
    for (const connection of model.connections) {
      // Check that source and target blocks exist
      if (!blockIds.has(connection.sourceBlockId)) {
        this.addError({
          code: 'INVALID_CONNECTION',
          message: `Connection references non-existent source block '${connection.sourceBlockId}'`,
          details: { connectionId: connection.id }
        })
      }
      
      if (!blockIds.has(connection.targetBlockId)) {
        this.addError({
          code: 'INVALID_CONNECTION',
          message: `Connection references non-existent target block '${connection.targetBlockId}'`,
          details: { connectionId: connection.id }
        })
      }
      
      // Check for multiple connections to same input port
      const targetBlock = model.blocks.find(b => b.originalId === connection.targetBlockId)
      if (targetBlock && connection.targetPortIndex >= 0) {
        const duplicateConnections = model.connections.filter(c => 
          c.targetBlockId === connection.targetBlockId &&
          c.targetPortIndex === connection.targetPortIndex &&
          c.id !== connection.id
        )
        
        if (duplicateConnections.length > 0) {
          this.addError({
            code: 'MULTIPLE_INPUT_CONNECTIONS',
            message: `Multiple connections to input port ${connection.targetPortIndex} of block '${targetBlock.flattenedName}'`,
            blockId: targetBlock.originalId,
            details: { 
              port: connection.targetPortIndex,
              connectionIds: [connection.id, ...duplicateConnections.map(c => c.id)]
            }
          })
        }
      }
    }
    
    // Check for orphaned blocks
    const connectedBlocks = new Set<string>()
    for (const connection of model.connections) {
      connectedBlocks.add(connection.sourceBlockId)
      connectedBlocks.add(connection.targetBlockId)
    }
    
    for (const block of model.blocks) {
      // Some blocks are allowed to have no connections
      const allowedOrphans = ['source', 'input_port', 'output_port', 'signal_display', 'signal_logger']
      
      if (!connectedBlocks.has(block.originalId) && !allowedOrphans.includes(block.block.type)) {
        this.addWarning({
          code: 'ORPHANED_BLOCK',
          message: `Block '${block.flattenedName}' has no connections`,
          blockId: block.originalId
        })
      }
    }
  }
  
  /**
   * Validate enable signals
   */
  private validateEnableSignals(model: FlattenedModel): void {
    for (const enableInfo of model.subsystemEnableInfo) {
      if (enableInfo.hasEnableInput) {
        // Check if enable wire is connected
        if (!enableInfo.enableWire) {
          this.addWarning({
            code: 'UNCONNECTED_ENABLE',
            message: `Subsystem '${enableInfo.subsystemName}' has enable input but no enable wire connected`,
            blockId: enableInfo.subsystemId
          })
        } else {
          // Validate enable signal type
          const sourceBlock = model.blocks.find(b => 
            b.originalId === enableInfo.enableWire!.sourceBlockId
          )
          
          if (sourceBlock) {
            const sourceType = this.getBlockOutputType(sourceBlock)
            if (sourceType !== 'bool' && sourceType !== 'int') {
              this.addWarning({
                code: 'INVALID_ENABLE_TYPE',
                message: `Enable signal for '${enableInfo.subsystemName}' should be bool or int type, got '${sourceType}'`,
                blockId: enableInfo.subsystemId,
                details: { sourceBlock: sourceBlock.flattenedName, sourceType }
              })
            }
          }
        }
      }
    }
  }
  
  /**
   * Validate data types
   */
  private validateDataTypes(model: FlattenedModel): void {
    // This is a placeholder for future type propagation validation
    // For now, just check that input/output ports have valid types
    
    const validTypes = ['bool', 'int', 'long', 'float', 'double']
    const arrayPattern = /^(bool|int|long|float|double)(\[\d+\]){1,2}$/
    
    for (const block of model.blocks) {
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        const dataType = block.block.parameters?.dataType || 'double'
        
        if (!validTypes.includes(dataType) && !arrayPattern.test(dataType)) {
          this.addError({
            code: 'INVALID_DATA_TYPE',
            message: `Invalid data type '${dataType}' for ${block.block.type}`,
            blockId: block.originalId
          })
        }
      }
    }
  }
  
  /**
   * Validate block parameters
   */
  private validateBlockParameters(model: FlattenedModel): void {
    for (const block of model.blocks) {
      switch (block.block.type) {
        case 'transfer_function':
          this.validateTransferFunction(block)
          break
          
        case 'lookup_1d':
          this.validateLookup1D(block)
          break
          
        case 'lookup_2d':
          this.validateLookup2D(block)
          break
          
        case 'scale':
          this.validateScale(block)
          break
          
        case 'source':
          this.validateSource(block)
          break
      }
    }
  }
  
  /**
   * Validate transfer function parameters
   */
  private validateTransferFunction(block: FlattenedBlock): void {
    const params = block.block.parameters || {}
    const numerator = params.numerator || []
    const denominator = params.denominator || []
    
    if (numerator.length === 0) {
      this.addError({
        code: 'INVALID_TF_NUMERATOR',
        message: `Transfer function '${block.flattenedName}' has empty numerator`,
        blockId: block.originalId
      })
    }
    
    if (denominator.length === 0) {
      this.addError({
        code: 'INVALID_TF_DENOMINATOR',
        message: `Transfer function '${block.flattenedName}' has empty denominator`,
        blockId: block.originalId
      })
    }
    
    if (denominator.length > 0 && Math.abs(denominator[0]) < 1e-10) {
      this.addError({
        code: 'INVALID_TF_DENOMINATOR',
        message: `Transfer function '${block.flattenedName}' has near-zero leading denominator coefficient`,
        blockId: block.originalId
      })
    }
  }
  
  /**
   * Validate 1D lookup parameters
   */
  private validateLookup1D(block: FlattenedBlock): void {
    const params = block.block.parameters || {}
    const inputValues = params.inputValues || []
    const outputValues = params.outputValues || []
    
    if (inputValues.length !== outputValues.length) {
      this.addError({
        code: 'LOOKUP_SIZE_MISMATCH',
        message: `Lookup table '${block.flattenedName}' has mismatched input/output sizes`,
        blockId: block.originalId,
        details: { inputSize: inputValues.length, outputSize: outputValues.length }
      })
    }
    
    if (inputValues.length < 2) {
      this.addError({
        code: 'LOOKUP_TOO_SMALL',
        message: `Lookup table '${block.flattenedName}' needs at least 2 points`,
        blockId: block.originalId
      })
    }
    
    // Check that input values are monotonic
    for (let i = 1; i < inputValues.length; i++) {
      if (inputValues[i] <= inputValues[i-1]) {
        this.addError({
          code: 'LOOKUP_NOT_MONOTONIC',
          message: `Lookup table '${block.flattenedName}' input values must be strictly increasing`,
          blockId: block.originalId
        })
        break
      }
    }
  }
  
  /**
   * Validate 2D lookup parameters
   */
  private validateLookup2D(block: FlattenedBlock): void {
    const params = block.block.parameters || {}
    const input1Values = params.input1Values || []
    const input2Values = params.input2Values || []
    const outputTable = params.outputTable || []
    
    if (outputTable.length !== input1Values.length) {
      this.addError({
        code: 'LOOKUP2D_SIZE_MISMATCH',
        message: `2D lookup table '${block.flattenedName}' table rows don't match input1 size`,
        blockId: block.originalId
      })
    }
    
    for (let i = 0; i < outputTable.length; i++) {
      if (!Array.isArray(outputTable[i]) || outputTable[i].length !== input2Values.length) {
        this.addError({
          code: 'LOOKUP2D_SIZE_MISMATCH',
          message: `2D lookup table '${block.flattenedName}' row ${i} size doesn't match input2 size`,
          blockId: block.originalId
        })
        break
      }
    }
  }
  
  /**
   * Validate scale block parameters
   */
  private validateScale(block: FlattenedBlock): void {
    const gain = block.block.parameters?.gain
    
    if (gain === undefined || gain === null) {
      this.addError({
        code: 'MISSING_PARAMETER',
        message: `Scale block '${block.flattenedName}' missing gain parameter`,
        blockId: block.originalId
      })
    }
  }
  
  /**
   * Validate source block parameters
   */
  private validateSource(block: FlattenedBlock): void {
    const sourceType = block.block.parameters?.sourceType || 'constant'
    
    if (sourceType === 'constant') {
      const value = block.block.parameters?.value
      if (value === undefined || value === null) {
        this.addError({
          code: 'MISSING_PARAMETER',
          message: `Source block '${block.flattenedName}' missing value parameter`,
          blockId: block.originalId
        })
      }
    }
  }
  
  /**
   * Validate signal names
   */
  private validateSignalNames(model: FlattenedModel): void {
    const signalNames = new Set<string>()
    
    for (const block of model.blocks) {
      // Check port names
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
        const portName = block.block.parameters?.portName
        
        if (!portName) {
          this.addError({
            code: 'MISSING_PORT_NAME',
            message: `${block.block.type} '${block.flattenedName}' missing port name`,
            blockId: block.originalId
          })
        } else if (!this.isValidCIdentifier(portName)) {
          this.addError({
            code: 'INVALID_PORT_NAME',
            message: `Port name '${portName}' is not a valid C identifier`,
            blockId: block.originalId
          })
        } else if (signalNames.has(portName)) {
          this.addError({
            code: 'DUPLICATE_PORT_NAME',
            message: `Duplicate port name '${portName}'`,
            blockId: block.originalId
          })
        } else {
          signalNames.add(portName)
        }
      }
    }
  }
  
  /**
   * Check if a string is a valid C identifier
   */
  private isValidCIdentifier(name: string): boolean {
    if (!name || name.length === 0) return false
    
    // Must start with letter or underscore
    if (!/^[a-zA-Z_]/.test(name)) return false
    
    // Must contain only letters, numbers, and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false
    
    // Check C keywords
    const cKeywords = [
      'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
      'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
      'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
      'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while'
    ]
    
    return !cKeywords.includes(name)
  }
  
  /**
   * Get output type for a block (simplified)
   */
  private getBlockOutputType(block: FlattenedBlock): string {
    // This is a simplified version - full type propagation would be more complex
    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType
    
    switch (block.block.type) {
      case 'source':
      case 'input_port':
        return block.block.parameters?.dataType || 'double'
      default:
        return 'double'
    }
  }
  
  /**
   * Add an error
   */
  private addError(error: Omit<ValidationError, 'severity'>): void {
    this.errors.push({ ...error, severity: 'error' })
  }
  
  /**
   * Add a warning
   */
  private addWarning(warning: Omit<ValidationError, 'severity'>): void {
    this.warnings.push({ ...warning, severity: 'warning' })
  }
}