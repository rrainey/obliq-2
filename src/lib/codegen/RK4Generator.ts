// lib/codegen/RK4Generator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { EnableEvaluator } from './EnableEvaluator'

/**
 * Generates derivatives function for stateful blocks
 * This is part of the algebraic layer - computing derivatives without updating states
 */
export class RK4Generator {
  private model: FlattenedModel
  private modelName: string
  private enableEvaluator: EnableEvaluator
  private hasEnableSubsystems: boolean
  
  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.enableEvaluator = new EnableEvaluator(model)
    this.hasEnableSubsystems = model.subsystemEnableInfo.some(info => info.hasEnableInput)
  }
  
  /**
   * Generate derivatives function only
   */
  generate(): string {
    if (!this.hasStatefulBlocks()) {
      return ''
    }
    
    return this.generateDerivativesFunction()
  }
  
  /**
   * Generate the derivatives function
   */
  private generateDerivativesFunction(): string {
    let code = CCodeBuilder.generateCommentBlock([
      'Calculate state derivatives for integration',
      'This is part of the algebraic layer - computes derivatives without modifying states',
      'Takes current states and signals, returns derivatives',
      this.hasEnableSubsystems ? 'Enable states control which blocks compute derivatives' : ''
    ].filter(Boolean))
    
    const params = [
      'double t',
      `const ${this.modelName}_inputs_t* inputs`,
      `const ${this.modelName}_signals_t* signals`,
      `const ${this.modelName}_states_t* current_states`,
      `${this.modelName}_states_t* state_derivatives`
    ]
    
    if (this.hasEnableSubsystems) {
      params.push(`const enable_states_t* enable_states`)
    }
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_derivatives`,
      params
    )
    
    // Initialize derivatives to zero
    code += '    /* Initialize all derivatives to zero */\n'
    code += '    memset(state_derivatives, 0, sizeof(*state_derivatives));\n\n'
    
    // Generate derivative calculations for each stateful block
    const statefulBlocks = this.getStatefulBlocks()
    
    for (const block of statefulBlocks) {
      code += this.generateBlockDerivative(block)
    }
    
    code += '}\n'
    return code
  }
  
  /**
   * Generate derivative calculation for a single block
   */
  private generateBlockDerivative(block: FlattenedBlock): string {
    let code = ''
    
    try {
      const generator = BlockModuleFactory.getBlockModule(block.block.type)
      
      // Only process blocks that have state
      if (!generator.requiresState(block.block)) {
        return ''
      }
      
      // Add block comment
      code += `    /* ${block.flattenedName}`
      if (block.subsystemPath.length > 0) {
        code += ` (from ${block.subsystemPath.join(' > ')})`
      }
      code += ' */\n'
      
      // Check if block is enabled (only if we have enable subsystems)
      if (this.hasEnableSubsystems) {
        const enableScope = this.model.enableScopes.get(block.originalId)
        if (enableScope) {
          const subsystemInfo = this.model.subsystemEnableInfo.find(info => 
            info.subsystemId === enableScope
          )
          
          if (subsystemInfo && subsystemInfo.hasEnableInput) {
            const safeName = CCodeBuilder.sanitizeIdentifier(subsystemInfo.subsystemName)
            code += `    if (enable_states->${safeName}_enabled) {\n`
            
            // Generate derivative computation (indented)
            const derivCode = this.generateDerivativeComputation(block, generator)
            code += CCodeBuilder.indent(derivCode, 2)
            
            code += '    }\n'
          } else {
            // No enable check needed
            code += this.generateDerivativeComputation(block, generator)
          }
        } else {
          // No enable scope
          code += this.generateDerivativeComputation(block, generator)
        }
      } else {
        // No enable subsystems at all
        code += this.generateDerivativeComputation(block, generator)
      }
      
      code += '\n'
      
    } catch (error) {
      code += `    /* Error generating derivatives for ${block.block.type}: ${error} */\n\n`
    }
    
    return code
  }
  
  /**
   * Generate the actual derivative computation for a block
   */
  private generateDerivativeComputation(
    block: FlattenedBlock,
    generator: any
  ): string {
    // For transfer functions, use the generateStateDerivative method
    if (block.block.type === 'transfer_function' && generator.generateStateDerivative) {
      // Get block inputs from signals
      const inputConnections = this.model.connections
        .filter(c => c.targetBlockId === block.originalId)
        .sort((a, b) => a.targetPortIndex - b.targetPortIndex)
      
      let inputExpr = '0.0' // Default if no input
      
      if (inputConnections.length > 0) {
        const sourceBlock = this.model.blocks.find(b => 
          b.originalId === inputConnections[0].sourceBlockId
        )
        
        if (sourceBlock) {
          const safeName = CCodeBuilder.sanitizeIdentifier(sourceBlock.block.name)
          
          // All signals should be available in the signals struct
          inputExpr = `signals->${safeName}`
        }
      }
      
      // Get output type for the block
      const outputType = this.getBlockOutputType(block)
      
      // Call the module's generateStateDerivative method
      return generator.generateStateDerivative(
        block.block,
        inputExpr,
        'current_states',
        outputType
      )
    }
    
    // For other block types that might have states in the future
    return '    /* Derivative computation not implemented for this block type */\n'
  }
  
  /**
   * Get all blocks that have state
   */
  private getStatefulBlocks(): FlattenedBlock[] {
    return this.model.blocks.filter(block => {
      try {
        const generator = BlockModuleFactory.getBlockModule(block.block.type)
        return generator.requiresState(block.block)
      } catch {
        return false
      }
    })
  }
  
  /**
   * Check if model has stateful blocks
   */
  hasStatefulBlocks(): boolean {
    return this.getStatefulBlocks().length > 0
  }
  
  /**
   * Get output type for a block
   */
  private getBlockOutputType(block: FlattenedBlock): string {
    // This should use the type map from type propagation
    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType
    
    return 'double'
  }
}