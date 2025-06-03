# MVP Build Plan for Visual Modeling & Simulation Web Application

Each task below has a clear start and end. They’re designed to be executed one at a time, ensuring a fully testable build path.

---

## 🟦 Initialization and Core Setup

### Task 1: Initialize Next.js Project
- **Start:** Create a new Next.js project with the App Router.
- **End:** Next.js dev server runs, showing the default homepage.

### Task 2: Add Supabase Client Initialization
- **Start:** Create a `lib/supabaseClient.ts` with project URL and anon API key.
- **End:** Export a ready-to-use Supabase client.

### Task 3: Add Supabase Auth Setup
- **Start:** Implement `lib/auth.tsx` with Supabase Auth helpers and hooks.
- **End:** A React context/hook like `useUser()` is available.

### Task 4: Setup Basic Auth Flow (Login Page)
- **Start:** Build `/app/login/page.tsx` with Supabase Auth UI.
- **End:** User can log in; Supabase session is established.

---

## 🟦 Model Data Handling

### Task 5: Create Models Table in Supabase
- **Start:** In Supabase, create `models` table with schema:
  - `id` (uuid)
  - `user_id` (uuid)
  - `name` (text)
  - `data` (jsonb)
  - `updated_at` (timestamp)
- **End:** Table exists; RLS policies ensure user isolation.

### Task 6: Implement Model List Page
- **Start:** Build `/app/models/page.tsx` to list user models.
- **End:** Authenticated user sees list of their models.

### Task 7: Implement New Model Creation
- **Start:** Add “New Model” button in `/models` page that inserts default model JSON in Supabase.
- **End:** User can create a new model.

### Task 8: Implement Model JSON Fetch on Editor Load
- **Start:** In `/app/models/[id]/page.tsx`, fetch model JSON from Supabase.
- **End:** Model JSON is available to the editor page.

---

## 🟦 Visual Modeling Canvas

### Task 9: Build Canvas Component
- **Start:** Create `components/Canvas.tsx` using HTML5 Canvas or SVG.
- **End:** User sees a blank canvas with pan/zoom.

### Task 10: Implement BlockLibrarySidebar
- **Start:** Build `components/BlockLibrarySidebar.tsx` with draggable block icons.
- **End:** User can drag blocks from sidebar onto canvas.

---

## 🟦 Core Block Types Implementation

### Task 11: Implement Basic Block Component
- **Start:** Create `components/Block.tsx` to render draggable blocks.
- **End:** Blocks can be moved around.

### Task 12: Implement Block Connection Wires
- **Start:** Create `components/Wire.tsx` for connections between blocks.
- **End:** User can draw valid wires between ports.

### Task 13: Implement Connection Validation
- **Start:** Prevent invalid connections (no multiple wires to an input).
- **End:** Invalid wires cannot be created.

---

## 🟦 Implement Each Block Type (One Task Per Block)

### Task 14: Implement Sum Block
- **Start:** Add Sum block logic to simulation engine and rendering.
- **End:** Sum block sums inputs in simulation.

### Task 15: Implement Multiply Block
- **Start:** Add Multiply block logic to simulation and rendering.
- **End:** Multiply block multiplies inputs.

### Task 16: Implement Laplace Transfer Function Block
- **Start:** Add Laplace Transfer Function block, using RK4 integration.
- **End:** Transfer Function block simulates dynamic systems.

### Task 17: Implement Signal Display Block
- **Start:** Implement charting (e.g., using Recharts) for Signal Display block.
- **End:** Displays simulation signal traces; ignored in C-code generation.

### Task 18: Implement Signal Logger Block
- **Start:** Implement data logging in simulation engine for this block.
- **End:** User can export logged data (e.g., as CSV).

### Task 19: Implement Input Port Block
- **Start:** Implement Input Port block in simulation engine and model JSON.
- **End:** External signals can enter the simulation.

### Task 20: Implement Source Block
- **Start:** Implement Source block (constants or generators) in simulation engine.
- **End:** Source block provides constant or generator signals.

### Task 21: Implement Output Port Block
- **Start:** Implement Output Port block handling in simulation and JSON.
- **End:** Signals can be marked as outputs of a subsystem or model.

