# WASM Quick Start Guide

## Task 0.1: Emscripten Setup - Complete! ✅

This guide will help you verify that the Emscripten environment is working correctly.

## Prerequisites Check

Before starting, verify you have:

- [ ] Docker Desktop installed and **running**
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)

## Step-by-Step Verification

### Step 1: Build Docker Image

```bash
npm run wasm:build-docker
```

**Expected output:**
```
Successfully tagged obliq-emscripten:latest
```

**Time**: ~5-10 minutes (first build)

### Step 2: Verify Emscripten

```bash
docker run --rm obliq-emscripten:latest emcc --version
```

**Expected output:**
```
emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.56
```

### Step 3: Run Hello World Test

```bash
npm run test:wasm:setup
```

**Expected output:**
```
PASS  __tests__/wasm/emscripten-setup.test.ts
  Emscripten Setup
    Docker Image Build
      ✓ should build Emscripten Docker image successfully (X ms)
      ✓ should have Emscripten compiler available in image (X ms)
    Basic WASM Compilation
      ✓ should compile hello.c to WASM (X ms)
      ✓ should be able to load and execute WASM module in Node.js (X ms)
```

### Step 4: Test in Browser (Optional)

#### 4a. Compile Hello World

**Windows:**
```cmd
__tests__\wasm\scripts\compile-hello-docker.bat
```

**Linux/Mac:**
```bash
chmod +x __tests__/wasm/scripts/compile-hello-docker.sh
__tests__/wasm/scripts/compile-hello-docker.sh
```

#### 4b. Start Web Server

```bash
cd __tests__/wasm/fixtures
python -m http.server 8000
```

Or if you have Node.js http-server:
```bash
npx http-server __tests__/wasm/fixtures -p 8000
```

#### 4c. Open Browser

Navigate to: http://localhost:8000/hello.html

**Expected result:**
- Green "✓ WebAssembly module loaded successfully!" message
- All test results show "✓ PASS"
- `add(2, 3) = 5.0`
- `multiply(2, 3) = 6.0`
- `sin(π/2) = 1.0`

### Step 5: Run Full Model Test

```bash
npm run test:wasm:model
```

**Expected output:**
```
PASS  __tests__/wasm/model-compilation.test.ts
  Model to WASM Compilation
    C Code Generation
      ✓ should generate C code from test model (X ms)
      ✓ should write generated C files to disk (X ms)
    WASM Compilation with Emscripten
      ✓ should compile generated C code to WASM (X ms)
    WASM Execution
      ✓ should load and execute the compiled WASM model (X ms)
      ✓ should maintain state across multiple steps (X ms)
```

### Step 6: Run All Tests

```bash
npm run test:wasm
```

**Expected:** All tests pass ✅

## What You Just Accomplished

✅ **Emscripten Docker environment** built and verified
✅ **Basic C to WASM compilation** working
✅ **WASM module loading** in Node.js functional
✅ **Full Obliq model compilation** to WASM successful
✅ **Browser WASM execution** verified

## Troubleshooting

### Docker not running

**Symptom:** `Cannot connect to Docker daemon`

**Fix:**
1. Open Docker Desktop
2. Wait for it to fully start
3. Try again

### Port 8000 already in use

**Symptom:** `Address already in use`

**Fix:** Use a different port:
```bash
python -m http.server 8080
# Then visit http://localhost:8080/hello.html
```

### Tests timeout

**Symptom:** `Timeout of 300000ms exceeded`

**Possible causes:**
1. Docker is slow (give it more resources in Docker Desktop settings)
2. First build takes longer (subsequent builds use cache)
3. Network issues downloading Emscripten

**Fix:** Re-run the test - it should be faster on subsequent runs.

### Module not found errors

**Symptom:** `Cannot find module '@/lib/codegen/CodeGenerator'`

**Fix:** Install dependencies:
```bash
npm install
```

## Next Steps

Now that Task 0.1 is complete, you're ready for:

### Task 0.2: WASM Cache Infrastructure
- Set up Supabase Storage bucket
- Implement cache key generation
- Create cache manager class

### Task 0.3: Update C Code Generator
- Add EMSCRIPTEN_KEEPALIVE macros
- Generate WASM interface functions
- Create TypeScript type definitions

### Task 0.4: WASM Compilation API
- Create `/api/compile-wasm` endpoint
- Integrate Emscripten into server
- Add caching logic

See `docs/wasm-implementation-roadmap.md` for the full plan.

## File Locations Reference

```
__tests__/wasm/
├── docker/
│   └── Dockerfile.emscripten          # Docker build file
├── fixtures/
│   ├── hello.c                         # Test C file
│   ├── hello.html                      # Browser test page
│   ├── hello.js                        # Generated (after compilation)
│   ├── hello.wasm                      # Generated (after compilation)
│   └── model-output/
│       ├── model.h                     # Generated model header
│       ├── model.c                     # Generated model source
│       ├── wasm_wrapper.c              # WASM interface wrapper
│       ├── model.js                    # Generated WASM glue
│       └── model.wasm                  # Generated WASM binary
├── scripts/
│   ├── compile-hello.sh                # Direct compilation
│   ├── compile-hello-docker.sh         # Docker compilation (Unix)
│   └── compile-hello-docker.bat        # Docker compilation (Windows)
├── emscripten-setup.test.ts            # Setup tests
├── model-compilation.test.ts           # Model tests
└── README.md                           # Full documentation
```

## Success Criteria

You can proceed to Task 0.2 when:

- [x] Docker image builds without errors
- [x] `emcc --version` shows Emscripten 3.1.56
- [x] All tests in `npm run test:wasm` pass
- [x] Hello World loads and runs in browser
- [x] Model compilation generates working WASM

## Questions or Issues?

1. Check `__tests__/wasm/README.md` for detailed docs
2. Review test output for specific error messages
3. Check Docker logs: `docker ps -a` then `docker logs <container-id>`
4. Verify Docker has enough resources (4GB+ RAM recommended)

---

**Status**: Task 0.1 Complete ✅
**Next**: Task 0.2 - WASM Cache Infrastructure
**Updated**: 2024-03-XX
