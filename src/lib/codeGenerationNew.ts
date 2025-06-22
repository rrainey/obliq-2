// lib/codeGenerationNew.ts

import { Sheet } from '@/lib/simulationEngine'
import { CodeGenerator, CodeGenerationOptions } from './codegen/CodeGenerator'

/**
 * Wrapper class to maintain backward compatibility with existing code
 * while using the new modular code generation system
 */
export class ModelCodeGenerator {
  private generator: CodeGenerator
  
  constructor(options: CodeGenerationOptions = {}) {
    this.generator = new CodeGenerator(options)
  }
  
  /**
   * Generate C code from model sheets
   * @param sheets Array of model sheets
   * @param modelName Name for the generated model (defaults to 'model')
   * @returns Object containing header and source code
   */
  generateCode(sheets: Sheet[], modelName: string = 'model'): {
    header: string
    source: string
    warnings: string[]
  } {
    // Use the new generator with the provided model name
    const result = this.generator.generate(sheets)
    
    // Log any warnings
    if (result.warnings.length > 0) {
      console.warn('Code generation warnings:', result.warnings)
    }
    
    // Log statistics
    console.log('Code generation complete:', {
      blocks: result.stats.blocksProcessed,
      connections: result.stats.connectionsProcessed,
      subsystems: result.stats.subsystemsFlattened,
      states: result.stats.statesGenerated,
      enabledSubsystems: result.stats.enabledSubsystems
    })
    
    return {
      header: result.header,
      source: result.source,
      warnings: result.warnings
    }
  }
  
  /**
   * Generate code with specific options
   */
  generateCodeWithOptions(
    sheets: Sheet[],
    options: CodeGenerationOptions
  ): {
    header: string
    source: string
    warnings: string[]
  } {
    const customGenerator = new CodeGenerator(options)
    const result = customGenerator.generate(sheets)
    
    return {
      header: result.header,
      source: result.source,
      warnings: result.warnings
    }
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use ModelCodeGenerator class instead
 */
export function generateCCode(
  sheets: Sheet[],
  modelName: string = 'model'
): {
  header: string
  source: string
} {
  const generator = new ModelCodeGenerator({ modelName })
  const result = generator.generateCode(sheets, modelName)
  
  return {
    header: result.header,
    source: result.source
  }
}

/**
 * Export the new modular components for direct use
 */
export { CodeGenerator } from './codegen/CodeGenerator'
export { ModelFlattener } from './codegen/ModelFlattener'
export { CCodeBuilder } from './codegen/CCodeBuilder'
export { HeaderGenerator } from './codegen/HeaderGenerator'
export { InitFunctionGenerator } from './codegen/InitFunctionGenerator'
export { StepFunctionGenerator } from './codegen/StepFunctionGenerator'
export { EnableEvaluator } from './codegen/EnableEvaluator'
export { RK4Generator } from './codegen/RK4Generator'

// Export types
export type { CodeGenerationOptions, CodeGenerationResult } from './codegen/CodeGenerator'
export type { 
  FlattenedModel, 
  FlattenedBlock, 
  FlattenedConnection,
  SubsystemEnableInfo,
  ModelFlattenerOptions,
  FlatteningResult
} from './codegen/ModelFlattener'