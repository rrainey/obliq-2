// lib/blocks/TrigBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
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