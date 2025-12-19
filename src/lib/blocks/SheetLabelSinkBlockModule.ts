// lib/blocks/SheetLabelSinkBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SheetLabelSinkBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Sheet label sinks are handled during model flattening
    // They don't generate direct computation code
    const signalName = block.parameters?.signalName || ''
    return `    // Sheet label sink: ${signalName} (resolved during flattening)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Sheet label sinks have no outputs in the traditional sense
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Sheet label sinks don't need signal storage
    // The signal is passed through sheet label resolution
    return null
  }

  requiresState(block: BlockData): boolean {
    // Sheet label sinks don't need state
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
    // Sheet label sinks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Sheet label sinks have no outputs (they are sinks)
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