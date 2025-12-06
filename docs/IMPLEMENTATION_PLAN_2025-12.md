# Implementation Plan: December 2025 Features

**Project:** obliq-2
**Date:** December 2, 2025
**Order:** Features to be implemented in the sequence presented

---

## Feature 1: Model Parameter Support - Data Structure

**Classification:** Model Structure
**Dependencies:** None
**Estimated Complexity:** Medium

### Overview
Add support for global model parameters (name/signal-type/value tuples) that can be referenced throughout the model. Parameters must have unique names that don't conflict with top-level block names.

### Implementation Steps

#### 1.1 Update Model Schema
**File:** `src/lib/modelSchema.ts`

- Add `ModelParameter` Zod schema:
  ```typescript
  ModelParameter {
    name: string           // Valid block name format
    signalType: string     // "float", "double", "float[N]", etc.
    value: number | number[] | number[][]  // Scalar, Vector, or Matrix
  }
  ```
- Add optional `parameters?: ModelParameter[]` to `ModelData` schema
- Ensure backward compatibility (parameters array defaults to empty if missing)
- Add validation: parameter names must be unique
- Add validation: parameter names must not conflict with top-level block names

#### 1.2 Update TypeScript Types
**File:** `src/types/index.ts`

- Add `ModelParameter` interface matching schema
- Update `ModelData` interface to include `parameters?: ModelParameter[]`
- Export types for use across application

#### 1.3 Update Zustand Store
**File:** `src/lib/modelStore.ts`

- Add `parameters: ModelParameter[]` to store state (default: `[]`)
- Add actions:
  - `addParameter(param: ModelParameter): void`
  - `updateParameter(name: string, updates: Partial<ModelParameter>): void`
  - `deleteParameter(name: string): void`
  - `getParameter(name: string): ModelParameter | undefined`
  - `validateParameterName(name: string): { valid: boolean, error?: string }`
- Implement validation logic:
  - Check uniqueness among parameters
  - Check against top-level block names
  - Use existing block name validation regex

#### 1.4 Database Migration
**File:** `database-scripts/add-model-parameters.sql`

- No schema changes needed (JSONB column `data` already flexible)
- Create migration notes documenting the change
- Test loading old models (parameters defaults to empty array)

#### 1.5 Testing
**File:** `__tests__/modelParameters.test.ts`

- Test parameter CRUD operations
- Test name validation (uniqueness, conflicts)
- Test backward compatibility (loading models without parameters)
- Test schema validation (valid types, values)
- Test vector/matrix parameter values

---

## Feature 2: Model Parameter View/Edit Dialog

**Classification:** UI
**Dependencies:** Feature 1 (Model Parameter Support)
**Estimated Complexity:** Medium

### Overview
Add a modal dialog accessible from the Model Editor to view, add, edit, and delete model parameters. Parameters can only be modified when simulation is not running.

### Implementation Steps

#### 2.1 Create Parameters Dialog Component
**File:** `src/components/ModelParametersDialog.tsx`

- Use Mantine `Modal` component
- Dialog sections:
  - Header: "Model Parameters" with close button
  - Body: Table of existing parameters (name, type, value)
  - Footer: "Add Parameter" button, "Close" button
- Table columns:
  - Name (text, click to edit inline)
  - Signal Type (dropdown: scalar types + vector/matrix notation)
  - Value (input field, adapts to type - scalar, array, matrix)
  - Actions (Edit icon, Delete icon)
- Disable all editing when `isSimulationRunning` state is true
- Show warning banner when simulation running: "Parameters cannot be modified during simulation"

#### 2.2 Add Parameter Form
**File:** `src/components/ModelParametersDialog.tsx` (subcomponent)

- Form fields:
  - Name: Text input with validation feedback
  - Signal Type: Select dropdown with common types + custom input
  - Value: Dynamic input based on type:
    - Scalar: Single number input
    - Vector: Array input (JSON or comma-separated)
    - Matrix: 2D array input (JSON or structured grid)
- Real-time validation:
  - Name uniqueness
  - Name format (valid identifier)
  - Value matches declared type
- Submit: "Add" or "Update" button
- Cancel: Reset form

#### 2.3 Edit/Delete Functionality
**File:** `src/components/ModelParametersDialog.tsx`

- Edit mode:
  - Click row or edit icon → populate form with parameter data
  - Form switches to "Update" mode
  - Cancel returns to "Add" mode
- Delete:
  - Click delete icon → show Mantine confirmation modal
  - Warning: "Delete parameter 'X'? This may break references in Source and Evaluate blocks."
  - Confirm → delete from store

#### 2.4 Integrate into Model Editor
**File:** `src/app/models/[id]/page.tsx`

- Add "Parameters" button to header toolbar (near Save, Simulate)
- Use Tabler icon: `IconVariable` or `IconMathSymbols`
- Click opens `ModelParametersDialog`
- Pass props: `opened`, `onClose`, `isSimulationRunning`

#### 2.5 Styling
- Use Mantine theme colors (harmonious with existing dark/light modes)
- Table: Striped rows, hover effect
- Form: Inline validation colors (red for errors, green for valid)
- Match existing dialog patterns (SaveAsDialog, ModelValidationModal)

#### 2.6 Testing
**File:** `__tests__/components/ModelParametersDialog.test.tsx`

- Test dialog open/close
- Test add parameter (valid cases)
- Test add parameter (invalid names, type mismatches)
- Test edit parameter
- Test delete parameter (with confirmation)
- Test disabled state when simulation running
- Test vector/matrix value parsing

---

## Feature 3: Integrate Model Parameters in Simulations

**Classification:** Modeling and UI
**Dependencies:** Feature 1, Feature 2
**Estimated Complexity:** High

### Overview
Allow Source and Evaluate blocks to reference model parameters. Update code generation to include parameters as constants in generated C code.

### Implementation Steps

#### 3.1 Update Source Block Configuration
**File:** `src/components/SourceConfig.tsx`

