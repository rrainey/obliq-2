# Reorganizing obliq-2 tests

## The original prompt:

<prompt>You have been assigned to this project to help reorganize the jest-based test suite. Examine these tests currently covering interactive simulation and C-code generation. Look for opportunities to expand testing in both regimes. 

C-Code tests should focus on actually compiling and running a model to obtain results. Favor that method over simply looking for fixed strings or markers in the generated code modules. As previously used in tests/integration/code-generation/code-compilation.test.ts , use Docker images to isolate and PlatformIO to compile the generated C code.
look for opportunities to run the same model in both interactive simulation and in Docker: compare the results and reject any results that differs by over 0.1% in a ten-second execution run.
Start by examining the existing tests.    Leverage tests/integration/code-generation/models/itest-01.json or itest-02.json or build your own test models from scratch. as a starting point, construct a step-by-step plan to rewrite and reorganize each test module.  Each task should:
- Be incredibly small + testable
- Have a clear start + end
- Focus on one concern in early testing and build up to more integrated, end-to-end tests.
</prompt>

Looking at the test suite, I can see there are two main testing areas:
1. **Unit tests** for code generation internals (`code-generation.test.ts`)
2. **Integration tests** that compile and run generated C code (`code-compilation.test.ts`)

The current tests have good coverage but could be reorganized for better clarity and expanded to include cross-validation between interactive simulation and compiled C code execution.

## Test Reorganization Plan

### Phase 1: Reorganize Existing Tests into Clear Categories

#### Task 1.1: Create Basic Block Test Module
- **File**: `__tests__/blocks/basic-blocks.test.ts`
- **Focus**: Test individual block modules (Sum, Multiply, Scale, etc.)
- **Actions**:
  - Move block-specific tests from `code-generation.test.ts`
  - Test each block's code generation in isolation
  - Test each block's simulation execution in isolation
  - Verify port counts and type propagation

#### Task 1.2: Create Model Flattening Test Module
- **File**: `__tests__/codegen/model-flattening.test.ts`
- **Focus**: Test the ModelFlattener class
- **Actions**:
  - Move flattening tests from `code-generation.test.ts`
  - Test single-sheet flattening
  - Test multi-sheet flattening
  - Test subsystem removal
  - Test sheet label resolution

#### Task 1.3: Create Enable Signal Test Module
- **File**: `__tests__/codegen/enable-signals.test.ts`
- **Focus**: Test enable signal functionality
- **Actions**:
  - Move enable-related tests from `code-generation.test.ts`
  - Test enable signal propagation
  - Test enable hierarchy
  - Test state freezing behavior

#### Task 1.4: Create Code Builder Utilities Test Module
- **File**: `__tests__/codegen/code-builder.test.ts`
- **Focus**: Test CCodeBuilder utilities
- **Actions**:
  - Move CCodeBuilder tests from `code-generation.test.ts`
  - Test identifier sanitization
  - Test array declarations
  - Test struct generation
  - Test boolean expressions

### Phase 2: Create Model Test Utilities

#### Task 2.1: Create Test Model Builder
- **File**: `__tests__/utils/TestModelBuilder.ts`
- **Focus**: Programmatic model creation
- **Actions**:
  - Create builder pattern for test models
  - Support fluent API for adding blocks/connections
  - Generate consistent test models
  - Include metadata for expected results

#### Task 2.2: Create Model Execution Utilities
- **File**: `__tests__/utils/ModelExecutor.ts`
- **Focus**: Run models in both simulation and C
- **Actions**:
  - Create unified interface for running models
  - Support interactive simulation execution
  - Support Docker-based C compilation/execution
  - Extract and parse results from both

#### Task 2.3: Create Result Comparison Utilities
- **File**: `__tests__/utils/ResultComparator.ts`
- **Focus**: Compare simulation vs C code results
- **Actions**:
  - Parse simulation results
  - Parse C program output
  - Compare with configurable tolerance (0.1%)
  - Generate detailed diff reports

### Phase 3: Create Cross-Validation Tests

#### Task 3.1: Create Basic Block Cross-Validation Tests
- **File**: `__tests__/cross-validation/basic-blocks.test.ts`
- **Focus**: Verify basic blocks produce same results
- **Actions**:
  - Test Sum block (multiple inputs)
  - Test Multiply block (multiple inputs)
  - Test Scale block (various gains)
  - Test Source blocks (constants, vectors, matrices)

#### Task 3.2: Create Transfer Function Cross-Validation Tests
- **File**: `__tests__/cross-validation/transfer-functions.test.ts`
- **Focus**: Verify dynamic blocks match
- **Actions**:
  - Test first-order systems
  - Test second-order systems
  - Test pure integrators
  - Test with different time steps

