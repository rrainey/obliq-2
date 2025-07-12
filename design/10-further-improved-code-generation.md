# Implementation Plan: Algebraic/Integration Layer Split

These changes refactor the approach to model C-code generation, allowing for more straighforward organization of the generated code.

## Phase 1: Foundation and Documentation

### Task 1.1: Update Architecture Document with New Design
- **Start:** Open `00-architecture.md`
- **End:** Add new section "Algebraic/Integration Layer Architecture" describing the two-layer approach, including conceptual diagram and rationale
- **Test:** Review document for clarity

### Task 1.2: Create Type Definitions for Algebraic Evaluation
- **Start:** Create new file `lib/codegen/AlgebraicTypes.ts`
- **End:** Define interfaces for `AlgebraicInputs`, `AlgebraicOutputs`, and `AlgebraicEvaluator`
- **Test:** File compiles without errors

### Task 1.3: Create Stub AlgebraicEvaluator Class
- **Start:** Create new file `lib/codegen/AlgebraicEvaluator.ts`
- **End:** Implement empty class with method signature `generate(): string` that returns `"/* TODO */"`
- **Test:** Can instantiate class and call generate()

## Phase 2: Extract Algebraic Computation Logic

### Task 2.1: Copy StepFunctionGenerator to AlgebraicEvaluator
- **Start:** Copy all code from `StepFunctionGenerator.ts` to `AlgebraicEvaluator.ts`
- **End:** Rename class and update imports
- **Test:** File still compiles

### Task 2.2: Rename Step Function to Evaluate Algebraic
- **Start:** In `AlgebraicEvaluator.ts`, rename `generate()` method
- **End:** Change function name from `${modelName}_step` to `${modelName}_evaluate_algebraic`
- **Test:** Generated code contains new function name

### Task 2.3: Update Algebraic Function Parameters
- **Start:** Modify function signature in `AlgebraicEvaluator.ts`
- **End:** Change from `(model_t* model)` to `(const inputs_t*, const states_t*, signals_t*, outputs_t*, const enable_states_t*)`
- **Test:** Generated function has new signature

### Task 2.4: Replace Model Pointer References with Parameters
- **Start:** In algebraic evaluation function body
- **End:** Replace all `model->inputs.X` with `inputs->X`, `model->states.X` with `states->X`, etc.
- **Test:** No references to `model->` remain in generated code

### Task 2.5: Remove Time Update from Algebraic Function
- **Start:** Find time update code in algebraic evaluator
- **End:** Remove `model->time += model->dt;` line
- **Test:** Generated code has no time updates

### Task 2.6: Remove State Integration from Algebraic Function
- **Start:** Find RK4 integration call
- **End:** Remove `perform_rk4_integration(model);` and related code
- **Test:** No state updates in algebraic function

### Task 2.7: Remove Enable State Evaluation from Algebraic Function
- **Start:** Find enable state evaluation
- **End:** Remove `${modelName}_evaluate_enable_states(model);` call
- **Test:** No enable state updates in algebraic function

## Phase 3: Create New Integration Orchestrator

### Task 3.1: Create IntegrationOrchestrator Class
- **Start:** Create new file `lib/codegen/IntegrationOrchestrator.ts`
- **End:** Basic class with `generate(): string` method returning empty step function
- **Test:** Can generate empty function with correct signature

### Task 3.2: Add Algebraic Evaluation Call to Step Function
- **Start:** In `IntegrationOrchestrator.generate()`
- **End:** Add call to `${modelName}_evaluate_algebraic(&model->inputs, &model->states, &model->signals, &model->outputs, &model->enable_states);`
- **Test:** Generated step function contains algebraic call

### Task 3.3: Add Time Update to Step Function
- **Start:** After algebraic evaluation call
- **End:** Add `model->time += model->dt;`
- **Test:** Time update appears after algebraic evaluation

### Task 3.4: Add Placeholder for State Integration
- **Start:** Between algebraic eval and time update
- **End:** Add comment `/* TODO: State integration */`
- **Test:** Comment appears in correct location

## Phase 4: Update Header Generation

### Task 4.1: Add Algebraic Function Prototype to Header
- **Start:** In `HeaderGenerator.ts`, find function prototypes section
- **End:** Add prototype for `${modelName}_evaluate_algebraic` function
- **Test:** Header contains new function prototype

