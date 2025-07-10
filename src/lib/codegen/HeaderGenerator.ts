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
    
    // Generate enable states structure if needed OR if we have stateful blocks
    // This ensures the type is always defined when referenced
    if (this.hasStatefulBlocks() || this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      types += CCodeBuilder.generateEnableStateStruct(this.model.subsystemEnableInfo)
      types += '\n'
    }
    
    return types
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
      // Skip input/output ports - they don't need signal storage
      if (block.block.type === 'input_port' || block.block.type === 'output_port') {
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
   * Generate main model structure
   */
  private generateModelStructure(): string {
    const members: string[] = []
    
    // Add sub-structures
    members.push(`    ${this.modelName}_inputs_t inputs;`)
    members.push(`    ${this.modelName}_outputs_t outputs;`)
    members.push(`    ${this.modelName}_signals_t signals;`)
    members.push(`    ${this.modelName}_states_t states;`)
    
    // Add enable states if needed OR if we have stateful blocks
    if (this.hasStatefulBlocks() || this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      members.push(`    enable_states_t enable_states;`)
    }
    
    // Add time tracking
    members.push(`    double time;`)
    members.push(`    double dt; /* Time step */`)
    
    return CCodeBuilder.generateStruct(
      this.modelName,
      members,
      'Main model structure containing all signals and states'
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
}