# Matrix Support Implementation Plan for Obliq2

## Overview
This plan introduces 2D matrix signal support, new matrix-specific blocks (Matrix Multiply, Mux, Demux), and enhances existing blocks to handle matrix operations.

## Phase 1: Core Type System Updates

### Task 1.1: Extend Type Validator for Matrix Types
- **Start**: Type validator only supports scalar and 1D arrays (e.g., `double[3]`)
- **End**: Support 2D matrix types with syntax `double[3][4]` (3 rows, 4 columns)
- **Test**: Parse and validate matrix type strings
- **Files**: `lib/typeValidator.ts`

### Task 1.2: Update ParsedType Interface for Matrices
- **Start**: ParsedType only has `isArray` and `arraySize`
- **End**: Add `isMatrix: boolean`, `rows?: number`, `cols?: number`
- **Test**: Correctly parse matrix dimensions from type string
- **Files**: `lib/typeValidator.ts`

### Task 1.3: Create Matrix Type Compatibility Rules
- **Start**: areTypesCompatible only checks 1D arrays
- **End**: Support matrix dimension matching (3×4 compatible with 3×4)
- **Test**: Validate compatible and incompatible matrix connections
- **Files**: `lib/typeValidator.ts`

### Task 1.4: Update Default Value Generation for Matrices
- **Start**: getDefaultValue returns scalar or 1D array
- **End**: Return 2D array filled with zeros for matrix types
- **Test**: Generate correct default values for various matrix sizes
- **Files**: `lib/typeValidator.ts`

### Task 1.5: Add Matrix Value Validation
- **Start**: isValidValue only checks scalars and 1D arrays
- **End**: Validate 2D array structure matches declared matrix dimensions
- **Test**: Validate correct and incorrect matrix values
- **Files**: `lib/typeValidator.ts`

## Phase 2: Signal Type Propagation Updates

### Task 2.1: Update Signal Type Propagation for Matrices
- **Start**: propagateSignalTypes only handles scalars and 1D arrays
- **End**: Support matrix type propagation through connections
- **Test**: Matrix types propagate correctly through model
- **Files**: `lib/signalTypePropagation.ts`

### Task 2.2: Add Matrix Block Output Type Rules
- **Start**: determineProcessingBlockOutputType doesn't handle matrices
- **End**: Define output types for matrix operations (element-wise vs matrix multiply)
- **Test**: Correct output types for various matrix operations
- **Files**: `lib/signalTypePropagation.ts`

### Task 2.3: Update Type Compatibility Validator
- **Start**: validateWireConnection only checks 1D compatibility
- **End**: Check matrix dimension compatibility for connections
- **Test**: Reject incompatible matrix connections
- **Files**: `lib/typeCompatibilityValidator.ts`

### Task 2.4: Add Matrix-Specific Validation Errors
- **Start**: Generic type mismatch messages
- **End**: Specific messages like "Cannot connect 3×4 matrix to 2×3 matrix input"
- **Test**: Clear error messages for matrix mismatches
- **Files**: `lib/typeCompatibilityValidator.ts`

## Phase 3: Block Type Definitions

### Task 3.1: Add New Block Types to Block.tsx
- **Start**: BlockType union doesn't include matrix blocks
- **End**: Add 'matrix_multiply', 'mux', 'demux' to BlockType
- **Test**: Can create blocks with new types
- **Files**: `components/Block.tsx`

### Task 3.2: Define Block Categories and Metadata
- **Start**: No matrix block categories
- **End**: Add matrix blocks to appropriate categories with icons
- **Test**: Matrix blocks appear in block library
- **Files**: `components/Block.tsx`, `components/BlockLibrary.tsx`

### Task 3.3: Add Port Configuration for Matrix Blocks
- **Start**: No port definitions for matrix operations
- **End**: Define input/output port counts and types
- **Test**: Correct port counts for each block type
- **Files**: `components/BlockNode.tsx` (getPortCounts function)

## Phase 4: Matrix Multiply Block Implementation

### Task 4.1: Add Matrix Multiply to Simulation Engine
- **Start**: SimulationEngine doesn't handle matrix_multiply blocks
- **End**: Add executeMatrixMultiplyBlock method
- **Test**: Matrix multiply executes correctly in simulation
- **Files**: `lib/simulationEngine.ts`

