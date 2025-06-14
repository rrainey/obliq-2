# obliq-2

A web-based visual modeling and simulation tool that enables users to construct, test, and simulate block diagram models directly in the browser, then generate C code for embedded deployment.

> **Note**: This project was almost entirely generated using Claude Opus LLM.

## Overview

obliq-2 is a browser-based application, designed for creating and simulating visual block diagram models. Users can drag and drop various block types onto a canvas, connect them with wires to define signal flow, run simulations to see how signals propagate through the system, and generate PlatformIO-compatible C code for deployment on embedded systems.

![Screenshot](images/screenshot-01.png)

## Key Features

### Visual Modeling
- **Drag-and-drop interface** for building block diagrams
- **Multiple block types** including:
  - Mathematical operations (Sum, Multiply, Scale)
  - Dynamic systems (Laplace Transfer Functions with RK4 integration)
  - Signal routing (Input/Output Ports, Sheet Labels)
  - Data operations (1D/2D Lookup Tables)
  - Visualization (Signal Display with real-time plotting)
  - Signal generation (Source blocks for constants and generators)
  - Hierarchical composition (Subsystem blocks)

### Signal Type System
- Support for C-style data types: `float`, `double`, `long`, `bool`
- 1D array support (e.g., `double[3]`, `float[10]`)
- Automatic type propagation through connections
- Type validation with visual error indicators

### Simulation Engine
- **Client-side simulation** for responsive interaction
- Real-time signal visualization with Recharts
- Configurable time steps and duration
- Signal logging with CSV export capability
- Support for both continuous and discrete-time systems

### Code Generation
- **PlatformIO-compatible C code** generation
- Preserves signal and block names for readable code
- Generates structured APIs with input/output/state structs
- Support for Runge-Kutta 4th order integration in generated code

### Multi-User Support
- User authentication via Supabase
- Isolated model storage per user
- Auto-save functionality every 5 minutes
- Model management dashboard

### Automation API
- RESTful API for CI/CD integration
- Supports automated validation, simulation, and code generation
- Token-based authentication for external systems

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Supabase (PostgreSQL with JSONB for model storage)
- **Authentication**: Supabase Auth
- **State Management**: Zustand
- **Visualization**: Recharts for signal plotting
- **Code Generation**: Server-side TypeScript to C transpilation

## Installation

### Prerequisites
- Node.js 18+ and npm/yarn
- Supabase account (or local Supabase instance)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/obliq-2.git
cd obliq-2
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
Create a `.env.local` file in the project root:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Automation API Token (generate a secure token)
AUTOMATION_API_TOKEN=your_secure_automation_token
```

4. Set up the database:
In your Supabase project, create the models table:
```sql
CREATE TABLE models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own models
CREATE POLICY "Users can manage their own models" ON models
  FOR ALL USING (auth.uid() = user_id);
```

## Running Locally

1. Start the development server:
```bash
npx supabase start -x vector

# then,
npm run dev
# or
yarn dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Create an account or log in to start building models.

### Development Commands

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Project Structure

```
obliq-2/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes for automation and code generation
│   ├── login/             # Authentication pages
│   └── models/            # Model dashboard and editor
├── components/            # React components
│   ├── Canvas.tsx         # Visual modeling canvas
│   ├── Block.tsx          # Block component
│   └── ...                # Other UI components
├── lib/                   # Core business logic
│   ├── simulationEngine.ts # Simulation execution
│   ├── codeGeneration.ts  # C code generator
│   └── modelSchema.ts     # Model data structures
└── public/                # Static assets
```

## Testing

PlatformIO is used for integration testing if C-code generation.  See the [PlatformIO site](https://docs.platformio.org/en/latest/core/installation/methods/installer-script.html) for install instructions.  You must install Platform IO to successfully run these integration tests.

```console
$ python3 get-platformio.py
Installer version: 1.2.2
Platform: Linux-6.6.87.1-microsoft-standard-WSL2-x86_64-with-glibc2.35
Python version: 3.10.12 (main, Feb  4 2025, 14:57:36) [GCC 11.4.0]
Python path: /usr/bin/python3
Creating a virtual environment at /home/riley/.platformio/penv
Updating Python package manager (PIP) in the virtual environment
Looking in indexes: https://pypi.org/simple, https://pypi.ngc.nvidia.com
Requirement already satisfied: pip in ./.platformio/penv/lib/python3.10/site-packages (22.0.2)
Collecting pip
  Downloading pip-25.1.1-py3-none-any.whl (1.8 MB)
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.8/1.8 MB 10.8 MB/s eta 0:00:00
Installing collected packages: pip
  Attempting uninstall: pip
    Found existing installation: pip 22.0.2
    Uninstalling pip-22.0.2:
      Successfully uninstalled pip-22.0.2

***
*** Lots removed for brevity
***

Successfully installed pip-25.1.1
PIP has been successfully updated!
Virtual environment has been successfully created!
Installing PlatformIO Core

PlatformIO Core has been successfully installed into an isolated environment `/home/riley/.platformio/penv`!

The full path to `platformio.exe` is `/home/riley/.platformio/penv/bin/platformio`

If you need an access to `platformio.exe` from other applications, please install Shell Commands
(add PlatformIO Core binary directory `/home/riley/.platformio/penv/bin` to the system environment PATH variable):

See https://docs.platformio.org/page/installation.html#install-shell-commands
```

You will also need to install PlatformIO's Shell Commands:  https://docs.platformio.org/en/latest/core/installation/shell-commands.html#piocore-install-shell-commands

You can then run:

```console
$ npm run test:codegen
```

Or:

```console
$ npm run test:codegen:arduino
```



## Usage

1. **Create a Model**: Click "New Model" from the dashboard
2. **Build Your Diagram**: Drag blocks from the library and connect them with wires
3. **Configure Blocks**: Click blocks to set parameters (e.g., transfer function coefficients)
4. **Run Simulation**: Click "Run Simulation" to see signals propagate in real-time
5. **Generate Code**: Click "Generate C Code" to download a PlatformIO-compatible library
6. **Export Data**: Use Signal Logger blocks to capture and export simulation data

## License

This project is covered by the MIT License.

## Acknowledgments

This project was almost entirely generated using Claude Opus, demonstrating the capabilities of large language models in software development.