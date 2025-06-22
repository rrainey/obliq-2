// lib/blocks/BlockCodeGeneratorFactory.ts

import { IBlockModule } from './BlockModule'
import { SumBlockModule } from './SumBlockModule'
import { MultiplyBlockModule } from './MultiplyBlockModule'
import { InputPortBlockModule } from './InputPortBlockModule'
import { OutputPortBlockModule } from './OutputPortBlockModule'
import { SourceBlockModule } from './SourceBlockModule'
import { ScaleBlockModule } from './ScaleBlockModule'
import { TransferFunctionBlockModule } from './TransferFunctionBlockModule'
import { Lookup1DBlockModule } from './Lookup1DBlockModule'
import { Lookup2DBlockModule } from './Lookup2DBlockModule'
import { MatrixMultiplyBlockModule } from './MatrixMultiplyBlockModule'
import { MuxBlockModule } from './MuxBlockModule'
import { DemuxBlockModule } from './DemuxBlockModule'

/**
 * Factory for creating block-specific code generators
 */
export class BlockCodeGeneratorFactory {
  private static instances: Map<string, IBlockModule> = new Map()
  
  /**
   * Get the code generator for a specific block type
   * @param blockType The type of block (e.g., 'sum', 'multiply', etc.)
   * @returns The appropriate code generator module
   * @throws Error if block type is not supported
   */
  static getBlockCodeGenerator(blockType: string): IBlockModule {
    // Use singleton instances for each block type
    if (!this.instances.has(blockType)) {
      const instance = this.createInstance(blockType)
      if (instance) {
        this.instances.set(blockType, instance)
      }
    }
    
    const generator = this.instances.get(blockType)
    if (!generator) {
      throw new Error(`Unsupported block type for code generation: ${blockType}`)
    }
    
    return generator
  }
  
  /**
   * Create a new instance of a block code generator
   */
  private static createInstance(blockType: string): IBlockModule | null {
    switch (blockType) {
      case 'sum':
        return new SumBlockModule()
        
      case 'multiply':
        return new MultiplyBlockModule()
        
      case 'input_port':
        return new InputPortBlockModule()
        
      case 'output_port':
        return new OutputPortBlockModule()
        
      case 'source':
        return new SourceBlockModule()
        
      case 'scale':
        return new ScaleBlockModule()
        
      case 'transfer_function':
        return new TransferFunctionBlockModule()
        
      case 'lookup_1d':
        return new Lookup1DBlockModule()
        
      case 'lookup_2d':
        return new Lookup2DBlockModule()
        
      case 'matrix_multiply':
        return new MatrixMultiplyBlockModule()
        
      case 'mux':
        return new MuxBlockModule()
        
      case 'demux':
        return new DemuxBlockModule()
        
      // Blocks that don't generate computation code
      case 'signal_display':
      case 'signal_logger':
      case 'sheet_label_sink':
      case 'sheet_label_source':
      case 'subsystem':
        return null
        
      default:
        return null
    }
  }
  
  /**
   * Check if a block type is supported for code generation
   */
  static isSupported(blockType: string): boolean {
    return this.createInstance(blockType) !== null
  }
  
  /**
   * Get list of all supported block types
   */
  static getSupportedBlockTypes(): string[] {
    return [
      'sum',
      'multiply',
      'input_port',
      'output_port',
      'source',
      'scale',
      'transfer_function',
      'lookup_1d',
      'lookup_2d',
      'matrix_multiply',
      'mux',
      'demux'
    ]
  }
  
  /**
   * Clear the instance cache (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear()
  }
}

// Export convenience function
export function getBlockCodeGenerator(blockType: string): IBlockModule {
  return BlockCodeGeneratorFactory.getBlockCodeGenerator(blockType)
}