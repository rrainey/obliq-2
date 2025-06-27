// lib/blocks/ScaleBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class ScaleBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const gain = block.parameters?.gain || 1
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No input\n`
    }
    
    const inputExpr = inputs[0]
    const outputType = this.getOutputType(block, [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    let code = `    // Scale block: ${block.name} (gain = ${gain})\n`
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Scale each element of the matrix
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${inputExpr}[i][j] * ${gain};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Scale each element of the vector
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
      code += `    }\n`
    } else {
      // Scale scalar
      code += `    ${outputName} = ${inputExpr} * ${gain};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Scale block output type matches input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Scale blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Scale blocks don't need state variables
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
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
    const input = inputs[0] // Single input
    const gain = blockState.blockData?.parameters?.gain ?? 1
    
    if (Array.isArray(input) && Array.isArray(input[0])) {
      // Matrix scaling
      const matrix = input as unknown as number[][]
      blockState.outputs[0] = matrix.map(row => 
        row.map(val => val * gain)
      )
    } else if (Array.isArray(input)) {
      // Vector scaling
      blockState.outputs[0] = (input as number[]).map(val => val * gain)
    } else if (typeof input === 'number') {
      // Scalar scaling
      blockState.outputs[0] = input * gain
    } else {
      blockState.outputs[0] = 0
    }
  }

  getInputPortCount(block: BlockData): number {
    // Scale blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Scale blocks have exactly 1 output
    return 1
  }


}