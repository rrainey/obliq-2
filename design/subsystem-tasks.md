# subsystem-tasks.md

# Subsystem Hierarchical Architecture Implementation Tasks

This document outlines the granular tasks needed to implement hierarchical sheet organization for subsystems. Each task is designed to be small, testable, and focused on a single concern.

These tasks were identified as a follow-on to the original system implementation when it was discovered that Subsystem blocks were not fully implemented in the original `tasks.md`.

## Phase 1: Schema and Data Model Updates

### Task 1: Update SubsystemParametersSchema in modelSchema.ts
- **Start:** Open modelSchema.ts
- **End:** SubsystemParametersSchema includes sheets array, inputPorts and outputPorts arrays

### Task 2: Remove sheetId/sheetName from SubsystemParametersSchema
- **Start:** SubsystemParametersSchema has old sheetId/sheetName properties
- **End:** Only sheets, inputPorts, outputPorts remain in schema

### Task 3: Add recursive Sheet type definition
- **Start:** Sheet type doesn't support nested sheets
- **End:** Sheet type can contain blocks with subsystem type that have embedded sheets

### Task 4: Update modelSchema version constant
- **Start:** Model version is "1.0"
- **End:** Add support for version "2.0" to indicate hierarchical structure

### Task 5: Add findSheetById helper function
- **Start:** No helper to find sheets at any depth
- **End:** findSheetById function can locate sheets in nested subsystems

### Task 6: Add getAllSheets helper function
- **Start:** No helper to collect all sheets recursively
- **End:** getAllSheets returns flat array of all sheets including nested ones

## Phase 2: Migration Functions

### Task 7: Create migrateToHierarchicalSheets function skeleton
- **Start:** No migration function exists
- **End:** Empty function with proper signature that returns modelData unchanged

### Task 8: Implement sheet categorization in migration
- **Start:** Migration doesn't categorize sheets
- **End:** Migration separates root sheets from subsystem sheets based on ID pattern

### Task 9: Implement subsystem sheet attachment in migration
- **Start:** Subsystem sheets aren't attached to parent blocks
- **End:** Migration updates subsystem blocks to contain their sheets

### Task 10: Add version update to migration
- **Start:** Migration doesn't update version
- **End:** Migration sets version to "2.0" after conversion

### Task 11: Test migration with sample flat model
- **Start:** No test for migration function
- **End:** Migration correctly converts a flat test model to hierarchical

## Phase 3: Model Store Updates

### Task 12: Update initializeFromModel to use migration
- **Start:** initializeFromModel doesn't handle hierarchical sheets
- **End:** Calls migrateToHierarchicalSheets before processing

### Task 13: Fix findSheetInSubsystems type annotation
- **Start:** TypeScript error on line 643
- **End:** Parameter 's' has type annotation (s: Sheet)

### Task 14: Fix switchToSheet null/undefined issue
- **Start:** TypeScript error on line 538
- **End:** Uses || undefined to convert null to undefined

### Task 15: Update saveModel to preserve hierarchical structure
- **Start:** saveModel might flatten sheets
- **End:** saveModel maintains hierarchical structure with version 2.0

### Task 16: Create updateSubsystemSheets action
- **Start:** No way to update sheets within a subsystem
- **End:** New action can update sheets array in subsystem parameters

### Task 17: Add getParentSheet helper
- **Start:** No way to find which sheet contains a subsystem
- **End:** Helper returns parent sheet for a given sheet ID

## Phase 4: Navigation Components

### Task 18: Create Breadcrumb interface type
- **Start:** No breadcrumb type definition
- **End:** Interface with sheetId, sheetName, and path properties

### Task 19: Create getSheetPath utility function
- **Start:** No way to build breadcrumb path
- **End:** Function returns array of breadcrumbs from root to target sheet

### Task 20: Create SheetBreadcrumbs component file
- **Start:** No breadcrumb component exists
- **End:** Empty component file with proper imports

