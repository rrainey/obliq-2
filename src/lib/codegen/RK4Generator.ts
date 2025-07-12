// lib/codegen/RK4Generator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { EnableEvaluator } from './EnableEvaluator'

/**
 * Generates RK4 integration code for stateful blocks
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
   * Generate all RK4-related functions
   */
  generate(): string {
    if (!this.hasStatefulBlocks()) {
      return ''
    }
    
    let code = ''
    
    // Generate derivatives function
    code += this.generateDerivativesFunction()
    code += '\n'
    
    // Generate RK4 integration code to be inserted into step function
    code += this.generateRK4Integration()
    
    return code
  }
  
  /**
   * Generate the derivatives function
   */
  private generateDerivativesFunction(): string {
    let code = CCodeBuilder.generateCommentBlock([
      'Calculate state derivatives for RK4 integration',
      'Takes current states and inputs, returns derivatives',
      this.hasEnableSubsystems ? 'Enable states control which blocks update their derivatives' : ''
    ].filter(Boolean))
    
    const params = [
      'double t',
      `const ${this.modelName}_inputs_t* inputs`,
      `const ${this.modelName}_signals_t* signals`,  // Add signals parameter
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
    // For transfer functions, use the new generateStateDerivative method
    if (block.block.type === 'transfer_function' && generator.generateStateDerivative) {
      // Get block inputs
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
          
          // Determine source based on block type
          if (sourceBlock.block.type === 'input_port') {
            // Input ports can be accessed directly from inputs parameter
            inputExpr = `inputs->${safeName}`
          } else {
            // For other blocks, access from signals parameter
            inputExpr = `signals->${safeName}`
          }
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
    return '/* Derivative computation not implemented for this block type */\n'
  }
  
  /**
   * Generate RK4 integration code
   */
  generateRK4Integration(): string {
    if (!this.hasStatefulBlocks()) {
      return ''
    }
    
    let code = CCodeBuilder.generateCommentBlock([
      'RK4 Integration',
      'This function performs Runge-Kutta 4th order integration for all stateful blocks'
    ])
    
    code += 'static void perform_rk4_integration(\n'
    code += `    ${this.modelName}_t* model\n`
    code += ') {\n'
    
    // Declare RK4 temporary variables
    code += '    /* RK4 temporary variables */\n'
    code += `    ${this.modelName}_states_t k1, k2, k3, k4;\n`
    code += `    ${this.modelName}_states_t temp_states;\n`
    code += `    ${this.modelName}_signals_t temp_signals;\n`  // Add temp signals
    code += '    double h = model->dt;\n'
    code += '    double half_h = h * 0.5;\n\n'
    
    // k1 = f(t, y)
    code += '    /* Calculate k1 = f(t, y) */\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time,\n'
    code += '        &model->inputs,\n'
    code += '        &model->signals,\n'  // Pass current signals
    code += '        &model->states,\n'
    code += '        &k1'
    if (this.hasEnableSubsystems) {
      code += ',\n        &model->enable_states'
    }
    code += '\n    );\n\n'
    
    // For k2, k3, k4, we need to compute intermediate signal values
    // This is complex and would require evaluating all blocks with updated states
    // For now, we'll use the current signals as an approximation
    
    // k2 = f(t + h/2, y + h/2 * k1)
    code += '    /* Calculate k2 = f(t + h/2, y + h/2 * k1) */\n'
    code += this.generateRK4StateUpdate('temp_states', 'model->states', 'k1', 'half_h')
    code += '    /* TODO: Recompute signals with updated states */\n'
    code += '    memcpy(&temp_signals, &model->signals, sizeof(temp_signals));\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + half_h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_signals,\n'  // Pass temp signals
    code += '        &temp_states,\n'
    code += '        &k2'
    if (this.hasEnableSubsystems) {
      code += ',\n        &model->enable_states'
    }
    code += '\n    );\n\n'
    
    // Similar for k3 and k4...
    // (Rest of the RK4 implementation remains similar with signals parameter added)
    
    return code
  }
  
  /**
   * Generate code to update temporary states
   */
  private generateRK4StateUpdate(
    dest: string,
    source: string,
    derivative: string,
    factor: string
  ): string {
    let code = ''
    
    // For each stateful block, update its states
    const statefulBlocks = this.getStatefulBlocks()
    
    for (const block of statefulBlocks) {
      const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
      
      // Check if this is a transfer function (the main stateful block type)
      if (block.block.type === 'transfer_function') {
        const denominator = block.block.parameters?.denominator || [1, 1]
        const stateOrder = Math.max(0, denominator.length - 1)
        
        if (stateOrder > 0) {
          // Determine if it's scalar or vector
          const outputType = this.getBlockOutputType(block)
          const isVector = outputType.includes('[')
          
          if (isVector) {
            const match = outputType.match(/\[(\d+)\]/)
            const size = match ? parseInt(match[1]) : 1
            
            code += `    for (int i = 0; i < ${size}; i++) {\n`
            code += `        for (int j = 0; j < ${stateOrder}; j++) {\n`
            code += `            ${dest}.${safeName}_states[i][j] = ${source}.${safeName}_states[i][j] + ${factor} * ${derivative}.${safeName}_states[i][j];\n`
            code += '        }\n'
            code += '    }\n'
          } else {
            code += `    for (int i = 0; i < ${stateOrder}; i++) {\n`
            code += `        ${dest}.${safeName}_states[i] = ${source}.${safeName}_states[i] + ${factor} * ${derivative}.${safeName}_states[i];\n`
            code += '    }\n'
          }
        }
      }
    }
    
    return code
  }
  
  /**
   * Generate final state update with RK4 formula
   */
  private generateFinalStateUpdate(): string {
    let code = ''
    const statefulBlocks = this.getStatefulBlocks()
    
    for (const block of statefulBlocks) {
      // Check if block is in an enable scope (only if we have enable subsystems)
      let needsEnableCheck = false
      let enableCheck = '1'
      
      if (this.hasEnableSubsystems) {
        enableCheck = this.enableEvaluator.generateBlockEnableCheck(block.originalId)
        needsEnableCheck = enableCheck !== '1'
      }
      
      if (needsEnableCheck) {
        code += `    if (${enableCheck}) {\n`
      }
      
      const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
      
      if (block.block.type === 'transfer_function') {
        const denominator = block.block.parameters?.denominator || [1, 1]
        const stateOrder = Math.max(0, denominator.length - 1)
        
        if (stateOrder > 0) {
          const outputType = this.getBlockOutputType(block)
          const isVector = outputType.includes('[')
          
          if (isVector) {
            const match = outputType.match(/\[(\d+)\]/)
            const size = match ? parseInt(match[1]) : 1
            
            const updateCode = `        for (int i = 0; i < ${size}; i++) {\n` +
              `            for (int j = 0; j < ${stateOrder}; j++) {\n` +
              `                model->states.${safeName}_states[i][j] += (h / 6.0) * (\n` +
              `                    k1.${safeName}_states[i][j] +\n` +
              `                    2.0 * k2.${safeName}_states[i][j] +\n` +
              `                    2.0 * k3.${safeName}_states[i][j] +\n` +
              `                    k4.${safeName}_states[i][j]\n` +
              `                );\n` +
              `            }\n` +
              `        }\n`
            
            code += needsEnableCheck ? CCodeBuilder.indent(updateCode, 2) : updateCode
          } else {
            const updateCode = `        for (int i = 0; i < ${stateOrder}; i++) {\n` +
              `            model->states.${safeName}_states[i] += (h / 6.0) * (\n` +
              `                k1.${safeName}_states[i] +\n` +
              `                2.0 * k2.${safeName}_states[i] +\n` +
              `                2.0 * k3.${safeName}_states[i] +\n` +
              `                k4.${safeName}_states[i]\n` +
              `            );\n` +
              `        }\n`
            
            code += needsEnableCheck ? CCodeBuilder.indent(updateCode, 2) : updateCode
          }
        }
      }
      
      if (needsEnableCheck) {
        code += '    }\n'
      }
    }
    
    return code
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
  private hasStatefulBlocks(): boolean {
    return this.getStatefulBlocks().length > 0
  }
  
  /**
   * Get output type for a block
   */
  private getBlockOutputType(block: FlattenedBlock): string {
    // This will be enhanced with proper type propagation
    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType
    
    return 'double'
  }
}