### Task 4.2: Update RK4 Derivatives Prototype
- **Start:** In derivatives function prototype
- **End:** Ensure it has `signals` parameter (from earlier discussion)
- **Test:** Derivatives function has signals parameter

## Phase 5: Update Main Code Generator

### Task 5.1: Import AlgebraicEvaluator in CodeGenerator
- **Start:** In `CodeGenerator.ts`
- **End:** Add import for `AlgebraicEvaluator`
- **Test:** File compiles

### Task 5.2: Instantiate AlgebraicEvaluator
- **Start:** In `CodeGenerator.generateSource()`
- **End:** Create instance: `const algebraicEvaluator = new AlgebraicEvaluator(model, typeMap)`
- **Test:** No compilation errors

### Task 5.3: Generate Algebraic Function Code
- **Start:** After static data generation
- **End:** Add `source += algebraicEvaluator.generate() + '\n'`
- **Test:** Generated source contains algebraic function

### Task 5.4: Import IntegrationOrchestrator
- **Start:** In `CodeGenerator.ts`
- **End:** Add import for `IntegrationOrchestrator`
- **Test:** File compiles

### Task 5.5: Replace StepFunctionGenerator with IntegrationOrchestrator
- **Start:** Find `StepFunctionGenerator` usage
- **End:** Replace with `IntegrationOrchestrator`
- **Test:** Step function still generates (now from orchestrator)

## Phase 6: Fix RK4 Integration

### Task 6.1: Create StateIntegrator Class
- **Start:** Create new file `lib/codegen/StateIntegrator.ts`
- **End:** Basic class structure with `generateEulerIntegration()` method
- **Test:** Class can be instantiated

### Task 6.2: Implement Simple Euler Integration
- **Start:** In `generateEulerIntegration()`
- **End:** Generate code that updates states using derivatives (simple Euler method)
- **Test:** Generated code contains state update loops

### Task 6.3: Add Euler Integration to Orchestrator
- **Start:** In `IntegrationOrchestrator`, after algebraic eval
- **End:** Replace TODO comment with call to Euler integration
- **Test:** Step function includes Euler integration

### Task 6.4: Create RK4 Specific Integration Method
- **Start:** In `StateIntegrator`, add `generateRK4Integration()` method
- **End:** Method returns `"/* RK4 not yet implemented */"`
- **Test:** Method exists and returns comment

### Task 6.5: Move RK4 Structure to StateIntegrator
- **Start:** Copy RK4 structure from `RK4Generator`
- **End:** Adapt to use algebraic evaluation calls
- **Test:** RK4 code generates without compilation errors

### Task 6.6: Update RK4 to Call Algebraic Evaluator
- **Start:** In RK4 integration code
- **End:** Replace derivatives calculation with algebraic eval + derivatives
- **Test:** Each k1,k2,k3,k4 calculation calls algebraic evaluator

### Task 6.7: Add Integration Method Selection
- **Start:** In `IntegrationOrchestrator`
- **End:** Add option to choose between Euler and RK4
- **Test:** Can generate either integration method

## Phase 7: Update Transfer Function Module

### Task 7.1: Create generateStateDerivative Method
- **Start:** In `TransferFunctionBlockModule.ts`
- **End:** Add method that generates derivative calculation code
- **Test:** Method exists and returns valid C code

### Task 7.2: Update Derivatives Function to Use Module
- **Start:** In `RK4Generator.generateDerivativeComputation`
- **End:** Call transfer function module's `generateStateDerivative`
- **Test:** Derivatives function uses module-generated code

## Phase 8: Update Simulation Engine

### Task 8.1: Create SimulationAlgebraicEvaluator Class
- **Start:** Create new file `lib/simulation/SimulationAlgebraicEvaluator.ts`
- **End:** Class with `evaluate()` method that takes states and returns signals
- **Test:** Class can be instantiated

### Task 8.2: Extract Algebraic Logic from SimulationEngine
- **Start:** Copy signal computation logic from `SimulationEngine.step()`
- **End:** Move to `SimulationAlgebraicEvaluator.evaluate()`
- **Test:** Algebraic evaluator computes correct signals

