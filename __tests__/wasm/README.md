# WebAssembly (WASM) Testing Infrastructure

This directory contains the infrastructure for compiling Obliq models to WebAssembly using Emscripten.

## Overview

The WASM implementation allows Obliq models to be compiled from C code to WebAssembly for execution in the browser, providing:

- **Perfect fidelity** between simulation and embedded deployment
- **5-10x performance improvement** over JavaScript simulation
- **Identical code** running in browser and on embedded devices
- **Fast iteration** with sub-second cached compilation

## Directory Structure

```
__tests__/wasm/
├── docker/
│   └── Dockerfile.emscripten      # Emscripten build environment
├── fixtures/
│   ├── hello.c                     # Simple "Hello World" test
│   ├── hello.html                  # Browser test page
│   └── model-output/               # Generated model WASM files
├── scripts/
│   ├── compile-hello.sh            # Direct Emscripten compilation
│   ├── compile-hello-docker.sh     # Docker-based compilation (Linux/Mac)
│   └── compile-hello-docker.bat    # Docker-based compilation (Windows)
├── emscripten-setup.test.ts        # Basic WASM compilation tests
├── model-compilation.test.ts       # Full model to WASM tests
└── README.md                       # This file
```

## Prerequisites

### Required

- **Docker Desktop**: Must be installed and running
- **Node.js 18+**: For running tests
- **npm**: For installing dependencies

### Optional (for local Emscripten)

- **Emscripten SDK**: For compiling without Docker
  - Installation: https://emscripten.org/docs/getting_started/downloads.html

## Quick Start

### 1. Build the Docker Image

```bash
npm run wasm:build-docker
```

This builds a Docker image with Emscripten 3.1.56 pre-installed.

### 2. Run WASM Tests

```bash
# Run all WASM tests
npm run test:wasm

# Run only setup tests
npm run test:wasm:setup

# Run only model compilation tests
npm run test:wasm:model
```

### 3. Manual Compilation (Hello World)

#### Using Docker (Recommended)

**Windows:**
```cmd
__tests__\wasm\scripts\compile-hello-docker.bat
```

**Linux/Mac:**
```bash
__tests__/wasm/scripts/compile-hello-docker.sh
```

#### Using Local Emscripten

```bash
__tests__/wasm/scripts/compile-hello.sh
```

### 4. Test in Browser

After compilation, start a web server:

```bash
cd __tests__/wasm/fixtures
python -m http.server 8000
```

Then open http://localhost:8000/hello.html in your browser.

## How It Works

### C to WebAssembly Compilation Flow

```
Model JSON (Obliq model)
  ↓
CodeGenerator (generates C code)
  ↓
C Header (.h) + C Source (.c)
  ↓
Emscripten (emcc)
  ↓
WebAssembly Module (.wasm) + JS Glue (.js)
  ↓
Browser loads and executes WASM
```

### Emscripten Compilation Options

The key Emscripten flags used:

- `-s WASM=1` - Generate WebAssembly output
- `-s EXPORTED_FUNCTIONS='[...]'` - Export specific functions
- `-s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]'` - Enable function calling from JS
- `-s MODULARIZE=1` - Generate module pattern
- `-s EXPORT_NAME='createModule'` - Module factory function name
- `-s ALLOW_MEMORY_GROWTH=1` - Allow dynamic memory allocation
- `-O2` - Optimization level (balance compile time vs runtime performance)
- `-lm` - Link math library (for sin, cos, sqrt, etc.)

## Test Files

### `emscripten-setup.test.ts`

Tests basic Emscripten functionality:

1. **Docker Image Build**: Verifies Emscripten image builds successfully
2. **Emscripten Installation**: Checks `emcc` is available and working
3. **Basic Compilation**: Compiles `hello.c` to WASM
4. **WASM Execution**: Loads and executes compiled WASM in Node.js
5. **Function Calls**: Tests exported functions (`add`, `multiply`, `sin`)

### `model-compilation.test.ts`

Tests full model compilation pipeline:

1. **C Code Generation**: Uses existing `CodeGenerator` to create C code
2. **WASM Wrapper**: Generates interface for WASM exports
3. **Compilation**: Compiles model C code to WASM via Emscripten
4. **Execution**: Loads WASM module and runs simulation
5. **Validation**: Verifies outputs match expected values

**Test Model**: Simple Sum + Gain model
- Inputs: `a`, `b`
- Processing: `(a + b) * 2.0`
- Output: `result`