### Task 22: Implement 1-D Lookup Block
- **Start:** Implement 1-D Lookup block interpolation logic.
- **End:** Lookup block works for one-dimensional data.

### Task 23: Implement 2-D Lookup Block
- **Start:** Implement 2-D Lookup block interpolation logic.
- **End:** Lookup block works for two-dimensional data.

### Task 24: Implement Scale Block
- **Start:** Implement Scale block logic in simulation.
- **End:** Scale block multiplies input by a constant.

---

## 🟦 Implement Subsystem Blocks

### Task 25: Implement Subsystem Block Type
- **Start:** Implement Subsystem block in block library and model JSON.
- **End:** Subsystem block can reference another sheet as its internals.

### Task 26: Implement Nested Sheet Support in Editor
- **Start:** Implement multi-sheet UI (tabs or dropdown) in `/models/[id]/page.tsx`.
- **End:** User can navigate and edit multiple sheets.

### Task 27: Implement Subsystem Simulation Scoping
- **Start:** Update simulation engine to simulate subsystems recursively with correct scoping.
- **End:** Subsystem blocks run their internal logic during simulation.

---

## 🟦 Model State & Saving

### Task 28: Establish Global Model State Management
- **Start:** Use React Context or Zustand to hold model JSON in memory.
- **End:** State updates are accessible across editor components.

### Task 29: Implement Model Save to Database
- **Start:** Add Save button to editor to persist model JSON to Supabase.
- **End:** User changes are saved to DB.

### Task 30: Implement Auto-Save Functionality
- **Start:** Create auto-save logic for “(auto-save)” recovery document.
- **End:** Auto-save works every 5 minutes, cleans up on explicit save.

---

## 🟦 Simulation Execution and Visualization

### Task 31: Implement Basic Simulation Engine Loop
- **Start:** In `lib/simulationEngine.ts`, create loop to compute outputs for all block types.
- **End:** Engine can run a basic simulation.

### Task 32: Add UI to Trigger Simulation
- **Start:** Add “Run Simulation” button to editor page.
- **End:** User can run the simulation.

### Task 33: Display Signal Data in Signal Display Blocks
- **Start:** Update Signal Display blocks in UI to plot data during simulation.
- **End:** Real-time plots work for simulation runs.

### Task 34: Add CSV Export for Logged Signals
- **Start:** Add export button for logs captured by Logger blocks.
- **End:** User can download simulation data as CSV.

---

## 🟦 C Code Generation

### Task 35: Implement Code Generation Logic in `lib/codeGeneration.ts`
- **Start:** Translate model JSON to PlatformIO-compatible C code (structs, update functions).
- **End:** In-memory C code is generated.

### Task 36: Create API Route for Code Generation
- **Start:** Build `/app/api/generate-code/route.ts` to accept model ID/JSON and return zip file.
- **End:** User can generate and download C code from editor UI.

---

## 🟦 Automation API

### Task 37: Implement Automation API Route
- **Start:** Create `/app/api/automations/[token]/route.ts` to handle actions (`generateCode`, `simulate`, etc.).
- **End:** Securely accepts requests from external systems.

---

## 🟦 Security & Auth Guards

### Task 38: Add Middleware or In-Page Route Guards
- **Start:** Protect routes (`/models`, `/models/[id]`) by redirecting unauthenticated users.
- **End:** Only authenticated users can access model editor and dashboard.

---

## 🟦 Testing & Error Handling

### Task 39: Create Test Suite for Model JSON Schema
- **Start:** Add schema validation tests (e.g., using Jest and Zod).
- **End:** Validates that model JSON meets required structure.

### Task 40: Implement Basic API Error Handling
- **Start:** Wrap API logic in try/catch and return JSON errors.
- **End:** Errors are displayed in a user-friendly manner.

---

## Signal Data Type Support

### Task 42: Add Data Type Property to Source and Input Port Blocks
- **Start:** Update Source and Input Port block parameters to include a dataType field with default value "double"
- **End:** Both block types have configurable data type property in their parameters

### Task 43: Create C-Style Type Validator
- **Start:** Create lib/typeValidator.ts with functions to validate C-style type syntax
- **End:** Validator accepts valid types (float, double, long, bool) and 1D arrays (e.g., float[3])

