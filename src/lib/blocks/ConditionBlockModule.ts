// lib/blocks/ConditionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class ConditionBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Condition block: ${block.name}\n`
    
    if (inputs.length !== 1) {
      code += `    // Error: Condition block requires exactly 1 input\n`
      code += `    ${outputName} = false;\n`
      return code
    }
    
    const input = inputs[0]
    const condition = block.parameters?.condition || '> 0'
    
    // Validate condition format
    const validOperators = ['>=', '<=', '==', '!=', '>', '<']
    // Longer operators MUST come first — otherwise `>=` matches as `>` + `= value`
    const operatorMatch = condition.match(/^\s*(>=|<=|==|!=|>|<)\s*(.+)$/)
    
    if (!operatorMatch) {
      code += `    // Error: Invalid condition format: ${condition}\n`
      code += `    ${outputName} = false;\n`
      return code
    }
    
    const operator = operatorMatch[1]
    const value = operatorMatch[2].trim()
    
    code += `    // Evaluate condition: input ${operator} ${value}\n`
    code += `    ${outputName} = (${input} ${operator} ${value});\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Condition block always outputs bool
    return 'bool'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Always generate a bool member
    return `    bool ${BlockModuleUtils.sanitizeIdentifier(block.name)};`
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }


  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['x1']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['bool']
  }
}