// lib/blocks/SubsystemBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SubsystemBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Subsystem blocks are flattened during code generation
    // They don't generate direct computation code
    return `    // Subsystem block: ${block.name} (flattened during code generation)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Subsystem output types depend on their internal structure
    // This would be resolved during type propagation
    return 'double' // Default, actual type comes from internal output ports
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Subsystem blocks don't need signal storage after flattening
    return null
  }

  requiresState(block: BlockData): boolean {
    // Subsystem blocks themselves don't need state
    // Their internal blocks may have state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for the subsystem block itself
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
    // In the hybrid simulation approach, subsystem blocks are just containers
    // They don't execute - the MultiSheetSimulationEngine handles their contents
    
    const { outputPorts } = blockState.internalState
    
    // Initialize outputs to zero (actual values come from internal output ports)
    for (let i = 0; i < outputPorts.length; i++) {
      blockState.outputs[i] = 0
    }
  }

  getInputPortCount(block: BlockData): number {
    // Subsystem blocks have dynamic input count based on configuration
    const inputPorts = block.parameters?.inputPorts || []
    let count = inputPorts.length
    
    // Add 1 for enable port if showEnableInput is true
    if (block.parameters?.showEnableInput) {
      count += 1
    }
    
    return count
  }

  getOutputPortCount(block: BlockData): number {
    // Subsystem blocks have dynamic output count based on configuration
    const outputPorts = block.parameters?.outputPorts || []
    return outputPorts.length
  }

  getInputPortLabels?(block: BlockData): string[] | undefined {
    const inputPorts = block.parameters?.inputPorts || []
    const labels = [...inputPorts]
    
    // Add enable port label if needed
    if (block.parameters?.showEnableInput) {
      labels.push('Enable')
    }
    
    return labels.length > 0 ? labels : undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    const outputPorts = block.parameters?.outputPorts || []
    return outputPorts.length > 0 ? outputPorts : undefined
  }
}