- Add "Use Parameter" checkbox/toggle for value input
- When enabled:
  - Show dropdown of available parameters
  - Filter by compatible signal type
  - Display selected parameter name and current value (read-only preview)
- When disabled:
  - Show existing value input fields
- For signal generators (sine, square, etc.):
  - Allow parameter references in amplitude, frequency, phase fields
  - Add parameter dropdown next to each numeric input
  - Store parameter reference in block parameters as: `{ useParameter: true, parameterName: "PARAM1" }`

#### 3.2 Update Source Block Module
**File:** `src/lib/blocks/SourceBlockModule.ts`

- Update `generateComputation()`:
  - Check if `block.parameters.useParameter === true`
  - If yes, emit C code using parameter name directly: `outputs[0] = PARAM_NAME;`
  - For generators, replace hardcoded values with parameter names
- Update `executeSimulation()`:
  - Look up parameter value from model parameters
  - Use parameter value in simulation calculations

#### 3.3 Update Evaluate Block Configuration
**File:** `src/components/EvaluateConfig.tsx`

- Add info section: "Model parameters are available as variables in expressions"
- Add reference panel showing available parameters (name, type, value)
- Add syntax highlighting/autocomplete for parameter names (optional enhancement)
- Validate expression at edit time:
  - Parse C expression
  - Check parameter names are declared
  - Show warnings for undefined parameters

#### 3.4 Update Evaluate Block Module
**File:** `src/lib/blocks/EvaluateBlockModule.ts`

- Update `generateComputation()`:
  - Parameters already in scope as const variables (handled by code generator)
  - Expression already references them by name
  - No changes needed (parameters will be in scope)
- Update `executeSimulation()`:
  - Inject parameter values into evaluation context
  - Use same approach as for inputs (parameter values available as variables)

#### 3.5 Update Code Generator - Header
**File:** `src/lib/codegen/HeaderGenerator.ts`

- Add new section: `// Model Parameters`
- For each parameter in `model.parameters`:
  - **Scalars**: Use `#define` preprocessor macros
    ```c
    #define PARAM_NAME 3.14f        // float scalar
    #define PARAM_NAME 3.14         // double scalar
    #define PARAM_NAME 42L          // long scalar
    ```
  - **Vectors**: Use `const` array with `#define` for size
    ```c
    #define PARAM_VEC_SIZE 3
    const float PARAM_VEC[PARAM_VEC_SIZE] = {1.0f, 2.0f, 3.0f};
    ```
  - **Matrices**: Use `const` 2D array with `#define` for dimensions
    ```c
    #define PARAM_MAT_ROWS 2
    #define PARAM_MAT_COLS 3
    const float PARAM_MAT[PARAM_MAT_ROWS][PARAM_MAT_COLS] = {{1,2,3},{4,5,6}};
    ```
- Rationale:
  - Scalars use `#define` for compile-time substitution and optimization
  - Arrays use `const` because `#define` cannot represent array literals
  - Size macros allow flexible compile-time configuration
- Use signal type to determine C type and literal suffix (f for float, L for long)
- Add comment with parameter metadata

#### 3.6 Update Code Generator - WASM
**File:** `src/lib/codegen/WasmCodeGenerator.ts`

- Ensure parameters are included in generated header
- Add EMSCRIPTEN exports if parameters need to be readable from JS (optional)
- Update WASM memory model to include parameter constants

#### 3.7 Update Type Propagator
**File:** `src/lib/codegen/TypePropagator.ts`

- When processing Source blocks with parameter references:
  - Look up parameter signal type
  - Use as output type for Source block
- When validating Evaluate expressions:
  - Include parameter types in validation context

#### 3.8 Update WASM Simulation Engine
**File:** `src/lib/simulation/WasmSimulationEngine.ts`

- Parameters are baked into WASM at compile time (const values)
- No runtime changes needed
- Parameters cannot be changed during simulation (enforced by dialog)

#### 3.9 Update Legacy Simulation Engine
**File:** `src/lib/simulationEngine.ts`

- Pass model parameters to simulation context
- Make available to Source and Evaluate block execution
- Inject into expression evaluator scope

#### 3.10 Testing
**Files:**
- `__tests__/blocks/SourceBlockModule.test.ts`
- `__tests__/blocks/EvaluateBlockModule.test.ts`
- `__tests__/codegen/CodeGenerator.test.ts`
- `__tests__/integration/parameterSimulation.test.ts`

Tests:
- Source block with parameter reference (scalar, vector, matrix)
- Source generator with parametric amplitude/frequency
- Evaluate block with parameter in expression
- Code generation includes parameters as constants
- Type propagation with parametric sources
- Simulation executes with parameter values
- Parameter type mismatch errors

---

## Feature 4: Grouped Block Selection

**Classification:** UI
**Dependencies:** None (but needed for Feature 5)
**Estimated Complexity:** Medium-High

### Overview
Enable multi-block selection by Alt+Drag to draw a rectangular selection region. Shift+Drag adds to selection. Connections between selected blocks are automatically included.

### Implementation Steps

#### 4.1 Update Zustand Store - Selection State
**File:** `src/lib/modelStore.ts`

- Replace `selectedBlockId: string | null` with `selectedBlockIds: string[]`
- Add `selectedWireIds: string[]` (for connections between selected blocks)
- Add selection actions:
  - `setSelectedBlocks(blockIds: string[]): void`
  - `addToSelection(blockIds: string[]): void`
  - `removeFromSelection(blockIds: string[]): void`
  - `clearSelection(): void`
  - `toggleBlockSelection(blockId: string): void`
- Add helper:
  - `getSelectedBlocks(): BlockData[]`
  - `getSelectedWires(): WireData[]`
  - `getConnectionsBetweenBlocks(blockIds: string[]): WireData[]`

#### 4.2 Update Canvas Component - Selection Rectangle
**File:** `src/components/CanvasReactFlow.tsx`

