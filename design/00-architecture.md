# obliq-2: Architecture Design for a Visual Modeling & Simulation Web Application

## Overview and Technology Stack

This application is a web-based visual modeling and simulation tool, similar in spirit to Simulink. It enables users to **construct, test, and simulate block diagram models** in the browser, then generate C code for embedded deployment. The solution is built with **Next.js** as the frontend framework (leveraging its full-stack capabilities) and **Supabase** as the backend-as-a-service (handling database storage and user authentication). The primary data model (the user-created diagrams) is stored as JSON in a Postgres database (via Supabase). Using Supabase simplifies backend infrastructure since it provides authentication and a Postgres database with built-in JSON support (using JSONB columns) and row-level security for multi-user data separation. The system includes both a traditional web interface and a **Model Context Protocol (MCP) server** for programmatic access, enabling efficient testing and automation workflows. The architecture prioritizes clarity, simplicity, and performance, avoiding complex collaborative features and focusing on single-user editing sessions.

## High-Level System Architecture


*High-level architecture of the visual modeling application.* The system consists of a **Next.js frontend** (the user interface and client-side logic) and **Next.js API routes** (serverless functions) that together form the application, with **Supabase** providing authentication and database services. The **user's browser** runs the Next.js frontend, including the **visual modeling canvas** and an in-browser **simulation engine**. The browser communicates directly with Supabase (via Supabase's JavaScript client) for most CRUD operations and authentication flows, and it communicates with Next.js API routes for specialized tasks like code generation or automated external triggers. Supabase's database stores persistent data (model documents, user profiles, etc.), and Supabase Auth manages user sign-up/sign-in and session tokens. The **Next.js API backend** (part of the same Next application) handles operations that are better done server-side (e.g. preparing a downloadable code bundle or responding to external API calls), and it can securely interact with the Supabase database (using service role credentials or Supabase client on the server) when needed. In summary, the browser is responsible for interactive modeling and simulation, Supabase handles data persistence and auth, and Next.js API routes provide auxiliary services (code export, automation hooks) and integrate all pieces.

Additionally, the system includes an **MCP Server** that provides programmatic access to model manipulation capabilities. The MCP server runs as a separate Node.js process and communicates with the Next.js backend through the existing Automation API. This allows MCP clients (such as AI assistants or automated testing tools) to create, modify, simulate, and validate models without using the web UI. The MCP server maintains no state and acts as a protocol adapter, translating MCP tool calls into appropriate HTTP requests to the backend.

## Project Structure and Folder Organization

The project follows a clean, modular folder structure to organize different concerns. Next.js does not enforce a specific organization, so we structure files by feature and functionality for clarity. Below is an outline of the key directories and files, with each part explained:

* **`/app`** (or `pages/` in older Next.js versions): Contains the Next.js pages and route handlers. Using Next.js App Router, we structure pages as React Server Components where appropriate for data fetching.

  * **`app/page.tsx`** – The landing page (e.g. a home or dashboard). If the user is not authenticated, it might show marketing info or a login link; if authenticated, it can redirect to the model list.
  * **`app/login/page.tsx`** – Login (and sign-up) page for user authentication. It uses Supabase Auth (via the JS client or Supabase Auth UI) to handle user credentials.
  * **`app/models/page.tsx`** – Models dashboard page, listing the user's saved models. This page fetches model metadata from Supabase (could be done via a React Server Component that uses the Supabase client with the user's session token). It displays a list of models and a button to create a new model.
  * **`app/models/[id]/page.tsx`** – The **model editor page** for constructing and simulating a specific model. It is the core of the application's UI, loading the model JSON from Supabase (via client-side fetch or server-side prefetch) and then rendering the visual canvas. This page likely uses a mix of server and client components: for example, the initial model data can be fetched on the server (for faster load) and passed to a client component that manages the interactive editing. It also provides UI controls for actions like *Save*, *Run Simulation*, *Generate C Code*, *Download JSON*, etc.
  * **`app/api/simulate/route.ts`** – (Optional) API route to run simulation on the server. If the simulation is simple enough, we might *not* need this and instead run simulations in the browser. However, if we choose server-side simulation for consistency or offloading work, this endpoint would accept a model (ID or JSON) and perform the simulation, returning results (e.g. computed signal traces).
  * **`app/api/generate-code/route.ts`** – API route to handle **C code generation**. When the user requests a PlatformIO C library export, the frontend calls this endpoint (likely via a POST request containing the model ID or JSON). The route will load the model (if only an ID was sent), then invoke the code generation service to produce a C code bundle (source files). The response could be a file download (e.g. a zip archive of the library) or a JSON with a link to a file in Supabase Storage. This isolates the heavy or sensitive operation of code generation on the server side. For local development, this route uses the Supabase service role key (stored in `SUPABASE_SERVICE_ROLE_KEY` environment variable) to bypass Row Level Security when fetching models. This key must never be exposed to client-side code.
  The route accepts an optional `version` parameter to generate code from specific versions. If no version is specified, it defaults to the latest version. The generated ZIP filename includes the version number for clarity.
  * **`app/api/automations/[token]/route.ts`** – API route for the **automation API**. This endpoint allows external systems (like CI/CD pipelines or validation tools) to trigger actions on a model. For example, an external request could hit `POST /api/automations/{token}` with a payload specifying a model ID and an action (simulate, validate, or code-generate). A secure token (or an API key) in the URL or headers is used to authenticate these external requests (to avoid requiring a user session). Internally, this route verifies the token, then performs the requested action by calling the appropriate logic (e.g., running a simulation or generating code) and returns a result (like success status or generated artifacts). By design, this API route decouples external automation from the UI, enabling integration with CI systems without exposing the main app's user session mechanism.

  All automation API actions support an optional `version` parameter, allowing CI/CD pipelines to work with specific versions of a model. This enables reproducible builds and testing against known model states.

* **`/components`**: Reusable **React and ReactFlow components** for the UI, especially those used on the modeling canvas and related UI panels.

  * **`components/CanvasReactFlow.tsx`** – The **visual modeling canvas** component. This component provides a drawing area (using HTML5 Canvas or SVG/React components) where block diagram elements (blocks and connecting wires) are rendered. It handles drag-and-drop placement of blocks, drawing of connection lines between ports, and selection/highlighting of elements. The Canvas component likely uses internal state or context to track what's being dragged or selected, and it delegates events (like drop or wire connection) to higher-level handlers.
  * **`components/BlockNode.tsx`** – A component representing an individual **Block** (e.g., a Sum block, Multiplication block, etc.). Each Block knows how to render its icon/symbol and has defined input/output ports. It might be implemented as a draggable item. This component might also include UI for configuring block parameters (for blocks that have parameters, such as a Laplace Transfer Function which has coefficients).
  * **`components/Port.tsx`** – A sub-component for an input or output port on a block. Ports are anchor points for connections. This component might handle user interactions for starting or ending a wire connection (e.g., click and drag from an output port to an input port).
  * **`components/Wire.tsx`** – A component (or an SVG path) representing a **wire connection** between blocks. Wires can be drawn as SVG lines or Bezier curves connecting an output port to an input port. This component likely calculates a path based on the positions of the connected ports. It may also handle user interaction (e.g., clicking a wire might highlight it or allow deletion).
  * **`components/BlockLibrarySidebar.tsx`** – A sidebar component that lists all available primitive blocks (Sum, Multiply, Transfer Function, Signal Display, Logger, Input/Output ports, etc.) and possibly user-defined Subsystems. Users can drag new blocks from this palette onto the canvas. This component organizes blocks into categories and provides a search or filter for convenience if the library grows.
  * **`components/PropertiesPanel.tsx`** – A panel for editing properties of the currently selected block or subsystem. For instance, if the user selects a Transfer Function block, this panel would show input fields for numerator/denominator coefficients. For an Input/Output port, it may allow naming the signal (which is important because signal names will carry into code generation). The panel writes changes back to the model state.

