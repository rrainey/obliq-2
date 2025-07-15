// lib/blocks/IntegratorBlockModule.ts - Example of another stateful block

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Example integrator block module showing how to implement computeDerivatives
 */
export class IntegratorBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const stateName = `model->states.${BlockModuleUtils.sanitizeIdentifier(block.name)}_state`
    
    return `    ${outputName} = ${stateName}; /* Integrator output */\n`
  }
  
  getOutputType(block: BlockData, inputTypes: string[]): string {
    return inputTypes[0] || 'double'
  }
  
  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }
  
  requiresState(block: BlockData): boolean {
    return true // Integrators always have state
  }
  
  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [`    double ${name}_state; /* Integrator state */`]
  }
  
  executeSimulation(
    blockState: BlockState,
    inputs: any[],
    simulationState: SimulationState
  ): void {
    // Output is just the current state
    blockState.outputs[0] = blockState.internalState?.state || 0
  }
  
  computeDerivatives(
    blockState: BlockState,
    inputs: any[],
    time: number
  ): number[] | undefined {
    // For an integrator, derivative equals input
    const input = inputs[0]
    
    if (typeof input === 'number') {
      return [input]
    } else if (Array.isArray(input)) {
      // For vector input, return vector of derivatives
      return input.map(val => typeof val === 'number' ? val : 0)
    }
    
    return [0]
  }
  
  getInputPortCount(block: BlockData): number {
    return 1
  }
  
  getOutputPortCount(block: BlockData): number {
    return 1
  }
}