- Add state for selection rectangle:
  ```typescript
  const [selectionRect, setSelectionRect] = useState<{
    startX: number, startY: number,
    endX: number, endY: number,
    isActive: boolean
  } | null>(null)
  ```
- Add state for drag mode: `dragMode: 'pan' | 'select' | 'addSelect'`

#### 4.3 Implement Mouse Handlers
**File:** `src/components/CanvasReactFlow.tsx`

- `onMouseDown`:
  - Check if Alt key pressed → set `dragMode = 'select'`
  - Check if Alt+Shift pressed → set `dragMode = 'addSelect'`
  - If neither → default pan behavior
  - If select mode: store start position, set `selectionRect.isActive = true`
  - Prevent default ReactFlow pan behavior when in select mode

- `onMouseMove`:
  - If `selectionRect.isActive`: update `endX`, `endY`
  - Calculate blocks inside rectangle using ReactFlow's `getNodes()` and position checks
  - Preview selection (visual feedback)

- `onMouseUp`:
  - If select mode: finalize selection
  - Get all blocks inside rectangle
  - If `dragMode === 'select'`: replace selection
  - If `dragMode === 'addSelect'`: add to selection
  - Find connections between selected blocks
  - Update store: `setSelectedBlocks()`, update `selectedWireIds`
  - Clear selection rectangle state
  - Reset `dragMode`

#### 4.4 Render Selection Rectangle
**File:** `src/components/CanvasReactFlow.tsx`

- Add SVG overlay for selection rectangle
- Render when `selectionRect.isActive === true`
- Style:
  - Border: Dashed line, theme accent color (e.g., blue)
  - Fill: Semi-transparent accent color (opacity: 0.1)
  - Z-index: Above canvas, below UI controls
- Calculate screen coordinates from canvas coordinates

#### 4.5 Update Block Rendering - Multi-Select Visual
**File:** `src/components/BlockNode.tsx`

- Change prop from `isSelected: boolean` to check if `blockId` in `selectedBlockIds[]`
- Apply selection style if in selection:
  - Border: Thicker, accent color
  - Glow/shadow effect
  - All selected blocks have same visual treatment

#### 4.6 Update Wire Rendering - Selected Wires
**File:** `src/components/CanvasReactFlow.tsx`

- Custom edge component or edge style override
- If wire ID in `selectedWireIds[]`: highlight (thicker, accent color)
- Connections between selected blocks auto-included

#### 4.7 Shift+Click Individual Block Selection
**File:** `src/components/BlockNode.tsx`

- `onClick` handler:
  - Check if Shift key pressed
  - If yes: `toggleBlockSelection(blockId)`
  - If no: `setSelectedBlocks([blockId])`
- Update connections automatically after each selection change

#### 4.8 Click Away to Deselect
**File:** `src/components/CanvasReactFlow.tsx`

- `onPaneClick` (ReactFlow event):
  - Clear selection if clicking empty canvas
  - `clearSelection()`

#### 4.9 Keyboard Shortcuts
**File:** `src/app/models/[id]/page.tsx` or `CanvasReactFlow.tsx`

- `Escape`: Clear selection
- `Ctrl+A`: Select all blocks on current sheet
- Add keyboard event listener to canvas/page

#### 4.10 Testing
**File:** `__tests__/components/CanvasReactFlow.test.tsx`

- Test Alt+Drag creates selection rectangle
- Test blocks inside rectangle are selected
- Test Shift+Alt+Drag adds to selection
- Test connections between selected blocks included
- Test Shift+Click toggles individual block
- Test click away clears selection
- Test keyboard shortcuts (Escape, Ctrl+A)
- Test visual rendering of selection rectangle
- Test multi-selected blocks have correct styling

---

## Feature 5: Block Cut/Copy and Paste

**Classification:** UI
**Dependencies:** Feature 4 (Grouped Block Selection)
**Estimated Complexity:** High

### Overview
Implement cut/copy/paste for selected blocks. Support pasting within same model, to other sheets, and across browser tabs. Handle dependency resolution for missing parameters and subsystems.

### Implementation Steps

#### 5.1 Define Clipboard Data Format
**File:** `src/types/clipboard.ts`

```typescript
interface ClipboardData {
  version: "1.0"
  sourceModelId?: string
  timestamp: number
  blocks: BlockData[]
  wires: WireData[]  // Only wires between included blocks
  dependencies: {
    parameters: ModelParameter[]      // Referenced parameters
    subsystemSheets?: Sheet[]         // If any block is a subsystem
  }
}
```

#### 5.2 Update Zustand Store - Clipboard State
**File:** `src/lib/modelStore.ts`

- Add state:
  ```typescript
  clipboardData: ClipboardData | null
  ```
- Add actions:
  - `copySelection(): ClipboardData`
  - `cutSelection(): ClipboardData` (copy + delete selected)
  - `pasteFromClipboard(position: {x: y}, clipboardData: ClipboardData): Promise<PasteResult>`
  - `getClipboardData(): ClipboardData | null`

#### 5.3 Implement Copy Logic
**File:** `src/lib/modelStore.ts` → `copySelection()`

- Get currently selected blocks and wires
- Deep clone block and wire data
- Scan blocks for parameter references:
  - Check Source blocks for `useParameter`
  - Check Evaluate blocks for parameter names in expressions
  - Collect unique parameters
- Scan for Subsystem blocks:
  - Include nested sheets in `dependencies.subsystemSheets`
- Create `ClipboardData` object
- Store in Zustand state: `clipboardData = data`
- Store in localStorage: `localStorage.setItem('obliq-clipboard', JSON.stringify(data))`
- Return clipboard data

#### 5.4 Implement Cut Logic
**File:** `src/lib/modelStore.ts` → `cutSelection()`

- Call `copySelection()` to get clipboard data
- Delete selected blocks: `deleteBlocks(selectedBlockIds)`
- Delete selected wires: `deleteWires(selectedWireIds)`
- Clear selection: `clearSelection()`
- Return clipboard data

