## Task Plan: Modularize Block Simulation and Port Management

### Phase 1: Extend IBlockModule Interface

#### Task 1.1: Add simulation execution method to IBlockModule
- **File**: `lib/blocks/BlockModule.ts`
- **Add to interface**:
  ```typescript
  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void
  ```
- **Test**: Interface compiles without errors

#### Task 1.2: Add port count methods to IBlockModule
- **File**: `lib/blocks/BlockModule.ts`
- **Add to interface**:
  ```typescript
  getInputPortCount(block: BlockData): number
  getOutputPortCount(block: BlockData): number
  ```
- **Test**: Interface compiles without errors

#### Task 1.3: Add dynamic port label generation to IBlockModule
- **File**: `lib/blocks/BlockModule.ts`
- **Add to interface**:
  ```typescript
  getInputPortLabels?(block: BlockData): string[]
  getOutputPortLabels?(block: BlockData): string[]
  ```
- **Test**: Interface compiles without errors

### Phase 2: Implement Simulation Methods in Block Modules

#### Task 2.1: Implement simulation for SumBlockModule
- **File**: `lib/blocks/SumBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeSumBlock`
- **Test**: Sum block simulation works identically

#### Task 2.2: Implement simulation for MultiplyBlockModule
- **File**: `lib/blocks/MultiplyBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeMultiplyBlock`
- **Test**: Multiply block simulation works identically

#### Task 2.3: Implement simulation for SourceBlockModule
- **File**: `lib/blocks/SourceBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeSourceBlock`
- **Test**: Source block generates all signal types correctly

#### Task 2.4: Implement simulation for InputPortBlockModule
- **File**: `lib/blocks/InputPortBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeInputPortBlock`
- **Test**: Input port handles external inputs correctly

#### Task 2.5: Implement simulation for OutputPortBlockModule
- **File**: `lib/blocks/OutputPortBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeOutputPortBlock`
- **Test**: Output port stores values correctly

#### Task 2.6: Implement simulation for ScaleBlockModule
- **File**: `lib/blocks/ScaleBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeScaleBlock`
- **Test**: Scale block handles scalars/vectors/matrices

#### Task 2.7: Implement simulation for TransferFunctionBlockModule
- **File**: `lib/blocks/TransferFunctionBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeTransferFunctionBlock`
- **Test**: Transfer function integrates correctly with enable states

#### Task 2.8: Implement simulation for Lookup1DBlockModule
- **File**: `lib/blocks/Lookup1DBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeLookup1DBlock`
- **Test**: 1D lookup interpolates correctly

#### Task 2.9: Implement simulation for Lookup2DBlockModule
- **File**: `lib/blocks/Lookup2DBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeLookup2DBlock`
- **Test**: 2D lookup performs bilinear interpolation

#### Task 2.10: Implement simulation for MatrixMultiplyBlockModule
- **File**: `lib/blocks/MatrixMultiplyBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeMatrixMultiplyBlock`
- **Test**: All matrix multiplication cases work

#### Task 2.11: Implement simulation for MuxBlockModule
- **File**: `lib/blocks/MuxBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeMuxBlock`
- **Test**: Mux creates correct output dimensions

#### Task 2.12: Implement simulation for DemuxBlockModule
- **File**: `lib/blocks/DemuxBlockModule.ts`
- **Add**: `executeSimulation` method
- **Move**: Logic from `simulationEngine.executeDemuxBlock`
- **Test**: Demux splits inputs correctly

### Phase 3: Create Special Block Modules

#### Task 3.1: Create SignalDisplayBlockModule
- **File**: `lib/blocks/SignalDisplayBlockModule.ts`
- **Implement**: All IBlockModule methods
- **Move**: Logic from `simulationEngine.executeSignalDisplayBlock`
- **Test**: Signal display collects samples correctly

#### Task 3.2: Create SignalLoggerBlockModule
- **File**: `lib/blocks/SignalLoggerBlockModule.ts`
- **Implement**: All IBlockModule methods
- **Move**: Logic from `simulationEngine.executeSignalLoggerBlock`
- **Test**: Logger stores timestamped data

#### Task 3.3: Create SheetLabelSinkBlockModule
- **File**: `lib/blocks/SheetLabelSinkBlockModule.ts`
- **Implement**: All IBlockModule methods
- **Move**: Logic from `simulationEngine.executeSheetLabelSinkBlock`
- **Test**: Sheet label sink stores values correctly

#### Task 3.4: Create SheetLabelSourceBlockModule
- **File**: `lib/blocks/SheetLabelSourceBlockModule.ts`
- **Implement**: All IBlockModule methods
- **Move**: Logic from `simulationEngine.executeSheetLabelSourceBlock`
- **Test**: Sheet label source retrieves values

#### Task 3.5: Create SubsystemBlockModule
- **File**: `lib/blocks/SubsystemBlockModule.ts`
- **Implement**: All IBlockModule methods (mostly stubs)
- **Special**: Dynamic port counts based on parameters
- **Test**: Port counts match subsystem definition

