// lib/blocks/DotProductBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DotProductBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Dot product block: ${block.name}\n`
    
    if (inputs.length < 2) {
      code += `    ${outputName} = 0.0; // Error: Dot product requires 2 inputs\n`
      return code
    }
    
    // Get the vector dimension from the first input type
    // This assumes type validation has ensured both inputs have the same dimensions
    const inputType1 = this.getInputTypeFromContext(block, 0) // This would need context
    const typeInfo = BlockModuleUtils.parseType(inputType1 || 'double[3]')
    const vectorSize = typeInfo.arraySize || 3
    
    // Generate dot product computation with known size
    code += `    ${outputName} = 0.0;\n`
    code += `    for (int i = 0; i < ${vectorSize}; i++) {\n`
    code += `        ${outputName} += ${inputs[0]}[i] * ${inputs[1]}[i];\n`
    code += `    }\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Dot product always outputs a scalar
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
    const input1 = inputs[0]
    const input2 = inputs[1]
    
    if (!Array.isArray(input1) || !Array.isArray(input2)) {
      console.warn('Dot product requires vector inputs')
      blockState.outputs[0] = 0
      return
    }
    
    // Vectors must have the same dimension
    if (input1.length !== input2.length) {
      console.warn(`Dot product requires vectors of same dimension. Got ${input1.length} and ${input2.length}`)
      blockState.outputs[0] = 0
      return
    }
    
    // Calculate dot product
    let dotProduct = 0
    for (let i = 0; i < input1.length; i++) {
      dotProduct += (input1[i] as number) * (input2[i] as number)
    }
    
    blockState.outputs[0] = dotProduct
  }

  getInputPortCount(block: BlockData): number {
    return 2
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['a', 'b']
  }

  // Helper method - in practice this would get the type from the connection context
  private getInputTypeFromContext(block: BlockData, portIndex: number): string | null {
    // This is a placeholder - the actual implementation would need access to
    // the connected wire types through the code generation context
    return null
  }
}