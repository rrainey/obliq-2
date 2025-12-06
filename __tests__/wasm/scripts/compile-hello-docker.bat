@echo off
REM Script to compile hello.c to WebAssembly using Docker + Emscripten (Windows)

setlocal

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..\..
set DOCKER_DIR=%PROJECT_ROOT%\__tests__\wasm\docker
set FIXTURES_DIR=%PROJECT_ROOT%\__tests__\wasm\fixtures

echo === Building Emscripten Docker Image ===
docker build -t obliq-emscripten:latest -f "%DOCKER_DIR%\Dockerfile.emscripten" "%DOCKER_DIR%"

if %ERRORLEVEL% NEQ 0 (
    echo Error: Docker build failed
    exit /b 1
)

echo.
echo === Compiling hello.c to WebAssembly (in Docker) ===

REM Convert Windows path to Unix-style for Docker volume mount
for /f "delims=" %%i in ('wsl wslpath -a "%FIXTURES_DIR%"') do set UNIX_FIXTURES=%%i

docker run --rm -v "%FIXTURES_DIR%:/workspace" obliq-emscripten:latest emcc /workspace/hello.c -o /workspace/hello.js -s WASM=1 -s EXPORTED_FUNCTIONS='["_add","_multiply","_compute_sin","_main","_malloc","_free"]' -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' -s MODULARIZE=1 -s EXPORT_NAME='createModule' -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=16MB -O2 -lm

if %ERRORLEVEL% NEQ 0 (
    echo Error: Compilation failed
    exit /b 1
)

echo.
echo === Compilation successful! ===
echo.
echo Generated files in: %FIXTURES_DIR%
dir "%FIXTURES_DIR%\hello.js" "%FIXTURES_DIR%\hello.wasm"
echo.
echo To test in browser:
echo 1. cd %FIXTURES_DIR%
echo 2. python -m http.server 8000
echo 3. Open http://localhost:8000/hello.html
echo.

endlocal
