// lib/blocks/SignalLoggerBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SignalLoggerBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Signal logger blocks don't generate C code
    // They are only used for simulation data collection
    return `    // Signal logger block: ${block.name} (ignored in generated code)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Signal logger blocks have no outputs
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Signal logger blocks don't need signal storage
    return null
  }

  requiresState(block: BlockData): boolean {
    // Signal logger blocks don't need state in generated code
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed in generated code
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
    const input = inputs[0]
    const { loggedData, timeStamps } = blockState.internalState
    
    // Check if input is a matrix and reject it
    if (Array.isArray(input) && Array.isArray(input[0])) {
      console.error(`Signal logger block ${blockState.blockId} cannot log matrix signals. Use separate loggers for each matrix element.`)
      return
    }
    
    // Store both the value and timestamp
    // For vectors, we'll store the entire vector
    loggedData.push(input)
    timeStamps.push(simulationState.time)
    
    // Signal logger blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  getInputPortCount(block: BlockData): number {
    // Signal logger blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Signal logger blocks have no outputs (they are sinks)
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