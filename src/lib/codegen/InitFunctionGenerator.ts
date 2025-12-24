// lib/codegen/InitFunctionGenerator.ts

import { FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Options for InitFunctionGenerator
 */
export interface InitFunctionOptions {
  /** Integration algorithm: 'rk4' (default) or 'euler' */
  integrationAlgorithm?: 'euler' | 'rk4'
}

/**
 * Generates the initialization function for a flattened model
 */
export class InitFunctionGenerator {
  private model: FlattenedModel
  private modelName: string
  private typeMap: Map<string, string>
  private options: Required<InitFunctionOptions>

  constructor(
    model: FlattenedModel,
    typeMap: Map<string, string> = new Map(),
    options: InitFunctionOptions = {}
  ) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.typeMap = typeMap
    this.options = {
      integrationAlgorithm: options.integrationAlgorithm ?? 'rk4'
    }
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

    // Initialize segregated subsystems
    code += this.generateSubsystemInit()

    // Initialize enable states
    if (this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      code += this.generateEnableStateInit()
    }

    // Initialize constants and source blocks FIRST
    // This is important for integrator init ports that read from source signals
    code += this.generateConstantInit()

    // Initialize block-specific states (e.g., integrators)
    // Must come after constant init so init port signals are available
    code += this.generateBlockSpecificInit()

    // Initialize data collection buffers
    code += this.generateDataCollectionInit()

    code += '}\n'
    return code
  }
  
  /**
   * Generate time initialization
   */
  private generateTimeInit(): string {
    const useRk4 = this.options.integrationAlgorithm === 'rk4' ? 1 : 0
    const algorithmComment = this.options.integrationAlgorithm === 'rk4'
      ? 'RK4 integration (4th order)'
      : 'Euler integration (1st order)'

    return `    /* Initialize time tracking */
    model->time = 0.0;
    model->dt = dt;
    model->use_rk4 = ${useRk4}; /* ${algorithmComment} */

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
   * Generate segregated subsystem initialization
   */
  private generateSubsystemInit(): string {
    if (!this.model.segregatedSubsystems || this.model.segregatedSubsystems.length === 0) {
      return ''
    }

    let code = '    /* Initialize segregated subsystems */\n'

    for (const sub of this.model.segregatedSubsystems) {
      code += `    ${sub.sanitizedName}_init(&model->${sub.sanitizedName});\n`
    }

    // Sync subsystem states to parent states struct
    // The subsystem's init sets model->SubsystemName.states,
    // but RK4 reads from model->states.SubsystemName
    const statefulSubs = this.model.segregatedSubsystems.filter(sub => sub.hasState)
    if (statefulSubs.length > 0) {
      code += '\n    /* Sync subsystem initial states to parent states struct */\n'
      for (const sub of statefulSubs) {
        code += `    memcpy(&model->states.${sub.sanitizedName}, &model->${sub.sanitizedName}.states, sizeof(model->states.${sub.sanitizedName}));\n`
      }
    }

    code += '\n'
    return code
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
        const generator = BlockModuleFactory.getBlockModule(block.block.type)

        // Check if this block type has initialization
        if (generator.generateInitialization) {
          const outputType = this.getBlockOutputType(block)

          // Check for init port connection (port index -3) for integrator blocks
          let initSignalExpr: string | undefined
          if (block.block.type === 'integrator' && block.block.parameters?.showInitPort) {
            initSignalExpr = this.getInitPortSignalExpr(block)
          }

          const initCode = generator.generateInitialization(block.block, outputType, initSignalExpr)
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
   * Get the C expression for a signal connected to an integrator's init port (port -3)
   */
  private getInitPortSignalExpr(block: typeof this.model.blocks[0]): string | undefined {
    // Find connection to port -3 (init port) for this block
    const initConnection = this.model.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === -3
    )

    if (!initConnection) {
      return undefined
    }

    // Find the source block
    const sourceBlock = this.model.blocks.find(b => b.originalId === initConnection.sourceBlockId)
    if (!sourceBlock) {
      return undefined
    }

    // Return the signal expression for the source block
    const signalName = CCodeBuilder.sanitizeIdentifier(sourceBlock.flattenedName)
    return `model->signals.${signalName}`
  }

  /**
   * Generate data collection buffer initialization
   */
  private generateDataCollectionInit(): string {
    let code = ''
    let hasDataCollection = false

    for (const block of this.model.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)

        // Check if this block employs data collection
        if (generator.employsDataCollection && generator.employsDataCollection(block.block)) {
          // Get input type for this block
          const inputType = this.getBlockInputType(block)

          // Generate data collection initialization
          if (generator.generateDataCollectionInit) {
            const initCode = generator.generateDataCollectionInit(block.block, inputType)
            if (initCode && initCode.trim()) {
              if (!hasDataCollection) {
                code += '    /* Initialize data collection buffers */\n'
                hasDataCollection = true
              }

              code += initCode
              code += '\n'
            }
          }
        }
      } catch (error) {
        // Block type not supported for data collection
        continue
      }
    }

    if (hasDataCollection) {
      code += '\n'
    }

    return code
  }

  /**
   * Get input type for a block by finding the type of the signal connected to its first input
   * Uses typeMap for accurate type propagation (e.g., Transfer Functions inherit input type)
   */
  private getBlockInputType(block: typeof this.model.blocks[0]): string {
    // Find the connection to the first input port of this block
    const inputConnection = this.model.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === 0
    )

    if (inputConnection) {
      // First, check the typeMap for the source block's propagated type
      const propagatedType = this.typeMap.get(inputConnection.sourceBlockId)
      if (propagatedType) {
        return propagatedType
      }

      // Fall back to checking block parameters
      const sourceBlock = this.model.blocks.find(b => b.originalId === inputConnection.sourceBlockId)
      if (sourceBlock) {
        return this.getBlockOutputType(sourceBlock)
      }
    }

    // Default to double if no connection found
    return 'double'
  }

  /**
   * Get output type for a block
   */
  private getBlockOutputType(block: typeof this.model.blocks[0]): string {
    // First, check the typeMap for propagated type
    const propagatedType = this.typeMap.get(block.originalId)
    if (propagatedType) return propagatedType

    // Check block parameters for explicit type
    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType

    // Default types by block type
    switch (block.block.type) {
      case 'source':
      case 'input_port':
        return block.block.parameters?.dataType || 'double'
      default:
        return 'double'
    }
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
        const value = block.block.parameters?.value ?? 0.0
        const dataType = block.block.parameters?.dataType || 'double'
        // Use flattened name for signal access to handle subsystem blocks correctly
        const signalName = `model->signals.${CCodeBuilder.sanitizeIdentifier(block.flattenedName)}`

        if (!hasConstants) {
          code += '    /* Initialize constant sources */\n'
          hasConstants = true
        }

        // Check if it's an array/matrix type
        const arrayMatch = dataType.match(/\[([\d\s,\[\]]+)\]/)
        if (arrayMatch) {
          // Array or matrix constant - pass value as-is (may be array or string)
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
    value: string | number[] | number[][],
    dataType: string,
    blockName: string
  ): string {
    let code = `    /* Initialize ${blockName} (${dataType}) */\n`

    // Parse the array value - may already be an array or may be a string
    try {
      let parsedValue: any

      // Check if value is already an array (common case from block parameters)
      if (Array.isArray(value)) {
        parsedValue = value
      } else if (typeof value === 'string') {
        // Handle different formats: [1,2,3] or [[1,2],[3,4]] etc.
        parsedValue = this.parseArrayValue(value)
      } else {
        throw new Error('Unexpected value type')
      }

      if (Array.isArray(parsedValue)) {
        // Determine dimensions
        const dims = this.getArrayDimensions(parsedValue)

        if (dims.length === 1) {
          // 1D array - assign element by element for clarity
          for (let i = 0; i < dims[0]; i++) {
            const val = parsedValue[i] ?? 0
            code += `    ${signalName}[${i}] = ${val};\n`
          }
        } else if (dims.length === 2) {
          // 2D array (matrix)
          for (let i = 0; i < dims[0]; i++) {
            for (let j = 0; j < dims[1]; j++) {
              const val = (parsedValue[i] && parsedValue[i][j]) ?? 0
              code += `    ${signalName}[${i}][${j}] = ${val};\n`
            }
          }
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