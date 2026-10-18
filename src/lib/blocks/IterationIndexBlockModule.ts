// lib/blocks/IterationIndexBlockModule.ts
// Source of the current for-iterator index (set by parent before each body call).

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class IterationIndexBlockModule implements IBlockModule {
  generateComputation(block: BlockData, _inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    // Parent sets model->iteration_index each pass of the for-loop.
    return `    ${outputName} = (double)model->iteration_index;\n`
  }

  getOutputType(_block: BlockData, _inputTypes: string[]): string {
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(_block: BlockData, _outputType: string): string[] {
    return []
  }

  generateInitialization(_block: BlockData): string {
    return ''
  }

  getInputPortCount(_block: BlockData): number {
    return 0
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }

  getOutputPortLabels?(_block: BlockData): string[] | undefined {
    return ['i']
  }

  executeSimulation(
    blockState: BlockState,
    _inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const i = (simulationState as { iterationIndex?: number }).iterationIndex ?? 0
    blockState.outputs = [i]
  }
}
