// lib/codegen/HeaderGenerator.ts

import { FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Generates the C header file for a flattened model
 */
export class HeaderGenerator {
  private model: FlattenedModel
  private modelName: string
  private typeMap: Map<string, string>
  
  constructor(model: FlattenedModel, typeMap: Map<string, string>) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.typeMap = typeMap
  }
  
  /**
   * Generate the complete header file
   */
  generate(): string {
    const guard = CCodeBuilder.generateIncludeGuard(this.modelName)
    let header = guard.start
    
    // Add standard includes
    header += this.generateIncludes()
    header += '\n'

    // Add model parameters (Feature 3)
    header += this.generateParameters()
    header += '\n'

    // Add extern "C" opening for C++ compatibility
    header += '#ifdef __cplusplus\n'
    header += 'extern "C" {\n'
    header += '#endif\n\n'
    
    // Add type definitions
    header += this.generateTypeDefinitions()
    header += '\n'
    
    // Add model structure
    header += this.generateModelStructure()
    header += '\n'
    
    // Add function prototypes
    header += this.generateFunctionPrototypes()
    
    // Close extern "C"
    header += '\n#ifdef __cplusplus\n'
    header += '}\n'
    header += '#endif\n'
    
    header += guard.end
    return header
  }
  
  /**
   * Generate include statements
   */
  private generateIncludes(): string {
    return `#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>\n`
  }
  
  /**
   * Generate type definitions for inputs, outputs, signals, and states
   */
  private generateTypeDefinitions(): string {
    let types = ''
    
    // Generate inputs structure
    types += this.generateInputsStruct()
    types += '\n'
    
    // Generate outputs structure
    types += this.generateOutputsStruct()
    types += '\n'
    
    // Generate signals structure
    types += this.generateSignalsStruct()
    types += '\n'
    
    // Generate states structure
    types += this.generateStatesStruct()
    types += '\n'
    
    // Always generate enable states structure to match function signatures
    types += CCodeBuilder.generateEnableStateStruct(this.model.subsystemEnableInfo)
    types += '\n'
    
    return types
  }

  private generateModelStructure(): string {
    const members: string[] = []

    // Add sub-structures
    members.push(`    ${this.modelName}_inputs_t inputs;`)
    members.push(`    ${this.modelName}_outputs_t outputs;`)
    members.push(`    ${this.modelName}_signals_t signals;`)
    members.push(`    ${this.modelName}_states_t states;`)
    members.push(`    enable_states_t enable_states;`) // Always include

    // Add data collection members for logger/display blocks
    for (const block of this.model.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)

        // Check if block employs data collection
        if (generator.employsDataCollection && generator.employsDataCollection(block.block)) {
          // Get input type for this block
          const inputType = this.getBlockInputType(block)

          // Generate data collection struct members
          if (generator.generateDataCollectionStructMembers) {
            const dataMembers = generator.generateDataCollectionStructMembers(block.block, inputType)
            members.push(...dataMembers)
          }
        }
      } catch (error) {
        // Block type not supported or doesn't use data collection
        continue
      }
    }

    // Add time tracking
    members.push(`    double time;`)
    members.push(`    double dt; /* Time step */`)
    members.push(`    int use_rk4; /* Integration method: 1=RK4, 0=Euler */`)

    return CCodeBuilder.generateStruct(
      this.modelName,
      members,
      'Main model structure containing all signals and states'
    )
  }
  
  /**
   * Generate inputs structure
   */
  private generateInputsStruct(): string {
    const members: string[] = []
    
    // Find all input port blocks
    const inputPorts = this.model.blocks.filter(b => b.block.type === 'input_port')
    
    for (const port of inputPorts) {
      const portName = port.block.parameters?.portName || port.flattenedName
      const dataType = port.block.parameters?.dataType || 'double'
      
      // Parse array dimensions if present
      const typeMatch = dataType.match(/^(\w+)(\[[\d\[\]]+\])?$/)
      if (typeMatch) {
        const baseType = typeMatch[1]
        const dimensions = typeMatch[2]
        
        if (dimensions) {
          // Extract dimension values
          const dims = dimensions.match(/\d+/g)?.map((d:any) => parseInt(d)) || []
          members.push(CCodeBuilder.generateStructMember(
            baseType,
            portName,
            dims,
            `Input port: ${port.block.name}`
          ))
        } else {
          members.push(CCodeBuilder.generateStructMember(
            baseType,
            portName,
            undefined,
            `Input port: ${port.block.name}`
          ))
        }
      }
    }
    
    // Add dummy member if no inputs
    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember(
        'int',
        'dummy',
        undefined,
        'No input ports defined'
      ))
    }
    
    return CCodeBuilder.generateStruct(
      `${this.modelName}_inputs`,
      members,
      'Model input signals'
    )
  }
  
  /**
   * Generate outputs structure
   */
  private generateOutputsStruct(): string {
    const members: string[] = []
    
    // Find all output port blocks
    const outputPorts = this.model.blocks.filter(b => b.block.type === 'output_port')
    
    for (const port of outputPorts) {
      const portName = port.block.parameters?.portName || port.flattenedName
      
      // Find the wire connected to this output port
      const inputWire = this.model.connections.find(c => 
        c.targetBlockId === port.originalId && c.targetPortIndex === 0
      )
      
      if (inputWire) {
        // Get the source block to determine output type
        const sourceBlock = this.model.blocks.find(b => b.originalId === inputWire.sourceBlockId)
        if (sourceBlock) {
          const outputType = this.getBlockOutputType(sourceBlock)
          
          // Parse type for array dimensions
          const typeMatch = outputType.match(/^(\w+)(\[[\d\[\]]+\])?$/)
          if (typeMatch) {
            const baseType = typeMatch[1]
            const dimensions = typeMatch[2]
            
            if (dimensions) {
              const dims = dimensions.match(/\d+/g)?.map(d => parseInt(d)) || []
              members.push(CCodeBuilder.generateStructMember(
                baseType,
                portName,
                dims,
                `Output port: ${port.block.name}`
              ))
            } else {
              members.push(CCodeBuilder.generateStructMember(
                baseType,
                portName,
                undefined,
                `Output port: ${port.block.name}`
              ))
            }
          }
        }
      }
    }
    
    // Add dummy member if no outputs
    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember(
        'int',
        'dummy',
        undefined,
        'No output ports defined'
      ))
    }
    
    return CCodeBuilder.generateStruct(
      `${this.modelName}_outputs`,
      members,
      'Model output signals'
    )
  }
  
  /**
   * Generate signals structure
   */

  private generateSignalsStruct(): string {
    const members: string[] = []
    
    // Process each block that needs signal storage
    for (const block of this.model.blocks) {
      // Include input ports in signals struct for internal access
      if (block.block.type === 'input_port') {
        const portName = block.block.parameters?.portName || block.block.name
        const dataType = block.block.parameters?.dataType || 'double'
        
        // Generate member for input port signal
        const typeMatch = dataType.match(/^(\w+)(\[[\d\[\]]+\])?$/)
        if (typeMatch) {
          const baseType = typeMatch[1]
          const dimensions = typeMatch[2]
          
          if (dimensions) {
            const dims = dimensions.match(/\d+/g)?.map((d: string) => parseInt(d)) || []
            members.push(CCodeBuilder.generateStructMember(
              baseType,
              block.block.name, // Use block name, not port name
              dims,
              `Signal from input port: ${portName}`
            ))
          } else {
            members.push(CCodeBuilder.generateStructMember(
              baseType,
              block.block.name, // Use block name, not port name
              undefined,
              `Signal from input port: ${portName}`
            ))
          }
        }
        continue
      }
      
      // Skip output ports - they don't need signal storage
      if (block.block.type === 'output_port') {
        continue
      }
      
      // Skip blocks that don't generate code
      if (block.block.type === 'signal_display' || block.block.type === 'signal_logger') {
        continue
      }
      
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        const outputType = this.getBlockOutputType(block)
        const member = generator.generateStructMember(block.block, outputType)
        
        if (member) {
          members.push(member)
        }
      } catch (error) {
        // Block type not supported for code generation
        continue
      }
    }
    
    // Add dummy member if no signals
    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember(
        'int',
        'dummy',
        undefined,
        'No internal signals'
      ))
    }
    
    return CCodeBuilder.generateStruct(
      `${this.modelName}_signals`,
      members,
      'Internal signal values'
    )
  }
  
  /**
   * Generate states structure
   */
  private generateStatesStruct(): string {
    const members: string[] = []
    
    // Process each block that needs state storage
    for (const block of this.model.blocks) {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        
        if (generator.requiresState(block.block)) {
          const outputType = this.getBlockOutputType(block)
          const stateMembers = generator.generateStateStructMembers(block.block, outputType)
          members.push(...stateMembers)
        }
      } catch (error) {
        // Block type not supported or doesn't need state
        continue
      }
    }
    
    // Add dummy member if no states
    if (members.length === 0) {
      members.push(CCodeBuilder.generateStructMember(
        'int',
        'dummy',
        undefined,
        'No state variables'
      ))
    }
    
    return CCodeBuilder.generateStruct(
      `${this.modelName}_states`,
      members,
      'State variables for dynamic blocks'
    )
  }
  
  
  /**
   * Generate function prototypes
   */
  private generateFunctionPrototypes(): string {
    let prototypes = CCodeBuilder.generateCommentBlock(['Function prototypes'])
    
    // Init function
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${this.modelName}_init`,
      [`${this.modelName}_t* model`, 'double dt'],
      'Initialize model with given time step'
    ) + '\n'
    
    // Algebraic evaluation function - NEW!
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${this.modelName}_evaluate_algebraic`,
      [
       `${this.modelName}_t* model`
      ],
      'Evaluate algebraic relationships (pure function, no state changes)'
    ) + '\n'
    
    // Step function
    prototypes += CCodeBuilder.generateFunctionPrototype(
      'void',
      `${this.modelName}_step`,
      [`${this.modelName}_t* model`],
      'Execute one simulation step'
    ) + '\n'
    
    // Derivatives function (for RK4) - only if we have stateful blocks
    if (this.hasStatefulBlocks()) {
      const params = [
        'double t',
        `const ${this.modelName}_inputs_t* inputs`,
        `const ${this.modelName}_signals_t* signals`,  // Add signals parameter
        `const ${this.modelName}_states_t* current_states`,
        `${this.modelName}_states_t* state_derivatives`
      ]
      
      // Only add enable_states parameter if we have subsystems with enable inputs
      const hasEnableSubsystems = this.model.subsystemEnableInfo.some(info => info.hasEnableInput)
      if (hasEnableSubsystems) {
        params.push(`const enable_states_t* enable_states`)
      }
      
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${this.modelName}_derivatives`,
        params,
        'Calculate state derivatives for RK4 integration'
      ) + '\n'
    }
    
    // Enable evaluation function - only if we have subsystems with enable inputs
    if (this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${this.modelName}_evaluate_enable_states`,
        [`${this.modelName}_t* model`],
        'Update enable states based on enable inputs'
      ) + '\n'
    }

    // Cleanup function - only if we have data collection blocks
    if (this.hasDataCollectionBlocks()) {
      prototypes += CCodeBuilder.generateFunctionPrototype(
        'void',
        `${this.modelName}_cleanup`,
        [`${this.modelName}_t* model`],
        'Free allocated memory for data collection'
      ) + '\n'
    }

    return prototypes
  }
  
  /**
   * Helper to determine if the model has stateful blocks
   */
  private hasStatefulBlocks(): boolean {
    return this.model.blocks.some(block => {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        return generator.requiresState(block.block)
      } catch {
        return false
      }
    })
  }

  /**
   * Helper to determine if the model has data collection blocks
   */
  private hasDataCollectionBlocks(): boolean {
    return this.model.blocks.some(block => {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        return generator.employsDataCollection && generator.employsDataCollection(block.block)
      } catch {
        return false
      }
    })
  }
  
  /**
   * Helper to get block output type
   */
  private getBlockOutputType(block: typeof this.model.blocks[0]): string {
    // First check the type map
    const mappedType = this.typeMap.get(block.originalId)
    if (mappedType) {
      return mappedType
    }

    // Fall back to parameter-based type
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
   * Helper to get block input type
   * For data collection blocks, we need to find the type of the signal connected to their input
   */
  private getBlockInputType(block: typeof this.model.blocks[0]): string {
    // Find the connection to the first input port of this block
    const inputConnection = this.model.connections.find(c =>
      c.targetBlockId === block.originalId && c.targetPortIndex === 0
    )

    if (inputConnection) {
      // Get the source block
      const sourceBlock = this.model.blocks.find(b => b.originalId === inputConnection.sourceBlockId)
      if (sourceBlock) {
        // Return the output type of the source block
        return this.getBlockOutputType(sourceBlock)
      }
    }

    // Default to double if no connection found
    return 'double'
  }

  /**
   * Generate model parameter definitions (Feature 3)
   * Scalars use #define, arrays use const with size macros
   */
  private generateParameters(): string {
    if (!this.model.parameters || this.model.parameters.length === 0) {
      return CCodeBuilder.generateCommentBlock(['No model parameters defined'])
    }

    let code = CCodeBuilder.generateCommentBlock(['Model Parameters'])

    for (const param of this.model.parameters) {
      const { name, signalType, value } = param

      // Parse signal type to determine if scalar, vector, or matrix
      const typeMatch = signalType.match(/^(\w+)(?:\[(\d+)\])?(?:\[(\d+)\])?$/)
      if (!typeMatch) {
        code += `// Warning: Invalid signal type for parameter ${name}: ${signalType}\n`
        continue
      }

      const baseType = typeMatch[1] // float, double, long, bool
      const dim1 = typeMatch[2] ? parseInt(typeMatch[2]) : null
      const dim2 = typeMatch[3] ? parseInt(typeMatch[3]) : null

      if (dim2 !== null) {
        // Matrix: Use const array with #define for dimensions
        code += `#define ${name}_ROWS ${dim1}\n`
        code += `#define ${name}_COLS ${dim2}\n`
        code += `const ${baseType} ${name}[${name}_ROWS][${name}_COLS] = `

        // Format matrix value
        if (Array.isArray(value) && Array.isArray(value[0])) {
          code += this.formatMatrixLiteral(value as number[][], baseType)
        } else {
          code += '{{0}}' // Error fallback
        }
        code += ';\n\n'

      } else if (dim1 !== null) {
        // Vector: Use const array with #define for size
        code += `#define ${name}_SIZE ${dim1}\n`
        code += `const ${baseType} ${name}[${name}_SIZE] = `

        // Format vector value
        if (Array.isArray(value)) {
          code += this.formatVectorLiteral(value as number[], baseType)
        } else {
          code += '{0}' // Error fallback
        }
        code += ';\n\n'

      } else {
        // Scalar: Use #define
        code += `#define ${name} `
        code += this.formatScalarLiteral(value as number, baseType)
        code += '\n'
      }
    }

    return code
  }

  /**
   * Format a scalar literal with appropriate suffix
   */
  private formatScalarLiteral(value: number, baseType: string): string {
    switch (baseType) {
      case 'float':
        return `${value}f`
      case 'double':
        return `${value}`
      case 'long':
        return `${value}L`
      case 'bool':
        return value ? '1' : '0'
      default:
        return `${value}`
    }
  }

  /**
   * Format a vector literal
   */
  private formatVectorLiteral(values: number[], baseType: string): string {
    const formattedValues = values.map(v => this.formatScalarLiteral(v, baseType))
    return `{${formattedValues.join(', ')}}`
  }

  /**
   * Format a matrix literal (2D array)
   */
  private formatMatrixLiteral(matrix: number[][], baseType: string): string {
    const rows = matrix.map(row => {
      const formattedRow = row.map(v => this.formatScalarLiteral(v, baseType))
      return `{${formattedRow.join(', ')}}`
    })
    return `{${rows.join(', ')}}`
  }
}