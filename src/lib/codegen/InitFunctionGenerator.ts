// lib/codegen/InitFunctionGenerator.ts

import { FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Generates the initialization function for a flattened model
 */
export class InitFunctionGenerator {
  private model: FlattenedModel
  private modelName: string
  
  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
  }
  
  /**
   * Generate the complete initialization function
   */
  generate(): string {
    let code = CCodeBuilder.generateCommentBlock([
      'Initialize model with given time step',
      'Sets all states and signals to their initial values'
    ])
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_init`,
      [`${this.modelName}_t* model`, 'double dt']
    )
    
    // Initialize time tracking
    code += this.generateTimeInit()
    
    // Initialize all structures to zero
    code += this.generateStructureInit()
    
    // Initialize enable states
    if (this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      code += this.generateEnableStateInit()
    }
    
    // Initialize block-specific states
    code += this.generateBlockSpecificInit()
    
    // Initialize constants and source blocks
    code += this.generateConstantInit()
    
    code += '}\n'
    return code
  }
  
  /**
   * Generate time initialization
   */
  private generateTimeInit(): string {
    return `    /* Initialize time tracking */
    model->time = 0.0;
    model->dt = dt;
    
`
  }
  
  /**
   * Generate structure initialization (zero all memory)
   */
  private generateStructureInit(): string {
    return `    /* Zero all structures */
    memset(&model->inputs, 0, sizeof(model->inputs));
    memset(&model->outputs, 0, sizeof(model->outputs));
    memset(&model->signals, 0, sizeof(model->signals));
    memset(&model->states, 0, sizeof(model->states));
    
`
  }
  
  /**
   * Generate enable state initialization
   */
  private generateEnableStateInit(): string {
    let code = CCodeBuilder.generateEnableStateInit(this.model.subsystemEnableInfo)
    if (code) {
      code = '\n' + code + '\n'
    }
    return code
  }
  
  /**
   * Generate block-specific initialization
   */
  private generateBlockSpecificInit(): string {
    let code = ''
    let hasBlockInit = false
    
    for (const block of this.model.blocks) {
      try {
        const generator = BlockModuleFactory.getModuleGenerator(block.block.type)
        
        // Check if this block type has initialization
        if (generator.generateInitialization) {
          const initCode = generator.generateInitialization(block.block)
          if (initCode && initCode.trim()) {
            if (!hasBlockInit) {
              code += '    /* Initialize block-specific states */\n'
              hasBlockInit = true
            }
            
            // Add comment about which block
            if (block.subsystemPath.length > 0) {
              code += `    /* ${block.flattenedName} (from ${block.subsystemPath.join(' > ')}) */\n`
            } else {
              code += `    /* ${block.flattenedName} */\n`
            }
            
            code += initCode
            code += '\n'
          }
        }
      } catch (error) {
        // Block type not supported for code generation
        continue
      }
    }
    
    if (hasBlockInit) {
      code += '\n'
    }
    
    return code
  }
  
  /**
   * Generate initialization for constant sources
   */
  private generateConstantInit(): string {
    let code = ''
    let hasConstants = false
    
    // Find all source blocks with constant values
    const sourceBlocks = this.model.blocks.filter(b => b.block.type === 'source')
    
    for (const block of sourceBlocks) {
      const sourceType = block.block.parameters?.sourceType || 'constant'
      
      if (sourceType === 'constant') {
        const value = block.block.parameters?.value || '0.0'
        const dataType = block.block.parameters?.dataType || 'double'
        const signalName = `model->signals.${CCodeBuilder.sanitizeIdentifier(block.block.name)}`
        
        if (!hasConstants) {
          code += '    /* Initialize constant sources */\n'
          hasConstants = true
        }
        
        // Check if it's an array/matrix type
        const arrayMatch = dataType.match(/\[([\d\s,\[\]]+)\]/)
        if (arrayMatch) {
          // Array or matrix constant
          code += this.generateArrayConstantInit(signalName, value, dataType, block.flattenedName)
        } else {
          // Scalar constant
          code += `    ${signalName} = ${value}; /* ${block.flattenedName} */\n`
        }
      }
    }
    
    if (hasConstants) {
      code += '\n'
    }
    
    return code
  }
  
  /**
   * Generate initialization for array/matrix constants
   */
  private generateArrayConstantInit(
    signalName: string,
    value: string,
    dataType: string,
    blockName: string
  ): string {
    let code = `    /* Initialize ${blockName} (${dataType}) */\n`
    
    // Parse the array value
    try {
      // Handle different formats: [1,2,3] or [[1,2],[3,4]] etc.
      const parsedValue = this.parseArrayValue(value)
      
      if (Array.isArray(parsedValue)) {
        // Determine dimensions
        const dims = this.getArrayDimensions(parsedValue)
        
        if (dims.length === 1) {
          // 1D array
          code += `    {\n`
          code += `        const double init_values[] = ${CCodeBuilder.generateArrayInitializer(parsedValue.flat())};\n`
          code += `        memcpy(${signalName}, init_values, sizeof(init_values));\n`
          code += `    }\n`
        } else if (dims.length === 2) {
          // 2D array (matrix)
          code += `    {\n`
          for (let i = 0; i < dims[0]; i++) {
            for (let j = 0; j < dims[1]; j++) {
              const val = (parsedValue[i] && parsedValue[i][j]) || 0
              code += `        ${signalName}[${i}][${j}] = ${val};\n`
            }
          }
          code += `    }\n`
        }
      }
    } catch (error) {
      // If parsing fails, initialize to zero (already done by memset)
      code += `    /* Error parsing array value - initialized to zero */\n`
    }
    
    return code
  }
  
  /**
   * Parse array value string into nested array
   */
  private parseArrayValue(value: string): any {
    try {
      // Remove any C-style type casting or suffixes
      const cleaned = value.replace(/[fdlLuU]/g, '')
      
      // Try to parse as JSON
      return JSON.parse(cleaned)
    } catch {
      // If not valid JSON, try to parse manually
      // This is a simplified parser for C-style array literals
      return this.parseSimpleArray(value)
    }
  }
  
  /**
   * Simple parser for C-style array literals
   */
  private parseSimpleArray(value: string): any {
    // Remove outer braces and split by comma
    const trimmed = value.trim().replace(/^\{|\}$/g, '')
    
    if (trimmed.includes('{')) {
      // Nested array (matrix)
      const rows = trimmed.split(/\},\s*\{/).map(row => 
        row.replace(/^\{|\}$/g, '').split(',').map(v => parseFloat(v.trim()))
      )
      return rows
    } else {
      // Simple array
      return trimmed.split(',').map(v => parseFloat(v.trim()))
    }
  }
  
  /**
   * Get dimensions of a nested array
   */
  private getArrayDimensions(arr: any): number[] {
    const dims: number[] = []
    let current = arr
    
    while (Array.isArray(current)) {
      dims.push(current.length)
      current = current[0]
    }
    
    return dims
  }
}