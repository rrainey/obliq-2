// lib/blocks/CrossProductBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class CrossProductBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Cross product block: ${block.name}\n`
    
    if (inputs.length < 2) {
      code += `    // Error: Cross product requires 2 inputs\n`
      code += `    ${outputName}[0] = 0.0;\n`
      code += `    ${outputName}[1] = 0.0;\n`
      code += `    ${outputName}[2] = 0.0;\n`
      return code
    }
    
    // Note: Cross product is only defined for 3D vectors
    // For now, we assume the inputs are 3D vectors - type checking ensures this
    code += `    // Cross product: a × b = [a1*b2 - a2*b1, a2*b0 - a0*b2, a0*b1 - a1*b0]\n`
    code += `    ${outputName}[0] = ${inputs[0]}[1] * ${inputs[1]}[2] - ${inputs[0]}[2] * ${inputs[1]}[1];\n`
    code += `    ${outputName}[1] = ${inputs[0]}[2] * ${inputs[1]}[0] - ${inputs[0]}[0] * ${inputs[1]}[2];\n`
    code += `    ${outputName}[2] = ${inputs[0]}[0] * ${inputs[1]}[1] - ${inputs[0]}[1] * ${inputs[1]}[0];\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Cross product always outputs a 3-element vector
    // Note: In a full implementation, we might validate that inputs are double[3]
    return 'double[3]'
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
      console.warn('Cross product requires vector inputs')
      blockState.outputs[0] = [0, 0, 0]
      return
    }
    
    // Cross product is only defined for 3D vectors
    if (input1.length !== 3 || input2.length !== 3) {
      console.warn('Cross product requires 3D vectors')
      blockState.outputs[0] = [0, 0, 0]
      return
    }
    
    const a = input1 as number[]
    const b = input2 as number[]
    
    // Calculate cross product: a × b
    blockState.outputs[0] = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ]
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
}