#### 5.5 Implement Paste Logic - Core
**File:** `src/lib/modelStore.ts` → `pasteFromClipboard()`

Steps:
1. **Load clipboard data:**
   - Use provided `clipboardData` or load from localStorage
   - Validate format and version

2. **Check for missing dependencies:**
   - Compare `clipboardData.dependencies.parameters` with current model parameters
   - Compare `clipboardData.dependencies.subsystemSheets` (if any)
   - Return dependency report:
     ```typescript
     {
       missingParameters: ModelParameter[]
       missingSubsystems: string[]  // Subsystem names
     }
     ```

3. **Show dependency resolution dialog** (see 5.6)

4. **Generate new IDs:**
   - Create ID mapping: `oldId → newId` for all blocks
   - Use `crypto.randomUUID()` or similar

5. **Clone and transform blocks:**
   - Deep clone each block
   - Assign new IDs
   - Offset positions: `newPosition = { x: position.x + offset, y: position.y + offset }`
   - Calculate offset based on cursor position vs original block positions

6. **Clone and remap wires:**
   - Deep clone wires between copied blocks
   - Remap `sourceBlockId` and `targetBlockId` using ID mapping
   - Generate new wire IDs

7. **Add to current sheet:**
   - `addBlocks(newBlocks)`
   - `addWires(newWires)`

8. **Set selection:**
   - Select all newly pasted blocks: `setSelectedBlocks(newBlockIds)`

9. **Return result:**
   ```typescript
   {
     success: boolean
     pastedBlockIds: string[]
     error?: string
   }
   ```

#### 5.6 Dependency Resolution Dialog
**File:** `src/components/PasteDependencyDialog.tsx`

- Mantine Modal
- Title: "Missing Dependencies"
- Body:
  - List missing parameters (name, type, value from clipboard)
  - List missing subsystem dependencies
  - Show counts: "2 parameters, 1 subsystem"
- Footer buttons:
  - **"Add All"**: Add all missing dependencies to current model, then paste
  - **"Skip"**: Paste anyway (may cause broken references)
  - **"Cancel"**: Abort paste operation
- Return user choice to paste logic

#### 5.7 Keyboard Shortcuts
**File:** `src/app/models/[id]/page.tsx`

- Add keyboard event listener:
  ```typescript
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') copySelection()
        if (e.key === 'x') cutSelection()
        if (e.key === 'v') pasteFromClipboard(cursorPosition)
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [])
  ```
- Track cursor position on canvas for paste location

#### 5.8 Context Menu Integration
**File:** `src/components/BlockContextMenu.tsx`

- Add menu items:
  - "Copy" (Ctrl+C) - enabled when blocks selected
  - "Cut" (Ctrl+X) - enabled when blocks selected
  - "Paste" (Ctrl+V) - enabled when clipboard has data
- Click handlers call Zustand actions

#### 5.9 Visual Feedback
- Show toast notification after copy/cut: "X blocks copied"
- Show toast after paste: "X blocks pasted"
- Use Mantine notifications

#### 5.10 Cross-Tab Clipboard Support
**File:** `src/lib/modelStore.ts`

- On copy/cut: Write to `localStorage.setItem('obliq-clipboard', ...)`
- On paste: Read from localStorage if Zustand state is empty
- Use storage event listener to detect cross-tab clipboard changes:
  ```typescript
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'obliq-clipboard') {
        // Update Zustand clipboardData
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])
  ```

#### 5.11 Testing
**Files:**
- `__tests__/clipboard/copy.test.ts`
- `__tests__/clipboard/paste.test.ts`
- `__tests__/clipboard/crossTab.test.ts`
- `__tests__/components/PasteDependencyDialog.test.tsx`

Tests:
- Copy single block
- Copy multiple blocks with connections
- Cut removes blocks from canvas
- Paste at cursor position
- Paste with ID remapping (no conflicts)
- Paste updates wire connections correctly
- Cross-sheet paste
- Cross-model paste with missing parameters (dependency dialog)
- Cross-tab paste (localStorage)
- Keyboard shortcuts (Ctrl+C/X/V)
- Subsystem blocks with nested sheets

---

## Feature 6: Models Page - Duplicate Model

**Classification:** UI
**Dependencies:** None
**Estimated Complexity:** Low-Medium

### Overview
Add "Duplicate" function to model tile on Models page. Prompt for new name with default suggestion. Create duplicate immediately without opening.

### Implementation Steps

#### 6.1 Update Models Page - Tile Context Menu
**File:** `src/app/page.tsx` (or models list component)

- Locate existing model tile component
- Add context menu or dropdown menu to tile
- Add menu item: "Duplicate..." (icon: `IconCopy`)
- Click opens duplicate dialog

#### 6.2 Create Duplicate Model Dialog
**File:** `src/components/DuplicateModelDialog.tsx`

- Mantine Modal
- Title: "Duplicate Model"
- Body:
  - Show original model name (read-only)
  - Text input for new name
  - Default value: `${originalName} (Copy)`
  - Real-time validation:
    - Name not empty
    - Name unique (no existing model with same name for user)
    - Show error message below input if invalid
- Footer:
  - "Cancel" button
  - "Duplicate" button (disabled if validation fails)

#### 6.3 API Route - Duplicate Model
**File:** `src/app/api/models/duplicate/route.ts`

- Method: POST
- Body: `{ modelId: string, newName: string }`
- Steps:
  1. Authenticate user (Supabase auth)
  2. Fetch original model data by ID (check ownership)
  3. Deep clone model data
  4. Update metadata:
     - New name
     - New creation timestamp
     - Update description: "Copy of [original name]"
  5. Insert new model into database
  6. Return new model ID and data
- Error handling:
  - Model not found
  - Permission denied
  - Name already exists
  - Database errors

#### 6.4 Client-Side Duplicate Logic
**File:** `src/lib/api/modelApi.ts` (or inline in dialog)

