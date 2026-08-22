// lib/blocks/BlockModuleFactory.ts

import { IBlockModule } from './BlockModule'
import { SumBlockModule } from './SumBlockModule'
import { MultiplyBlockModule } from './MultiplyBlockModule'
import { DivideBlockModule } from './DivideBlockModule'
import { SignBlockModule } from './SignBlockModule'
import { InputPortBlockModule } from './InputPortBlockModule'
import { OutputPortBlockModule } from './OutputPortBlockModule'
import { SourceBlockModule } from './SourceBlockModule'
import { ClockBlockModule } from './ClockBlockModule'
import { ScaleBlockModule } from './ScaleBlockModule'
import { EvaluateBlockModule } from './EvaluateBlockModule'
import { TransferFunctionBlockModule } from './TransferFunctionBlockModule'
import { Lookup1DBlockModule } from './Lookup1DBlockModule'
import { Lookup2DBlockModule } from './Lookup2DBlockModule'
import { MatrixMultiplyBlockModule } from './MatrixMultiplyBlockModule'
import { TransposeBlockModule } from './TransposeBlockModule'
import { MuxBlockModule } from './MuxBlockModule'
import { DemuxBlockModule } from './DemuxBlockModule'
import { TrigBlockModule } from './TrigBlockModule'
import { MagnitudeBlockModule } from './MagnitudeBlockModule'
import { CrossProductBlockModule } from './CrossProductBlockModule'
import { DotProductBlockModule } from './DotProductBlockModule'
import { IfBlockModule } from './IfBlockModule'
import { ConditionBlockModule } from './ConditionBlockModule'
import { AbsoluteValueBlockModule } from './AbsoluteValueBlockModule'
import { UnaryMinusBlockModule } from './UnaryMinusBlockModule'
import { LimitBlockModule } from './LimitBlockModule'
import { RelayBlockModule } from './RelayBlockModule'
import { RateLimiterBlockModule } from './RateLimiterBlockModule'
import { QuantizerBlockModule } from './QuantizerBlockModule'
import { SelectorBlockModule } from './SelectorBlockModule'
import { DataStoreWriteBlockModule } from './DataStoreWriteBlockModule'
import { DataStoreReadBlockModule } from './DataStoreReadBlockModule'
import { IntegratorBlockModule } from './IntegratorBlockModule'
import { UnitDelayBlockModule } from './UnitDelayBlockModule'
import { OrientationConversionBlockModule } from './OrientationConversionBlockModule'
import { UnitsConversionBlockModule } from './UnitsConversionBlockModule'
import { DiscreteTransformBlockModule } from './DiscreteTransformBlockModule'
import { Body2QuaternionRatesBlockModule } from './Body2QuaternionRatesBlockModule'
import { EdgeDetectBlockModule } from './EdgeDetectBlockModule'
import { AtmosphereBlockModule } from './AtmosphereBlockModule'

import { SheetLabelSinkBlockModule } from './SheetLabelSinkBlockModule'
import { SheetLabelSourceBlockModule } from './SheetLabelSourceBlockModule'
import { SubsystemBlockModule } from './SubsystemBlockModule'
import { SignalDisplayBlockModule } from './SignalDisplayBlockModule'
import { SignalLoggerBlockModule } from './SignalLoggerBlockModule'
import { NoConnectionBlockModule } from './NoConnectionBlockModule'
import { InertiaDiagPackBlockModule } from './InertiaDiagPackBlockModule'

/**
 * Factory for creating block-specific code generators
 */
export class BlockModuleFactory {
  private static instances: Map<string, IBlockModule> = new Map()
  
