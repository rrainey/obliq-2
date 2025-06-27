// lib/blocks/OutputPortBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class OutputPortBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const portName = block.parameters?.portName || 'Output'
    const safeName = BlockModuleUtils.sanitizeIdentifier(portName)
    
    if (inputs.length === 0) {
      return `    // Output port: ${portName} (no input connected)\n`
    }
    
    const inputExpr = inputs[0]
    const dataType = block.parameters?.dataType || 'double'
    const typeInfo = BlockModuleUtils.parseType(dataType)
    
    let code = `    // Output port: ${portName}\n`
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Copy matrix to outputs
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            model->outputs.${safeName}[i][j] = ${inputExpr}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Copy array to outputs
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        model->outputs.${safeName}[i] = ${inputExpr}[i];\n`
      code += `    }\n`
    } else {
      // Copy scalar to outputs
      code += `    model->outputs.${safeName} = ${inputExpr};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output port doesn't have its own output type in the signal flow
    // It's a sink block
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Output port blocks don't need signal storage
    // They write directly to the model outputs struct
    return null
  }

  requiresState(block: BlockData): boolean {
    // Output port blocks don't need state variables
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

  /*
  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    // Output ports represent external outputs to parent subsystem/model
    const input = inputs[0]
    const portName = blockState.internalState?.portName || `Output_${blockState.blockId}`

    console.log(`*** Executing output port: ${portName} with input:`, input)
    
    // Store the current input value for external access
    // Handles both scalar and vector/matrix values
    blockState.internalState = {
      ...blockState.internalState,
      portName,
      currentValue: input !== undefined ? input : 0,
      isConnectedToParent: false // Would be true in subsystem context
    }
    
    // Output ports don't produce outputs to other blocks within the same level
    // They are sink blocks
  }
    */
  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input = inputs[0]
    const portName = blockState.internalState?.portName || `Output_${blockState.blockId}`

    // Ensure internalState exists
    if (!blockState.internalState) {
      blockState.internalState = {}
    }

    // Store the current input value for external access
    blockState.internalState.portName = portName
    blockState.internalState.currentValue = input !== undefined ? input : 0
  }

  getInputPortCount(block: BlockData): number {
    // Output port blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Output port blocks have no outputs (they are sinks)
    return 0
  }

  // No custom port labels needed
  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }
}