### Task 44: Update Source and Input Port Config UIs
- **Start:** Add data type input field to SourceConfig and InputPortConfig components
- **End:** Users can enter and validate data types with real-time syntax validation

### Task 45: Implement Signal Type Propagation Engine
- **Start:** Create lib/signalTypePropagation.ts to analyze model and propagate types through connections
- **End:** Function returns a map of all signal types in the model

### Task 46: Update Simulation Engine for Vector Support
- **Start:** Modify simulationEngine.ts to handle vector signals in block computations
- **End:** All blocks correctly process scalar and vector signals according to specifications

### Task 47: Implement Type Compatibility Validator
- **Start:** Create validation functions to check type compatibility between connected blocks
- **End:** Validator detects invalid operations (e.g., scalar + vector) and returns detailed errors

### Task 48: Add Visual Type Mismatch Indicators
- **Start:** Update Wire component to show visual indication of type mismatches
- **End:** Invalid connections are highlighted in red with hover tooltip showing the error

### Task 49: Create Model Validation UI
- **Start:** Add "Validate Model" button to the model editor toolbar
- **End:** Button triggers validation and displays results in a modal or panel

### Task 50: Update Code Generator for Vector Types
- **Start:** Modify codeGeneration.ts to generate C arrays for vector signals
- **End:** Generated code correctly declares and uses arrays for vector signals

### Task 51: Update Transfer Function for Vector Support
- **Start:** Modify transfer function state allocation and processing for element-wise vector operations
- **End:** Transfer functions correctly process vector inputs with appropriate state arrays

### Task 52: Update Signal Display for Multi-Line Plotting
- **Start:** Modify SignalDisplay component to plot vector elements as separate lines
- **End:** Vector signals display with each element as a distinct colored line with legend

### Task 53: Add Lookup Block Input Validation
- **Start:** Add validation to ensure lookup blocks only accept scalar inputs
- **End:** Lookup blocks reject vector connections with appropriate error messages

### Task 54: Integrate Validation with Run/Generate Actions
- **Start:** Add validation checks before simulation and code generation
- **End:** Run and Generate Code buttons perform validation first, blocking on errors

### Task 55: Update Model Schema for Type Information
- **Start:** Update modelSchema.ts to include signal type information in the model structure
- **End:** Model JSON properly stores and validates signal type data

### Task 56: Create Type Propagation Tests
- **Start:** Write comprehensive tests for type propagation and validation logic
- **End:** Test suite covers all type combinations and edge cases

### Task 57: Update Block Library Display
- **Start:** Update BlockLibrarySidebar to show which blocks support vector operations
- **End:** Block descriptions indicate scalar/vector compatibility

### Task 58: Full Integration Test of Signal Types
- **Start:** Create test models with various scalar and vector signal combinations
- **End:** Signal types work correctly through the full workflow: edit → validate → simulate → generate code

## 🟦 Intermediate Integration Test of MVP

### Task 59: Intermediate End-to-End Test of MVP
- **Start:** Manually test user flow: login → create model → build model → run simulation → generate code → export logs.
- **End:** MVP features work seamlessly together!

## 🟦 Sheet Label Implementation Tasks

### Task 60: Add Sheet Label Block Type Definitions
- **Start:** Add 'sheet_label_sink' and 'sheet_label_source' to the block type enums in relevant files
- **End:** Both new block types are recognized as valid types in the type system

### Task 61: Create Sheet Label Sink Block Icon
- **Start:** Create visual representation for Sheet Label Sink block (icon/SVG)
- **End:** Sheet Label Sink has a distinct visual appearance (e.g., arrow pointing into a label)

### Task 62: Create Sheet Label Source Block Icon  
- **Start:** Create visual representation for Sheet Label Source block (icon/SVG)
- **End:** Sheet Label Source has a distinct visual appearance (e.g., arrow pointing out from a label)

### Task 63: Add Sheet Label Blocks to Block Library
- **Start:** Add Sheet Label Sink and Source entries to BlockLibrarySidebar component
- **End:** Both blocks appear in the sidebar and can be dragged onto canvas