#### Task 3.3: Create Lookup Table Cross-Validation Tests
- **File**: `__tests__/cross-validation/lookup-tables.test.ts`
- **Focus**: Verify interpolation matches
- **Actions**:
  - Test 1D lookup with clamping
  - Test 1D lookup with extrapolation
  - Test 2D lookup tables
  - Test edge cases (out of bounds)

#### Task 3.4: Create Matrix Operation Cross-Validation Tests
- **File**: `__tests__/cross-validation/matrix-operations.test.ts`
- **Focus**: Verify matrix math matches
- **Actions**:
  - Test matrix multiply operations
  - Test mux/demux blocks
  - Test element-wise operations
  - Test various matrix sizes

### Phase 4: Create Complex System Tests

#### Task 4.1: Create Multi-Sheet System Tests
- **File**: `__tests__/cross-validation/multi-sheet-systems.test.ts`
- **Focus**: Verify sheet label connections
- **Actions**:
  - Test sheet labels within same subsystem
  - Test nested subsystem communication
  - Test multiple sheet label pairs
  - Compare 10-second runs

#### Task 4.2: Create Subsystem Enable Tests
- **File**: `__tests__/cross-validation/subsystem-enable.test.ts`
- **Focus**: Verify enable behavior matches
- **Actions**:
  - Test simple enable/disable
  - Test nested enable inheritance
  - Test state freezing over time
  - Test enable signal changes during run

#### Task 4.3: Create Feedback System Tests
- **File**: `__tests__/cross-validation/feedback-systems.test.ts`
- **Focus**: Test closed-loop systems
- **Actions**:
  - Create PID controller test
  - Create state-space feedback test
  - Test algebraic loops (if supported)
  - Verify stability over 10 seconds

### Phase 5: Create Performance and Edge Case Tests

#### Task 5.1: Create Large Model Tests
- **File**: `__tests__/performance/large-models.test.ts`
- **Focus**: Test scalability
- **Actions**:
  - Test model with 100+ blocks
  - Test deeply nested subsystems (10+ levels)
  - Test large matrix operations (50x50)
  - Verify memory usage is reasonable

#### Task 5.2: Create Numerical Accuracy Tests
- **File**: `__tests__/accuracy/numerical-precision.test.ts`
- **Focus**: Test numerical precision
- **Actions**:
  - Test very small time steps (0.0001)
  - Test very large time steps (1.0)
  - Test extreme parameter values
  - Test numerical stability

#### Task 5.3: Create Error Handling Tests
- **File**: `__tests__/error-handling/compilation-errors.test.ts`
- **Focus**: Test error conditions
- **Actions**:
  - Test invalid connections
  - Test missing blocks
  - Test type mismatches
  - Verify helpful error messages

### Phase 6: Create Test Infrastructure

#### Task 6.1: Create Test Report Generator
- **File**: `__tests__/utils/TestReporter.ts`
- **Focus**: Generate comparison reports
- **Actions**:
  - Create HTML report template
  - Include graphs of signals over time
  - Show simulation vs C code diffs
  - Generate summary statistics

#### Task 6.2: Create Continuous Integration Setup
- **File**: `.github/workflows/cross-validation.yml`
- **Focus**: Automate cross-validation
- **Actions**:
  - Build Docker images in CI
  - Run all cross-validation tests
  - Generate and archive reports
  - Fail on >0.1% deviation

#### Task 6.3: Create Test Model Library
- **File**: `__tests__/models/library/`
- **Focus**: Reusable test models
- **Actions**:
  - Create standard control systems
  - Create signal processing examples
  - Create matrix operation examples
  - Document expected behaviors

### Phase 7: Migrate and Enhance Existing Tests

#### Task 7.1: Enhance itest-01.json Tests
- **File**: `__tests__/cross-validation/itest-01.test.ts`
- **Focus**: Full validation of itest-01
- **Actions**:
  - Load itest-01.json
  - Run in simulation for 10 seconds
  - Compile and run C code
  - Compare all outputs (<0.1% tolerance)

#### Task 7.2: Enhance itest-02.json Tests
- **File**: `__tests__/cross-validation/itest-02.test.ts`
- **Focus**: Full validation of itest-02
- **Actions**:
  - Load itest-02.json
  - Verify lookup table behavior
  - Compare signal display values
  - Validate logged data matches

#### Task 7.3: Create Model Mutation Tests
- **File**: `__tests__/cross-validation/model-mutations.test.ts`
- **Focus**: Test model variations
- **Actions**:
  - Load base model
  - Mutate parameters slightly
  - Verify both systems respond identically
  - Test parameter sensitivity

This reorganization will create a much more maintainable and comprehensive test suite that ensures the interactive simulation and generated C code produce identical results within tolerance.