### Task 21: Implement SheetBreadcrumbs UI
- **Start:** Empty component
- **End:** Displays breadcrumb trail with separators

### Task 22: Add click handlers to SheetBreadcrumbs
- **Start:** Breadcrumbs are display-only
- **End:** Clicking breadcrumb navigates to that sheet

### Task 23: Add SheetBreadcrumbs to page.tsx
- **Start:** No breadcrumb display in editor
- **End:** Breadcrumbs appear below sheet tabs

## Phase 5: Canvas and Context Menu Updates

### Task 24: Update handleCanvasDrop to embed subsystem sheets
- **Start:** Subsystem sheets added to root level
- **End:** Sheets stored in subsystem parameters.sheets array

### Task 25: Remove addSheet call for subsystem sheets
- **Start:** handleCanvasDrop calls addSheet for subsystem sheets
- **End:** Only subsystem block is added, sheet is embedded

### Task 26: Update getAvailableSheets to read from parameters
- **Start:** getAvailableSheets searches all sheets
- **End:** Returns block.parameters?.sheets || []

### Task 27: Add sheet count to context menu display
- **Start:** Context menu shows "Open Sheet >"
- **End:** Shows "Open Sheet > (2 sheets)" when multiple sheets exist

### Task 28: Update context menu to handle empty sheet array
- **Start:** Context menu might show submenu for empty sheets
- **End:** "Open Sheet" option hidden when no sheets exist

## Phase 6: SubsystemConfig Dialog Updates

### Task 29: Add sheets state to SubsystemConfig
- **Start:** SubsystemConfig doesn't manage sheets
- **End:** Component has local sheets state initialized from parameters

### Task 30: Create "Add Sheet" button in SubsystemConfig
- **Start:** No way to add sheets in dialog
- **End:** Button appears below ports configuration

### Task 31: Implement addSubsystemSheet function
- **Start:** Button doesn't do anything
- **End:** Clicking creates new sheet with unique ID and name

### Task 32: Create sheet list display in SubsystemConfig
- **Start:** No list of subsystem sheets
- **End:** Shows table with sheet name and actions

### Task 33: Add rename sheet functionality
- **Start:** Can't rename subsystem sheets
- **End:** Edit icon opens inline name editor

### Task 34: Add delete sheet functionality
- **Start:** Can't delete subsystem sheets
- **End:** Trash icon removes sheet (with confirmation)

### Task 35: Add navigate button for each sheet
- **Start:** Can't navigate to sheets from config
- **End:** Arrow icon navigates to sheet and closes dialog

### Task 36: Update handleSave to include sheets array
- **Start:** Save doesn't include sheets
- **End:** parameters includes updated sheets array

## Phase 7: Sheet Tabs Updates

### Task 37: Filter SheetTabs to show only root sheets
- **Start:** SheetTabs shows all sheets including subsystem sheets
- **End:** Only displays sheets from root level

### Task 38: Add visual indicator for active subsystem context
- **Start:** No indication when viewing subsystem sheet
- **End:** Different background color or border for subsystem context

### Task 39: Add "Parent" button when in subsystem
- **Start:** No way to navigate up from subsystem sheet
- **End:** Button appears that returns to parent sheet

### Task 40: Implement getParentSheetId function
- **Start:** No way to find parent of current sheet
- **End:** Function returns ID of sheet containing the subsystem

## Phase 8: Simulation Engine Updates

### Task 41: Update MultiSheetSimulationEngine to handle nested sheets
- **Start:** Simulation only processes flat sheet array
- **End:** Recursively collects all sheets including nested ones

### Task 42: Add subsystem sheet collection to getAllSheets
- **Start:** Simulation might miss subsystem sheets
- **End:** getAllSheets includes sheets from subsystem parameters

### Task 43: Update sheet label resolution for hierarchical sheets
- **Start:** Sheet labels might not work across subsystem boundaries
- **End:** Resolution considers subsystem scope correctly

