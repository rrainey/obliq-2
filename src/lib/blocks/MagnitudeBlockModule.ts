// lib/blocks/MagnitudeBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MagnitudeBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Magnitude block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    const inputExpr = inputs[0]
    
    // Get the vector dimension from the input type
    const inputType = this.getInputTypeFromContext(block, 0)
    const typeInfo = BlockModuleUtils.parseType(inputType || 'double[3]')
    const vectorSize = typeInfo.arraySize || 3
    
    // Generate magnitude computation with known size
    code += `    ${outputName} = 0.0;\n`
    code += `    for (int i = 0; i < ${vectorSize}; i++) {\n`
    code += `        ${outputName} += ${inputExpr}[i] * ${inputExpr}[i];\n`
    code += `    }\n`
    code += `    ${outputName} = sqrt(${outputName});\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Magnitude always outputs a scalar
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input = inputs[0]
    
    if (!Array.isArray(input)) {
      console.warn('Magnitude requires vector input')
      blockState.outputs[0] = 0
      return
    }
    
    // Calculate magnitude of vector: sqrt(sum of squares)
    let sumOfSquares = 0
    for (let i = 0; i < input.length; i++) {
      sumOfSquares += (input[i] as number) * (input[i] as number)
    }
    
    blockState.outputs[0] = Math.sqrt(sumOfSquares)
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  // Helper method - in practice this would get the type from the connection context
  private getInputTypeFromContext(block: BlockData, portIndex: number): string | null {
    // This is a placeholder - the actual implementation would need access to
    // the connected wire types through the code generation context
    return null
  }
}