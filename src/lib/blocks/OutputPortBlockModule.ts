// lib/blocks/OutputPortBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class OutputPortBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const portName = block.parameters?.portName || 'Output'
    const safeName = BlockModuleUtils.sanitizeIdentifier(portName)
    
    if (inputs.length === 0) {
      return `    // Output port: ${portName} (no input connected)\n`
    }
    
    const inputExpr = inputs[0]
    
    // Get the type from inputTypes if available
    let needsMemcpy = false
    if (inputTypes && inputTypes.length > 0) {
      const inputType = inputTypes[0]
      const typeInfo = BlockModuleUtils.parseType(inputType)
      needsMemcpy = typeInfo.isArray || typeInfo.isMatrix
    } else {
      // Fallback: check if the input expression contains array access syntax
      // This is a heuristic but should work for most cases
      needsMemcpy = !inputExpr.includes('[') && inputExpr.includes('model->signals.')
    }
    
    let code = `    // Output port: ${portName}\n`
    
    if (needsMemcpy) {
      // Use memcpy for array/matrix copy
      code += `    memcpy(&model->outputs.${safeName}, &${inputExpr}, sizeof(model->outputs.${safeName}));\n`
    } else {
      // Copy scalar to outputs
      code += `    model->outputs.${safeName} = ${inputExpr};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output ports pass through the type of their input for type propagation
    // Even though they're sinks, we need this for the type system
    if (inputTypes.length > 0) {
      return inputTypes[0]
    }
    // Default to double if no input type available
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Output ports don't need signal storage - they write directly to outputs struct
    return null
  }

  requiresState(block: BlockData): boolean {
    // Output ports don't have state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input = inputs[0]
    const portName = blockState.internalState?.portName || 
                     blockState.blockData?.parameters?.portName || 
                     `Output_${blockState.blockId}`

    //console.log(`OutputPort ${blockState.blockId} received input:`, input)

    // Ensure internalState exists
    if (!blockState.internalState) {
      blockState.internalState = {}
    }

    // Store the current input value for external access
    blockState.internalState.portName = portName
    blockState.internalState.currentValue = input !== undefined ? input : 0
    blockState.internalState.isConnectedToParent = false // Would be true in subsystem context
    
    // Output ports don't produce outputs to other blocks within the same level
    // They are sink blocks, but we might need to track the value for debugging
    // or for parent subsystem access
  }

  getInputPortCount(block: BlockData): number {
    // Output ports have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Output ports have 0 outputs (they're sinks in the graph)
    // But for type propagation, we treat them as having 1 output
    return 1
  }

  // No custom port labels needed
  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }
}