- Function: `duplicateModel(modelId: string, newName: string)`
- Call API route: `POST /api/models/duplicate`
- Handle response:
  - Success: Close dialog, refresh models list, show toast "Model duplicated"
  - Error: Show error message in dialog

#### 6.5 Update Models List
**File:** `src/app/page.tsx`

- After successful duplication:
  - Fetch updated models list
  - Highlight newly created model (optional)
  - Do NOT navigate to new model (stay on list page)

#### 6.6 Testing
**File:** `__tests__/api/duplicateModel.test.ts`

- Test successful duplication
- Test name validation (empty, duplicate)
- Test permission checks (can't duplicate other user's models)
- Test data integrity (all sheets, blocks, parameters copied)
- Test metadata updates (name, timestamp, description)
- Test UI flow (dialog, success toast, list refresh)

---

## Feature 7: Model Editor - Rename Block

**Classification:** UI
**Dependencies:** None
**Estimated Complexity:** Medium

### Overview
Add inline block renaming via context menu. Validate uniqueness within naming scope (top-level or current subsystem). Update references in SignalDisplay and other blocks.

### Implementation Steps

#### 7.1 Update Block Context Menu
**File:** `src/components/BlockContextMenu.tsx`

- Add menu item: "Rename" (icon: `IconEdit`)
- Position near top of menu (after "Properties")
- Click triggers rename mode

#### 7.2 Implement Inline Rename - UI
**File:** `src/components/BlockNode.tsx`

- Add state: `isRenaming: boolean`
- When rename triggered:
  - Set `isRenaming = true`
  - Replace block name label with text input
  - Auto-focus input
  - Pre-fill with current name (selected)
- Input styling:
  - Match block name font/size
  - Visible border to indicate edit mode
  - Show validation status (green/red border)
- Handle events:
  - `onBlur`: Save if valid, revert if invalid
  - `onKeyDown`:
    - Enter: Save and exit rename mode
    - Escape: Cancel and revert to original name

#### 7.3 Name Validation Logic
**File:** `src/lib/validation/blockNameValidator.ts`

- Function: `validateBlockName(newName: string, blockId: string, scopeBlockIds: string[])`
- Validation rules:
  1. Not empty
  2. Valid identifier format (alphanumeric + underscore, no spaces)
  3. Unique within scope:
     - Top-level: Check against all blocks in current sheet
     - Subsystem: Check against blocks in current subsystem sheet
  4. Not conflicting with model parameters (if top-level)
- Return: `{ valid: boolean, error?: string }`

#### 7.4 Determine Naming Scope
**File:** `src/lib/modelStore.ts` → Helper function

- Function: `getBlockNamingScope(sheetId: string): string[]`
- Logic:
  - If sheet is top-level: return all top-level block IDs
  - If sheet is inside subsystem: return block IDs in that subsystem sheet
- Use sheet hierarchy to determine scope

#### 7.5 Update Store - Rename Action
**File:** `src/lib/modelStore.ts`

- Action: `renameBlock(blockId: string, newName: string): { success: boolean, error?: string }`
- Steps:
  1. Validate name using `validateBlockName()`
  2. If valid:
     - Update block name in store
     - Find and update references (see 7.6)
     - Return `{ success: true }`
  3. If invalid:
     - Return `{ success: false, error: validationError }`

#### 7.6 Update References
**File:** `src/lib/modelStore.ts` → Helper in `renameBlock()`

- Find all blocks referencing the renamed block:
  - **SignalDisplay blocks**: Check if `parameters.signalName` matches old name
  - **SignalLogger blocks**: Check signal name references
  - **SheetLabelSource/Sink**: Check label names (if they reference blocks)
- Update each reference to use new name
- Log references updated (for debugging/undo)

#### 7.7 Visual Feedback
**File:** `src/components/BlockNode.tsx`

- Show validation state in real-time:
  - Valid name: Green border or checkmark icon
  - Invalid name: Red border + error tooltip
- After successful rename:
  - Show brief success animation (optional)
  - Update block label immediately

#### 7.8 Context Menu Flow
**File:** `src/components/BlockContextMenu.tsx`

- "Rename" click:
  - Close context menu
  - Trigger rename mode on block: `setBlockRenameMode(blockId, true)`
  - Focus input

#### 7.9 Testing
**File:** `__tests__/blockRename.test.ts`

- Test rename via context menu
- Test inline input appears and focuses
- Test name validation (empty, invalid chars, duplicate)
- Test scope validation (top-level vs subsystem)
- Test reference updates (SignalDisplay, SignalLogger)
- Test Enter saves, Escape cancels
- Test blur saves if valid
- Test visual feedback (borders, errors)

---

## Feature 8: "Limit" Block

**Classification:** Block
**Dependencies:** None
**Estimated Complexity:** Low-Medium

### Overview
Add Limit block that clamps signal values to a configurable range. Supports scalar, vector, and matrix signals with element-wise limiting. Asymmetric min/max limits.

### Implementation Steps

#### 8.1 Create Limit Block Module
**File:** `src/lib/blocks/LimitBlockModule.ts`

- Implement `IBlockModule` interface
- Block parameters:
  ```typescript
  {
    minLimit: number    // Minimum value
    maxLimit: number    // Maximum value
  }
  ```
- Methods:
  - `getInputPortCount()`: Return 1
  - `getOutputPortCount()`: Return 1
  - `getInputPortLabels()`: Return `["Input"]`
  - `getOutputPortLabels()`: Return `["Output"]`
  - `requiresState()`: Return false (stateless)
  - `generateStateStructMembers()`: Return `[]`

#### 8.2 Type Propagation
**File:** `src/lib/blocks/LimitBlockModule.ts` → `getOutputType()`

- Output type = Input type (passthrough)
- Validate input is numeric type (float, double, long)
- Reject non-numeric types (bool, etc.)

#### 8.3 Code Generation
**File:** `src/lib/blocks/LimitBlockModule.ts` → `generateComputation()`

