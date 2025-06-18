Here are the granular tasks to implement the hybrid approach for multi-sheet simulation:

## Phase 1: Add Required Methods to SimulationEngine

### Task 1: Add executeBlockById method signature to SimulationEngine
- **Start:** SimulationEngine has no method to execute a specific block
- **End:** Method signature `executeBlockById(blockId: string): void` exists (empty implementation)

### Task 2: Implement executeBlockById method body
- **Start:** executeBlockById method is empty
- **End:** Method finds block by ID and calls existing executeBlock method

### Task 3: Add advanceTime method signature to SimulationEngine
- **Start:** SimulationEngine has no method to advance time without executing blocks
- **End:** Method signature `advanceTime(timeStep: number): void` exists (empty implementation)

### Task 4: Implement advanceTime method body
- **Start:** advanceTime method is empty
- **End:** Method updates state.time by timeStep amount

### Task 5: Make executeBlock method public
- **Start:** executeBlock is private method
- **End:** executeBlock is public method so executeBlockById can use it

## Phase 2: Update MultiSheetSimulationEngine Structure

### Task 6: Add blockEngines Map to MultiSheetSimulationEngine
- **Start:** MultiSheetSimulationEngine uses single engines Map
- **End:** Add `blockEngines: Map<string, SimulationEngine>` property

### Task 7: Add executionOrder array to MultiSheetSimulationEngine
- **Start:** No global execution order tracking
- **End:** Add `executionOrder: { sheetId: string, blockId: string }[]` property

### Task 8: Add blockToSheet Map to MultiSheetSimulationEngine
- **Start:** No tracking of which sheet each block belongs to
- **End:** Add `blockToSheet: Map<string, string>` property

### Task 9: Remove old engines Map and subsystemSheetLabelValues
- **Start:** Old properties still exist
- **End:** Remove engines and subsystemSheetLabelValues properties

## Phase 3: Update Constructor Logic

### Task 10: Initialize blockEngines in constructor
- **Start:** Constructor uses old engines Map
- **End:** Constructor creates SimulationEngine for each sheet in blockEngines

### Task 11: Populate blockToSheet Map in constructor
- **Start:** blockToSheet Map is empty
- **End:** Constructor fills blockToSheet with block ID to sheet ID mappings

### Task 12: Add buildGlobalExecutionOrder call to constructor
- **Start:** Constructor doesn't build execution order
- **End:** Constructor calls buildGlobalExecutionOrder() at the end

## Phase 4: Implement Global Execution Order

### Task 13: Create buildGlobalExecutionOrder method skeleton
- **Start:** No buildGlobalExecutionOrder method exists
- **End:** Empty method with proper signature exists

### Task 14: Create dependency collection in buildGlobalExecutionOrder
- **Start:** Method doesn't collect dependencies
- **End:** Method creates dependencies Map from all sheet connections

### Task 15: Add mapSubsystemConnections method skeleton
- **Start:** No method to map subsystem connections
- **End:** Empty mapSubsystemConnections method exists

### Task 16: Implement mapSubsystemConnections for input mapping
- **Start:** mapSubsystemConnections doesn't map inputs
- **End:** Maps external inputs to internal input port blocks

### Task 17: Implement mapSubsystemConnections for output mapping
- **Start:** mapSubsystemConnections doesn't map outputs
- **End:** Maps internal output port blocks to external outputs

### Task 18: Implement topological sort visit function
- **Start:** No topological sort logic
- **End:** Recursive visit function exists in buildGlobalExecutionOrder

### Task 19: Complete buildGlobalExecutionOrder with visit calls
- **Start:** Visit function not called on all blocks
- **End:** All blocks visited and executionOrder array populated

## Phase 5: Update Run Method

### Task 20: Remove initializeSheetLabels call from run
- **Start:** run() calls initializeSheetLabels
- **End:** Call removed (no longer needed with new approach)

### Task 21: Update main simulation loop structure
- **Start:** Loop executes engines separately
- **End:** Loop iterates through executionOrder array

### Task 22: Add executeBlockById calls in simulation loop
- **Start:** Loop doesn't execute individual blocks
- **End:** Loop calls engine.executeBlockById for each execution order entry

### Task 23: Update signal data collection to use blockEngines
- **Start:** Uses old engines Map
- **End:** Uses blockEngines Map for signal collection

### Task 24: Add advanceTime calls for all engines
- **Start:** No time advancement after block execution
- **End:** All engines have advanceTime called after block execution

### Task 25: Remove subsystem sheet label synchronization
- **Start:** Complex sheet label synchronization logic exists
- **End:** All sheet label sync code removed

## Phase 6: Handle Sheet Label Scoping

### Task 26: Update SimulationEngine sheet label execution
- **Start:** Sheet labels use global sheetLabelValues
- **End:** Each engine maintains its own sheet label scope

### Task 27: Add getSheetLabelValue method to SimulationEngine
- **Start:** No method to get sheet label values
- **End:** Method exists to retrieve values by name

### Task 28: Add setSheetLabelValue method to SimulationEngine
- **Start:** No method to set sheet label values
- **End:** Method exists to store values by name

### Task 29: Update executeSheetLabelSinkBlock to use setSheetLabelValue
- **Start:** Uses state.sheetLabelValues directly
- **End:** Uses setSheetLabelValue method

### Task 30: Update executeSheetLabelSourceBlock to use getSheetLabelValue
- **Start:** Uses state.sheetLabelValues directly
- **End:** Uses getSheetLabelValue method

## Phase 7: Fix Subsystem Execution

### Task 31: Remove subsystem execution from executeSubsystemBlock
- **Start:** executeSubsystemBlock creates child engines
- **End:** Method just passes through inputs to outputs

### Task 32: Add subsystem port value storage
- **Start:** No way to pass values between subsystem boundary
- **End:** SimulationEngine tracks port values for subsystems

### Task 33: Implement input port value retrieval for subsystems
- **Start:** Input ports can't get subsystem input values
- **End:** Input ports read from parent's port value storage

### Task 34: Implement output port value storage for subsystems
- **Start:** Output ports don't store values for parent
- **End:** Output ports write to port value storage

## Phase 8: Testing and Validation

### Task 35: Update existing multi-sheet simulation test
- **Start:** Test expects old behavior
- **End:** Test passes with new execution model

### Task 36: Add test for sheet label scoping
- **Start:** No explicit test for scoping boundaries
- **End:** Test verifies labels don't leak between subsystems

### Task 37: Add test for nested subsystem execution order
- **Start:** No test for deep nesting execution
- **End:** Test verifies correct order with 3+ levels

### Task 38: Add test for subsystem with multiple sheets
- **Start:** No test for multi-sheet subsystems
- **End:** Test verifies sheet labels work within subsystem

### Task 39: Fix getSheetEngine method
- **Start:** Returns from old engines Map
- **End:** Returns from blockEngines Map

### Task 40: Fix getOutputPortValues method
- **Start:** Uses old engine retrieval
- **End:** Uses blockEngines Map

## Phase 9: Cleanup and Optimization

### Task 41: Remove unused helper methods
- **Start:** Old methods like getSheetsInSameScope still exist
- **End:** Unused methods removed

### Task 42: Add execution order debugging
- **Start:** No way to inspect execution order
- **End:** Optional console.log shows execution order

### Task 43: Add cycle detection warning
- **Start:** Cycles silently ignored
- **End:** Console warning when cycle detected

### Task 44: Optimize block lookup in executeBlockById
- **Start:** Linear search for block
- **End:** Use Map for O(1) lookup

### Task 45: Final integration test
- **Start:** Individual features tested
- **End:** Complex model with all features works correctly