### Phase 4: Implement Port Count Methods

#### Task 4.1: Add port count methods to all arithmetic blocks
- **Files**: Sum, Multiply, Scale, MatrixMultiply modules
- **Add**: `getInputPortCount` and `getOutputPortCount`
- **Test**: Each returns correct fixed counts

#### Task 4.2: Add port count methods to I/O blocks
- **Files**: InputPort, OutputPort, Source modules
- **Add**: Port count methods
- **Test**: Correct counts (0 or 1 as appropriate)

#### Task 4.3: Add dynamic port count to MuxBlockModule
- **File**: `lib/blocks/MuxBlockModule.ts`
- **Add**: Calculate input ports from rows × cols
- **Test**: Port count changes with parameters

#### Task 4.4: Add dynamic port count to DemuxBlockModule
- **File**: `lib/blocks/DemuxBlockModule.ts`
- **Add**: Calculate output ports from input dimensions
- **Test**: Port count updates dynamically

#### Task 4.5: Add dynamic port count to SubsystemBlockModule
- **File**: `lib/blocks/SubsystemBlockModule.ts`
- **Add**: Read from parameters.inputPorts/outputPorts
- **Test**: Matches subsystem configuration

### Phase 5: Update Factory and Create Adapter

#### Task 5.1: Update BlockCodeGeneratorFactory
- **File**: `lib/blocks/BlockCodeGeneratorFactory.ts`
- **Add**: Special blocks to factory
- **Rename**: To `BlockModuleFactory`
- **Test**: All block types return modules

#### Task 5.2: Create simulation execution adapter
- **File**: `lib/simulation/BlockSimulationAdapter.ts`
- **Create**: Adapter that uses BlockModuleFactory
- **Method**: `executeBlock(blockId, block, blockState, inputs, simulationState)`
- **Test**: Delegates to correct module

#### Task 5.3: Create port count adapter
- **File**: `lib/validation/PortCountAdapter.ts`
- **Create**: Adapter for getting port counts
- **Methods**: `getInputPortCount(block)`, `getOutputPortCount(block)`
- **Test**: Returns correct counts for all blocks

### Phase 6: Integration

#### Task 6.1: Update SimulationEngine to use adapter
- **File**: `lib/simulationEngine.ts`
- **Replace**: Switch statement in `executeBlock` with adapter call
- **Remove**: Individual execute methods
- **Test**: All simulations run identically

#### Task 6.2: Update connectionValidation to use adapter
- **File**: `lib/connectionValidation.ts`
- **Replace**: `getBlockInputPortCount` to use adapter
- **Replace**: `getOutputPortCount` to use adapter
- **Test**: Connection validation works correctly

#### Task 6.3: Update BlockNode to use adapter
- **File**: `components/BlockNode.tsx`
- **Replace**: `getPortCounts` to use adapter
- **Import**: PortCountAdapter
- **Test**: UI shows correct port counts

#### Task 6.4: Add port label support
- **File**: `components/BlockNode.tsx`
- **Add**: Use `getInputPortLabels`/`getOutputPortLabels` if available
- **Fallback**: Generate default labels if not provided
- **Test**: Demux shows proper labels (row1_col2, etc.)

### Phase 7: Cleanup and Testing

#### Task 7.1: Remove old simulation methods
- **File**: `lib/simulationEngine.ts`
- **Remove**: All `execute*Block` methods
- **Keep**: Only adapter usage
- **Test**: Everything still works

#### Task 7.2: Create comprehensive block module tests
- **File**: `__tests__/blocks/blockModules.test.ts`
- **Test**: Each module's simulation behavior
- **Test**: Port counts for all blocks
- **Test**: Port labels where applicable

#### Task 7.3: Test subsystem enable behavior
- **File**: `__tests__/simulation/subsystemEnable.test.ts`
- **Test**: Enable state propagation works with modules
- **Test**: State freezing works correctly
- **Verify**: No regression in functionality

#### Task 7.4: Test dynamic port updates
- **File**: `__tests__/ui/dynamicPorts.test.ts`
- **Test**: Mux updates ports when dimensions change
- **Test**: Demux updates based on input
- **Test**: UI reflects changes

### Phase 8: Documentation

#### Task 8.1: Document block module pattern
- **File**: `lib/blocks/README.md`
- **Document**: How to add new block types
- **Include**: Required methods and patterns
- **Example**: Complete block module

#### Task 8.2: Update architecture documentation
- **File**: `00-architecture.md`
- **Update**: Block module system description
- **Add**: Simulation execution flow
- **Add**: Port management system

This modularization will:
1. Centralize all block-specific logic in one place per block type
2. Make adding new blocks much easier (implement one interface)
3. Eliminate duplicate port count logic across multiple files
4. Enable easier testing of individual block behaviors
5. Support dynamic port configurations cleanly
6. Maintain backward compatibility while improving architecture