* **`/lib`**: Utility modules and services (plain TypeScript/JavaScript modules that contain business logic, helpers, or integrations).

  * **`lib/supabaseClient.ts`** – A module to initialize and export the Supabase client (with the project URL and anon API key). This is used on the client side to interact with Supabase. It might also handle setting up Supabase authentication state listener and refreshing the JWT as needed.
  * **`lib/auth.tsx`** – (Optional) Utilities for authentication, possibly a React context provider that wraps the Supabase auth functions. This could provide React hooks like `useUser()` or `useSession()` throughout the app. It might also implement route guarding (for example, redirecting to login if no user session).
  * **`lib/multiSheetSimulation.ts`** – Implementation of the `MultiSheetSimulationEngine` class that coordinates simulation across multiple sheets with proper subsystem handling and sheet label scoping.

  * **`lib/sheetLabelUtils.ts`** – Utilities for handling sheet label connections, validation, and scoping within subsystems.
  * **`lib/simulationEngine.ts`** – The **simulation logic** implementation. This module contains functions to execute a model step-by-step. For simplicity and performance, the simulation can run in the browser (no network latency). The simulation engine would take the model JSON (or an in-memory representation of the block graph) and iteratively compute outputs of blocks over time steps. It likely supports both continuous (differential equation) blocks like transfer functions and discrete logic for algebraic blocks. For interactive use, this could be run in a Web Worker to keep the UI responsive if needed. The simulation engine updates the values of Signal Display blocks and logs data for Signal Logger blocks as the simulation progresses. Because our app is focusing on simplicity and not real-time collaboration, the simulation state lives purely on the client during a session – the results are not persisted in the database, they are just visualized or available for download if the user explicitly exports them.
  * **`lib/codeGeneration.ts`** – The **C Code generation service**. This module includes functions that transform a model JSON into C code files. It likely iterates through the blocks and connections to produce C structures and functions. For example, it may generate a `init()` function to initialize all blocks, an `update(step_time)` function to update the simulation each tick, and data structures for each block's state. It uses the preserved signal names from the model for variable and function names to ensure the generated code is understandable. The code generation could use templates for PlatformIO (e.g., generating a library with a `library.properties` if targeting Arduino, or a PlatformIO `src/` folder with code). This module can be used both on the server (for the API route that delivers a file) and potentially on the client (if we wanted to preview code). However, generating a downloadable library (especially if it involves bundling multiple files into a zip) is better done server-side. The output of code generation is not stored in the database; it's generated on-demand and provided to the user (or external caller) for download.
  * **`lib/modelSchema.ts`** – Definition of the **Model JSON schema** or TypeScript types for the model. This defines how a model is structured as JSON: e.g., a model object containing metadata and an array of **Sheets**, each Sheet containing a list of **Blocks** (with properties like id, type, position, parameters, etc.) and **Connections** (wires linking block outputs to inputs). It also defines how Subsystems are represented (possibly as a special block type that contains a reference to another list of blocks internally or a child sheet). Defining a clear schema (and perhaps using a validation library like Zod for it) helps maintain consistency between the front-end, simulation, and code generation logic so all interpret the model the same way.
  * **`lib/validation.ts`** – (Optional) If needed, this module could contain functions to validate a model (e.g., to ensure there are no unconnected required ports, no algebraic loops without feedback blocks, etc.). This might be used in the automation API to run model checks.
  * **`lib/types.ts`** – TypeScript types for models and versions, including `Model`, `ModelVersion`, and `ModelWithVersion` interfaces.
  * **`lib/useAutoSave.ts`** – React hook managing the auto-save timer, with logic to prevent auto-saves during loading or when viewing older versions.

* **`/public`**: Static assets such as images or maybe example models.

  * We might include an **embedded block icon library** here. For example, icons or SVGs for each block type (Sum, Multiply, etc.) that the Block components use to visually represent themselves.
  * If we provide any documentation or offline assets (like a PDF manual, or a default example model JSON), they could reside here as well.

* **`/mcp-server`**: MCP server implementation for programmatic model access

  * **`mcp-server/index.ts`** – Main MCP server entry point that initializes the server and registers all available tools. It handles authentication, request routing, and error handling.
  * **`mcp-server/tools/`** – Individual tool implementations
    * **`tools/model-management.ts`** – Tools for creating, listing, and deleting models
    * **`tools/model-construction.ts`** – Tools for adding blocks, connections, and sheets
    * **`tools/simulation.ts`** – Tools for running simulations and retrieving results
    * **`tools/validation.ts`** – Tools for model validation and error analysis
    * **`tools/code-generation.ts`** – Tools for generating and retrieving C code
  * **`mcp-server/client.ts`** – HTTP client wrapper for calling the Automation API endpoints
  * **`mcp-server/types.ts`** – TypeScript types for MCP tool inputs and outputs
  * **`mcp-server/auth.ts`** – Authentication handling for MCP requests
  * **`mcp-server/config.ts`** – Configuration for MCP server (port, API endpoints, etc.)

