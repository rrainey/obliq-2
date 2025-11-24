// lib/blocks/SignalDisplayBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SignalDisplayBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Signal display blocks don't generate C code
    // They are only used for simulation visualization
    return `    // Signal display block: ${block.name} (ignored in generated code)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Signal display blocks have no outputs
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Signal display blocks don't need signal storage
    return null
  }

  requiresState(block: BlockData): boolean {
    // Signal display blocks don't need state in generated code
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

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input = inputs[0]
    const { samples, maxSamples } = blockState.internalState
    
    // Check if input is a matrix and reject it
    if (Array.isArray(input) && Array.isArray(input[0])) {
      console.error(`Signal display block ${blockState.blockId} cannot display matrix signals. Use separate displays for each matrix element.`)
      return
    }
    
    // Store the current input value
    // For vectors, we'll store the entire vector
    samples.push(input)
    
    // Maintain maximum sample count
    if (samples.length > maxSamples) {
      samples.shift()
    }
    
    // Signal display blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  getInputPortCount(block: BlockData): number {
    // Signal display blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Signal display blocks have no outputs (they are sinks)
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

    // Current sample index
    members.push(`    int ${safeName}_sample_index;`)

    // Maximum samples capacity
    members.push(`    int ${safeName}_max_samples;`)

    return members
  }

  generateDataCollectionInit(block: BlockData, inputType: string): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const maxSamples = this.getMaxSampleCount(block)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Initialize signal display: ${block.name}\n`
    code += `    model->${safeName}_sample_index = 0;\n`
    code += `    model->${safeName}_max_samples = ${maxSamples};\n`

    // Allocate sample buffer based on signal type
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      const size = `${maxSamples} * ${typeInfo.rows} * ${typeInfo.cols}`
      code += `    model->${safeName}_samples = (double (*)[${typeInfo.rows}][${typeInfo.cols}])malloc(${size} * sizeof(double));\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      const size = `${maxSamples} * ${typeInfo.arraySize}`
      code += `    model->${safeName}_samples = (double (*)[${typeInfo.arraySize}])malloc(${size} * sizeof(double));\n`
    } else {
      code += `    model->${safeName}_samples = (double*)malloc(${maxSamples} * sizeof(double));\n`
    }

    return code
  }

  generateSampleStorage(block: BlockData, inputExpression: string, inputType: string): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Store sample for display: ${block.name}\n`
    code += `    if (model->${safeName}_sample_index < model->${safeName}_max_samples) {\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Copy matrix element by element
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                model->${safeName}_samples[model->${safeName}_sample_index][i][j] = ${inputExpression}[i][j];\n`
      code += `            }\n`
      code += `        }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Copy vector element by element
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            model->${safeName}_samples[model->${safeName}_sample_index][i] = ${inputExpression}[i];\n`
      code += `        }\n`
    } else {
      // Copy scalar value
      code += `        model->${safeName}_samples[model->${safeName}_sample_index] = ${inputExpression};\n`
    }

    code += `        model->${safeName}_sample_index++;\n`
    code += `    }\n`

    return code
  }

  generateDataCollectionCleanup(block: BlockData): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    free(model->${safeName}_samples);\n`
  }
}