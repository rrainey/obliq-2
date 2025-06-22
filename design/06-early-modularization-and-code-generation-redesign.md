# Code Generation System Reimplementation Task Plan

## Phase 1: Create Block-Specific Code Generation Infrastructure

### Task 1.1: Create base block code generator interface
- Create `lib/blocks/BlockModule.ts`
- Define interface `IBlockModule` with methods:
  - `generateComputation(block: BlockData, inputs: string[]): string`
  - `getOutputType(block: BlockData, inputTypes: string[]): string`
  - `generateStructMember(block: BlockData, outputType: string): string | null`
  - `requiresState(block: BlockData): boolean`
  - `generateStateStructMembers(block: BlockData, outputType: string): string[]`
  - `generateInitialization?(block: BlockData): string`

### Task 1.2: Create Sum block code generator
- Create `lib/blocks/SumBlockModule.ts`
- Implement `IBlockModule` for Sum blocks
- Move existing `generateSumBlock` logic into `generateComputation` method
- Support scalar, vector, and matrix operations

### Task 1.3: Create Multiply block code generator
- Create `lib/blocks/MultiplyBlockModule.ts`
- Implement `IBlockModule` for Multiply blocks
- Move existing `generateMultiplyBlock` logic into `generateComputation` method

### Task 1.4: Create Input Port block code generator
- Create `lib/blocks/InputPortBlockModule.ts`
- Implement `IBlockModule` for Input Port blocks
- Generate code that copies from `model->inputs` to `model->signals`

### Task 1.5: Create Output Port block code generator
- Create `lib/blocks/OutputPortBlockModule.ts`
- Implement `IBlockModule` for Output Port blocks
- Generate code that copies from input expression to `model->outputs`

### Task 1.6: Create Source block code generator
- Create `lib/blocks/SourceBlockModule.ts`
- Implement `IBlockModule` for Source blocks
- Move existing `generateSourceBlock` logic

### Task 1.7: Create Scale block code generator
- Create `lib/blocks/ScaleBlockModule.ts`
- Implement `IBlockModule` for Scale blocks
- Move existing `generateScaleBlock` logic

### Task 1.8: Create Transfer Function block code generator
- Create `lib/blocks/TransferFunctionBlockModule.ts`
- Implement `IBlockModule` for Transfer Function blocks
- Include state management methods
- Add support for conditional state updates based on enable status

### Task 1.9: Create Lookup1D block code generator
- Create `lib/blocks/Lookup1DBlockModule.ts`
- Implement `IBlockModule` for 1D Lookup blocks
- Move existing lookup table generation logic

### Task 1.10: Create Lookup2D block code generator
- Create `lib/blocks/Lookup2DBlockModule.ts`
- Implement `IBlockModule` for 2D Lookup blocks

### Task 1.11: Create MatrixMultiply block code generator
- Create `lib/blocks/MatrixMultiplyBlockModule.ts`
- Implement `IBlockModule` for Matrix Multiply blocks
- Support all matrix/vector/scalar combinations

### Task 1.12: Create Mux block code generator
- Create `lib/blocks/MuxBlockModule.ts`
- Implement `IBlockModule` for Mux blocks
- Support dynamic port generation based on dimensions

### Task 1.13: Create Demux block code generator
- Create `lib/blocks/DemuxBlockModule.ts`
- Implement `IBlockModule` for Demux blocks
- Support dynamic output signal generation

### Task 1.14: Create block code generator factory
- Create `lib/blocks/BlockCodeGeneratorFactory.ts`
- Map block types to their code generator classes
- Export factory function `getBlockCodeGenerator(blockType: string): IBlockModule`

## Phase 2: Create Model Flattening System

### Task 2.1: Create model flattener types
- Create `lib/codegen/ModelFlattener.ts`
- Define types: `FlattenedBlock`, `FlattenedConnection`, `FlattenedModel`
- Add `subsystemPath: string[]` to FlattenedBlock for tracking hierarchy
- Add `enableScope: string | null` to track which subsystem's enable controls this block

### Task 2.2: Create subsystem enable tracking
- In `ModelFlattener.ts`, create `SubsystemEnableInfo` type
- Track subsystem IDs with their enable signal sources
- Create method `buildEnableScopes()` to map blocks to their controlling enable signal