### Task 64: Define Sheet Label Block Port Configuration
- **Start:** Define port configuration for Sheet Label blocks (Sink: 1 input, 0 outputs; Source: 0 inputs, 1 output)
- **End:** Port definitions exist in Block component for both Sheet Label types

### Task 65: Add Signal Name Parameter to Sheet Label Blocks
- **Start:** Add 'signalName' parameter to the default parameters for both Sheet Label block types
- **End:** Sheet Label blocks have a signalName field in their parameters object

### Task 66: Create Sheet Label Sink Config Component
- **Start:** Create SheetLabelSinkConfig.tsx component with text input for signal name
- **End:** Component exists with basic text input field

### Task 67: Add Signal Name Autocomplete Data Collection
- **Start:** Create utility function to collect all available signal names in current scope
- **End:** Function returns array of signal names from current sheet/subsystem

### Task 68: Enhance Sheet Label Sink Config with Autocomplete
- **Start:** Add autocomplete dropdown to SheetLabelSinkConfig showing available signals
- **End:** Users see dropdown of existing signals while typing in the signal name field

### Task 69: Create Sheet Label Source Config Component
- **Start:** Create SheetLabelSourceConfig.tsx component with dropdown for sink selection
- **End:** Component exists with basic dropdown field

### Task 70: Implement Sheet Label Sink Collection Function
- **Start:** Create function to find all Sheet Label Sink blocks in current subsystem scope
- **End:** Function returns array of sink blocks with their signal names

### Task 71: Populate Sheet Label Source Dropdown
- **Start:** Connect Sheet Label Source config dropdown to show all available sinks
- **End:** Dropdown shows all Sheet Label Sink signal names in current scope

### Task 72: Add Sheet Label Config to Double-Click Handler
- **Start:** Update handleBlockDoubleClick to open config for Sheet Label blocks
- **End:** Double-clicking Sheet Label blocks opens their configuration dialogs

### Task 73: Implement Sheet Label Type Inheritance for Sinks
- **Start:** Update type propagation to assign input wire type to Sheet Label Sink's signal
- **End:** Sheet Label Sink inherits the data type from its connected input

### Task 74: Implement Sheet Label Type Inheritance for Sources
- **Start:** Update type propagation to copy type from associated sink to source output
- **End:** Sheet Label Source outputs the same type as its associated sink's input

### Task 75: Add Sheet Label Signal Resolution
- **Start:** Create function to resolve Sheet Label connections (match sources to sinks by signal name)
- **End:** Function returns map of source blocks to their associated sink blocks

### Task 76: Update Simulation Engine for Sheet Label Sinks
- **Start:** Modify simulation engine to store Sheet Label Sink values by signal name
- **End:** Sink blocks capture their input values during simulation

### Task 77: Update Simulation Engine for Sheet Label Sources  
- **Start:** Modify simulation engine to retrieve values from associated sinks
- **End:** Source blocks output the value from their associated sink

### Task 78: Add Sheet Label Scope Validation
- **Start:** Create validation to ensure Sheet Label signal names are unique within scope
- **End:** Validator detects duplicate signal names in same subsystem

### Task 79: Add Sheet Label Connection Validation
- **Start:** Create validation to ensure all sources have associated sinks
- **End:** Validator detects unmatched Sheet Label Source blocks

### Task 80: Update Model Validation UI for Sheet Labels
- **Start:** Add Sheet Label validation errors to the validation results display
- **End:** Users see clear messages about Sheet Label issues

### Task 81: Implement Sheet Label Visual Indicators
- **Start:** Add visual indicator (e.g., label text) on Sheet Label blocks showing signal name
- **End:** Signal names are visible on the canvas without opening config

### Task 82: Update Code Generation for Sheet Label Connections
- **Start:** Modify code generator to treat Sheet Label connections as direct wires
- **End:** Generated C code connects source to sink values transparently

### Task 83: Add Sheet Label Same-Sheet Support
- **Start:** Enable Sheet Labels to work within the same sheet (not just across sheets)
- **End:** Users can use Sheet Labels for organizing connections on single sheet

