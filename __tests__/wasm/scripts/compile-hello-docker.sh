#!/bin/bash
# Script to compile hello.c to WebAssembly using Docker + Emscripten

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/__tests__/wasm/docker"
FIXTURES_DIR="$PROJECT_ROOT/__tests__/wasm/fixtures"

echo "=== Building Emscripten Docker Image ==="
docker build -t obliq-emscripten:latest -f "$DOCKER_DIR/Dockerfile.emscripten" "$DOCKER_DIR"

echo ""
echo "=== Compiling hello.c to WebAssembly (in Docker) ==="

# Run Emscripten compilation in Docker container
docker run --rm \
  -v "$FIXTURES_DIR:/workspace" \
  obliq-emscripten:latest \
  emcc /workspace/hello.c \
    -o /workspace/hello.js \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS='["_add","_multiply","_compute_sin","_main","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
    -s MODULARIZE=1 \
    -s EXPORT_NAME='createModule' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=16MB \
    -O2 \
    -lm

echo ""
echo "=== Compilation successful! ==="
echo ""
echo "Generated files:"
ls -lh "$FIXTURES_DIR/hello.js" "$FIXTURES_DIR/hello.wasm"
echo ""
echo "To test in browser:"
echo "1. cd $FIXTURES_DIR"
echo "2. python -m http.server 8000"
echo "3. Open http://localhost:8000/hello.html"
echo ""