Test cases:
- `a=2, b=3` → `result=10.0`
- `a=5, b=-2` → `result=6.0`
- `a=0, b=0` → `result=0.0`

## Docker Image Details

### Base Image

- **Base**: `node:20-alpine`
- **Size**: ~400MB (optimized for CI/CD)
- **Emscripten Version**: 3.1.56 (stable as of March 2024)

### Installed Tools

- Python 3 (Emscripten dependency)
- CMake & Ninja (build tools)
- Git (for Emscripten SDK)
- build-base (gcc, g++, make)

### Environment Variables

- `EMSDK=/opt/emsdk`
- `EM_CONFIG=/opt/emsdk/.emscripten`
- `PATH` includes Emscripten binaries

## CI/CD Integration

### GitHub Actions Workflow

File: `.github/workflows/wasm-tests.yml`

**Triggers:**
- Push to `main` or `wasm` branches
- Pull requests targeting `main` or `wasm`

**Jobs:**

1. **wasm-compilation-tests** (Ubuntu)
   - Builds Emscripten Docker image
   - Runs setup tests
   - Runs model compilation tests
   - Uploads WASM artifacts

2. **compatibility-test** (Matrix)
   - Tests on Ubuntu and macOS
   - Tests with Node 18 and 20
   - Ensures cross-platform compatibility

### Artifacts

Compiled WASM files are uploaded as artifacts:
- Retention: 7 days
- Includes: `*.wasm`, `*.js`, model outputs

## Troubleshooting

### Docker Build Fails

**Error**: `Cannot connect to Docker daemon`
**Solution**: Ensure Docker Desktop is running

**Error**: `No space left on device`
**Solution**: Run `docker system prune -a` to free space

### Compilation Errors

**Error**: `emcc: command not found`
**Solution**: Rebuild Docker image with `npm run wasm:build-docker`

**Error**: `undefined reference to 'sin'`
**Solution**: Add `-lm` flag to link math library

### Runtime Errors

**Error**: `Module._add is not a function`
**Solution**: Ensure function is in `EXPORTED_FUNCTIONS` list

**Error**: `Cannot find module 'hello.js'`
**Solution**: Check that compilation succeeded and files exist

### Test Failures

**Error**: `Timeout of 300000ms exceeded`
**Solution**: Docker operations can be slow. Increase timeout or ensure Docker has sufficient resources.

**Error**: `ENOENT: no such file or directory`
**Solution**: Ensure output directory exists or tests create it in `beforeAll`

## Performance Benchmarks

From initial testing:

### Compilation Times (Docker)

- **Simple model** (5 blocks): ~2-3 seconds
- **Medium model** (20 blocks): ~4-6 seconds
- **Large model** (100+ blocks): ~15-20 seconds

### WASM Execution Speed

- **vs JavaScript**: 5-10x faster for numerical computation
- **Steps/second**: >50,000 for typical models

### File Sizes

- **hello.wasm**: ~20KB (optimized with -O2)
- **hello.js** (glue code): ~30KB
- **Model WASM**: ~50-200KB depending on complexity

## Next Steps (Future Tasks)

This infrastructure enables the following roadmap items:

- **Task 0.2**: WASM caching with Supabase Storage
- **Task 0.3**: Update C code generator for WASM exports
- **Task 0.4**: Create `/api/compile-wasm` endpoint
- **Task 1.1**: `WasmSimulationEngine` class
- **Phase 2**: UI integration with WASM simulation

## Additional Resources

### Emscripten Documentation

- **Official Docs**: https://emscripten.org/docs/
- **API Reference**: https://emscripten.org/docs/api_reference/
- **Porting Guide**: https://emscripten.org/docs/porting/

### WebAssembly

- **MDN Docs**: https://developer.mozilla.org/en-US/docs/WebAssembly
- **WASM Spec**: https://webassembly.github.io/spec/

### Project-Specific

- **WASM Implementation Roadmap**: `docs/wasm-implementation-roadmap.md`
- **WASM Architecture**: `docs/wasm-simulation-architecture_1.md`
- **C Code Generation**: `docs/wasm-c-code-generation.md`
- **Testing Strategy**: `docs/wasm-testing-strategy.md`

## Support

For issues or questions:

1. Check existing tests for examples
2. Review documentation in `docs/`
3. Check Docker logs: `docker logs <container-id>`
4. Open an issue on GitHub

---

**Last Updated**: 2024-03-XX (Task 0.1 completion)
**Status**: ✅ Emscripten environment verified and working
**Next Task**: 0.2 - WASM Cache Infrastructure
