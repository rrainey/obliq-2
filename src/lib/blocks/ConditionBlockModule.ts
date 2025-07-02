// lib/blocks/ConditionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
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
    const validOperators = ['>', '<', '>=', '<=', '==', '!=']
    const operatorMatch = condition.match(/^\s*(>|<|>=|<=|==|!=)\s*(.+)$/)
    
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

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    if (inputs.length !== 1) {
      console.warn('Condition block requires exactly 1 input')
      blockState.outputs[0] = false
      return
    }
    
    const input = inputs[0]
    
    // Only accept scalar numeric inputs
    if (typeof input !== 'number') {
      console.warn('Condition block requires scalar numeric input')
      blockState.outputs[0] = false
      return
    }
    
    // Get the condition from blockData if available, otherwise from internal state
    const condition = blockState.blockData?.parameters?.condition || 
                     blockState.internalState?.condition || 
                     '> 0'
    
    // Parse the condition
    const operatorMatch = condition.match(/^\s*(>|<|>=|<=|==|!=)\s*(.+)$/)
    
    if (!operatorMatch) {
      console.warn(`Invalid condition format: ${condition}`)
      blockState.outputs[0] = false
      return
    }
    
    const operator = operatorMatch[1]
    const valueStr = operatorMatch[2].trim()
    
    // Parse the comparison value
    let comparisonValue: number
    try {
      // Handle common C-style numeric formats
      if (valueStr.endsWith('f') || valueStr.endsWith('F')) {
        comparisonValue = parseFloat(valueStr.slice(0, -1))
      } else if (valueStr.endsWith('L') || valueStr.endsWith('l')) {
        comparisonValue = parseFloat(valueStr.slice(0, -1))
      } else {
        comparisonValue = parseFloat(valueStr)
      }
      
      if (isNaN(comparisonValue)) {
        throw new Error('Not a number')
      }
    } catch {
      console.warn(`Invalid comparison value: ${valueStr}`)
      blockState.outputs[0] = false
      return
    }
    
    // Perform the comparison
    let result: boolean
    switch (operator) {
      case '>':
        result = input > comparisonValue
        break
      case '<':
        result = input < comparisonValue
        break
      case '>=':
        result = input >= comparisonValue
        break
      case '<=':
        result = input <= comparisonValue
        break
      case '==':
        result = Math.abs(input - comparisonValue) < Number.EPSILON
        break
      case '!=':
        result = Math.abs(input - comparisonValue) >= Number.EPSILON
        break
      default:
        result = false
    }
    
    blockState.outputs[0] = result
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