  /**
   * Get the code generator for a specific block type
   * @param blockType The type of block (e.g., 'sum', 'multiply', etc.)
   * @returns The appropriate code generator module
   * @throws Error if block type is not supported
   */
  static getBlockModule(blockType: string): IBlockModule {
    // Use singleton instances for each block type
    if (!this.instances.has(blockType)) {
      const instance = this.createInstance(blockType)
      if (instance) {
        this.instances.set(blockType, instance)
      }
    }
    
    const generator = this.instances.get(blockType)
    if (!generator) {
      throw new Error(`Unsupported block type: ${blockType}`)
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

      case 'divide':
        return new DivideBlockModule()

      case 'sign':
        return new SignBlockModule()
        
      case 'input_port':
        return new InputPortBlockModule()
        
      case 'output_port':
        return new OutputPortBlockModule()
        
      case 'source':
        return new SourceBlockModule()

      case 'clock':
        return new ClockBlockModule()

      case 'scale':
        return new ScaleBlockModule()

      case 'evaluate':
        return new EvaluateBlockModule()
        
      case 'transfer_function':
        return new TransferFunctionBlockModule()
        
      case 'lookup_1d':
        return new Lookup1DBlockModule()
        
      case 'lookup_2d':
        return new Lookup2DBlockModule()
        
      case 'matrix_multiply':
        return new MatrixMultiplyBlockModule()

      case 'transpose': 
        return new TransposeBlockModule()
        
      case 'mux':
        return new MuxBlockModule()
        
      case 'demux':
        return new DemuxBlockModule()

      case 'signal_display':
        return new SignalDisplayBlockModule() 

      case 'signal_logger':
        return new SignalLoggerBlockModule()

      case 'no_connection':
        return new NoConnectionBlockModule()

      case 'sheet_label_sink':
        return new SheetLabelSinkBlockModule()

      case 'sheet_label_source':
        return new SheetLabelSourceBlockModule()

      case 'subsystem':
        return new SubsystemBlockModule()

      case 'trig':
        return new TrigBlockModule()

      case 'mag':
        return new MagnitudeBlockModule()

      case 'cross':
        return new CrossProductBlockModule()

      case 'dot':
        return new DotProductBlockModule()

      case 'if':
        return new IfBlockModule()

      case 'condition':
        return new ConditionBlockModule()

      case 'abs': 
        return new AbsoluteValueBlockModule()

      case 'uminus':
        return new UnaryMinusBlockModule()

      case 'limit':
        return new LimitBlockModule()

      case 'relay':
        return new RelayBlockModule()

      case 'rate_limiter':
        return new RateLimiterBlockModule()

      case 'quantizer':
        return new QuantizerBlockModule()

      case 'selector':
        return new SelectorBlockModule()

      case 'data_store_write':
        return new DataStoreWriteBlockModule()

      case 'data_store_read':
        return new DataStoreReadBlockModule()

      case 'integrator':
        return new IntegratorBlockModule()

      case 'unit_delay':
        return new UnitDelayBlockModule()

      case 'orientation_conversion':
        return new OrientationConversionBlockModule()

      case 'units_conversion':
        return new UnitsConversionBlockModule()

      case 'discrete_transform':
        return new DiscreteTransformBlockModule()

      case 'body2quaternion_rates':
        return new Body2QuaternionRatesBlockModule()

      case 'edge_detect':
        return new EdgeDetectBlockModule()

      case 'atmosphere':
        return new AtmosphereBlockModule()

      case 'inertia_diag_pack':
        return new InertiaDiagPackBlockModule()

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
      'divide',
      'sign',
      'input_port',
      'output_port',
      'source',
      'clock',
      'scale',
      'evaluate',
      'transfer_function',
      'lookup_1d',
      'lookup_2d',
      'matrix_multiply',
      'transpose',
      'mux',
      'demux',
      'trig',
      'mag',
      'cross',
      'dot',
      'signal_display',
      'signal_logger',
      'no_connection',
      'inertia_diag_pack',
      'if',
      'condition',
      'abs',
      'uminus',
      'limit',
      'relay',
      'rate_limiter',
      'quantizer',
      'selector',
      'data_store_write',
      'data_store_read',
      'integrator',
      'unit_delay',
      'orientation_conversion',
      'units_conversion',
      'discrete_transform',
      'body2quaternion_rates',
      'edge_detect',
      'atmosphere'
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
export function getModuleGenerator(blockType: string): IBlockModule {
  return BlockModuleFactory.getBlockModule(blockType)
}