// lib/codegen/RK4Generator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockCodeGeneratorFactory } from '../blocks/BlockCodeGeneratorFactory'
import { EnableEvaluator } from './EnableEvaluator'

/**
 * Generates RK4 integration code for stateful blocks
 */
export class RK4Generator {
  private model: FlattenedModel
  private modelName: string
  private enableEvaluator: EnableEvaluator
  
  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.enableEvaluator = new EnableEvaluator(model)
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
      'Enable states control which blocks update their derivatives'
    ])
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_derivatives`,
      [
        'double t',
        `const ${this.modelName}_inputs_t* inputs`,
        `const ${this.modelName}_states_t* current_states`,
        `${this.modelName}_states_t* state_derivatives`,
        `const enable_states_t* enable_states`
      ]
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
      const generator = BlockCodeGeneratorFactory.getBlockCodeGenerator(block.block.type)
      
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
      
      // Check if block is enabled
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
    // For now, we'll handle transfer functions specially
    // Other stateful blocks can be added later
    
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
            inputExpr = `inputs->${safeName}`
          } else {
            // For derivatives, we need to reference the temporary computed value
            // This is a simplification - in reality we'd need to compute intermediate values
            inputExpr = `0.0 /* TODO: Compute intermediate value for ${sourceBlock.block.name} */`
          }
        }
      }
      
      // Get output type for the block
      const outputType = this.getBlockOutputType(block)
      
      return generator.generateStateDerivative(
        block.block,
        inputExpr,
        'current_states',
        outputType
      )
    }
    
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
      'This code should be inserted into the step function after block computations'
    ])
    
    code += 'static void perform_rk4_integration(\n'
    code += `    ${this.modelName}_t* model\n`
    code += ') {\n'
    
    // Declare RK4 temporary variables
    code += '    /* RK4 temporary variables */\n'
    code += `    ${this.modelName}_states_t k1, k2, k3, k4;\n`
    code += `    ${this.modelName}_states_t temp_states;\n`
    code += '    double h = model->dt;\n'
    code += '    double half_h = h * 0.5;\n\n'
    
    // k1 = f(t, y)
    code += '    /* Calculate k1 = f(t, y) */\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time,\n'
    code += '        &model->inputs,\n'
    code += '        &model->states,\n'
    code += '        &k1,\n'
    code += '        &model->enable_states\n'
    code += '    );\n\n'
    
    // k2 = f(t + h/2, y + h/2 * k1)
    code += '    /* Calculate k2 = f(t + h/2, y + h/2 * k1) */\n'
    code += this.generateRK4StateUpdate('temp_states', 'model->states', 'k1', 'half_h')
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + half_h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_states,\n'
    code += '        &k2,\n'
    code += '        &model->enable_states\n'
    code += '    );\n\n'
    
    // k3 = f(t + h/2, y + h/2 * k2)
    code += '    /* Calculate k3 = f(t + h/2, y + h/2 * k2) */\n'
    code += this.generateRK4StateUpdate('temp_states', 'model->states', 'k2', 'half_h')
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + half_h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_states,\n'
    code += '        &k3,\n'
    code += '        &model->enable_states\n'
    code += '    );\n\n'
    
    // k4 = f(t + h, y + h * k3)
    code += '    /* Calculate k4 = f(t + h, y + h * k3) */\n'
    code += this.generateRK4StateUpdate('temp_states', 'model->states', 'k3', 'h')
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_states,\n'
    code += '        &k4,\n'
    code += '        &model->enable_states\n'
    code += '    );\n\n'
    
    // Update states: y = y + (h/6) * (k1 + 2*k2 + 2*k3 + k4)
    code += '    /* Update states: y = y + (h/6) * (k1 + 2*k2 + 2*k3 + k4) */\n'
    code += this.generateFinalStateUpdate()
    
    code += '}\n'
    
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
      // Check if block is in an enable scope
      const enableCheck = this.enableEvaluator.generateBlockEnableCheck(block.originalId)
      const needsEnableCheck = enableCheck !== '1'
      
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
        const generator = BlockCodeGeneratorFactory.getBlockCodeGenerator(block.block.type)
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