- Generate C code for limiting:
  ```c
  // Scalar
  outputs[0] = fmax(minLimit, fmin(maxLimit, inputs[0]));

  // Vector
  for (int i = 0; i < N; i++) {
    outputs[0][i] = fmax(minLimit, fmin(maxLimit, inputs[0][i]));
  }

  // Matrix
  for (int i = 0; i < M; i++) {
    for (int j = 0; j < N; j++) {
      outputs[0][i][j] = fmax(minLimit, fmin(maxLimit, inputs[0][i][j]));
    }
  }
  ```
- Parse input type to determine scalar vs vector vs matrix
- Use sanitized identifiers for variable names

#### 8.4 Simulation Execution
**File:** `src/lib/blocks/LimitBlockModule.ts` → `executeSimulation()`

- Read input value from `inputs[0]`
- Apply element-wise clamping:
  ```typescript
  const clamp = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, val))

  if (typeof input === 'number') {
    blockState.outputs[0] = clamp(input, minLimit, maxLimit)
  } else if (Array.isArray(input)) {
    blockState.outputs[0] = input.map(val =>
      Array.isArray(val)
        ? val.map(v => clamp(v, minLimit, maxLimit))
        : clamp(val, minLimit, maxLimit)
    )
  }
  ```

#### 8.5 Configuration UI
**File:** `src/components/LimitConfig.tsx`

- Mantine component
- Form fields:
  - **Minimum Limit**: Number input
  - **Maximum Limit**: Number input
  - Validation: Ensure min ≤ max
- Real-time validation feedback
- "Apply" button updates block parameters

#### 8.6 Block Library Entry
**File:** `src/components/BlockLibrary.tsx`

- Add "Limit" to "Signal Processing" category
- Icon: `IconEaseInOutControlPointsFilled` or custom
- Drag-and-drop support (existing pattern)

#### 8.7 Register in Factory
**File:** `src/lib/blocks/BlockModuleFactory.ts`

- Add case: `case 'limit': return new LimitBlockModule()`
- Export module

#### 8.8 Testing
**Files:**
- `__tests__/blocks/LimitBlockModule.test.ts`
- `__tests__/components/LimitConfig.test.tsx`

Tests:
- Limit scalar value (within range, below min, above max)
- Limit vector elements
- Limit matrix elements
- Code generation (scalar, vector, matrix)
- Simulation execution correctness
- Configuration UI validation (min ≤ max)
- Type propagation (output = input type)

---

## Feature 9: "Integrator" Block

**Classification:** Block
**Dependencies:** Feature 1 (for parametric initial values)
**Estimated Complexity:** High

### Overview
Add Integrator block with configurable initial values, optional Enable and Reset inputs, and optional upper/lower limits with saturation logic. Integration algorithm (RK4/Euler) selected at model level. Reset on rising edge sets output to initial value. When limits are configured, the integrator clamps outputs and optimizes integration by skipping computation when at saturation limits.

### Implementation Steps

#### 9.1 Add Integration Algorithm to Model Settings
**File:** `src/lib/modelSchema.ts`

- Add to `ModelData.globalSettings`:
  ```typescript
  {
    integrationAlgorithm: "rk4" | "euler"  // Default: "rk4"
  }
  ```
- Update Zod schema with validation

