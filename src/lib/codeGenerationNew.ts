// lib/codeGenerationNew.ts

import { Sheet } from '@/lib/simulationTypes'
import { CodeGenerator, CodeGenerationOptions } from './codegen/CodeGenerator'
import { ModelParameter } from './modelSchema'

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
   * @param parameters Model parameters (Feature 3)
   * @returns Object containing header and source code
   */
  generateCode(sheets: Sheet[], modelName: string = 'model', parameters: ModelParameter[] = []): {
    header: string
    source: string
    warnings: string[]
    subsystemFiles: Array<{ header: string; source: string; subsystemName: string; warnings: string[] }>
  } {
    // Pass integration method from metadata if available
    const options = {
      ...this.generator.options,
      modelName,
      integrationMethod: (sheets[0] as any)?.metadata?.integrationMethod
    }

    // Create new generator with updated options
    const customGenerator = new CodeGenerator(options)
    const result = customGenerator.generate(sheets, parameters)

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
      enabledSubsystems: result.stats.enabledSubsystems,
      segregatedSubsystems: result.stats.segregatedSubsystems
    })

    return {
      header: result.header,
      source: result.source,
      warnings: result.warnings,
      subsystemFiles: result.subsystemFiles
    }
  }
  
  /**
   * Generate code with specific options
   */
  generateCodeWithOptions(
    sheets: Sheet[],
    options: CodeGenerationOptions,
    parameters: ModelParameter[] = []
  ): {
    header: string
    source: string
    warnings: string[]
  } {
    const customGenerator = new CodeGenerator(options)
    const result = customGenerator.generate(sheets, parameters)

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