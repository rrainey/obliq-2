# WASM Setup Instructions - Quick Reference

## What Was Implemented

Task 0.1 from the WASM Implementation Roadmap is now **complete**. The Emscripten development environment has been set up with full Docker support, automated testing, and browser verification.

## How to Verify Everything Works

### Step 1: Build the Docker Image

Open a terminal in the project root and run:

```bash
npm run wasm:build-docker
```

**Expected output**: You should see Docker building the image and eventually:
```
Successfully tagged obliq-emscripten:latest
```

**Time**: 5-10 minutes (first time only)

### Step 2: Run the Automated Tests

```bash
npm run test:wasm
```

**Expected output**: All tests should pass with output like:
```
PASS  __tests__/wasm/emscripten-setup.test.ts
PASS  __tests__/wasm/model-compilation.test.ts

Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
```

**Time**: 1-3 minutes

### Step 3: Test in Browser (Optional but Recommended)

#### 3a. Compile the Hello World example

**On Windows:**
```cmd
__tests__\wasm\scripts\compile-hello-docker.bat
```

**On Linux/Mac:**
```bash
chmod +x __tests__/wasm/scripts/compile-hello-docker.sh
__tests__/wasm/scripts/compile-hello-docker.sh
```

**Expected output**:
```
=== Compilation successful! ===
Generated files:
  hello.js
  hello.wasm
```

#### 3b. Start a web server

```bash
cd __tests__/wasm/fixtures
python -m http.server 8000
```

Or use Node's http-server:
```bash
npx http-server __tests__/wasm/fixtures -p 8000
```

#### 3c. Open in browser

Navigate to: **http://localhost:8000/hello.html**

**Expected result**:
- Green success message: "✓ WebAssembly module loaded successfully!"
- All test results show "✓ PASS"
- Manual test buttons work when clicked

## What's Next?

With Task 0.1 complete, you're ready for **Task 0.2: WASM Cache Infrastructure**

See [docs/wasm-task-0.1-completion-summary.md](docs/wasm-task-0.1-completion-summary.md) for full details.

## Need Help?

- **Quick Start Guide**: [`__tests__/wasm/QUICKSTART.md`](__tests__/wasm/QUICKSTART.md)
- **Full Documentation**: [`__tests__/wasm/README.md`](__tests__/wasm/README.md)
- **Troubleshooting**: Check the README for common issues

## Common Issues

### Docker not running
**Error**: `Cannot connect to Docker daemon`
**Fix**: Start Docker Desktop and try again

### Port 8000 in use
**Fix**: Use a different port:
```bash
python -m http.server 8080
# Then visit http://localhost:8080/hello.html
```

### Tests timeout
**Fix**:
1. Ensure Docker has enough resources (4GB+ RAM)
2. Re-run the test - subsequent runs are faster

---

**Status**: Task 0.1 ✅ Complete
**Next**: Task 0.2 - WASM Cache Infrastructure