### Task 8.3: Update SimulationEngine to Use Algebraic Evaluator
- **Start:** In `SimulationEngine.step()`
- **End:** Replace inline computation with call to algebraic evaluator
- **Test:** Simulation still produces correct results

### Task 8.4: Create SimulationStateIntegrator
- **Start:** Create new file `lib/simulation/SimulationStateIntegrator.ts`
- **End:** Class with `integrate()` method for state updates
- **Test:** Class exists with correct interface

### Task 8.5: Move State Integration Logic
- **Start:** Extract state update logic from `SimulationEngine`
- **End:** Move to `SimulationStateIntegrator`
- **Test:** State updates work correctly

## Phase 9: Update Multi-Sheet Simulation

### Task 9.1: Update MultiSheetSimulationEngine Constructor
- **Start:** In constructor
- **End:** Create algebraic evaluators for each sheet engine
- **Test:** No errors during construction

### Task 9.2: Refactor Global Execution Order Usage
- **Start:** In `MultiSheetSimulationEngine.run()`
- **End:** Use algebraic evaluation approach instead of direct execution
- **Test:** Multi-sheet simulation still works

## Phase 10: Testing Infrastructure Updates

### Task 10.1: Update ModelExecutor for New Architecture
- **Start:** In `ModelExecutor.ts`
- **End:** Add logging for algebraic vs integration phases
- **Test:** Logs show both phases

### Task 10.2: Add Algebraic-Only Test Mode
- **Start:** Add option to `ModelExecutor`
- **End:** Can run only algebraic evaluation without integration
- **Test:** Can compare algebraic outputs at t=0

### Task 10.3: Create Integration Method Comparison Tests
- **Start:** Create new test file `integration-methods.test.ts`
- **End:** Compare Euler vs RK4 results
- **Test:** Tests can run and show differences

### Task 10.4: Update Cross-Validation Tests
- **Start:** In existing test files
- **End:** Ensure tests still pass with new architecture
- **Test:** All existing tests pass

# Phase 11: Refactor Integration to State Integrator

This phase moves integration logic from individual block modules to the SimulationStateIntegrator, enabling runtime selection of integration methods and proper separation of concerns.

## Phase 11: Move Integration Logic to State Integrator

### Task 11.1: Create Derivative Interface for Block Modules
- **Start:** Add `computeDerivatives` method to IBlockModule interface
- **End:** Interface includes method signature: `computeDerivatives(blockState: BlockState, inputs: any[], time: number): number[]`
- **Test:** Interface compiles without errors

### Task 11.2: Implement computeDerivatives in TransferFunctionBlockModule
- **Start:** Add computeDerivatives method to TransferFunctionBlockModule
- **End:** Method returns state derivatives without updating states
- **Test:** Unit test verifies derivatives match expected values

### Task 11.3: Extract State Update Logic from TransferFunctionBlockModule
- **Start:** Identify state update code in processTransferFunctionElement
- **End:** Create separate method that only computes derivatives
- **Test:** Transfer function still produces correct outputs

### Task 11.4: Create State Container Interface
- **Start:** Design interface for managing block states during integration
- **End:** Interface supports getting/setting states for all blocks
- **Test:** Can store and retrieve states for multiple blocks

### Task 11.5: Implement Euler Integration in SimulationStateIntegrator
- **Start:** In SimulationStateIntegrator.integrateEuler method
- **End:** Implement proper Euler integration using block derivatives
- **Test:** Euler produces expected results for test cases

### Task 11.6: Implement RK4 Integration in SimulationStateIntegrator
- **Start:** In SimulationStateIntegrator.integrateRK4 method
- **End:** Implement full RK4 using intermediate state evaluations
- **Test:** RK4 matches current accuracy

### Task 11.7: Create Integration Context for Multi-Stage Methods
- **Start:** Design structure to hold intermediate states for RK4
- **End:** Context supports k1, k2, k3, k4 evaluations
- **Test:** Can perform multi-stage integration correctly

### Task 11.8: Update SimulationAlgebraicEvaluator for Integration Support
- **Start:** Modify evaluate method to accept temporary states
- **End:** Can evaluate algebraic relationships at intermediate points
- **Test:** Produces correct outputs for non-current states