### Task 4.2: Implement Scalar×Matrix Multiplication
- **Start**: No scalar×matrix support
- **End**: Handle scalar × matrix case in executeMatrixMultiplyBlock
- **Test**: 3 × [[1,2],[3,4]] = [[3,6],[9,12]]
- **Files**: `lib/simulationEngine.ts`

### Task 4.3: Implement Matrix×Matrix Multiplication
- **Start**: No matrix×matrix support
- **End**: Full matrix multiplication algorithm
- **Test**: [[1,2],[3,4]] × [[5,6],[7,8]] = [[19,22],[43,50]]
- **Files**: `lib/simulationEngine.ts`

### Task 4.4: Handle Dimension Validation at Runtime
- **Start**: No runtime dimension checking
- **End**: Validate dimensions before multiplication
- **Test**: Proper error handling for dimension mismatches
- **Files**: `lib/simulationEngine.ts`

## Phase 5: Mux Block Implementation

### Task 5.1: Create Mux Block Configuration UI
- **Start**: No configuration dialog for mux blocks
- **End**: Dialog to set rows, cols, and output type
- **Test**: Can configure 2×3 matrix output
- **Files**: Create `components/MuxConfig.tsx`

### Task 5.2: Update Block Parameters for Dynamic Ports
- **Start**: Fixed port count in BlockNode
- **End**: Dynamic port generation based on mux parameters
- **Test**: Changing rows/cols updates port count
- **Files**: `components/BlockNode.tsx`

### Task 5.3: Implement Mux Execution in Simulation
- **Start**: No executeMuxBlock method
- **End**: Combine scalar inputs into vector/matrix
- **Test**: 6 scalars → [[1,2,3],[4,5,6]] matrix
- **Files**: `lib/simulationEngine.ts`

### Task 5.4: Add Mux Block to Block Library
- **Start**: Mux not in available blocks
- **End**: Mux block with proper icon and category
- **Test**: Can drag mux block to canvas
- **Files**: `components/BlockLibrary.tsx`

## Phase 6: Demux Block Implementation

### Task 6.1: Implement Dynamic Port Detection
- **Start**: Demux has fixed ports
- **End**: Ports update based on connected input type
- **Test**: Connecting 3×2 matrix creates 6 output ports
- **Files**: `lib/signalTypePropagation.ts`, `components/BlockNode.tsx`

### Task 6.2: Implement Demux Execution
- **Start**: No executeDemuxBlock method
- **End**: Split vector/matrix into scalar outputs
- **Test**: [[1,2],[3,4]] → out0=1, out1=2, out2=3, out3=4
- **Files**: `lib/simulationEngine.ts`

### Task 6.3: Add Demux Visual Representation
- **Start**: No special demux visualization
- **End**: Show matrix grid layout on block
- **Test**: 2×3 demux shows grid pattern
- **Files**: `components/BlockNode.tsx`

### Task 6.4: Add Demux to Block Library
- **Start**: Demux not available
- **End**: Demux block in matrix category
- **Test**: Can create demux blocks
- **Files**: `components/BlockLibrary.tsx`

## Phase 7: Source Block Enhancement

### Task 7.1: Update Source Config for Matrix Input
- **Start**: SourceConfig only handles scalar/1D array values
- **End**: Support matrix value entry with syntax [[1,2],[3,4]]
- **Test**: Parse and validate matrix constant values
- **Files**: `components/SourceConfig.tsx`

### Task 7.2: Add Matrix Dimension Validation
- **Start**: No validation of matrix value dimensions
- **End**: Ensure entered matrix matches declared type dimensions
- **Test**: Reject [[1,2],[3]] for double[2][2]
- **Files**: `components/SourceConfig.tsx`

### Task 7.3: Update Source Block Execution
- **Start**: executeSourceBlock only outputs scalars/1D arrays
- **End**: Output 2D arrays for matrix types
- **Test**: Source generates correct matrix values
- **Files**: `lib/simulationEngine.ts`

### Task 7.4: Enhance Source Block Display
- **Start**: Shows scalar value or 1D array
- **End**: Show matrix preview (e.g., "2×3 matrix")
- **Test**: Matrix sources display dimension info
- **Files**: `components/BlockNode.tsx`

## Phase 8: Existing Block Updates

