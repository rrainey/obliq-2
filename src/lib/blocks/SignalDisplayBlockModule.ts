// lib/blocks/SignalDisplayBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SignalDisplayBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Signal display blocks don't generate C code
    // They are only used for simulation visualization
    return `    // Signal display block: ${block.name} (ignored in generated code)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Signal display blocks have no outputs
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Signal display blocks don't need signal storage
    return null
  }

  requiresState(block: BlockData): boolean {
    // Signal display blocks don't need state in generated code
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
    const { samples, maxSamples } = blockState.internalState
    
    // Check if input is a matrix and reject it
    if (Array.isArray(input) && Array.isArray(input[0])) {
      console.error(`Signal display block ${blockState.blockId} cannot display matrix signals. Use separate displays for each matrix element.`)
      return
    }
    
    // Store the current input value
    // For vectors, we'll store the entire vector
    samples.push(input)
    
    // Maintain maximum sample count
    if (samples.length > maxSamples) {
      samples.shift()
    }
    
    // Signal display blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  getInputPortCount(block: BlockData): number {
    // Signal display blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Signal display blocks have no outputs (they are sinks)
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