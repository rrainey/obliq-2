// lib/blocks/TrigBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TrigBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const func = block.parameters?.function || 'sin'
    
    let code = `    // Trig block: ${block.name} (${func})\n`
    
    if (func === 'atan2') {
      // atan2 requires 2 inputs
      if (inputs.length < 2) {
        code += `    ${outputName} = 0.0; // Error: atan2 requires 2 inputs\n`
      } else {
        code += `    ${outputName} = atan2(${inputs[0]}, ${inputs[1]});\n`
      }
    } else if (func === 'sincos') {
      // sincos has 2 outputs
      const outputName2 = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}_cos`
      if (inputs.length === 0) {
        code += `    ${outputName} = 0.0; // No input\n`
        code += `    ${outputName2} = 1.0; // No input\n`
      } else {
        code += `    ${outputName} = sin(${inputs[0]});\n`
        code += `    ${outputName2} = cos(${inputs[0]});\n`
      }
    } else {
      // Single input, single output functions
      if (inputs.length === 0) {
        code += `    ${outputName} = 0.0; // No input\n`
      } else {
        switch (func) {
          case 'sin':
            code += `    ${outputName} = sin(${inputs[0]});\n`
            break
          case 'cos':
            code += `    ${outputName} = cos(${inputs[0]});\n`
            break
          case 'atan':
            code += `    ${outputName} = atan(${inputs[0]});\n`
            break
          default:
            code += `    ${outputName} = 0.0; // Unknown function\n`
        }
      }
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Trig blocks always output double
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    const func = block.parameters?.function || 'sin'
    
    if (func === 'sincos') {
      // sincos needs two output signals
      const name1 = BlockModuleUtils.sanitizeIdentifier(block.name)
      const name2 = BlockModuleUtils.sanitizeIdentifier(block.name + '_cos')
      return `    double ${name1};\n    double ${name2};`
    } else {
      // Single output
      return BlockModuleUtils.generateStructMember(block.name, outputType)
    }
  }

  requiresState(block: BlockData): boolean {
    // Trig blocks don't need state variables
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
    const func = blockState.blockData?.parameters?.function || 'sin'
    
    if (func === 'atan2') {
      // atan2(y, x) - requires 2 inputs
      const y = typeof inputs[0] === 'number' ? inputs[0] : 0
      const x = typeof inputs[1] === 'number' ? inputs[1] : 0
      blockState.outputs[0] = Math.atan2(y, x)
    } else if (func === 'sincos') {
      // sincos(x) - 1 input, 2 outputs
      const input = typeof inputs[0] === 'number' ? inputs[0] : 0
      blockState.outputs[0] = Math.sin(input)
      blockState.outputs[1] = Math.cos(input)
    } else {
      // Single input, single output functions
      const input = typeof inputs[0] === 'number' ? inputs[0] : 0
      
      switch (func) {
        case 'sin':
          blockState.outputs[0] = Math.sin(input)
          break
        case 'cos':
          blockState.outputs[0] = Math.cos(input)
          break
        case 'atan':
          blockState.outputs[0] = Math.atan(input)
          break
        default:
          blockState.outputs[0] = 0
      }
    }
  }

  getInputPortCount(block: BlockData): number {
    const func = block.parameters?.function || 'sin'
    // atan2 requires 2 inputs (y, x), all others require 1
    return func === 'atan2' ? 2 : 1
  }

  getOutputPortCount(block: BlockData): number {
    const func = block.parameters?.function || 'sin'
    // sincos has 2 outputs, all others have 1
    return func === 'sincos' ? 2 : 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    const func = block.parameters?.function || 'sin'
    if (func === 'atan2') {
      return ['y', 'x']
    }
    return ['input1']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    const func = block.parameters?.function || 'sin'
    if (func === 'sincos') {
      return ['sin', 'cos']
    }
    return ['output 1']
  }
}