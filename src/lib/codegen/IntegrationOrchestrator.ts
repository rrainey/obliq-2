// lib/codegen/IntegrationOrchestrator.ts

import { FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { StateIntegrator } from './StateIntegrator'

/**
 * Options for integration orchestrator code generation
 */
export interface IntegrationOrchestratorOptions {
  /** Whether to include debug comments */
  includeComments?: boolean
  
  /** Integration method to use (euler, rk4, etc.) */
  integrationMethod?: 'euler' | 'rk4'
  
  /** Whether to include timing instrumentation */
  includeTiming?: boolean
}

/**
 * Generates the main step function that orchestrates algebraic evaluation and state integration.
 * This class implements the integration layer of the two-layer architecture.
 */
export class IntegrationOrchestrator {
  private model: FlattenedModel
  private modelName: string
  private options: Required<IntegrationOrchestratorOptions>
  private stateIntegrator: StateIntegrator
  
  constructor(
    model: FlattenedModel,
    options: IntegrationOrchestratorOptions = {}
  ) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
    this.options = {
      includeComments: options.includeComments ?? true,
      integrationMethod: options.integrationMethod ?? 'rk4',
      includeTiming: options.includeTiming ?? false
    }
    this.stateIntegrator = new StateIntegrator(model, {
      includeComments: this.options.includeComments
    })
  }
  
  /**
   * Generate the main step function
   */
  generate(): string {
    let code = ''
    
    if (this.options.includeComments) {
      code += CCodeBuilder.generateCommentBlock([
        'Main simulation step function',
        'Orchestrates algebraic evaluation and state integration',
        `Integration method: ${this.options.integrationMethod.toUpperCase()}`
      ])
    }
    
    code += CCodeBuilder.generateFunctionHeader(
      'void',
      `${this.modelName}_step`,
      [`${this.modelName}_t* model`]
    )
    
    // Call algebraic evaluation function
    code += '    /* Evaluate algebraic relationships */\n'
    code += `    ${this.modelName}_evaluate_algebraic(\n`
    code += '        &model->inputs,\n'
    code += '        &model->states,\n'
    code += '        &model->signals,\n'
    code += '        &model->outputs,\n'
    code += '        &model->enable_states\n'
    code += '    );\n'
    code += '\n'
    
    // State integration
    if (this.stateIntegrator.hasStatefulBlocks()) {
      if (this.options.integrationMethod === 'euler') {
        code += this.stateIntegrator.generateEulerIntegration()
      } else if (this.options.integrationMethod === 'rk4') {
        code += this.stateIntegrator.generateRK4Integration()
      } else {
        // Other methods - placeholder
        code += '    /* Unsupported integration method */\n'
      }
      code += '\n'
    }
    
    // Evaluate enable states at end of step (if needed)
    if (this.hasEnableSubsystems()) {
      code += '    /* Evaluate enable states for next step */\n'
      code += `    ${this.modelName}_evaluate_enable_states(model);\n`
      code += '\n'
    }
    
    // Update simulation time
    code += '    /* Update simulation time */\n'
    code += '    model->time += model->dt;\n'
    code += '\n'
    
    code += '}\n'
    
    return code
  }
  
  /**
   * Get the function name for the step function
   */
  getFunctionName(): string {
    return `${this.modelName}_step`
  }
  
  /**
   * Check if the model has stateful blocks
   */
  private hasStatefulBlocks(): boolean {
    return this.stateIntegrator.hasStatefulBlocks()
  }
  
  /**
   * Check if the model has subsystems with enable inputs
   */
  private hasEnableSubsystems(): boolean {
    return this.model.subsystemEnableInfo.some(info => info.hasEnableInput)
  }
}