### Task 84: Create Sheet Label Test Model
- **Start:** Build a test model using Sheet Labels across multiple sheets
- **End:** Test model demonstrates cross-sheet signal flow via Sheet Labels

### Task 85: Add Sheet Label Integration Tests
- **Start:** Write tests for Sheet Label signal resolution and type propagation
- **End:** Automated tests verify Sheet Label functionality

### Task 86: Document Sheet Label Usage
- **Start:** Add Sheet Label usage examples to help text or tooltips
- **End:** Users understand how to use Sheet Labels for cross-sheet connections

### Task 87: Full Integration Test of Sheet Labels
- **Start:** Test complete workflow: create labels → connect across sheets → simulate → generate code
- **End:** Sheet Labels work seamlessly in all aspects of the application

---

💡 **Sheet Label Implementation Notes:**
- Sheet Label signal names are distinct from block names
- Signal name scope is limited to the current subsystem
- Type inheritance follows the connection flow
- Same signal name can be used on same sheet for wire organization
- Sources without matching sinks should be caught by validation

## 🟦 MCP Server Implementation

### Task 88: Initialize MCP Server Project Structure
- **Start:** Create `/mcp-server` directory with basic Node.js/TypeScript setup
- **End:** `npm install` completes and TypeScript compiles successfully

### Task 89: Create MCP Server Entry Point
- **Start:** Create `mcp-server/index.ts` with basic MCP server initialization
- **End:** Server starts and logs "MCP Server running on port 3001"

### Task 90: Add MCP Configuration
- **Start:** Create `mcp-server/config.ts` with environment variable loading
- **End:** Config exports PORT, API_BASE_URL, and MCP_API_TOKEN values

### Task 91: Implement MCP Authentication Middleware
- **Start:** Create `mcp-server/auth.ts` with token validation
- **End:** Middleware rejects invalid tokens and accepts valid ones

### Task 92: Create HTTP Client Wrapper
- **Start:** Create `mcp-server/client.ts` with authenticated fetch wrapper
- **End:** Client can make authenticated requests to the Next.js API

### Task 93: Define MCP Tool Types
- **Start:** Create `mcp-server/types.ts` with TypeScript interfaces for all tools
- **End:** All tool input/output types are defined and export successfully

### Task 94: Implement Create Model Tool
- **Start:** Create `tools/model-management.ts` with `create_model` tool
- **End:** Tool creates a model via automation API and returns modelId

### Task 95: Implement Get Model Tool
- **Start:** Add `get_model` tool to retrieve model JSON
- **End:** Tool fetches and returns complete model data

### Task 96: Implement List Models Tool
- **Start:** Add `list_models` tool to list user's models
- **End:** Tool returns array of model metadata

### Task 97: Implement Delete Model Tool
- **Start:** Add `delete_model` tool to remove a model
- **End:** Tool deletes model and returns success status

### Task 98: Create Model Construction Tools File
- **Start:** Create `tools/model-construction.ts` with tool stubs
- **End:** File exports empty tool definitions

### Task 99: Implement Add Sheet Tool
- **Start:** Add `add_sheet` tool to create new sheets
- **End:** Tool adds sheet to model and returns sheetId

### Task 100: Implement Add Block Tool
- **Start:** Add `add_block` tool to place blocks on sheets
- **End:** Tool adds block with position/parameters and returns blockId

### Task 101: Implement Update Block Tool
- **Start:** Add `update_block` tool to modify block properties
- **End:** Tool updates block parameters/position successfully

### Task 102: Implement Delete Block Tool
- **Start:** Add `delete_block` tool to remove blocks
- **End:** Tool removes block and its connections

### Task 103: Implement Add Connection Tool
- **Start:** Add `add_connection` tool to create wires
- **End:** Tool creates wire between specified ports and returns wireId

### Task 104: Implement Delete Connection Tool
- **Start:** Add `delete_connection` tool to remove wires
- **End:** Tool removes specified wire successfully

### Task 105: Create Simulation Tools File
- **Start:** Create `tools/simulation.ts` with simulation tool stubs
- **End:** File exports empty tool definitions

### Task 106: Implement Run Simulation Tool
- **Start:** Add `run_simulation` tool to execute simulations
- **End:** Tool runs simulation and returns basic success/failure

