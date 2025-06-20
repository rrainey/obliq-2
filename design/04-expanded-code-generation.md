Let's create a plan for updating the code generation to handle multi-sheet models with subsystems. This is a natural next step since we've successfully implemented multi-sheet simulation.

## Code Generation Update Tasks

Here are the granular tasks to update code generation for multi-sheet models:

### Phase 1: Add Multi-Sheet Support Structure

#### Task 1: Add getAllSheets helper to codeGeneration.ts
- **Start:** generateCCode only processes main sheet
- **End:** Helper function exists to collect all sheets recursively

#### Task 2: Create block name prefixing function
- **Start:** No way to create unique names across sheets
- **End:** Function generates names like `subsystem1_scale1` for nested blocks

#### Task 3: Add sheet context tracking
- **Start:** No tracking of which sheet blocks belong to
- **End:** Map of blockId to sheet context exists

### Phase 2: Flatten Model Structure

#### Task 4: Create flattenModelStructure function skeleton
- **Start:** No function to flatten multi-sheet models
- **End:** Empty function with proper signature exists

#### Task 5: Implement block collection across all sheets
- **Start:** Function doesn't collect blocks
- **End:** All blocks from all sheets collected with prefixed names

#### Task 6: Implement wire collection and remapping
- **Start:** Function doesn't handle wires
- **End:** All wires collected with updated block references

#### Task 7: Handle subsystem port mapping
- **Start:** Subsystem input/output connections not mapped
- **End:** Subsystem boundaries replaced with direct connections

#### Task 8: Add sheet label connection resolution
- **Start:** Sheet labels not connected across sheets
- **End:** Sheet label sources connected to sinks within scope

### Phase 3: Update Code Generation Logic

#### Task 9: Modify generateCCode to use flattened structure
- **Start:** Uses original multi-sheet structure
- **End:** Uses flattened single-sheet structure

#### Task 10: Update execution order calculation
- **Start:** Only handles single sheet
- **End:** Calculates global execution order like simulation

#### Task 11: Add scoped variable naming
- **Start:** Variables might have name conflicts
- **End:** All variables have unique scoped names

#### Task 12: Update struct generation for subsystem signals
- **Start:** Only generates structs for main sheet
- **End:** Includes all signals from all sheets

### Phase 4: Handle Sheet Labels in Generated Code

#### Task 13: Create sheet label signal mapping
- **Start:** No tracking of sheet label connections
- **End:** Map of source to sink signals exists

#### Task 14: Generate sheet label signal assignments
- **Start:** No code for sheet label value passing
- **End:** Direct assignments replace sheet label blocks

#### Task 15: Remove sheet label blocks from generation
- **Start:** Sheet label blocks included in generated code
- **End:** Sheet label blocks excluded, only assignments remain

### Phase 5: Test Generated Code

#### Task 16: Create test model with subsystems
- **Start:** No test for multi-sheet code generation
- **End:** Test model with nested subsystems exists

#### Task 17: Add code generation test for subsystems
- **Start:** No automated test for subsystem code gen
- **End:** Test verifies correct C code structure

#### Task 18: Test compilation of generated multi-sheet code
- **Start:** No compilation test for complex models
- **End:** Generated code compiles successfully

### Phase 6: Integration and Documentation

#### Task 19: Update generateBlockComputation for all sheets
- **Start:** Only handles main sheet blocks
- **End:** Handles blocks from any sheet with proper naming

#### Task 20: Add comments indicating original sheet/subsystem
- **Start:** No indication of block origin in generated code
- **End:** Comments show original location for debugging

#### Task 21: Update code generation documentation
- **Start:** Docs only describe single-sheet generation
- **End:** Docs explain multi-sheet flattening process

#### Task 22: Final integration test
- **Start:** Individual features tested
- **End:** Complete multi-sheet model generates working code