### Task 8.1: Update Scale Block for Matrices
- **Start**: executeScaleBlock only handles scalar/1D arrays
- **End**: Element-wise scaling of 2D arrays
- **Test**: Scale [[1,2],[3,4]] by 2 = [[2,4],[6,8]]
- **Files**: `lib/simulationEngine.ts`

### Task 8.2: Update Sum Block for Matrices
- **Start**: executeSumBlock only handles scalar/1D arrays
- **End**: Element-wise addition of 2D arrays
- **Test**: [[1,2],[3,4]] + [[5,6],[7,8]] = [[6,8],[10,12]]
- **Files**: `lib/simulationEngine.ts`

### Task 8.3: Update Multiply Block for Matrices
- **Start**: executeMultiplyBlock only does element-wise for 1D
- **End**: Element-wise multiplication for 2D arrays
- **Test**: [[1,2],[3,4]] .* [[5,6],[7,8]] = [[5,12],[21,32]]
- **Files**: `lib/simulationEngine.ts`

### Task 8.4: Update Scope/Logger Validation
- **Start**: No rejection of matrix inputs
- **End**: Clear error message for matrix connections
- **Test**: "Scope blocks cannot display matrix signals"
- **Files**: `lib/connectionValidation.ts`

### Task 8.5: Update Transfer Function for Matrices
- **Start**: Only processes scalars and 1D arrays element-wise
- **End**: Process 2D arrays element-wise (each element gets own state)
- **Test**: Apply transfer function to each matrix element
- **Files**: `lib/simulationEngine.ts`

## Phase 9: Code Generation Updates

### Task 9.1: Update C Type Generation for Matrices
- **Start**: parseTypeToVariable only handles 1D arrays
- **End**: Generate 2D array declarations (e.g., double matrix[3][4])
- **Test**: Matrix types generate correct C declarations
- **Files**: `lib/codeGeneration.ts`

### Task 9.2: Generate Matrix Initialization Code
- **Start**: Only initializes scalars and 1D arrays
- **End**: Generate nested loops for matrix initialization
- **Test**: Matrix inputs initialized with memset or loops
- **Files**: `lib/codeGeneration.ts`

### Task 9.3: Generate Matrix Multiply Function
- **Start**: No matrix multiply in generated code
- **End**: Generate efficient matmul function
- **Test**: Generated function computes correctly
- **Files**: `lib/codeGeneration.ts`

### Task 9.4: Generate Element-wise Matrix Operations
- **Start**: Only scalar/1D array operations
- **End**: Nested loops for element-wise matrix ops
- **Test**: Scale, sum, multiply work on matrices
- **Files**: `lib/codeGeneration.ts`

### Task 9.5: Generate Mux/Demux Functions
- **Start**: No mux/demux code generation
- **End**: Pack/unpack scalars to/from matrices
- **Test**: Generated mux/demux functions work
- **Files**: `lib/codeGeneration.ts`

## Phase 10: UI/UX Updates

### Task 10.1: Add Matrix Type Preview on Wires
- **Start**: Wires show scalar/vector types only
- **End**: Display matrix dimensions (e.g., "double[3][4]")
- **Test**: Matrix connections show dimension info
- **Files**: `components/CustomEdge.tsx`

### Task 10.2: Update Block Icons for Matrix Operations
- **Start**: No matrix-specific icons
- **End**: Matrix multiply shows ⊗, mux/demux have grid icons
- **Test**: Matrix blocks visually distinct
- **Files**: `components/BlockNode.tsx`

### Task 10.3: Add Matrix Value Preview
- **Start**: No matrix preview in UI
- **End**: Hover tooltip shows matrix values (truncated if large)
- **Test**: Hovering over matrix signal shows first few values
- **Files**: `components/SignalTooltip.tsx` (new file)

### Task 10.4: Update Connection Validation UI
- **Start**: Generic connection errors
- **End**: Show dimension mismatch visually
- **Test**: Red highlight with "3×4 → 2×3 ✗" message
- **Files**: `components/CanvasReactFlow.tsx`

### Task 10.5: Add Matrix Block Configuration Dialogs
- **Start**: No config UI for matrix blocks
- **End**: Dialogs for mux dimensions, demux preview
- **Test**: Can configure matrix block parameters
- **Files**: Create `components/MatrixMultiplyConfig.tsx`, update `components/ModelEditor.tsx`

