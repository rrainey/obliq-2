# PowerShell script to compile hello.c to WebAssembly using Docker + Emscripten

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Resolve-Path "$ScriptDir\..\..\..\"
$FixturesDir = Join-Path $ProjectRoot "__tests__\wasm\fixtures"

Write-Host "=== Compiling hello.c to WebAssembly (in Docker) ===" -ForegroundColor Green
Write-Host "Fixtures directory: $FixturesDir"

# Run Docker with volume mount
docker run --rm `
    -v "${FixturesDir}:/workspace" `
    obliq-emscripten:latest `
    emcc /workspace/hello.c `
        -o /workspace/hello.js `
        -s WASM=1 `
        -s 'EXPORTED_FUNCTIONS=["_add","_multiply","_compute_sin","_main","_malloc","_free"]' `
        -s 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]' `
        -s MODULARIZE=1 `
        -s EXPORT_NAME='createModule' `
        -s ALLOW_MEMORY_GROWTH=1 `
        -s INITIAL_MEMORY=16MB `
        -O2 `
        -lm

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Compilation failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Compilation successful! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Generated files:"
Get-ChildItem "$FixturesDir\hello.js", "$FixturesDir\hello.wasm" | ForEach-Object {
    Write-Host "  $($_.Name) - $([math]::Round($_.Length / 1KB, 2)) KB"
}
Write-Host ""
Write-Host "To test in browser:" -ForegroundColor Cyan
Write-Host "1. cd $FixturesDir"
Write-Host "2. python -m http.server 8000"
Write-Host "3. Open http://localhost:8000/hello.html"
Write-Host ""
