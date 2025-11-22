#!/bin/bash
# Script to compile hello.c to WebAssembly using Emscripten

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../fixtures"
OUTPUT_DIR="$FIXTURES_DIR"

echo "=== Compiling hello.c to WebAssembly ==="
echo "Source: $FIXTURES_DIR/hello.c"
echo "Output: $OUTPUT_DIR/hello.{js,wasm}"
echo ""

# Compile with Emscripten
emcc "$FIXTURES_DIR/hello.c" \
  -o "$OUTPUT_DIR/hello.js" \
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
ls -lh "$OUTPUT_DIR/hello.js" "$OUTPUT_DIR/hello.wasm"
echo ""
echo "To test in browser:"
echo "1. Start a local web server in $FIXTURES_DIR"
echo "   Example: python -m http.server 8000"
echo "2. Open http://localhost:8000/hello.html"
echo ""
