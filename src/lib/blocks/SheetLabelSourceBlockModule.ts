// lib/blocks/SheetLabelSourceBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SheetLabelSourceBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Sheet label sources are handled during model flattening
    // They don't generate direct computation code
    const signalName = block.parameters?.signalName || ''
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    return `    // Sheet label source: ${signalName} (resolved during flattening)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Sheet label source output type depends on the connected sink
    // This would be resolved during type propagation
    return block.parameters?.dataType || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Sheet label sources need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Sheet label sources don't need state
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
    const signalName = blockState.internalState?.signalName
    if (!signalName) {
      blockState.outputs[0] = 0
      return
    }
    
    // Retrieve the value from sheet label storage
    let value: any = undefined
    if ((simulationState as any).sheetLabelValues) {
      value = (simulationState as any).sheetLabelValues.get(signalName)
    }
    
    if (value !== undefined) {
      blockState.outputs[0] = value
    } else {
      // No sink found or not yet executed
      blockState.outputs[0] = 0
    }
  }

  getInputPortCount(block: BlockData): number {
    // Sheet label sources have no inputs (they are sources)
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    // Sheet label sources have exactly 1 output
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