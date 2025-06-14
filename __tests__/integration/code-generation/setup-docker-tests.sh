#!/bin/bash
# __tests__/integration/code-generation/setup-docker-tests.sh

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DOCKER_DIR="$SCRIPT_DIR/docker"
MODELS_DIR="$SCRIPT_DIR/models"
PLATFORMIO_TEST_DIR="$SCRIPT_DIR/platformio-test"

echo "Setting up Docker-based code generation tests..."

# Create necessary directories
echo "Creating directories..."
mkdir -p "$DOCKER_DIR"
mkdir -p "$MODELS_DIR"
mkdir -p "$PLATFORMIO_TEST_DIR/src"
mkdir -p "$PLATFORMIO_TEST_DIR/lib"

# Create basic platformio.ini if it doesn't exist
if [ ! -f "$PLATFORMIO_TEST_DIR/platformio.ini" ]; then
    echo "Creating platformio.ini..."
    cat > "$PLATFORMIO_TEST_DIR/platformio.ini" << 'EOF'
[platformio]
default_envs = native

[env:native]
platform = native
build_flags = -std=c99 -Wall -Wextra
lib_compat_mode = off
lib_deps = 
EOF
fi

# Build Docker image
echo "Building Docker image..."
docker build -t platformio-test -f "$DOCKER_DIR/Dockerfile.platformio" "$DOCKER_DIR"

echo "Setup complete!"
echo ""
echo "To run tests:"
echo "  npm run test:codegen"
echo ""
echo "To add new test models:"
echo "  Place JSON files in: $MODELS_DIR"
echo ""
echo "Model JSON files should follow this structure:"
echo "  - sheets: array of sheet definitions"
echo "  - metadata.testInputs: object with input port values for testing"
echo "  - metadata.expectedOutput: expected output value for validation"