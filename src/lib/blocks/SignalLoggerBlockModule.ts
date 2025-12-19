// lib/blocks/SignalLoggerBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SignalLoggerBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Signal logger blocks don't generate C code
    // They are only used for simulation data collection
    return `    // Signal logger block: ${block.name} (ignored in generated code)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Signal logger blocks have no outputs
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Signal logger blocks don't need signal storage
    return null
  }

  requiresState(block: BlockData): boolean {
    // Signal logger blocks don't need state in generated code
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed in generated code
    return []
  }

  generateInitialization(block: BlockData): string {
    // No initialization needed
    return ''
  }

  getInputPortCount(block: BlockData): number {
    // Signal logger blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Signal logger blocks have no outputs (they are sinks)
    return 0
  }

  // No custom port labels needed
  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  // Data collection methods for WASM code generation
  employsDataCollection(block: BlockData): boolean {
    return true
  }

  getMaxSampleCount(block: BlockData): number {
    return block.parameters?.maxSamples || 1000
  }

  generateDataCollectionStructMembers(block: BlockData, inputType: string): string[] {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    const members: string[] = []

    // Sample buffer pointer (type depends on input signal type)
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // For matrix: double (*samples)[rows][cols]
      members.push(`    double (*${safeName}_samples)[${typeInfo.rows}][${typeInfo.cols}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // For vector: double (*samples)[arraySize]
      members.push(`    double (*${safeName}_samples)[${typeInfo.arraySize}];`)
    } else {
      // For scalar: double* samples
      members.push(`    double* ${safeName}_samples;`)
    }

    // Current write index (wraps around for circular buffer)
    members.push(`    int ${safeName}_sample_index;`)

    // Maximum samples capacity
    members.push(`    int ${safeName}_max_samples;`)

    // Number of samples actually collected (capped at max_samples)
    members.push(`    int ${safeName}_num_samples;`)

    // Simulation time of the last recorded sample
    members.push(`    double ${safeName}_last_sample_time;`)

    return members
  }

  generateDataCollectionInit(block: BlockData, inputType: string): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const maxSamples = this.getMaxSampleCount(block)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Initialize signal logger: ${block.name}\n`
    code += `    model->${safeName}_sample_index = 0;\n`
    code += `    model->${safeName}_max_samples = ${maxSamples};\n`
    code += `    model->${safeName}_num_samples = 0;\n`
    code += `    model->${safeName}_last_sample_time = -1.0;\n`

    // Allocate sample buffer based on signal type (using max_samples variable)
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    model->${safeName}_samples = (double (*)[${typeInfo.rows}][${typeInfo.cols}])malloc(model->${safeName}_max_samples * ${typeInfo.rows} * ${typeInfo.cols} * sizeof(double));\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    model->${safeName}_samples = (double (*)[${typeInfo.arraySize}])malloc(model->${safeName}_max_samples * ${typeInfo.arraySize} * sizeof(double));\n`
    } else {
      code += `    model->${safeName}_samples = (double*)malloc(model->${safeName}_max_samples * sizeof(double));\n`
    }

    return code
  }

  generateSampleStorage(block: BlockData, inputExpression: string, inputType: string): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Store sample for logger: ${block.name} (circular buffer)\n`
    code += `    {\n`
    code += `        int idx = model->${safeName}_sample_index;\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Copy matrix element by element
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                model->${safeName}_samples[idx][i][j] = ${inputExpression}[i][j];\n`
      code += `            }\n`
      code += `        }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Copy vector element by element
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            model->${safeName}_samples[idx][i] = ${inputExpression}[i];\n`
      code += `        }\n`
    } else {
      // Copy scalar value
      code += `        model->${safeName}_samples[idx] = ${inputExpression};\n`
    }

    // Update sample index with wrap-around
    code += `        model->${safeName}_sample_index = (idx + 1) % model->${safeName}_max_samples;\n`
    // Track number of samples (capped at max_samples)
    code += `        if (model->${safeName}_num_samples < model->${safeName}_max_samples) {\n`
    code += `            model->${safeName}_num_samples++;\n`
    code += `        }\n`
    // Record the simulation time of this sample
    code += `        model->${safeName}_last_sample_time = model->time;\n`
    code += `    }\n`

    return code
  }

  generateDataCollectionCleanup(block: BlockData): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    free(model->${safeName}_samples);\n`
  }
}