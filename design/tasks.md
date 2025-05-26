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

## 🟦 Final Integration Test of MVP

### Task 41: Full End-to-End Test of MVP
- **Start:** Manually test user flow: login → create model → build model → run simulation → generate code → export logs.
- **End:** MVP features work seamlessly together!

---

💡 **Notes:**
- Each block implementation task also requires a test (unit test or manual test).
- Tasks are incremental—no leap of logic; each small step is independently verifiable.
- Tasks can be parallelized cautiously (e.g., separate block types by different devs).

