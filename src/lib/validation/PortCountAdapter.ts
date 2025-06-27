// lib/validation/PortCountAdapter.ts

import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'

/**
 * Adapter that provides consistent port count and label information
 * by delegating to the appropriate block modules.
 */
export class PortCountAdapter {
  /**
   * Get the number of input ports for a block
   * @param block - The block data
   * @returns Number of input ports
   */
  static getInputPortCount(block: BlockData): number {
    try {
      const module = BlockModuleFactory.getBlockModule(block.type)
      return module.getInputPortCount(block)
    } catch (error) {
      // Default to 1 input if module not found
      console.warn(`No module found for block type ${block.type}, defaulting to 1 input port`)
      return 1
    }
  }

  /**
   * Get the number of output ports for a block
   * @param block - The block data
   * @returns Number of output ports
   */
  static getOutputPortCount(block: BlockData): number {
    try {
      const module = BlockModuleFactory.getBlockModule(block.type)
      return module.getOutputPortCount(block)
    } catch (error) {
      // Default to 1 output if module not found
      console.warn(`No module found for block type ${block.type}, defaulting to 1 output port`)
      return 1
    }
  }

  /**
   * Get custom labels for input ports
   * @param block - The block data
   * @returns Array of port labels or undefined for default numbering
   */
  static getInputPortLabels(block: BlockData): string[] | undefined {
    try {
      const module = BlockModuleFactory.getBlockModule(block.type)
      return module.getInputPortLabels?.(block)
    } catch (error) {
      return undefined
    }
  }

  /**
   * Get custom labels for output ports
   * @param block - The block data
   * @returns Array of port labels or undefined for default numbering
   */
  static getOutputPortLabels(block: BlockData): string[] | undefined {
    try {
      const module = BlockModuleFactory.getBlockModule(block.type)
      return module.getOutputPortLabels?.(block)
    } catch (error) {
      return undefined
    }
  }

  /**
   * Get port counts for both input and output
   * @param block - The block data
   * @returns Object with inputCount and outputCount
   */
  static getPortCounts(block: BlockData): { inputCount: number, outputCount: number } {
    return {
      inputCount: this.getInputPortCount(block),
      outputCount: this.getOutputPortCount(block)
    }
  }

  /**
   * Check if a block has dynamic port counts
   * @param block - The block data
   * @returns true if the block's port count can change based on parameters
   */
  static hasDynamicPorts(block: BlockData): boolean {
    // Blocks with dynamic ports
    const dynamicPortBlocks = ['mux', 'demux', 'subsystem']
    return dynamicPortBlocks.includes(block.type)
  }
}