### Task 11.9: Refactor TransferFunctionBlockModule.executeSimulation
- **Start:** Remove integration code from executeSimulation
- **End:** Method only computes algebraic output from current state
- **Test:** Block works correctly with external integration

### Task 11.10: Update MultiSheetSimulationEngine Integration Loop
- **Start:** Modify run method to use new integration approach
- **End:** Properly calls state integrator with derivative information
- **Test:** Multi-sheet models produce same results as before

### Task 11.11: Add Integration Method Selection to SimulationConfig
- **Start:** Add integrationMethod field to SimulationConfig interface
- **End:** Can specify 'euler' or 'rk4' in configuration
- **Test:** Configuration properly propagates to integrators

### Task 11.12: Implement State Rollback for Failed Steps
- **Start:** Add mechanism to restore previous states
- **End:** Can rollback states if integration step fails
- **Test:** System recovers from numerical issues

### Task 11.13: Add Derivative Validation and Error Checking
- **Start:** Implement checks for NaN/Inf in derivatives
- **End:** Integration fails gracefully with meaningful errors
- **Test:** Proper error messages for problematic systems

### Task 11.14: Create Integration Method Comparison Tests
- **Start:** Update integration-methods.test.ts
- **End:** Tests actually compare Euler vs RK4 results
- **Test:** Shows RK4 is more accurate than Euler

### Task 11.15: Update Other Stateful Block Modules
- **Start:** Identify other blocks that need derivatives (if any)
- **End:** All stateful blocks implement computeDerivatives
- **Test:** All block types work with new integration

### Task 11.16: Add Performance Benchmarks
- **Start:** Create benchmarks comparing integration methods
- **End:** Measure overhead of new architecture
- **Test:** Performance is acceptable (within 20% of original)

### Task 11.17: Update Code Generation for Consistency
- **Start:** Ensure C code generation matches new approach
- **End:** Generated code uses same integration structure
- **Test:** Cross-validation tests still pass

### Task 11.18: Document Integration Architecture
- **Start:** Create integration-architecture.md
- **End:** Document new derivative-based approach
- **Test:** Documentation is clear and complete

## Phase 11 - Benefits of This Refactoring

1. **True Integration Method Selection**: Can switch between Euler and RK4 at runtime
2. **Better Testability**: Can test integration methods in isolation
3. **Cleaner Architecture**: Algebraic computation separated from integration
4. **Extensibility**: Easy to add new integration methods (e.g., RK2, adaptive methods)
5. **Consistency**: Simulation and code generation use same integration approach
6. **Debugging**: Can inspect derivatives independently of state updates

## Phase 11 - Migration Strategy

- Implement in parallel without breaking existing functionality
- Use feature flag to switch between old and new integration
- Gradually migrate block modules one at a time
- Ensure backward compatibility during transition

## Phase 12: Documentation Updates

### Task 12.1: Update Code Generation Documentation
- **Start:** Create new file `docs/code-generation-architecture.md`
- **End:** Document the algebraic/integration split
- **Test:** Documentation is clear and complete

### Task 12.2: Add Integration Method Documentation
- **Start:** In architecture docs
- **End:** Document available integration methods and when to use each
- **Test:** Includes examples and trade-offs

### Task 12.3: Update API Documentation
- **Start:** In relevant source files
- **End:** Update JSDoc comments for new architecture
- **Test:** Generated docs reflect new structure

## Phase 13: Cleanup and Optimization

### Task 13.1: Remove Old StepFunctionGenerator
- **Start:** After confirming all tests pass
- **End:** Delete `StepFunctionGenerator.ts`
- **Test:** Project still builds

### Task 13.2: Remove Redundant Code from RK4Generator
- **Start:** Identify code moved to other modules
- **End:** Remove duplicated functionality
- **Test:** RK4 generation still works

### Task 13.3: Add Performance Benchmarks
- **Start:** Create `benchmarks/algebraic-performance.test.ts`
- **End:** Measure algebraic evaluation performance
- **Test:** Benchmarks run and produce metrics

### Task 13.4: Optimize Algebraic Evaluation Order
- **Start:** In `AlgebraicEvaluator`
- **End:** Ensure optimal block execution order
- **Test:** No change in results, possible performance improvement