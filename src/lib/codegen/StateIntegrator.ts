// lib/codegen/StateIntegrator.ts - Updated implementation

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

/**
 * Options for state integration code generation
 */
export interface StateIntegratorOptions {
  /** Whether to include debug comments */
  includeComments?: boolean
  
  /** Whether to check enable states during integration */
  checkEnableStates?: boolean
}

/**
 * Generates state integration code for various integration methods.
 * This class implements the integration layer of the two-layer architecture.
 */
export class StateIntegrator {
  private model: FlattenedModel
  private modelName: string
  private options: Required<StateIntegratorOptions>
  
  constructor(
    model: FlattenedModel,
    options: StateIntegratorOptions = {}
  ) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.options = {
      includeComments: options.includeComments ?? true,
      checkEnableStates: options.checkEnableStates ?? true
    }
  }
  
  /**
   * Generate code that selects integration method at runtime
   */
  generateIntegrationDispatch(includeRK4: boolean = true): string {
    let code = ''
    
    if (!this.hasStatefulBlocks()) {
      return '    /* No state integration needed - no stateful blocks */\n'
    }
    
    if (includeRK4) {
      code += '    /* Select integration method */\n'
      code += '    if (model->use_rk4) {\n'
      code += this.generateRK4Integration().split('\n').map(line => '    ' + line).join('\n')
      code += '\n    } else {\n'
      code += this.generateEulerIntegration().split('\n').map(line => '    ' + line).join('\n')
      code += '\n    }\n'
    } else {
      code += this.generateEulerIntegration()
    }
    
    return code
  }
  
  /**
   * Generate Euler integration code
   */
  generateEulerIntegration(): string {
    const statefulBlocks = this.getStatefulBlocks()
    
    if (statefulBlocks.length === 0) {
      return '    /* No state integration needed - no stateful blocks */\n'
    }
    
    let code = ''
    
    if (this.options.includeComments) {
      code += '    /* Euler integration: x[n+1] = x[n] + dt * dx/dt */\n'
    }
    
    // First, calculate derivatives
    code += '    /* Calculate derivatives */\n'
    code += `    ${this.modelName}_states_t derivatives;\n`
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time,\n'
    code += '        &model->inputs,\n'
    code += '        &model->signals,\n'
    code += '        &model->states,\n'
    code += '        &derivatives'
    
    // Add enable states parameter if needed
    if (this.hasEnableSubsystems()) {
      code += ',\n        &model->enable_states'
    }
    
    code += '\n    );\n\n'
    
    // Then update states
    code += '    /* Update states using Euler method */\n'
    
    // Generate state update for each stateful block
    for (const block of statefulBlocks) {
      code += this.generateEulerBlockUpdate(block)
    }
    
    return code
  }
  
  /**
   * Generate Euler update for a single block
   */
  private generateEulerBlockUpdate(block: FlattenedBlock): string {
    let code = ''
    
    try {
      const generator = BlockModuleFactory.getBlockModule(block.block.type)
      
      if (!generator.requiresState(block.block)) {
        return ''
      }
      
      // Add block comment
      if (this.options.includeComments) {
        code += `    /* Update states for ${block.flattenedName} */\n`
      }
      
      // Check if block is in an enable scope
      if (this.options.checkEnableStates && this.hasEnableScope(block)) {
        const enableCheck = this.generateEnableCheck(block)
        code += `    if (${enableCheck}) {\n`
        code += this.generateBlockStateUpdate(block, generator, 2)
        code += '    }\n'
      } else {
        code += this.generateBlockStateUpdate(block, generator, 1)
      }
      
    } catch (error) {
      code += `    /* Error generating state update for ${block.block.type}: ${error} */\n`
    }
    
    return code
  }
  
  /**
   * Generate the actual state update code for a block
   */
  private generateBlockStateUpdate(
    block: FlattenedBlock,
    generator: any,
    indentLevel: number = 1
  ): string {
    const indent = '    '.repeat(indentLevel)
    let code = ''
    
    // For transfer functions, we need to update states based on derivatives
    if (block.block.type === 'transfer_function') {
      const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
      const denominator = block.block.parameters?.denominator || [1, 1]
      const stateOrder = Math.max(0, denominator.length - 1)
      
      if (stateOrder > 0) {
        const typeInfo = this.getBlockTypeInfo(block)
        
        if (typeInfo.isMatrix) {
          const [rows, cols] = typeInfo.dimensions
          code += `${indent}for (int i = 0; i < ${rows}; i++) {\n`
          code += `${indent}    for (int j = 0; j < ${cols}; j++) {\n`
          code += `${indent}        for (int k = 0; k < ${stateOrder}; k++) {\n`
          code += `${indent}            model->states.${safeName}_states[i][j][k] += model->dt * derivatives.${safeName}_states[i][j][k];\n`
          code += `${indent}        }\n`
          code += `${indent}    }\n`
          code += `${indent}}\n`
        } else if (typeInfo.isVector) {
          const size = typeInfo.dimensions[0]
          code += `${indent}for (int i = 0; i < ${size}; i++) {\n`
          code += `${indent}    for (int j = 0; j < ${stateOrder}; j++) {\n`
          code += `${indent}        model->states.${safeName}_states[i][j] += model->dt * derivatives.${safeName}_states[i][j];\n`
          code += `${indent}    }\n`
          code += `${indent}}\n`
        } else {
          code += `${indent}for (int i = 0; i < ${stateOrder}; i++) {\n`
          code += `${indent}    model->states.${safeName}_states[i] += model->dt * derivatives.${safeName}_states[i];\n`
          code += `${indent}}\n`
        }
      }
    }
    
    return code
  }
  
  /**
   * Generate RK4 integration code
   */
  generateRK4Integration(): string {
    const statefulBlocks = this.getStatefulBlocks()
    
    if (statefulBlocks.length === 0) {
      return '    /* No state integration needed - no stateful blocks */\n'
    }
    
    let code = ''
    
    if (this.options.includeComments) {
      code += '    /* RK4 Integration (Runge-Kutta 4th order) */\n'
    }
    
    // Declare RK4 temporary variables
    code += '    /* RK4 temporary variables */\n'
    code += `    ${this.modelName}_states_t k1, k2, k3, k4;\n`
    code += `    ${this.modelName}_states_t temp_states;\n`
    code += `    ${this.modelName}_signals_t temp_signals;\n`
    code += `    ${this.modelName}_outputs_t temp_outputs;\n`
    code += '    double h = model->dt;\n'
    code += '    double half_h = h * 0.5;\n\n'
    
    // k1 = f(t, y)
    code += '    /* Calculate k1 = f(t, y) */\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time,\n'
    code += '        &model->inputs,\n'
    code += '        &model->signals,\n'
    code += '        &model->states,\n'
    code += '        &k1'
    
    if (this.hasEnableSubsystems()) {
      code += ',\n        &model->enable_states'
    }
    
    code += '\n    );\n\n'
    
    // k2 = f(t + h/2, y + h/2 * k1)
    code += '    /* Calculate k2 = f(t + h/2, y + h/2 * k1) */\n'
    code += this.generateStateUpdate('temp_states', 'model->states', 'k1', 'half_h')
    code += '\n'
    code += '    /* Re-evaluate algebraic relationships with updated states */\n'
    code += `    ${this.modelName}_evaluate_algebraic(\n`
    code += '        &model->inputs,\n'
    code += '        &temp_states,\n'
    code += '        &temp_signals,\n'
    code += '        &temp_outputs,\n'
    code += '        &model->enable_states\n'
    code += '    );\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + half_h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_signals,\n'
    code += '        &temp_states,\n'
    code += '        &k2'
    
    if (this.hasEnableSubsystems()) {
      code += ',\n        &model->enable_states'
    }
    
    code += '\n    );\n\n'
    
    // k3 = f(t + h/2, y + h/2 * k2)
    code += '    /* Calculate k3 = f(t + h/2, y + h/2 * k2) */\n'
    code += this.generateStateUpdate('temp_states', 'model->states', 'k2', 'half_h')
    code += '\n'
    code += '    /* Re-evaluate algebraic relationships with updated states */\n'
    code += `    ${this.modelName}_evaluate_algebraic(\n`
    code += '        &model->inputs,\n'
    code += '        &temp_states,\n'
    code += '        &temp_signals,\n'
    code += '        &temp_outputs,\n'
    code += '        &model->enable_states\n'
    code += '    );\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + half_h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_signals,\n'
    code += '        &temp_states,\n'
    code += '        &k3'
    
    if (this.hasEnableSubsystems()) {
      code += ',\n        &model->enable_states'
    }
    
    code += '\n    );\n\n'
    
    // k4 = f(t + h, y + h * k3)
    code += '    /* Calculate k4 = f(t + h, y + h * k3) */\n'
    code += this.generateStateUpdate('temp_states', 'model->states', 'k3', 'h')
    code += '\n'
    code += '    /* Re-evaluate algebraic relationships with updated states */\n'
    code += `    ${this.modelName}_evaluate_algebraic(\n`
    code += '        &model->inputs,\n'
    code += '        &temp_states,\n'
    code += '        &temp_signals,\n'
    code += '        &temp_outputs,\n'
    code += '        &model->enable_states\n'
    code += '    );\n'
    code += `    ${this.modelName}_derivatives(\n`
    code += '        model->time + h,\n'
    code += '        &model->inputs,\n'
    code += '        &temp_signals,\n'
    code += '        &temp_states,\n'
    code += '        &k4'
    
    if (this.hasEnableSubsystems()) {
      code += ',\n        &model->enable_states'
    }
    
    code += '\n    );\n\n'
    
    // Update states using RK4 formula
    code += '    /* Update states using RK4 formula: y[n+1] = y[n] + h/6 * (k1 + 2*k2 + 2*k3 + k4) */\n'
    code += this.generateRK4FinalUpdate(statefulBlocks)
    
    return code
  }
  
  /**
   * Generate code to update temporary states
   */
  private generateStateUpdate(
    dest: string,
    source: string,
    derivative: string,
    factor: string
  ): string {
    let code = ''
    const statefulBlocks = this.getStatefulBlocks()
    
    for (const block of statefulBlocks) {
      if (block.block.type === 'transfer_function') {
        const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
        const denominator = block.block.parameters?.denominator || [1, 1]
        const stateOrder = Math.max(0, denominator.length - 1)
        
        if (stateOrder > 0) {
          const typeInfo = this.getBlockTypeInfo(block)
          
          if (typeInfo.isMatrix) {
            const [rows, cols] = typeInfo.dimensions
            code += `    for (int i = 0; i < ${rows}; i++) {\n`
            code += `        for (int j = 0; j < ${cols}; j++) {\n`
            code += `            for (int k = 0; k < ${stateOrder}; k++) {\n`
            code += `                ${dest}.${safeName}_states[i][j][k] = ${source}.${safeName}_states[i][j][k] + ${factor} * ${derivative}.${safeName}_states[i][j][k];\n`
            code += `            }\n`
            code += `        }\n`
            code += `    }\n`
          } else if (typeInfo.isVector) {
            const size = typeInfo.dimensions[0]
            code += `    for (int i = 0; i < ${size}; i++) {\n`
            code += `        for (int j = 0; j < ${stateOrder}; j++) {\n`
            code += `            ${dest}.${safeName}_states[i][j] = ${source}.${safeName}_states[i][j] + ${factor} * ${derivative}.${safeName}_states[i][j];\n`
            code += `        }\n`
            code += `    }\n`
          } else {
            code += `    for (int i = 0; i < ${stateOrder}; i++) {\n`
            code += `        ${dest}.${safeName}_states[i] = ${source}.${safeName}_states[i] + ${factor} * ${derivative}.${safeName}_states[i];\n`
            code += `    }\n`
          }
        }
      }
    }
    
    return code
  }
  
  /**
   * Generate final RK4 state update
   */
  private generateRK4FinalUpdate(statefulBlocks: FlattenedBlock[]): string {
    let code = ''
    
    for (const block of statefulBlocks) {
      if (block.block.type === 'transfer_function') {
        // Check if block is in an enable scope
        if (this.options.checkEnableStates && this.hasEnableScope(block)) {
          const enableCheck = this.generateEnableCheck(block)
          code += `    if (${enableCheck}) {\n`
          code += this.generateRK4BlockUpdate(block, 2)
          code += '    }\n'
        } else {
          code += this.generateRK4BlockUpdate(block, 1)
        }
      }
    }
    
    return code
  }
  
  /**
   * Generate RK4 update for a single block
   */
  private generateRK4BlockUpdate(block: FlattenedBlock, indentLevel: number = 1): string {
    const indent = '    '.repeat(indentLevel)
    let code = ''
    
    const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
    const denominator = block.block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder > 0) {
      const typeInfo = this.getBlockTypeInfo(block)
      
      if (typeInfo.isMatrix) {
        const [rows, cols] = typeInfo.dimensions
        code += `${indent}for (int i = 0; i < ${rows}; i++) {\n`
        code += `${indent}    for (int j = 0; j < ${cols}; j++) {\n`
        code += `${indent}        for (int k = 0; k < ${stateOrder}; k++) {\n`
        code += `${indent}            model->states.${safeName}_states[i][j][k] += (h / 6.0) * (\n`
        code += `${indent}                k1.${safeName}_states[i][j][k] +\n`
        code += `${indent}                2.0 * k2.${safeName}_states[i][j][k] +\n`
        code += `${indent}                2.0 * k3.${safeName}_states[i][j][k] +\n`
        code += `${indent}                k4.${safeName}_states[i][j][k]\n`
        code += `${indent}            );\n`
        code += `${indent}        }\n`
        code += `${indent}    }\n`
        code += `${indent}}\n`
      } else if (typeInfo.isVector) {
        const size = typeInfo.dimensions[0]
        code += `${indent}for (int i = 0; i < ${size}; i++) {\n`
        code += `${indent}    for (int j = 0; j < ${stateOrder}; j++) {\n`
        code += `${indent}        model->states.${safeName}_states[i][j] += (h / 6.0) * (\n`
        code += `${indent}            k1.${safeName}_states[i][j] +\n`
        code += `${indent}            2.0 * k2.${safeName}_states[i][j] +\n`
        code += `${indent}            2.0 * k3.${safeName}_states[i][j] +\n`
        code += `${indent}            k4.${safeName}_states[i][j]\n`
        code += `${indent}        );\n`
        code += `${indent}    }\n`
        code += `${indent}}\n`
      } else {
        code += `${indent}for (int i = 0; i < ${stateOrder}; i++) {\n`
        code += `${indent}    model->states.${safeName}_states[i] += (h / 6.0) * (\n`
        code += `${indent}        k1.${safeName}_states[i] +\n`
        code += `${indent}        2.0 * k2.${safeName}_states[i] +\n`
        code += `${indent}        2.0 * k3.${safeName}_states[i] +\n`
        code += `${indent}        k4.${safeName}_states[i]\n`
        code += `${indent}    );\n`
        code += `${indent}}\n`
      }
    }
    
    return code
  }
  
  /**
   * Get detailed type information for a block's output
   */
  private getBlockTypeInfo(block: FlattenedBlock): {
    baseType: string,
    isVector: boolean,
    isMatrix: boolean,
    dimensions: number[]
  } {
    const outputType = this.getBlockOutputType(block)
    const matrixMatch = outputType.match(/(\w+)\[(\d+)\]\[(\d+)\]/)
    const vectorMatch = outputType.match(/(\w+)\[(\d+)\]/)
    
    if (matrixMatch) {
      return {
        baseType: matrixMatch[1],
        isVector: false,
        isMatrix: true,
        dimensions: [parseInt(matrixMatch[2]), parseInt(matrixMatch[3])]
      }
    } else if (vectorMatch) {
      return {
        baseType: vectorMatch[1],
        isVector: true,
        isMatrix: false,
        dimensions: [parseInt(vectorMatch[2])]
      }
    } else {
      return {
        baseType: outputType,
        isVector: false,
        isMatrix: false,
        dimensions: []
      }
    }
  }
  
  /**
   * Check if the model has subsystems with enable inputs
   */
  private hasEnableSubsystems(): boolean {
    return this.model.subsystemEnableInfo.some(info => info.hasEnableInput)
  }
  
  /**
   * Check if a block has an enable scope
   */
  private hasEnableScope(block: FlattenedBlock): boolean {
    const enableScope = this.model.enableScopes.get(block.originalId)
    if (!enableScope) return false
    
    const subsystemInfo = this.model.subsystemEnableInfo.find(
      info => info.subsystemId === enableScope
    )
    
    return subsystemInfo?.hasEnableInput ?? false
  }
  
  /**
   * Generate enable check expression for a block
   */
  private generateEnableCheck(block: FlattenedBlock): string {
    const enableScope = this.model.enableScopes.get(block.originalId)
    if (!enableScope) return '1'
    
    const subsystemInfo = this.model.subsystemEnableInfo.find(
      info => info.subsystemId === enableScope
    )
    
    if (!subsystemInfo || !subsystemInfo.hasEnableInput) {
      return '1'
    }
    
    const safeName = CCodeBuilder.sanitizeIdentifier(subsystemInfo.subsystemName)
    return `model->enable_states.${safeName}_enabled`
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
   * Get output type for a block
   */
  private getBlockOutputType(block: FlattenedBlock): string {
    // This should ideally come from a type map
    const dataType = block.block.parameters?.dataType
    if (dataType) return dataType
    
    return 'double'
  }
  
  /**
   * Check if the model has any stateful blocks
   */
  hasStatefulBlocks(): boolean {
    return this.getStatefulBlocks().length > 0
  }
}