* **Configuration & Misc**:

  * **`next.config.js`** – Next.js configuration (if needed for custom webpack config or to set environment variables for Supabase, etc.). Usually minimal for our case.
  * **`.env.local`** – Environment variables including:
  - `NEXT_PUBLIC_SUPABASE_URL`: The Supabase project URL (safe for client-side)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: The anonymous key for client-side Supabase access
  - `SUPABASE_SERVICE_ROLE_KEY`: Service role key for server-side API routes (bypasses RLS)
  - `AUTOMATION_API_TOKEN`: Secret token for external automation API access
  - `MCP_SERVER_PORT`: Port for the MCP server (default: 3001)
  - `MCP_API_TOKEN`: Authentication token for MCP server access
  - `MCP_API_BASE_URL`: Base URL for the Next.js API routes (default: http://localhost:3000)
    
    For local Supabase development, default keys are provided by the Supabase CLI and are consistent across all local instances.
  * **`middleware.ts`** – (Optional) Next.js middleware to protect routes. We might use middleware to redirect unauthenticated users trying to access the `/models/...` pages back to `/login`. Alternatively, we handle this in the pages themselves by checking Supabase auth state.

This structure cleanly separates concerns: pages and API routes for routing, components for UI elements, and lib for core logic (simulation, codegen, etc.). It facilitates extensibility; for instance, adding a new block type means updating the block library (UI component + perhaps simulation and codegen handling in lib) without entangling unrelated parts.

## Database Design and Model Storage

All persistent data lives in **Supabase's PostgreSQL** database. The key pieces of data are: **Users**, **Models**, and **Model Versions**. Supabase Auth manages the Users table and authentication, so we primarily focus on the Models and Model Versions tables.

The database uses a two-table design for versioning:

**Models table** (metadata only):
* `id` (uuid primary key)
* `user_id` (foreign key to auth.users – the owner of the model)
* `name` (text, model name)
* `latest_version` (integer, the highest version number)
* `created_at` (timestamp)
* `updated_at` (timestamp)

**Model_versions table** (version data):
* `id` (uuid primary key)
* `model_id` (uuid, foreign key to models.id)
* `version` (integer, version number starting at 1)
* `data` (jsonb, the model JSON document)
* `created_at` (timestamp)
* Unique constraint on (model_id, version)

Version 0 is reserved for auto-save data, which is automatically deleted when a new version is saved. Regular versions start at 1 and increment monotonically. Each save operation creates a new version, providing a complete history of the model's evolution.

The model JSON stored in the `data` column contains the full structure of the model (including all sheets, blocks, connections, and any metadata like sheet layouts or signal names). We use a JSONB column type for efficiency in storage and querying. We can query parts of the JSON if needed (e.g., maybe to find all models that use a certain block type, though not a primary requirement). Supabase's row-level security (RLS) is configured such that each user can only select/update their own models (using `user_id = auth.uid()` in policy). This ensures privacy and data integrity.

**Application State vs. Database State:** The application maintains state both on the client and in the database. **Transient UI state** (like the current positions of blocks as the user is dragging, current simulation values, unsaved changes) lives in React state on the frontend. **Persistent state** (the saved model structure) lives in the Supabase DB as JSON. When the user is actively editing a model, changes are reflected in local state immediately for responsiveness, and the app may autosave periodically or allow the user to click "Save" to persist the JSON to Supabase. Because we avoid real-time collaboration, we don't need constant sync; a simple debounce or save-on-demand strategy is sufficient (improving performance by reducing writes).

For simulation, the state of the simulation (values of signals at each time step, etc.) is not stored in the database – it's either kept in memory in the browser or returned from a simulation API call. If the user stops a simulation and closes the model, they could save the final state or any logs they want by embedding them in the model JSON or by downloading a log file, but by default, simulations are ephemeral. Similarly, generated C code isn't stored in the database; it's produced on the fly by code generation logic when requested (keeping the DB focused on core data and not large blobs of code).

**Version Management:** The application tracks both the current version being viewed and whether it's an older version than the latest. When viewing an older version, the UI clearly indicates this state and changes the save behavior to prompt for a new model name (forking). The version number is passed as a query parameter when opening specific versions. Auto-save functionality is disabled when viewing older versions to prevent confusion.

## Model Versioning

The application implements lightweight versioning to track the evolution of models over time. This system provides several key capabilities:

**Version Storage:** Each save operation creates a new version with a monotonically increasing version number. Versions are immutable once created, ensuring a reliable audit trail.

**Version Selection:** Users can browse and open any previous version from the model list page. A dropdown on each model tile shows all available versions, with the latest clearly marked. Opening an older version passes the version number as a query parameter.

**Fork on Save:** When saving changes to an older version, users are prompted to create a new model with a new name. This prevents accidental overwrites and maintains clear lineage while allowing experimentation with historical states.

**API Version Support:** Both the code generation and automation APIs accept version parameters, enabling:
- Generation of C code from any version
- CI/CD pipelines that reference specific versions
- Automated testing against known model states
- Reproducible builds from historical versions

**Performance Considerations:** The two-table design keeps the models table lightweight for fast listing operations while storing the potentially large JSON data in the versions table. Version queries use the indexed (model_id, version) pair for efficient lookups.

* **Multi-Sheet Performance**: 
  - Simulation uses separate engines per sheet to avoid unnecessary global state updates
  - Code generation flattens only during generation, not during editing
  - Block execution order is calculated once and reused throughout simulation
  - Sheet label resolution is O(1) using hash maps for both simulation and code generation

## Basics of the Simulation Model Document

A simulation **Model** is logically composed of one or more **Sheets**. Each Sheet will contain a collection of **Blocks**. We will define multiple block types from which to compose a simulation model.  Blocks have input and output **Ports**. Ports are interconnected by **Signal** wires.  As we'll see, Output Ports will have an associated data type assigned based on the nature of the block type or configuration by the user.  Signals inherit the data type of the source Output Port which they are connected to. We'll enumerate the data types supported by the application in a later section. These closly correspond to C-language data types to make for effective translation to a C-language implementation.

The simulation model is conceived with modularity and component reuse as important consideration.  Based on that idea, a model can be decomposed into **Subsystems** by the user.  As we will see, a Subsystem will have its own unique scope of blocks, names, inputs, outputs, and interconnections. In fact, the main model can be thought of as the root Subsystem to an overall model.  Subsystems may be nested inside a parent Subsystem.  There is no limit to this Subsystem nesting depth.


## Visual Modeling Canvas and Block Editor

One of the most critical parts of the app is the **visual modeling canvas** where users build diagrams. This is implemented in the frontend (React) and must be efficient and intuitive. We use a combination of HTML5 Canvas or SVG for drawing connections and perhaps a library for the diagramming foundation. For example, we could leverage an existing JS diagramming library (such as **JointJS, mxGraph, GoJS, or Draw2D**) to handle low-level drag-and-drop and rendering, but we will likely customize it heavily to enforce our specific rules (e.g., **only one wire per input port, multiple wires per output port**, and naming of signals). 

Blocks are interconnected by wires called **Signals**.  Every Signal has an an associated C-style data type.  This data type is inherited from the characteristics of the source block. Valid data types supported will be float, double, long, bool, one-dimensional arrays of these types, and two-dimensional matrices. Where they appear in the user interface or internally in the model JSON document, data types specification will be text strings conforming to C-language syntax; array and matrix dimensions must be explicitly specified (for example, "int", "double[3]", "bool", "double[3][4]" for a 3×4 matrix).

Each primitive block type is defined with specific behavior:

* **Sum Block** – multiple inputs, one output (sums the inputs).
* **Multiply Block** – multiple inputs, one output (multiplies inputs).
* **Laplace Transfer Function Block** – represents a dynamic system; it has a mathematical transfer function (one input, one output with internal state representing the differential equation). The transfer function is specified by numerator and denominator polynomial coefficients ordered from highest to lowest power of s (e.g., for H(s) = (s + 2)/(s² + 3s + 1), numerator = [1, 2] and denominator = [1, 3, 1]). Internal integration of this block shall be performed by a Runge-Kutta Fourth Order Integration algorithm. The generated C code shall include a separate `_derivatives` function to support proper RK4 implementation.
* **Signal Display Block** – an output-only block that graphically displays a signal (for simulation visualization purposes; no outputs). The Signal display block should be capable of storing a fixed number of input Signal samples from each time step of the simulation.  The number of samples should be configurable for each block. The default number of stored samples should be 1000.  Signal Display blocks are only important to the interactive simulation.  These will be ignored when generating C-code. Recorded signals will be plotted as line charts using a popular charting package such as **Recharts**.
* **Signal Logger Block** – an output-only block that logs a signal's values during simulation (could be used to export data later; no outputs).
* **Input Port Block** – a source block representing an external input (no inputs, one output). This would be where external signals enter a subsystem or top-level model.
* **Source Block** - a source block providing either a constant or signal-generator-style signal source (no inputs, one output). Where the Source is a constant, a C-syntax constant expression sets the implied data type - examples  would include "0" - an int, 0.0f - a float, "false" - a bool, "[0.0, 0.0, 0.0]" a C-style double vector.
* **Output Port Block** – a sink block representing an external output (one input, no outputs) to mark signals that leave a subsystem or top-level model.
* **Subsystem Block** – a special block that contains a nested diagram (hierarchical composition). A Subsystem has its own internal sheet with blocks and can have defined input/output interface ports. In the parent sheet, the Subsystem block appears as a block with those ports. Subsystems can be nested to an arbitrary depth.
* **1-D Lookup Block** - a block which estimates the value of a 1-D function from an array of samples and their associated output values. The input must be a scalar int, float, or double. The output will be the same type as the input. Lookup is performed using linear interpolation. Values for inputs outside of the range of the lookup table can be either clamped to the smallest or largest lookup value or extrapolated.  Lookup is driven by similarly sized vectors: the input values (supplied in order sorted from smalled to largest value) and the corresponding output value for each. 
* **2-D Lookup Block** - this block is almost identical in function to a **1-D Lookup Block** excepts that it takes two inputs. The types of the two inputs must match and the output will be that same type. Lookup is performed using linear interpolation. Values for inputs outside of the range of the lookup table can be either clamped to the smallest or largest lookup value or extrapolated.  Lookup is driven by two vectors, an N-sized input1, an M-sized input 2, and a N by M table of corresponding output values.
* **Scale Block** - this block multiplies the input signal by a sclalar constant. It has one input port and one output port.

### Matrix Operation Blocks

* **Matrix Multiply Block** – performs matrix multiplication following standard linear algebra rules. It has two inputs and one output. The block supports:
  - Scalar × Matrix (element-wise scaling)
  - Vector × Matrix (1×n × n×m = 1×m)
  - Matrix × Vector (m×n × n×1 = m×1)  
  - Matrix × Matrix (m×n × n×p = m×p)
  The block validates dimension compatibility at connection time and displays the operation symbol ⊗.

* **Mux Block** – multiplexer that combines multiple scalar inputs into a vector or matrix output. The block configuration specifies the output dimensions (rows × columns), which determines the number of input ports dynamically. Inputs are arranged in row-major order. For example, a 2×3 mux creates 6 input ports and produces a double[2][3] output.

* **Demux Block** – demultiplexer that splits a vector or matrix input into multiple scalar outputs. The number of output ports is determined dynamically based on the connected input signal's dimensions. Outputs are extracted in row-major order. Port labels indicate position (e.g., "row1_col2" for matrices).

### Matrix Support in Other Blocks

Several existing blocks have been enhanced to support matrix operations:

* **Sum, Multiply, and Scale Blocks** – perform element-wise operations on matrices. All matrix inputs must have matching dimensions. For example, multiplying two 3×4 matrices produces a 3×4 matrix where each element is the product of corresponding elements.

* **Transfer Function Block** – applies the transfer function independently to each element of a matrix input, maintaining separate state variables for each element. A 2×3 matrix input results in 6 parallel transfer function computations.

* **Source Block** – can generate constant matrix values using C-style syntax (e.g., "[[1.0, 2.0], [3.0, 4.0]]" for a 2×2 matrix). The block configuration UI includes validation to ensure the entered values match the declared matrix dimensions.

* **Signal Display and Logger Blocks** – do not accept matrix inputs. Attempting to connect a matrix signal results in a clear validation error.

The **CanvasReactFlow** and related components manage user interactions: Users can drag blocks from the library sidebar onto the canvas (creating a new instance of that block type in the model state), drag blocks around to reposition them, and drag from an output port to an input port to create a connection (wire). The UI provides visual feedback (highlighting compatible ports, etc.) and prevents invalid connections (for example, the app should stop the user from connecting two outputs directly or connecting an output to multiple inputs on the same port). These rules of connectivity are enforced in the Canvas component logic or the underlying diagram library, reflecting the single-source per input constraint of signal flow models.

### Visual Elements of the Block Diagram Canvas

The visual design of blocks on the canvas follows established conventions from flowcharting and control system diagrams while incorporating modern UI patterns for clarity and usability.

#### Block Visual Representations

Each block type has a distinct visual appearance designed to convey its function at a glance:

**Basic Mathematical Blocks:**
- **Sum Block** – Rectangular block displaying the "∑" (sigma) symbol. Standard 80px width with white background and gray border.
- **Multiply Block** – Rectangular block displaying the "×" (multiplication) symbol. Same dimensions as Sum block.
- **Scale Block** – Rectangular block displaying the gain value (default "K"). Updates dynamically to show the actual scaling factor.

**Dynamic System Blocks:**
- **Transfer Function Block** – Rectangular block displaying the transfer function as a fraction with numerator and denominator polynomials. Width adjusts dynamically based on polynomial length. Polynomials are formatted with proper superscripts for powers of s (e.g., s², s³).

**Data Lookup Blocks:**
- **1-D Lookup Block** – Rectangular block containing a 60x40px SVG diagram showing the actual lookup curve. The diagram displays:
  - Light gray axes (#9ca3af)
  - Medium gray curve (#6b7280) 
  - Automatic scaling to fit the defined data points
  - Linear interpolation visualization between points
- **2-D Lookup Block** – Similar to 1-D but displays multiple curves (one for each second input value) with slight transparency (0.7 opacity) to show overlapping curves clearly.

**Input/Output Interface Blocks:**
- **Input Port Block** – Terminator shape (stadium/pill shape with semicircular ends) displaying the port name centered within. Height is 45px (30% flatter than standard blocks) with dynamic width based on port name length (100-200px range).
- **Output Port Block** – Identical terminator shape to Input Port, visually indicating interface boundaries.
- **Source Block** – Rectangular block displaying either:
  - "~" symbol for signal generators
  - The actual constant value in monospace font (e.g., "3.14", "[1.0, 0.0, 0.0]")
  - Width adjusts to accommodate longer constant expressions

**Signal Monitoring Blocks:**
- **Signal Display Block** – Rectangular block with "📊" (chart) emoji indicating graphical display capability.
- **Signal Logger Block** – Rectangular block with "📝" (memo) emoji indicating data logging function.

**Structural Blocks:**
- **Subsystem Block** – Rectangular block with "□" (square) symbol. Contains multiple input/output ports based on subsystem definition.

**Sheet Connection Blocks:**
- **Sheet Label Sink** – Rectangular block with downward arrow "↓" and the signal name displayed below in smaller text (truncated to 8 characters if needed).
- **Sheet Label Source** – Rectangular block with upward arrow "↑" and matching signal name display format.

**Matrix Operation Blocks:**
- **Matrix Multiply Block** – Rectangular block displaying the "⊗" symbol. Width adjusts to accommodate dimension preview.
- **Mux Block** – Rectangular block with a grid icon indicating the multiplexing function. Shows configured dimensions (e.g., "2×3").
- **Demux Block** – Rectangular block with an inverse grid icon. Dynamically shows output configuration based on input.

**Matrix Signal Visualization:**
- Matrix connections display dimension information (e.g., "double[3][4]") on hover
- Type mismatches show specific dimension errors (e.g., "3×4 → 2×3 ✗")
- Matrix-capable blocks show a small matrix indicator icon

#### Visual Design Principles

**Color Scheme:**
- All blocks use a consistent monochrome gray color palette
- White backgrounds with #9ca3af (gray-400) borders
- Selected blocks show a blue ring (#3b82f6) with 2px offset
- Text uses #374151 (gray-900) for maximum contrast

**Block Dimensions:**
- Minimum height: 64px (45px for terminator shapes)
- Default width: 80px
- Dynamic width adjustment for:
  - Transfer functions (based on polynomial length)
  - Source blocks (based on constant value length)
  - Input/Output ports (based on port name length)
  - Sheet labels (based on signal name length)

**Port Indicators:**
- Circular handles (12px diameter) on block edges
- Dark gray (#374151) with white border in default state
- Blue (#3b82f6) with shadow effect on hover
- Minimum 20px vertical spacing between multiple ports
- Positioned 6px outside the block boundary

**Block Names:**
- Displayed above each block in small gray text (0.5rem)
- Automatically generated following pattern: BlockType + Number (e.g., "Sum1", "TransferFunction2")
- Sheet label blocks show signal name in purple below the block name

**Connection Wires:**
- Rendered as paths between output and input ports
- Single connection allowed per input port
- Multiple connections allowed from output ports
- Visual feedback during connection dragging

#### Responsive Behavior

- Blocks maintain relative cursor position during dragging to prevent visual "jumping"
- Port highlights provide immediate feedback for valid connection targets
- Dynamic resizing ensures content is never clipped or overlapped
- Consistent hover states across all interactive elements

This visual design system ensures that block diagrams are both functional and aesthetically consistent, making it easy for users to understand signal flow and system structure at a glance.

**Scope of names** - The scope of a named signal or block name is the Subsystem in which the parent block appears. Outside this region, we cannot access the named signal or block and it is treated as undefined or undeclared.  For our purposes, the model document can be considered the root Subsystem. When a new block is instantiated, it shall be automatically assigned a unique name.  This name should follow the form <block-type-name><integer-id-number>. The expected next <integer-id-number> to be assigned should be tracked at the parent Subsystem level (e.g., at either the main model or a parent Subsystem). So, for example, the first new Sum block created in a Sunsystem would be assigned the name "Sum1", the next, "Sum2", and so on.

**Block Naming Implementation:** The automatic naming system shall maintain a per-sheet counter for each block type. When a block is created, it receives a name in the format `<BlockType><Number>` where BlockType is the capitalized, space-removed version of the block type (e.g., "Sum", "TransferFunction", "SignalDisplay") and Number starts at 1 for each type on each sheet. This counter is maintained at the sheet level, not globally, allowing "Sum1" to exist on multiple sheets.

**Visual Design Considerations:**
* **Port Spacing:** Input and output ports on blocks shall be spaced at least 20 pixels apart vertically to ensure clear visual distinction and prevent connection errors. Blocks with multiple ports shall dynamically adjust their height to accommodate proper port spacing.
* **Block Dragging:** When initiating a drag operation on a block, the relative position between the mouse cursor and the block's origin shall be maintained throughout the drag to prevent visual "jumping."
* **Connection Feedback:** Ports shall provide clear visual feedback (color change, ring effect) on hover to indicate they are valid connection targets.

Under the hood, when a new connection (wire) is made, the application updates the model's JSON structure – likely by adding an entry to a connections list that references the source block's output and target block's input. Conversely, deleting a wire or block updates the JSON state accordingly. Because these operations happen in the client state first, the UI is responsive; periodic saves propagate those changes to the database. The canvas likely uses a **React context or state management library** (like Zustand or Redux, if needed) to manage the current model graph in memory while editing. Given the moderate complexity, a dedicated state management solution could be beneficial to avoid prop drilling and to allow multiple components (canvas, panels) to sync up. However, we can also leverage React's built-in context to provide the current model and a dispatcher for updates.

**Multi-Sheet Support:** The model supports multiple **Sheets** (think of these as separate canvases or pages in the same model, akin to having multiple tabs or layers in a model). The Canvas displays one Sheet at a time. This is useful for organizing large models or representing subsystems on separate pages. In the UI, this could be presented as tabbed views or a dropdown to switch sheets. Each sheet has its own canvas extent (dimensions, perhaps used to set an appropriate zoom/scale or coordinate system for the blocks on that sheet) and its own set of block instances that belong to that sheet. Connections typically exist within a sheet, except for special cases where an output port in a Subsystem might connect to an input in the parent sheet via the Subsystem block interface (we handle that via the Subsystem block definition). The data model JSON would have a structure like: `"sheets": [ { "id": 1, "name": "Main", "blocks": [...], "connections": [...] }, { "id": 2, "name": "Controller Subsystem", "blocks": [...], ... } ]`. Each sheet knows its extents (e.g., a coordinate system range for the canvas) and the layout of blocks. The **block positions** (x, y coordinates) are stored so that on loading the model, we can place each block where it was saved.

We introduce the concept of **Sheet Labels** to provide connections across sheets of a Subsystem (as with name scoping, we treat the top level model as the root Subsystem for Sheet Labeling). **Sheet Labels** referencing the same Signal name may also appear on the same sheet. Two extra Block types support the concept of **Sheet Labels**:

* **Sheet Label Sink** - A block with one input that captures a signal and makes it available by name within the current subsystem scope. The signal name is distinct from the block name and can be selected via autocomplete showing available signals.

* **Sheet Label Source** - A block with one output that retrieves a signal by name from a Sheet Label Sink within the same subsystem scope. A dropdown shows all available sink signal names in the current scope.

**Sheet Label Implementation Details**:
- Sheet labels are scoped to their containing subsystem (or root model)
- The Signal name associated with any Sheet Label block is distinct from the (unique) name assigned to the block.  This is true for both Sheet Label Sink and Sheet Label Source blocks.
- During simulation, values are stored in a scoped map within each SimulationEngine
- During code generation, sheet label connections are replaced with direct wire connections
- The `sheetLabelUtils.ts` module provides validation to ensure unique sink names and matched source/sink pairs

Because each block (and subsystem) can have a user-defined name (especially signals going into output ports or coming from input ports), we preserve these names. Names must comply with C-style identifier naming conventions. They will be important when generating code, as they become identifier names or part of function names to make the generated code more traceable to the source model.

### Type System and Matrix Support

The type validation system (`lib/typeValidator.ts`) has been extended to support two-dimensional matrices:

* **Type Syntax**: Matrix types follow C array syntax: `baseType[rows][cols]` (e.g., `double[3][4]`)
* **Type Propagation**: The signal type propagation system tracks matrix dimensions through the model
* **Compatibility Rules**: Matrix operations enforce strict dimension compatibility:
  - Element-wise operations require exact dimension matches
  - Matrix multiplication requires inner dimension agreement (m×n × n×p)
  - Connections validate dimension compatibility at design time

## Simulation Engine Design

The simulation capability allows users to run their model and see how signals change over time. Simulations will be executed on the **server** (via an API route) and return the results to the UI via APIs.

The **simulation engine** (implemented in `lib/simulationEngine.ts`) works as follows:

1. It takes a model (likely as a JavaScript object parsed from the JSON) and an optional simulation configuration (time step, total simulation time, etc. – possibly specified by the user in the UI). This simulations treats all blocks across all sheets as a
single consolidated sheet for simulation purposes. It follows that Sheet Labels are essential to establishing the correct
execution order of blocks and also for passing Signal data types and calculated values to the appropriate destinations.
2. It initializes all blocks. Some blocks have internal state or memory (e.g. a Transfer Function has internal state for its differential equation or difference equation). The engine may create a corresponding JavaScript object for each block to hold its current state and output value.
3. It then enters a loop over simulation time steps. At each step, it computes outputs of blocks that are driven by inputs. The computation order should respect data dependencies – essentially, this model forms a directed acyclic graph (DAG) if no algebraic loop, so we determine an execution order. (If there are feedback loops with delays, the engine would handle those appropriately by using previous step values for the feedback).
4. At each block, the engine computes the output based on the block type: Sum will sum its inputs, Multiply multiplies them, Transfer Function uses its internal state and formula to produce a new output (updating internal state), etc. Input Port blocks might just output a user-defined input (could be a constant or a predefined signal like a sine wave for testing), and Output Port blocks might just take a value and mark it as an output (perhaps logging it).
5. Signal Display and Logger blocks are special: they don't affect other blocks (no output wires), but the engine knows to collect their input value each step. The Display block could directly update a UI element (like plotting on a canvas in real-time), and the Logger block stores values in an array for that run.
6. The loop continues until the simulation end time. During or after the loop, the engine can present results: e.g., plot data on a chart component, or provide a table of logged values. The user can interact with the simulation (pause, resume, step, reset) if we implement those controls. All of this simulation state (current time, current outputs, log buffers) lives in memory on the client. If a model is large or the simulation is heavy, we could move this to a Web Worker thread to avoid blocking the UI – the architecture allows swapping the engine to a worker without affecting the rest of the system.
7. Once the simulation is done, the user can see all output plots. If needed, an "Export CSV" for logged signals could be offered (which would just take the logged arrays and create a CSV file for download in the browser).

If we later needed server-side simulation (for example, to offload work or allow long-running simulations to run without keeping the browser open), the architecture can accommodate it. We would implement the `app/api/simulate` route such that it loads the model JSON from the database, runs a simulation using perhaps a Node.js library or a headless version of our simulation engine, and returns the results (likely not as detailed interactive data, but maybe summary or logs). However, for now, the client-side approach is sufficient and simpler.

### Matrix Simulation Support

The simulation engine efficiently handles matrix operations:

* **Memory Management**: Matrix values are stored as nested JavaScript arrays (number[][])
* **Block Execution**: Matrix operations are computed element-wise or using optimized algorithms (e.g., matrix multiplication)
* **Performance**: Large matrices (up to 100×100) are supported with acceptable performance
* **State Management**: Transfer functions maintain separate state arrays for each matrix element

### Multi-Sheet Simulation Architecture

The simulation engine uses a hybrid approach that combines the benefits of separate sheet engines with global execution order:

1. **Per-Sheet Engines**: Each sheet (including those nested in subsystems) has its own `SimulationEngine` instance, maintaining local state and signal values.

2. **Global Execution Order**: A `MultiSheetSimulationEngine` coordinates all sheet engines, calculating a global execution order that respects dependencies across sheet boundaries.

3. **Subsystem Transparency**: Subsystem blocks are treated as containers. Values flow directly from subsystem inputs to internal input ports and from internal output ports to subsystem outputs.

4. **Sheet Label Scoping**: Each subsystem maintains its own sheet label namespace, preventing signal name conflicts between different subsystems.

Key implementation details:
- `SimulationEngine` provides `executeBlockById()` and `advanceTime()` methods for fine-grained control
- `MultiSheetSimulationEngine` maintains `blockEngines`, `executionOrder`, and `blockToSheet` mappings
- Sheet label values are scoped to their containing subsystem
- No redundant subsystem simulation - blocks execute exactly once per time step

## C Code Generation Service

A standout feature is generating a **PlatformIO-compatible C code library** from the model. This allows the user to deploy the logic on embedded systems (e.g., Arduino or similar microcontrollers). The code generation is initiated by the user via the UI ("Generate C Code" button), and the architecture handles this by offloading to a serverless function for processing, since file generation and packaging is better done server-side.

When the user triggers code generation for a model:

* The frontend (model editor page) calls the **Generate Code API** (e.g., `POST /api/generate-code`) either with the model's ID or the model JSON itself. If only an ID is sent, the API route will fetch the latest model data from Supabase.
* The API route then calls the code generation module (`lib/codeGeneration.ts`). This module translates the model into C code. For each block in the model, it might map to a snippet of C:

  * It will declare a struct or variables for any block that needs state (e.g., internal states for transfer functions).
  * It will generate an **initialize function** that sets up all initial conditions (clears sums, etc.).
  * It will generate an **update step function** that, when called periodically (e.g., from a loop in an embedded program), computes all the outputs from inputs, essentially performing one simulation step. This function follows the block execution order determined by the model's topology (similar to how the simulation engine does, but now in C).
  * **RK4 Integration Support:** For blocks requiring numerical integration (e.g., Transfer Functions), the generator shall produce a separate `<modelName>_derivatives()` function that computes state derivatives given current states and inputs. This enables proper implementation of Runge-Kutta 4th order integration in the `_step()` function.
  * **Generated Function Signatures:**
    ```c
    void modelName_derivatives(
        double t,
        const modelName_inputs_t* inputs,
        const modelName_states_t* current_states,
        modelName_states_t* state_derivatives
    );
    ```
  * Among the major elements of C-code generated for a model or Subsystem, there shall be a struct defining all inputs to the model or Subsystem, a struct defining the outputs, and a struct defining all required state variables (examples of state variables might be the staeful elements of each transfer function block).  A separate struct definition will be composed of all three of these elements.  That parent struct becomes a key element of the API to the model or Subsystem. An instance of that stuct can be craeted by a caller to create a new distinct instance of the model or Subsystem.
  * If the model has designated input/output ports (to interface with external hardware signals), those might correspond to function parameters or global variables in the generated code.
  * The code generator uses the **signal names** and block names from the model to name variables and functions in C. For example, a signal named "engine\_speed" that goes to an Output Port might result in a global variable or function output named `engine_speed`. This makes the generated code easier to integrate and understand.
* The output of the code generator is a set of C source (`.c`) and header (`.h`) files, possibly with a `platformio.ini` or library manifest if needed. For example, it would produce `src/<document-name>.c`, `src/<document-name>.h`, and any additional files for complex subsystems.
* The Next.js API route then needs to deliver these files to the user. This could be done by creating a zip archive in-memory (using a library like JSZip) and sending it as a binary response with the appropriate headers so the browser downloads it. Alternatively, the files could be uploaded to Supabase Storage or an S3 bucket and an expiring download link returned. For simplicity, generating a zip and streaming it back is straightforward.
* The user's browser will receive the response (triggering a download of the zip file). The user can then open the zip to find a ready-to-use PlatformIO project or library containing their model's logic in C.

The code generation service is stateless (it generates code on the fly from the model data) and does not store anything in the database. This ensures that if the model changes, the next code generation will reflect the latest model. It also keeps the database size in check (we're not saving potentially large code text, which can be regenerated as needed).

From an extensibility perspective, the code generation is designed to be easily **extendable for new block types**: when new blocks are introduced, we update the codeGeneration module to handle their code translation. Because the model JSON includes all the needed information (block type and parameters), the code generator can use a factory or lookup pattern to handle each block type. For instance, it might have a mapping like `{ "Sum": generateSumBlockCode, "TransferFunc": generateTFBlockCode, ... }`. This modular approach allows adding new block types without rewriting the entire generator.

### Matrix Code Generation

The code generator produces efficient C code for matrix operations:

* **Type Declarations**: Matrices are declared as 2D C arrays (e.g., `double matrix[3][4]`)
* **Memory Layout**: Row-major order matching C conventions
* **Operations**: Generated functions include:
  - Element-wise operations with nested loops
  - Optimized matrix multiplication
  - Mux/demux functions for matrix construction/deconstruction
* **Initialization**: Matrices are initialized using nested loops or memset for efficiency

## Automation API and External Integrations

To support workflows like continuous integration (CI), automated model validation, or external triggers (perhaps a git hook or an IoT device requesting an update), the application provides a simple **Automation API**. This is implemented as an API route (`/api/automations/[token]` as noted in the structure) which accepts HTTP requests from authorized external sources. We deliberately separate this from the main user interface to keep the web app focused and secure.

**Security:** We generate a secret token (or use an environment-defined API key) that external systems must provide to use this API. This could be part of the URL or an HTTP header. Supabase Auth is not used here (since the caller might be a machine, not a logged-in user), so we implement a simple token check in the route handler. This avoids exposing any user-specific credentials and allows revoking/regenerating the token without affecting users.

**Functionality:** The Automation API can be designed to handle various actions:

* **Trigger Code Generation:** For example, a CI pipeline could call `POST /api/automations/[token]` with a JSON body like `{ "action": "generateCode", "modelId": "<uuid>" }`. The API route would verify the token, then fetch the model JSON from the database (using a Supabase service role key that has read access to all models, since this is a trusted environment operation) and run the code generation. It could respond with a URL to the generated code bundle or even directly attach the zip (similar to the user flow). This way, the latest code can be pulled into a firmware build process automatically.
* **Run Simulation/Tests:** Another use might be `{ "action": "simulate", "modelId": "..." }`, which triggers a server-side simulation of the model (especially if the simulation can run headless and perhaps check for certain conditions or verify outputs). The results could be returned as data (or perhaps stored to a log). This could be used for automated regression testing of models.
* **Validate Model:** `{ "action": "validateModel", "modelId": "..." }` could trigger a series of model checks (using `lib/validation.ts` if implemented) to ensure the model meets certain criteria (no missing connections, etc.), and return a pass/fail or report.

The Automation API responses are designed to be machine-readable (JSON responses with status and data), since the consumer is likely another software service. We keep these routes lightweight – they mostly orchestrate calls to the same simulation or codegen logic used by the interactive app, just without a UI. Because these run on the server, they might be allowed to take slightly longer (a CI job could wait for code generation or simulation results a few seconds), whereas the interactive UI tries to be as real-time as possible.

By having this API, we maintain a **single source of truth** for simulation and code generation logic (the functions in `lib/`), and simply expose different ways to invoke them (UI vs API). This adheres to DRY principles and ensures consistency: whether a user clicks "Simulate" in the browser or a CI calls the simulate API, the underlying computation is the same.

### Relationship to MCP Server

While the Automation API provides HTTP endpoints for external systems, the MCP server builds upon these same endpoints to offer a more interactive, tool-based interface. The key differences are:

- **Protocol**: Automation API uses HTTP REST, while MCP uses the Model Context Protocol
- **Granularity**: Automation API offers high-level operations (generate code, run simulation), while MCP provides fine-grained tools (add individual blocks, create specific connections)
- **Use Cases**: Automation API is ideal for CI/CD pipelines and webhooks, while MCP excels at interactive development, testing, and model construction
- **State Management**: Both are stateless, but MCP tools can be composed into complex workflows by the client

The MCP server internally uses the Automation API for operations that require server-side processing (like simulation and code generation), while directly interfacing with Supabase for CRUD operations on models. This layered approach ensures consistency while providing flexibility for different use cases.

## MCP Integration Layer

To enhance the testing and development workflow, the application includes a Model Context Protocol (MCP) server that provides programmatic access to model creation, manipulation, and validation. This layer builds upon the existing Automation API to offer a more interactive and efficient interface for automated testing and model generation.

### Rationale for MCP Integration

While the HTTP-based Automation API serves external CI/CD systems well, developing and testing complex models requires a more interactive approach. The MCP integration addresses several needs:

1. **Rapid Test Model Generation**: Creating test models through the UI is time-consuming. MCP allows instantaneous creation of complex test scenarios.

2. **Systematic Testing**: MCP enables systematic testing of edge cases, type propagation scenarios, and multi-sheet configurations that would be tedious to create manually.

3. **Regression Testing**: Automated model creation through MCP facilitates comprehensive regression test suites.

4. **Development Efficiency**: Developers and AI assistants can quickly prototype and test new features by programmatically creating models.

5. **Validation Testing**: Complex validation scenarios (like Sheet Label scoping across multiple sheets) can be tested systematically.

### MCP Server Architecture

The MCP server is implemented as a Node.js application that interfaces with the existing Next.js backend through the Automation API. It exposes model manipulation capabilities as MCP tools, allowing MCP clients to:

- Create and modify models programmatically
- Execute simulations and retrieve results
- Validate models and analyze errors
- Generate C code from models
- Test complex multi-sheet scenarios

The MCP server maintains no state of its own, instead delegating all operations to the existing backend services. This ensures consistency between MCP operations and UI operations.

## State Management and Data Flow

Throughout the system, careful consideration is given to **where state lives** to maintain performance and simplicity:

* **Local UI State:** The React components hold state for instant UI feedback. For example, dragging a block around updates its position in a React state variable (or a Zustand store) immediately, so the block moves with the cursor. The wire drawing might happen in real-time as well, showing a temporary wire as the user drags from a port. This local state is authoritative during the edit session. The Canvas likely emits higher-level events (like "block moved" or "wire created") that update the global model state in memory.
* **Global Model State in Editor:** When on the model editor page, we maintain a representation of the current model (could be the same JSON structure stored in a React state or store). All components (canvas, sidebars, panels) read and modify this state. We might use a React Context provider at the page level to supply the model and a dispatcher function to child components. For performance, consider immutable updates or state libraries that can handle large object updates efficiently. The model JSON can be large, but since it's mostly tree-structured, focusing updates on specific parts (like a single block's coordinates) helps.
* **Database State:** On certain triggers (on a manual save action or periodically), the in-memory model state is serialized to JSON and sent to Supabase (update the `models.data` for that model). Likewise, when opening the editor page, we load from Supabase (via server component or client fetch). We ensure the data is synced but not on every minor change (to avoid network and performance overhead).
* **Auth State:** Supabase Auth provides a session JWT which we keep on the client (Supabase JS library handles this, often storing in local storage or memory and refreshing it). We can also propagate the session to Next.js server-side (Next 13 App Router can use cookies or the auth helper library to get the user on the server). For simplicity, the app can rely on client-side checks for auth to protect most pages, but critical actions (like API routes) double-check the Supabase JWT or the automation token.
* **Simulation State:** Lives in the simulation engine context (client or server depending on mode). It's not stored globally in React state because simulation is more of a transient process; however, some UI components (like a plot) might have internal state for the data points to display. The simulation engine could emit events or call callbacks (e.g., each time step, send new values to displays). This could be done via a simple pub-sub within the engine or by updating a React state that the Signal Display component is subscribed to. Because React re-renders could be expensive for many time steps, often simulation display is done by directly manipulating a canvas or using a chart library that imperatively updates. We might therefore have the Signal Display component just hold a reference to a chart instance and the simulation engine pushes data to it without full React state updates each step, which is a performance consideration.
* **Unsaved Changes:** To help the user, we will keep track of a "document dirty" flag – whether the model has unsaved edits. This state can be in the editor component, and if the user tries to navigate away, we can prompt them to save. It's a minor detail but important for UX.
**Auto Save:** every five minutes, the current state of the "dirty" model document shall be "auto-saved" to version 0 in the model_versions table. This special version number is reserved exclusively for auto-save data. Auto-save only runs when viewing the latest version of a model and is disabled when viewing historical versions. The auto-save version is automatically deleted when the user performs an explicit save, ensuring clean version history. Auto-save data is never included in version listings shown to users.

The separation of concerns in state ensures that each part of the app deals with the appropriate form of data:

1. **UI Components** – operate on in-memory state for speed.
2. **Persistent Model Storage** – only updated occasionally, which also minimizes conflict potential (since no concurrent edits).
3. **Computation (Simulation/Codegen)** – operates on a snapshot of the model state (we might pass a copy of the model JSON to the simulation engine or code generator to avoid any mutations affecting the UI state). They produce results that are either displayed or downloaded, not directly modifying the model (except maybe adding some meta info like simulation results if we choose).

## Hybrid Simulation and Code Generation Architecture

The application uses a unified approach for handling multi-sheet models in both simulation and code generation:

### Shared Concepts

1. **Sheet Hierarchy**: Both systems traverse the complete sheet hierarchy, including sheets nested within subsystem blocks.

2. **Block Identification**: Blocks maintain their original IDs throughout flattening and simulation, enabling consistent tracking.

3. **Signal Flow**: Both systems handle:
   - Direct connections within sheets
   - Subsystem port mappings (input/output port blocks)
   - Sheet label connections within subsystem scopes

### Key Differences

**Simulation (Runtime)**:
- Maintains separate engine instances per sheet
- Executes blocks in-place with value passing between engines
- Preserves sheet label scoping dynamically
- Real-time state management

**Code Generation (Compile-time)**:
- Flattens entire model into single structure
- Generates prefixed variable names
- Replaces sheet labels with direct assignments
- Static code output

### Multi-Sheet Code Generation

The code generator handles hierarchical multi-sheet models through a flattening process:

1. **Model Flattening**: The C-code Generator makes no distinction between single sheet and multi-sheet models as it generates C-language code. Instead, the code generator shall - early in the code generation process - flatten the entire model into a single logical sheet in all cases. This implies that Subsystem input and output block are removed and replace with direct connections to their connected blocks on both sides. Signal Source and Signal Sink blocks would be handled in the same way.  (inputs and outputs of the top level model must be excluded from this treatment - only inputs and outputs of contained Subsystems should be replaced with direct connections).

2. **Modularized Block Definitions** Blocks are modularized by defining Block-specific classes in the `lib/blocks/` folder - A `lib/blocks/BlockModule.ts` module defines an interface, `IBlockModule`, for implementing these Block-specific behavior methods:
  - `generateComputation(block: BlockData, inputs: string[]): string` - generates the C-code corresponding to any computations performed by the block - sets the output based on inputs and state of the model structure
  - `getOutputType(block: BlockData, inputTypes: string[]): string` - specifies the C-style type of the Block's output signal
  - `generateStructMember(block: BlockData, outputType: string): string | null` - generates member variables that should be defined in the _signals_t structure typedef
  - `requiresState(block: BlockData): boolean` - true where this block has continuous state that requires RK4 integration
  - `generateStateStructMembers(block: BlockData, outputType: string): string[]` - generates member variables that should be defined in the _states_t structure typedef
  - `generateInitialization?(block: BlockData): string` - generates code that should be inserted into the _init function

3. **Subsystems can be Dynamically Enabled or Disabled** Subsystems have a special "enable" Boolean input signal.  By default, its value is True.  While enabled, all blocks in the subsystem operate normally.  It is disabled when the signal connected to the enable pin is "false-y". In this state, no integration is performed on any contained stateful Blocks (e.g., Transfer Function blocks) or Subsystems. Subsystem outputs would be generated as usual including using any frozen state values.  Supporting this, define a new Boolean property for Subsystem blocks called "showEnableInput". The default value will be False. We'll describe how we'll expose "enable" ports in the Canvas/Block UI later - for now, these rules should add proper functionality for C-code generation.  The enabled state of a Subsystem may change from one time step to the next, based on the "truthy-ness" of the connected "Enabled" input. Adding this feature affects the approach to properly flattening the model.  A notion of the scope of each active Enable signal will need to be maintained to correctly handle "disabled" elements during a live simulation - at least for Subsystems that have "showEnableInput" set.

**Enable signal propagation** When a subsystem is disabled (enable=false), should nested subsystems shall be considered, regardless of their own enable signal.

**Output behavior when disabled** You mentioned "Subsystem outputs would be generated as usual including using any frozen state values." Disabled Subsystems should hold their last values from when the subsystem was enabled. This implies that an initial value of all outputs must be computed based on the state of the system (taking into account initial values of all state variables), so that these outputs may be used for the Subsystem until it is enabled.

**"enable" has a Special Port Number** Enable ports will be assigned a special index of -1 - for example, -1 will appear as the targetPortIndex for a connection where the "enable" port is the target of a connection.  Using -1 avoids affecting the order of other, regular input ports.

**Default enable behavior** Where a subsystem has showEnableInput=false, it is enabled only if immediate parent is enabled. Similar to other rules, the top level model is special: it does not have its own showEnableInput tracking. Instead, it is always considered "enabled".

**Subsystem Enabled Status updates in the Time Step Function** The Enabled state of all subsystems should be re-evaluated and updated at the end of the time step function.

2. **Context Preservation**: A `BlockContextMap` tracks each block's original location:
   - Original sheet path for comments (e.g., "from Subsystem1 > Controller")
   - Prefixed names to ensure uniqueness across the flattened model
   - Proper scoping for signal names and variables

3. **Execution Order**: The flattened model uses `calculateExecutionOrderMultiSheet()` to determine a global execution order respecting all dependencies.

4. **Generated Code Structure**:
   - All signals use prefixed names to avoid conflicts
   - Comments indicate the original subsystem location
   - Sheet label connections become direct assignments
   - States for transfer functions are properly scoped

### Benefits of This Architecture

1. **Consistency**: Same signal flow logic ensures simulation matches generated code behavior
2. **Performance**: Simulation avoids unnecessary flattening overhead
3. **Debugging**: Generated code comments preserve original structure
4. **Extensibility**: New block types need minimal changes to both systems

## Extensibility and Performance Considerations

The architecture is designed to be **extensible**. Adding new features or blocks should require minimal changes:

* New block types would involve updating the BlockLibrarySidebar (to list it), adding a Block component or variant, and extending simulation and codegen logic to handle its behavior. Thanks to a modular design (with centralized model schema and dedicated simulation/codegen modules), this is straightforward.
* Additional features like new result visualization (say, an FFT block for signal analysis, or a custom chart) can be added as new blocks or as new panels subscribing to simulation data, without altering the core architecture.
* The use of Next.js means we can also easily add new pages, such as a **Profile page** for the user, or a **Help/Documentation** page, within the same project structure.

We also consider **performance** in the architecture:

* The visual canvas can potentially have many blocks and wires. We should use techniques like windowing or canvas layers if the number grows large. Libraries like those mentioned (JointJS, etc.) are built for many nodes and have internal optimizations. If implementing ourselves with React, we'd avoid re-rendering the whole canvas on every minor change – instead, perhaps each block is a React component that moves independently, and connections might be drawn in an SVG that updates efficiently.
* Using Next.js App Router with server components can optimize data fetching. For example, the model list page can be rendered server-side (faster initial load and SEO if needed). The model editor page could preload the model JSON on the server (so the page renders with data without an extra loading spinner). Next's architecture allows mixing server and client components for an optimal experience.
* Supabase, being a managed Postgres, is quite scalable for our needs. By storing the heavy data (models) in JSONB, we minimize the number of tables and joins needed; a single query can retrieve the whole model. We should, however, be mindful to not fetch the model JSON more often than needed (since it could be large). This is handled by the state management as described (once loaded, keep it in memory).
* The serverless functions (API routes) should perform heavy tasks like code generation within reasonable time. If a model is extremely large, code generation could be slow, but typically it's string processing which is fast in Node. PlatformIO code is text, so even a few thousand lines is fine to handle.
* We avoid using websockets or real-time subscriptions (since no collab or real-time multi-user updates). This simplifies the architecture and removes a class of issues around synchronization and race conditions.
* We ensure that each service is used appropriately: the database is not doing computation, the client is not doing secure data storage, etc. This clear separation means each part can be optimized or replaced if needed (for instance, if we needed to support extremely heavy simulations, we could introduce a dedicated simulation microservice or WebAssembly module without restructuring the whole app).
* **Matrix Performance**: Matrix operations are optimized for reasonable sizes (up to 100×100). Larger matrices may impact simulation performance. The UI provides warnings for matrices exceeding 1000×1000 elements. Memory usage scales with the square of matrix dimensions, so appropriate limits are enforced.
* **Version Performance:** The versioning system uses a two-table design to optimize common operations. Model listings only query the lightweight models table, while version data is fetched on-demand. The unique index on (model_id, version) ensures fast version lookups.
* **Auto-save Efficiency:** Auto-save operations use version 0 with upsert semantics, preventing version table bloat. The system validates model state before auto-saving to prevent errors during the save cycle.

### MCP Integration Benefits

The MCP server enhances both extensibility and performance in several ways:

**Extensibility**:
- New MCP tools can be added without modifying the core application
- Complex model construction workflows can be scripted and shared
- Testing scenarios can be versioned and automated
- Integration with AI assistants and development tools becomes straightforward

**Performance**:
- Batch operations can be performed without UI overhead
- Model creation and testing can be parallelized
- Rapid iteration on model designs without manual clicking
- Automated performance testing of simulation engine with various model complexities

**Testing Efficiency**:
- Systematic testing of edge cases (e.g., maximum block counts, complex wire routing)
- Automated validation of type propagation across multiple sheets
- Regression test suites can be generated and run programmatically
- Sheet Label scoping and multi-sheet interactions can be tested comprehensively

### Matrix Support in MCP

The MCP server tools support matrix operations for testing:

* **Matrix Creation**: Tools can create blocks with matrix types and set matrix constant values
* **Type Validation**: MCP tools validate matrix dimensions during model construction
* **Testing Scenarios**: Complex matrix signal flows can be created programmatically for comprehensive testing
* **Performance Testing**: Large matrix models can be generated to test system limits

The MCP server maintains the same performance characteristics as the Automation API since it uses the same underlying services. The primary performance gain comes from eliminating manual UI interactions and enabling batch operations.

## Testing Infrastructure

The application includes a comprehensive testing infrastructure that validates both the simulation engine and the generated C code.

### Unit Testing
Standard unit tests are implemented using Jest and cover the core functionality of the simulation engine, type propagation system, and model validation logic. These tests run directly in Node.js without external dependencies.

### Integration Testing for Code Generation
The code generation testing infrastructure uses Docker to ensure consistent and reproducible compilation environments across different development platforms. This approach eliminates the need for developers to install PlatformIO or other embedded toolchains locally.

### Matrix Operation Testing

The testing infrastructure includes comprehensive matrix support:

* **Type Validation Tests**: Verify correct parsing and validation of matrix type strings
* **Simulation Tests**: Validate matrix operations produce correct numerical results
* **Code Generation Tests**: Ensure generated C code compiles and executes correctly
* **Performance Tests**: Benchmark large matrix operations to ensure acceptable performance
* **Integration Tests**: Test complex signal flows involving multiple matrix operations

#### Docker-Based Compilation Pipeline
The test suite automatically:
1. Builds a Docker image containing PlatformIO and necessary compilation tools
2. Generates C code from test models (stored as JSON files)
3. Creates proper PlatformIO library structures with appropriate configuration
4. Compiles the generated code in isolated Docker containers
5. Executes the compiled binaries to verify correctness
6. Validates outputs against expected results defined in model metadata

#### PlatformIO Library Structure
Generated libraries follow PlatformIO conventions:
- C source files are placed in the library root (not in a `src` subdirectory)
- Header files are placed in the library root for includes
- A `library.properties` file provides Arduino-compatible metadata
- A `library.json` file provides PlatformIO-specific configuration
- The `platformio.ini` configuration includes:
  - `lib_deps` with the library name for proper dependency resolution
  - `lib_compat_mode = off` to allow pure C libraries without Arduino dependencies

### Test Model Structure
Test models are stored in `__tests__/integration/code-generation/models/` as JSON files with optional metadata:
- `metadata.testInputs`: Object defining input port values for testing
- `metadata.expectedOutput`: Expected output value for validation
- `metadata.description`: Human-readable test case description

## Code Generation Service Updates

### C Code Structure
The generated C code follows a clean, modular structure:
- **Header files** define structs for inputs, outputs, and internal states
- **Source files** implement initialization and step functions
- **RK4 Integration**: Transfer functions use inline Runge-Kutta 4th order integration within the step function
- **Vector Support**: Proper handling of array types with element-wise operations

### Library Compatibility
Generated libraries are compatible with:
- PlatformIO projects (primary target)
- Arduino IDE (via library.properties)
- Generic C99 compilers (no platform-specific dependencies)

## Project Structure Updates

### Test Infrastructure Files
Additional files supporting the Docker-based testing:
- `__tests__/integration/code-generation/docker/Dockerfile.platformio` - Docker image definition
- `__tests__/integration/code-generation/models/*.json` - Test model definitions
- `__tests__/integration/code-generation/code-compilation.test.ts` - Integration test suite

## Development Workflow Enhancements

### Continuous Integration
The Docker-based approach enables:
- Consistent test execution across different platforms (Windows, macOS, Linux)
- No local toolchain installation requirements
- Parallel test execution in CI/CD pipelines
- Reproducible builds with specific PlatformIO versions

### Test Execution
Developers can run code generation tests with a simple command:
```bash
npm run test:codegen
```

This command will:
- Build the Docker image if not present
- Run all code generation tests
- Report compilation errors with full diagnostics
- Validate program outputs against expected values

## Conclusion

This architecture leverages **Next.js** for a unified frontend and backend codebase, keeping the project structure organized by feature. **Supabase** provides a convenient and secure data layer with minimal overhead in developing our own backend. The design outlined above emphasizes clean separation of concerns: the *UI components* manage interactivity and visualization, the *client-side state* enables responsive editing and simulation, the *server-side API* handles heavy lifting like code export and external automation, and the *database* safely persists user models. By focusing on simplicity (a single-user editing model, on-demand persistence, no unnecessary complexity), the application remains performant and easier to maintain. The folder structure and service interactions described ensure that as the application grows (more block types, larger models, more features), the codebase remains well-organized and extensible, providing a solid foundation for a visual modeling and simulation platform.