## Phase 11: Testing Infrastructure

### Task 11.1: Create Matrix Test Utilities
- **Start**: No matrix test helpers
- **End**: Helper functions for creating test matrices
- **Test**: Test utilities work correctly
- **Files**: Create `__tests__/utils/matrixHelpers.ts`

### Task 11.2: Add Type Validator Tests for Matrices
- **Start**: Tests only cover scalars/1D arrays
- **End**: Comprehensive matrix type validation tests
- **Test**: All matrix type edge cases covered
- **Files**: Create `__tests__/typeValidator.test.ts`

### Task 11.3: Add Signal Propagation Tests
- **Start**: No matrix propagation tests
- **End**: Test matrix types flow through model
- **Test**: Complex matrix signal chains work
- **Files**: Create `__tests__/signalTypePropagation.test.ts`

### Task 11.4: Add Simulation Engine Matrix Tests
- **Start**: No matrix operation tests
- **End**: Test all matrix blocks in simulation
- **Test**: Matrix operations compute correctly
- **Files**: Create `__tests__/simulationEngine.test.ts`

### Task 11.5: Add Code Generation Tests
- **Start**: No matrix code generation tests
- **End**: Test generated C code for matrices
- **Test**: Generated code compiles and runs
- **Files**: Create `__tests__/codeGeneration.test.ts`

## Phase 12: Integration and Migration

### Task 12.1: Update Model Schema for Matrices
- **Start**: Schema doesn't validate matrix types
- **End**: Support matrix types in model validation
- **Test**: Models with matrix blocks validate correctly
- **Files**: `lib/modelSchema.ts`

### Task 12.2: Add Matrix Examples
- **Start**: No matrix example models
- **End**: Example models demonstrating matrix operations
- **Test**: Examples load and simulate correctly
- **Files**: Create example model files

### Task 12.3: Update Multi-Sheet Simulation
- **Start**: Multi-sheet doesn't handle matrix signals
- **End**: Matrix signals work across sheet boundaries
- **Test**: Matrix signals through subsystems
- **Files**: `lib/multiSheetSimulation.ts`

### Task 12.4: Add Backwards Compatibility
- **Start**: No migration for existing models
- **End**: Existing models continue to work
- **Test**: Old models load without errors
- **Files**: `lib/modelStore.ts`

### Task 12.5: Performance Optimization
- **Start**: No matrix-specific optimizations
- **End**: Optimize large matrix operations
- **Test**: 100×100 matrices perform acceptably
- **Files**: Various simulation files

## Implementation Order and Dependencies

### Critical Path (Must be done in order):
1. **Phase 1**: Type system (foundation for everything)
2. **Phase 2**: Type propagation (needed for validation)
3. **Phase 3**: Block definitions (needed for UI)
4. **Phase 7-8**: Basic matrix support in existing blocks
5. **Phase 4-6**: New matrix blocks
6. **Phase 9**: Code generation
7. **Phase 10-12**: UI, testing, integration

### Parallel Work Opportunities:
- Phase 3 (block definitions) can start after Phase 1
- Phase 10 (UI updates) can proceed alongside Phase 4-6
- Phase 11 (testing) can be developed alongside implementation
- Documentation can be updated continuously

## Testing Strategy

Each task should include:
1. **Unit tests** for the specific functionality
2. **Integration tests** when connecting to other components
3. **Visual tests** for UI components
4. **Performance benchmarks** for large matrices

## Success Criteria

- All existing functionality continues to work
- Matrix operations produce correct results (validated against NumPy/MATLAB)
- Generated C code compiles and produces same results as simulation
- UI clearly indicates matrix signals and dimensions
- Performance is acceptable for matrices up to 100×100

## Risk Mitigation

### Memory Usage
- Implement size limits (max 1000×1000)
- Add memory warnings in UI
- Use efficient data structures

### Performance
- Optimize matrix multiply algorithm
- Consider lazy evaluation for large matrices
- Add progress indicators for long operations

### Type Safety
- Strict validation at connection time
- Clear error messages for dimension mismatches
- Runtime validation in simulation

### Backwards Compatibility
- Existing models must load and run
- Gradual migration path for users
- Clear documentation of changes