### Task 107: Implement Get Simulation Results Tool
- **Start:** Add `get_simulation_results` tool to retrieve detailed data
- **End:** Tool returns time series data and signal values

### Task 108: Create Validation Tools File
- **Start:** Create `tools/validation.ts` with validation tool stubs
- **End:** File exports empty tool definitions

### Task 109: Implement Validate Model Tool
- **Start:** Add `validate_model` tool for type/connection validation
- **End:** Tool returns errors and warnings arrays

### Task 110: Implement List Sheet Labels Tool
- **Start:** Add `list_sheet_labels` tool to find all sheet labels
- **End:** Tool returns sinks and sources with their signal names

### Task 111: Implement Validate Sheet Labels Tool
- **Start:** Add `validate_sheet_labels` tool for sheet label validation
- **End:** Tool returns sheet label specific errors/warnings

### Task 112: Create Code Generation Tools File
- **Start:** Create `tools/code-generation.ts` with codegen tool stubs
- **End:** File exports empty tool definitions

### Task 113: Implement Generate Code Tool
- **Start:** Add `generate_code` tool to trigger C code generation
- **End:** Tool initiates generation and returns job status

### Task 114: Implement Get Generated Files Tool
- **Start:** Add `get_generated_files` tool to retrieve code
- **End:** Tool returns array of generated file contents

### Task 115: Register All Tools with MCP Server
- **Start:** Update `index.ts` to import and register all tools
- **End:** Server starts with all tools available

### Task 116: Add Error Handling to MCP Server
- **Start:** Wrap all tool executions in try/catch blocks
- **End:** Errors return proper MCP error responses

### Task 117: Add Request Logging to MCP Server
- **Start:** Add middleware to log all MCP requests
- **End:** Server logs tool name, params, and execution time

### Task 118: Create MCP Server README
- **Start:** Document setup, configuration, and tool usage
- **End:** README includes examples for each tool

### Task 119: Add MCP Server Start Script
- **Start:** Add `mcp-server:dev` script to root package.json
- **End:** `npm run mcp-server:dev` starts the MCP server

### Task 120: Create Basic MCP Client Test Script
- **Start:** Create `mcp-server/test-client.ts` to test basic connectivity
- **End:** Script connects and lists available tools

### Task 121: Test Create and Get Model Flow
- **Start:** Use test client to create model and retrieve it
- **End:** Model creation and retrieval work via MCP

### Task 122: Test Block Addition Flow
- **Start:** Use test client to add various block types
- **End:** All block types can be added with proper parameters

### Task 123: Test Connection Creation Flow
- **Start:** Use test client to create valid connections
- **End:** Wires created between compatible ports

### Task 124: Test Simulation Execution Flow
- **Start:** Use test client to run simulation on created model
- **End:** Simulation completes and returns results

### Task 125: Test Validation Flow
- **Start:** Use test client to validate model with errors
- **End:** Validation returns expected errors/warnings

### Task 126: Test Code Generation Flow
- **Start:** Use test client to generate C code
- **End:** Code generation completes and files retrievable

### Task 127: Add MCP Batch Operations Support
- **Start:** Add support for multiple operations in single request
- **End:** Client can send array of operations efficiently

### Task 128: Add MCP Transaction Support
- **Start:** Add rollback capability for failed operations
- **End:** Failed batch operations don't leave partial changes

### Task 129: Create Example Model Builder Script
- **Start:** Create script that builds complete example model
- **End:** Script creates multi-sheet model with sheet labels

### Task 130: Full Integration Test of MCP Server
- **Start:** Run complete workflow: create → build → validate → simulate → generate
- **End:** All MCP operations work seamlessly together

---

💡 **MCP Implementation Notes:**
- Each tool should validate inputs before calling APIs
- Tools should return consistent error formats
- Authentication token must be included in all API calls
- Model state should remain consistent across operations
- Tools should be idempotent where possible

---

💡 **Notes:**
- Each block implementation task also requires a test (unit test or manual test).
- Tasks are incremental—no leap of logic; each small step is independently verifiable.
- Tasks can be parallelized cautiously (e.g., separate block types by different devs).