### Task 2.3: Implement subsystem flattening with enable tracking
- In `ModelFlattener.ts`, create `flattenSubsystems()` method
- Recursively collect all blocks from all sheets
- Generate unique names for blocks based on their path
- Track enable scope for each block based on parent subsystems

### Task 2.4: Implement subsystem port removal
- In `ModelFlattener.ts`, create `removeSubsystemPorts()` method
- Map subsystem input/output ports to their connected blocks
- Handle special enable ports separately from regular input ports
- Replace subsystem connections with direct connections

### Task 2.5: Implement sheet label resolution
- In `ModelFlattener.ts`, create `resolveSheetLabels()` method
- Match sheet label sources and sinks within same scope
- Replace with direct connections

### Task 2.6: Create complete model flattener
- In `ModelFlattener.ts`, create main `flattenModel()` method
- Call all flattening methods in sequence
- Return `FlattenedModel` with blocks, connections, and enable scope mappings

## Phase 3: Create New Code Generation Pipeline

### Task 3.1: Create C code builder utilities
- Create `lib/codegen/CCodeBuilder.ts`
- Add utility methods: `sanitizeIdentifier()`, `generateArrayDeclaration()`
- Add struct building helpers
- Add method `generateBooleanExpression()` for enable signal evaluation

### Task 3.2: Create enable state management structures
- In `CCodeBuilder.ts`, add enable state struct generation
- Create helper to generate enable state tracking variables
- Add macros for checking enable status

### Task 3.3: Create header generator with enable support
- Create `lib/codegen/HeaderGenerator.ts`
- Take `FlattenedModel` as input
- Generate inputs, outputs, signals, and states structs
- Add enable state tracking struct
- Generate enable-related function prototypes

### Task 3.4: Create init function generator
- Create `lib/codegen/InitFunctionGenerator.ts`
- Generate initialization for all inputs and states
- Initialize all subsystem enable states to true
- Use block code generators for block-specific initialization

### Task 3.5: Create enable evaluation function generator
- Create `lib/codegen/EnableEvaluator.ts`
- Generate function to evaluate all subsystem enable signals
- Handle enable signal inheritance from parent subsystems
- Store results in enable state struct

### Task 3.6: Create step function generator with enable support
- Create `lib/codegen/StepFunctionGenerator.ts`
- Calculate execution order from flattened model
- Generate enable evaluation at start of step
- Wrap state updates in enable checks
- Call block code generators for each block's computation

### Task 3.7: Create RK4 integration generator with enable support
- Create `lib/codegen/RK4Generator.ts`
- Generate RK4 and derivatives functions
- Add enable state checks to skip integration for disabled blocks
- Use transfer function block code generator for state derivatives

### Task 3.8: Create main code generator
- Create `lib/codegen/CodeGenerator.ts` (new, simplified version)
- Coordinate all generators
- Take sheets as input, flatten first, then generate code
- Ensure enable evaluation happens at correct time

## Phase 4: Integration and Testing

### Task 4.1: Create enable signal test models
- Create test model with nested subsystems and enable signals
- Create test for enable signal inheritance
- Create test for state freezing behavior

### Task 4.2: Update existing code to use new generator
- Update imports in existing files to use new `lib/codegen/CodeGenerator.ts`
- Ensure API compatibility with existing code

### Task 4.3: Remove old code generation functions
- Delete old generator functions from original `codeGeneration.ts`
- Keep only the wrapper class for backward compatibility

### Task 4.4: Add comprehensive tests
- Create tests for each block code generator
- Create tests for model flattener with enable support
- Create tests for enable state evaluation
- Create integration tests for complete code generation

### Task 4.5: Add error handling and validation
- Add validation in model flattener for invalid connections
- Validate enable signal connections (must be boolean-typed)
- Add clear error messages for unsupported block configurations

## Phase 5: Documentation and Polish

### Task 5.1: Document enable signal behavior
- Create documentation for subsystem enable functionality
- Document the special port handling
- Document state freezing behavior

### Task 5.2: Add code generation comments
- Ensure generated C code includes comments explaining enable logic
- Add comments for state freezing sections
- Document the enable evaluation timing

This approach will:
1. Always flatten the model first, eliminating single/multi-sheet complexity
2. Properly track and handle subsystem enable states throughout the hierarchy
3. Modularize block-specific code generation
4. Make the code more maintainable and testable
5. Separate concerns clearly (flattening, enable tracking, struct generation, computation generation)