#### 9.2 Model Settings UI
**File:** `src/components/ModelSettingsDialog.tsx` (create if doesn't exist)

- Mantine Modal
- Add radio group or select:
  - Label: "Integration Algorithm"
  - Options: "RK4 (Runge-Kutta 4th Order)" | "Euler"
  - Default: RK4
- Accessible from Model Editor header (Settings button)

#### 9.3 Create Integrator Block Module
**File:** `src/lib/blocks/IntegratorBlockModule.ts`

- Implement `IBlockModule`
- Block parameters:
  ```typescript
  {
    initialValue: number | number[] | number[][]  // Scalar/Vector/Matrix
    showEnableInput: boolean    // Default: false
    showResetInput: boolean     // Default: false
    useLimits: boolean          // Default: false
    upperLimit?: number         // Optional upper saturation limit
    lowerLimit?: number         // Optional lower saturation limit
    // Optionally: initialValueParameter?: string  (for parametric ref)
  }
  ```

#### 9.4 Dynamic Port Configuration
**File:** `src/lib/blocks/IntegratorBlockModule.ts`

- `getInputPortCount()`:
  - Base: 1 (derivative input)
  - +1 if `showEnableInput === true`
  - +1 if `showResetInput === true`

- `getInputPortLabels()`:
  ```typescript
  const labels = ["Derivative"]
  if (showEnableInput) labels.push("Enable")
  if (showResetInput) labels.push("Reset")
  return labels
  ```

- `getOutputPortCount()`: Return 1

- `getOutputPortLabels()`: Return `["Output"]`

#### 9.5 Type Propagation
**File:** `src/lib/blocks/IntegratorBlockModule.ts` → `getOutputType()`

- Output type = Derivative input type (first input)
- Validate initial value matches derivative signal type
- Enable and Reset inputs must be boolean (if present)

#### 9.6 State Management
**File:** `src/lib/blocks/IntegratorBlockModule.ts`

- `requiresState()`: Return true
- `generateStateStructMembers()`:
  ```typescript
  [
    `${outputType} integral;`,
    `bool reset_prev;`  // For edge detection
  ]
  ```
- `generateInitialization()`:
  ```c
  state->integral = INITIAL_VALUE;  // Or parameter reference
  state->reset_prev = false;
  ```

#### 9.7 Code Generation - Integration with Limits and Optimization
**File:** `src/lib/blocks/IntegratorBlockModule.ts` → `generateComputation()`

- Check model-level algorithm setting
- For each element (scalar, or each vector/matrix element):

**Saturation Check Optimization:**
```c
// Check if integration can be skipped due to saturation
bool skip_integration = false;
if (useLimits) {
  float current_val = state->integral;  // Or state->integral[i] for vectors
  float derivative = inputs[0];          // Or inputs[0][i] for vectors

  // At upper limit with positive derivative - would exceed and clamp anyway
  if (current_val >= upperLimit && derivative > 0.0f) {
    skip_integration = true;
  }
  // At lower limit with negative derivative - would exceed and clamp anyway
  if (current_val <= lowerLimit && derivative < 0.0f) {
    skip_integration = true;
  }
}
```

**Integration Logic:**
- If RK4:
  ```c
  // Managed by StateIntegrator.ts (existing RK4 infrastructure)
  // Mark block as having derivative state
  // StateIntegrator will handle k1, k2, k3, k4 calculations
  // Apply saturation check before each RK4 sub-step
  // Apply limits after final RK4 computation
  ```

- If Euler:
  ```c
  // Simple forward Euler with optimization
  if (!skip_integration) {
    state->integral += inputs[0] * dt;

    // Apply limits after integration
    if (useLimits) {
      state->integral = fmax(lowerLimit, fmin(upperLimit, state->integral));
    }
  }

  outputs[0] = state->integral;
  ```

**Enable Logic (if configured):**
```c
bool enabled = showEnableInput ? (bool)inputs[ENABLE_PORT] : true;
if (!enabled) {
  // Hold previous value - skip all integration
  outputs[0] = state->integral;
  return;  // Early exit
}
```

**Reset Logic (if configured):**
```c
bool reset = (bool)inputs[RESET_PORT];
bool rising_edge = reset && !state->reset_prev;
if (rising_edge) {
  state->integral = INITIAL_VALUE;
  // Note: Initial value may also need clamping if useLimits
  if (useLimits) {
    state->integral = fmax(lowerLimit, fmin(upperLimit, state->integral));
  }
}
state->reset_prev = reset;
```

**Element-wise for Vectors/Matrices:**
```c
// Vector example
for (int i = 0; i < N; i++) {
  bool skip = false;
  if (useLimits) {
    if (state->integral[i] >= upperLimit && inputs[0][i] > 0.0f) skip = true;
    if (state->integral[i] <= lowerLimit && inputs[0][i] < 0.0f) skip = true;
  }

  if (!skip) {
    state->integral[i] += inputs[0][i] * dt;
    if (useLimits) {
      state->integral[i] = fmax(lowerLimit, fmin(upperLimit, state->integral[i]));
    }
  }

  outputs[0][i] = state->integral[i];
}
```

#### 9.8 Simulation Execution
**File:** `src/lib/blocks/IntegratorBlockModule.ts` → `executeSimulation()`

- Implement Euler integration with limits and optimization:
  ```typescript
  const dt = simState.timeStep
  const derivative = inputs[0]
  const enabled = showEnableInput ? inputs[1] : true
  const reset = showResetInput ? inputs[showEnableInput ? 2 : 1] : false
  const { useLimits, upperLimit, lowerLimit } = block.parameters

  // Rising edge detection
  const risingEdge = reset && !blockState.state.resetPrev
  if (risingEdge) {
    blockState.state.integral = initialValue
    // Clamp initial value if using limits
    if (useLimits) {
      blockState.state.integral = Math.max(lowerLimit, Math.min(upperLimit, blockState.state.integral))
    }
  }
  blockState.state.resetPrev = reset

  // Integration with saturation optimization
  if (enabled) {
    // Helper function for element-wise integration
    const integrateElement = (current: number, deriv: number): number => {
      // Optimization: Skip integration if at saturation
      if (useLimits) {
        if (current >= upperLimit && deriv > 0) return current  // At upper limit, positive derivative
        if (current <= lowerLimit && deriv < 0) return current  // At lower limit, negative derivative
      }

      // Perform integration
      let newVal = current + deriv * dt

      // Apply limits
      if (useLimits) {
        newVal = Math.max(lowerLimit, Math.min(upperLimit, newVal))
      }

      return newVal
    }

    // Handle scalar, vector, or matrix
    if (typeof derivative === 'number') {
      blockState.state.integral = integrateElement(blockState.state.integral, derivative)
    } else if (Array.isArray(derivative)) {
      if (Array.isArray(derivative[0])) {
        // Matrix
        blockState.state.integral = derivative.map((row, i) =>
          row.map((val, j) => integrateElement(blockState.state.integral[i][j], val))
        )
      } else {
        // Vector
        blockState.state.integral = derivative.map((val, i) =>
          integrateElement(blockState.state.integral[i], val)
        )
      }
    }
  }

  blockState.outputs[0] = blockState.state.integral
  ```

#### 9.9 Integrate with Existing RK4 Infrastructure
**File:** `src/lib/codegen/StateIntegrator.ts`

- Detect Integrator blocks (by type)
- If model uses RK4:
  - Add Integrator block to RK4 calculation loop
  - Generate k1, k2, k3, k4 for derivative
  - Apply saturation optimization at each RK4 sub-step:
    ```c
    // Before computing k2, k3, k4: check if at saturation
    if (useLimits) {
      if (state_k1 >= upperLimit && derivative > 0) {
        // Skip this RK4 sub-step calculation
        continue;
      }
      if (state_k1 <= lowerLimit && derivative < 0) {
        continue;
      }
    }
    ```
  - Update integral using RK4 formula
  - Apply final limit clamping after RK4 update:
    ```c
    state->integral = state->integral + (k1 + 2*k2 + 2*k3 + k4) / 6.0 * dt;
    if (useLimits) {
      state->integral = fmax(lowerLimit, fmin(upperLimit, state->integral));
    }
    ```
- Respect Enable/Reset signals in RK4 loop
- Note: RK4 optimization is more complex but can save significant computation
  - Consider conservative approach: only skip if ALL k values would saturate
  - Or simpler: only apply optimization to Euler, use standard RK4 with post-clamp

#### 9.10 Configuration UI
**File:** `src/components/IntegratorConfig.tsx`

- Form fields:
  - **Initial Value**:
    - Type selector: Scalar | Vector | Matrix
    - Value input (adapts to type)
    - Option: "Use Parameter" (dropdown of compatible parameters)
  - **Show Enable Input**: Checkbox
  - **Show Reset Input**: Checkbox
  - **Use Limits**: Checkbox
    - When enabled, show:
      - **Upper Limit**: Number input
      - **Lower Limit**: Number input
      - Validation: lower ≤ upper
      - Optional: Visual indicator showing limit range
- Display current integration algorithm (read from model settings, not editable here)
- Preview port configuration based on checkboxes
- Info tooltip explaining saturation optimization behavior

#### 9.11 Block Library Entry
**File:** `src/components/BlockLibrary.tsx`

- Add "Integrator" to "Dynamic Systems" category
- Icon: `IconMathIntegral` or similar
- Description: "Integrates input signal over time"

#### 9.12 Register in Factory
**File:** `src/lib/blocks/BlockModuleFactory.ts`

- Add case: `case 'integrator': return new IntegratorBlockModule()`

#### 9.13 Testing
**Files:**
- `__tests__/blocks/IntegratorBlockModule.test.ts`
- `__tests__/codegen/integratorCodeGen.test.ts`
- `__tests__/simulation/integratorSimulation.test.ts`
- `__tests__/simulation/integratorLimits.test.ts`

Tests:
- Euler integration (scalar, vector, matrix)
- RK4 integration (compare with known solutions)
- Initial value setting (constant, parametric)
- Enable input (integration stops when disabled)
- Reset input (rising edge detection, resets to initial value)
- **Limits and saturation:**
  - Integration stops at upper limit with positive derivative
  - Integration stops at lower limit with negative derivative
  - Integration resumes when derivative reverses direction
  - Limits applied element-wise for vectors/matrices
  - Initial value clamped if outside limits
  - Reset value clamped if outside limits
- **Optimization verification:**
  - Verify integration skipped when at saturation (check performance)
  - Verify output remains at limit when saturated
  - Test boundary conditions (exactly at limit, near limit)
- Code generation (Euler and RK4 with and without limits)
- Simulation correctness (compare with analytical solutions)
- Port configuration (dynamic port count based on checkboxes)
- Type propagation (output = input type)

---

## Testing Strategy

### Unit Tests
- Each block module: Test all IBlockModule methods
- Code generators: Test C code output for various configurations
- Type propagator: Test type inference with new blocks
- Validation: Test parameter/block name validation logic
- Clipboard: Test copy/paste/cut operations

### Integration Tests
- Model parameters in Source/Evaluate blocks end-to-end
- Copy/paste across sheets and models with dependencies
- Grouped selection with connections
- Integrator block with RK4/Euler in full simulation
- Limit block in simulation pipeline

### UI Tests (with React Testing Library)
- Parameter dialog: Add/edit/delete parameters
- Dependency resolution dialog: User choices affect paste outcome
- Block rename: Inline editing, validation feedback
- Selection rectangle: Drag-select behavior
- Context menus: All new menu items

### E2E Tests (optional, with Playwright/Cypress)
- Full workflow: Create model → add parameters → use in Source → simulate
- Copy/paste between browser tabs (cross-tab clipboard)
- Duplicate model from models page
- Rename block with references, verify updates

---

## Migration and Backward Compatibility

### Model Schema Version
- Current version: `2.0` (based on existing schema)
- New version: `2.1` (with parameters)
- Migration strategy:
  - Models without `parameters` field: Default to empty array
  - No explicit migration needed (Zod optional field)
  - New features gracefully degrade for old models

### Database
- No schema changes (JSONB column flexible)
- Models created before features: Load normally with defaults
- Models created after features: Full feature support

### Code Generation
- Parameters: Optional in generated code (if array empty, skip section)
- Integrator: Uses existing RK4 infrastructure (TransferFunction pattern)
- Limit: New block, no impact on existing code

---

## Documentation Updates

After implementation, update:
- User documentation: New features guide
- Developer documentation: Block module pattern, clipboard format
- API documentation: New routes (duplicate model)
- Schema documentation: Updated ModelData structure

---

## Estimated Timeline

| Feature | Complexity | Estimated Effort |
|---------|------------|------------------|
| 1. Model Parameter Support | Medium | 2-3 days |
| 2. Parameter View/Edit Dialog | Medium | 2-3 days |
| 3. Integrate Parameters in Simulations | High | 4-5 days |
| 4. Grouped Block Selection | Medium-High | 3-4 days |
| 5. Block Cut/Copy/Paste | High | 5-6 days |
| 6. Duplicate Model | Low-Medium | 1-2 days |
| 7. Rename Block | Medium | 2-3 days |
| 8. Limit Block | Low-Medium | 1-2 days |
| 9. Integrator Block | High | 4-5 days |
| **Testing & Polish** | - | 3-4 days |
| **Total** | - | **28-37 days** |

---

## Risk Assessment

### High Risk Items
1. **Copy/paste with dependencies**: Complex dependency resolution logic
2. **Integrator RK4 integration**: Must work with existing StateIntegrator
3. **Cross-tab clipboard**: Browser storage limitations, sync issues

### Medium Risk Items
1. **Parameter name conflicts**: Validation logic must be bulletproof
2. **Grouped selection**: Mouse event handling, ReactFlow integration
3. **Inline rename with references**: Finding all references, updating correctly

### Low Risk Items
1. **Limit block**: Straightforward implementation
2. **Duplicate model**: Standard CRUD operation
3. **Parameter dialog**: Standard form/table UI

### Mitigation Strategies
- Early prototyping of high-risk features
- Comprehensive unit tests before integration
- Feature flags for gradual rollout
- User testing on dev environment before production

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Set up feature branch**: `feature/december-2025-features`
3. **Begin with Feature 1**: Model Parameter Support (foundation for other features)
4. **Iterate through features** in the order presented
5. **Run tests** after each feature completion
6. **User acceptance testing** before production deployment

---

**Document Version:** 1.0
**Last Updated:** December 2, 2025
**Author:** Claude Code