### Task 44: Test simulation with nested subsystem
- **Start:** No test for hierarchical simulation
- **End:** Test model with subsystem simulates correctly

## Phase 9: Code Generation Updates

### Task 45: Update code generator to extract nested sheets
- **Start:** Code gen might only see root sheets
- **End:** Collects all sheets recursively for processing

### Task 46: Add subsystem namespace generation
- **Start:** No namespace isolation for subsystem code
- **End:** Subsystem code wrapped in namespace/struct

### Task 47: Update include paths for subsystem headers
- **Start:** Flat include structure
- **End:** Subsystem headers in subdirectories

### Task 48: Test code generation with nested subsystem
- **Start:** No test for hierarchical code gen
- **End:** Generated code compiles with subsystem

## Phase 10: Model Validation Updates

### Task 49: Update validateMultiSheetTypeCompatibility for nested sheets
- **Start:** Validation only checks flat sheet array
- **End:** Recursively validates all sheets

### Task 50: Add subsystem port validation
- **Start:** No validation of subsystem interface consistency
- **End:** Validates port count matches block definition

### Task 51: Update error messages to include sheet path
- **Start:** Errors only show sheet name
- **End:** Shows full path like "Main > Sub1 > Controller"

### Task 52: Test validation with nested subsystem errors
- **Start:** No test for hierarchical validation
- **End:** Validation catches errors in nested sheets

## Phase 11: Import/Export Updates

### Task 53: Update model JSON export to maintain hierarchy
- **Start:** Export might flatten structure
- **End:** Exported JSON preserves nested sheets

### Task 54: Update model JSON import to handle both versions
- **Start:** Import only handles one format
- **End:** Detects version and migrates if needed

### Task 55: Add format version indicator to exported files
- **Start:** No version in filename
- **End:** Filename includes v1 or v2 format indicator

## Phase 12: Testing and Edge Cases

### Task 56: Handle deletion of sheet containing subsystems
- **Start:** Might orphan subsystem sheets
- **End:** Prompts user about nested content

### Task 57: Handle copy/paste of subsystem blocks
- **Start:** Might not deep-copy sheets
- **End:** Duplicates entire subsystem structure

### Task 58: Add sheet count limit per subsystem
- **Start:** Unlimited sheets allowed
- **End:** Reasonable limit (e.g., 10) with error message

### Task 59: Add safeguard against circular subsystem references
- **Start:** Could create infinite loops
- **End:** Detects and prevents circular references

### Task 60: Create comprehensive test model
- **Start:** No test model with all features
- **End:** Test model has 3-level deep subsystems with sheet labels

## Phase 13: UI Polish

### Task 61: Add sheet count badge to subsystem blocks
- **Start:** No visual indication of sheet count
- **End:** Small badge shows number like "(3)"

### Task 62: Add loading indicator for sheet navigation
- **Start:** Instant but might be jarring
- **End:** Brief fade transition between sheets

### Task 63: Add keyboard shortcut for parent navigation
- **Start:** Only button navigation
- **End:** Ctrl+Up navigates to parent sheet

### Task 64: Add sheet search/filter in SubsystemConfig
- **Start:** All sheets always visible
- **End:** Search box filters sheet list

### Task 65: Add drag-to-reorder sheets in SubsystemConfig
- **Start:** Fixed sheet order
- **End:** Can drag sheets to reorder

## Phase 14: Documentation

### Task 66: Update architecture.md with hierarchical design
- **Start:** Docs describe flat structure
- **End:** Explains nested sheet organization

### Task 67: Add subsystem best practices guide
- **Start:** No guidance on subsystem usage
- **End:** Document with examples and patterns

### Task 68: Create migration guide for existing models
- **Start:** No migration documentation
- **End:** Step-by-step guide for users

### Task 69: Add inline help tooltips
- **Start:** No tooltips for new features
- **End:** Helpful tooltips on hover

### Task 70: Final integration test
- **Start:** Individual features tested
- **End:** Full workflow tested end-to-end
