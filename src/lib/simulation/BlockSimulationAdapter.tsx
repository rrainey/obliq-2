// lib/simulation/BlockSimulationAdapter.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'

/**
 * Adapter that delegates block simulation execution to the appropriate block modules.
 * This replaces the large switch statement in the simulation engine with a clean
 * delegation pattern using the block module factory.
 */
export class BlockSimulationAdapter {
  /**
   * Execute a block's simulation logic using its module
   * @param blockId - The ID of the block to execute
   * @param block - The block data
   * @param blockState - The current state of the block
   * @param inputs - Array of input values
   * @param simulationState - The global simulation state
   */
  static executeBlock(
    blockId: string,
    block: BlockData,
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const module = BlockModuleFactory.getBlockModule(block.type)
    
    if (module) {
      // Pass block data through blockState for access in modules
      const enhancedBlockState = {
        ...blockState,
        blockData: block // Add reference to full block data
      }
      module.executeSimulation(enhancedBlockState, inputs, simulationState)
    } else {
      // If no module exists for this block type, log a warning
      // This shouldn't happen if all block types are properly registered
      console.warn(`No simulation module found for block type: ${block.type}`)
      
      // Set outputs to default values
      if (blockState.outputs.length === 0) {
        blockState.outputs = [0]
      } else {
        for (let i = 0; i < blockState.outputs.length; i++) {
          blockState.outputs[i] = 0
        }
      }
    }
  }
  
  /**
   * Check if a block type has a simulation module
   * @param blockType - The type of block
   * @returns true if the block type is supported
   */
  static isSupported(blockType: string): boolean {
    return BlockModuleFactory.isSupported(blockType)
  }
  
  /**
   * Get the list of all block types that have simulation modules
   * @returns Array of supported block type names
   */
  static getSupportedBlockTypes(): string[] {
    return BlockModuleFactory.getSupportedBlockTypes()
  }
}