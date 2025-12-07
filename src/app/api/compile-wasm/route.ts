/**
 * WASM Compilation API
 *
 * Endpoint: POST /api/compile-wasm
 *
 * Compiles a model to WebAssembly using Emscripten.
 *
 * Request body:
 * {
 *   modelId: string,          // UUID of the model
 *   version?: number,          // Optional version (defaults to latest)
 *   optimizationLevel?: string // 'O0' | 'O1' | 'O2' | 'O3' (default: 'O2')
 *   noCache?: boolean          // Skip cache lookup and force recompilation (default: false)
 * }
 *
 * Response:
 * - 200: JSON with { wasmData, jsData, metadata, cacheHit }
 * - 400: Validation error
 * - 404: Model not found
 * - 500: Compilation error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { SupabaseCacheManager, generateCacheKey, hashModel } from '@/lib/wasm/cache'
import { withErrorHandling, AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const execAsync = promisify(exec)

// Create server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
})

// Docker image for Emscripten compilation
const DOCKER_IMAGE = 'obliq-emscripten:latest'

// Compilation timeout (30 seconds)
const COMPILATION_TIMEOUT = 30000

async function compileWasmHandler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()
  console.log('[compile-wasm] API called')

  // Parse and validate request body
  let requestBody: any
  try {
    requestBody = await request.json()
  } catch (error) {
    throw new AppError(
      'Invalid JSON in request body',
      400,
      ErrorTypes.VALIDATION_ERROR
    )
  }

  // Validate required fields
  validateRequiredFields(requestBody, ['modelId'])

  const { modelId, version, optimizationLevel = 'O2', noCache = false } = requestBody

  // Validate optimization level
  if (!['O0', 'O1', 'O2', 'O3'].includes(optimizationLevel)) {
    throw new AppError(
      'Invalid optimization level. Must be O0, O1, O2, or O3',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { providedLevel: optimizationLevel }
    )
  }

  // Validate modelId format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(modelId)) {
    throw new AppError(
      'Invalid model ID format',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { providedModelId: modelId }
    )
  }

  console.log(`[compile-wasm] Fetching model: ${modelId}`)

  // Fetch model metadata
  const { data: model, error: dbError } = await supabaseServer
    .from('models')
    .select('*')
    .eq('id', modelId)
    .single()

  if (dbError || !model) {
    throw new AppError(
      'Model not found',
      404,
      ErrorTypes.NOT_FOUND,
      { modelId, dbError }
    )
  }

  console.log(`[compile-wasm] Model found: ${model.name}`)

  // Determine version to use
  const versionToUse = version || model.latest_version || 1

  // Fetch version data
  const { data: versionData, error: versionError } = await supabaseServer
    .from('model_versions')
    .select('*')
    .eq('model_id', modelId)
    .eq('version', versionToUse)
    .single()

  if (versionError || !versionData) {
    throw new AppError(
      `Version ${versionToUse} not found for this model`,
      404,
      ErrorTypes.NOT_FOUND,
      { modelId, requestedVersion: versionToUse }
    )
  }

  // Validate model structure
  if (!versionData.data || !versionData.data.sheets || !Array.isArray(versionData.data.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name }
    )
  }

  const sheets = versionData.data.sheets

  // Generate cache key
  const cacheKey = generateCacheKey(modelId, { sheets }, { optimizationLevel })
  console.log(`[compile-wasm] Cache key: ${cacheKey}`)

  // Check cache (unless noCache is set)
  const cacheManager = new SupabaseCacheManager()

  if (!noCache) {
    const cachedResult = await cacheManager.get(cacheKey)

    if (cachedResult) {
      console.log(`[compile-wasm] Cache HIT (${Date.now() - startTime}ms)`)

      // Log cache hit metric
      await cacheManager.logCompilationMetric({
        modelId,
        cacheHit: true,
        blockCount: sheets.flatMap((s: any) => s.blocks).length,
        optimizationLevel
      })

      // Return cached result
      return NextResponse.json({
        wasmData: cachedResult.wasmData.toString('base64'),
        jsData: cachedResult.jsData.toString('base64'),
        metadata: {
          ...cachedResult.metadata,
          cacheHit: true,
          retrievalTime: Date.now() - startTime,
          modelName: model.name,
          cacheKey
        }
      })
    }

    console.log(`[compile-wasm] Cache MISS - compiling...`)
  } else {
    console.log(`[compile-wasm] Cache BYPASSED (noCache=true) - compiling...`)
  }

  // Generate C code using WasmCodeGenerator
  let generatedCode: {
    header: string
    source: string
    wasmWrapper: string
    inputMap: Map<string, number>
    outputMap: Map<string, number>
    subsystemFiles: Array<{
      header: string
      source: string
      subsystemName: string
      warnings: string[]
    }>
  }

  try {
    const generator = new WasmCodeGenerator({
      modelName: sanitizeModelName(model.name),
      includeEmscriptenExports: true,
      includeDebugFunctions: false
    })

    generatedCode = generator.generateWasm(sheets)
    console.log(`[compile-wasm] Code generated (${Date.now() - startTime}ms)`)
  } catch (error) {
    throw new AppError(
      'Failed to generate C code',
      500,
      ErrorTypes.INTERNAL_ERROR,
      {
        modelId,
        originalError: error instanceof Error ? error.message : 'Unknown error'
      }
    )
  }

  // Create temporary directory for compilation
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm-compile-'))
  console.log(`[compile-wasm] Temp dir: ${tempDir}`)

  try {
    // Write C files to temp directory
    const safeName = sanitizeModelName(model.name)
    const headerPath = path.join(tempDir, `${safeName}.h`)
    const sourcePath = path.join(tempDir, `${safeName}.c`)
    const wrapperPath = path.join(tempDir, `${safeName}_wasm.c`)

    await fs.writeFile(headerPath, generatedCode.header)
    await fs.writeFile(sourcePath, generatedCode.source)
    await fs.writeFile(wrapperPath, generatedCode.wasmWrapper)

    // Write subsystem files (for segregated subsystems)
    const subsystemSourceFiles: string[] = []
    if (generatedCode.subsystemFiles && generatedCode.subsystemFiles.length > 0) {
      for (const subFile of generatedCode.subsystemFiles) {
        const subHeaderPath = path.join(tempDir, `${subFile.subsystemName}.h`)
        const subSourcePath = path.join(tempDir, `${subFile.subsystemName}.c`)
        await fs.writeFile(subHeaderPath, subFile.header)
        await fs.writeFile(subSourcePath, subFile.source)
        subsystemSourceFiles.push(`${subFile.subsystemName}.c`)
      }
    }

    console.log(`[compile-wasm] Files written to disk (${subsystemSourceFiles.length} subsystems)`)

    // Compile with Emscripten using Docker
    const outputPath = path.join(tempDir, `${safeName}.js`)
    const wasmOutputPath = path.join(tempDir, `${safeName}.wasm`)

    // Build emcc command
    const isWindows = process.platform === 'win32'
    const volumeMount = isWindows
      ? tempDir.replace(/\\/g, '/') // Convert Windows paths to Unix-style for Docker
      : tempDir

    // Build list of source files (main + wrapper + subsystems)
    const sourceFiles = [
      `/workspace/${safeName}.c`,
      `/workspace/${safeName}_wasm.c`,
      ...subsystemSourceFiles.map(f => `/workspace/${f}`)
    ].join(' ')

    const emccCmd = `docker run --rm -v "${volumeMount}:/workspace" ${DOCKER_IMAGE} ` +
      `emcc ${sourceFiles} ` +
      `-I/workspace -o /workspace/${safeName}.js ` +
      `-s WASM=1 ` +
      `-s "EXPORTED_FUNCTIONS=[\\"_wasm_init\\",\\"_wasm_set_input\\",\\"_wasm_get_output\\",\\"_wasm_step\\",\\"_wasm_get_time\\",\\"_wasm_get_collector_count\\",\\"_wasm_get_collector_name\\",\\"_wasm_get_sample_count\\",\\"_wasm_get_sample_write_index\\",\\"_wasm_get_max_samples\\",\\"_wasm_get_last_sample_time\\",\\"_wasm_get_samples\\",\\"_wasm_get_element_size\\",\\"_wasm_cleanup\\",\\"_malloc\\",\\"_free\\"]" ` +
      `-s "EXPORTED_RUNTIME_METHODS=[\\"ccall\\",\\"cwrap\\",\\"UTF8ToString\\"]" ` +
      `-s MODULARIZE=1 ` +
      `-s "EXPORT_NAME=createModule" ` +
      `-s ALLOW_MEMORY_GROWTH=1 ` +
      `-s INITIAL_MEMORY=16MB ` +
      `-${optimizationLevel} -lm`

    console.log(`[compile-wasm] Executing emcc...`)

    // Execute compilation with timeout
    let stdout: string
    let stderr: string

    try {
      const result = await execAsync(emccCmd, { timeout: COMPILATION_TIMEOUT })
      stdout = result.stdout
      stderr = result.stderr

      if (stderr && !stderr.includes('cache:INFO')) {
        console.warn(`[compile-wasm] Compilation warnings: ${stderr}`)
      }
    } catch (error: any) {
      console.error(`[compile-wasm] Compilation failed:`, error)

      // Parse emcc error message
      const errorMessage = error.stderr || error.message || 'Unknown compilation error'

      throw new AppError(
        `WASM compilation failed: ${errorMessage}`,
        500,
        ErrorTypes.INTERNAL_ERROR,
        {
          modelId,
          modelName: model.name,
          emccError: errorMessage,
          command: 'emcc'
        }
      )
    }

    console.log(`[compile-wasm] Compilation successful (${Date.now() - startTime}ms)`)

    // Read compiled files
    const wasmData = await fs.readFile(wasmOutputPath)
    const jsData = await fs.readFile(outputPath)

    console.log(`[compile-wasm] WASM size: ${wasmData.length} bytes, JS size: ${jsData.length} bytes`)

    // Store in cache
    const compilationTime = Date.now() - startTime
    const modelHash = hashModel({ sheets })

    await cacheManager.store(
      cacheKey,
      modelId,
      wasmData,
      jsData,
      {
        modelHash,
        compilationTime,
        optimizationLevel,
        wasmSize: wasmData.length,
        jsSize: jsData.length,
        blockCount: sheets.flatMap((s: any) => s.blocks).length
      }
    )

    console.log(`[compile-wasm] Stored in cache`)

    // Log compilation metric
    await cacheManager.logCompilationMetric({
      modelId,
      cacheHit: false,
      compilationTime,
      blockCount: sheets.flatMap((s: any) => s.blocks).length,
      optimizationLevel
    })

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true })

    // Return compiled result
    return NextResponse.json({
      wasmData: wasmData.toString('base64'),
      jsData: jsData.toString('base64'),
      metadata: {
        modelName: model.name,
        version: versionToUse,
        cacheKey,
        cacheHit: false,
        compilationTime,
        wasmSize: wasmData.length,
        jsSize: jsData.length,
        optimizationLevel,
        blockCount: sheets.flatMap((s: any) => s.blocks).length,
        inputMap: Array.from(generatedCode.inputMap.entries()),
        outputMap: Array.from(generatedCode.outputMap.entries())
      }
    })
  } catch (error) {
    // Clean up temp directory on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (cleanupError) {
      console.error(`[compile-wasm] Failed to clean up temp dir:`, cleanupError)
    }

    // Re-throw if it's already an AppError
    if (error instanceof AppError) {
      throw error
    }

    // Wrap unexpected errors
    throw new AppError(
      'Unexpected error during WASM compilation',
      500,
      ErrorTypes.INTERNAL_ERROR,
      {
        originalError: error instanceof Error ? error.message : 'Unknown error'
      }
    )
  }
}

/**
 * Sanitize model name for use as C identifier
 */
function sanitizeModelName(name: string): string {
  // Replace non-alphanumeric characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9]/g, '_')

  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = '_' + sanitized
  }

  return sanitized
}

// Export the wrapped handler
export const POST = withErrorHandling(compileWasmHandler, 'compile-wasm')
