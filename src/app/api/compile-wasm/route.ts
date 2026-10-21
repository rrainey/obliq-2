/**
 * WASM Compilation API
 *
 * Endpoint: POST /api/compile-wasm
 *
 * Compiles a model to WebAssembly using Emscripten.
 *
 * Authentication: Bearer token required (Authorization: Bearer <token>)
 *
 * Request body:
 * {
 *   modelId: string,          // UUID of the model
 *   version?: number,          // Optional saved version (defaults to the current model file)
 *   optimizationLevel?: string // 'O0' | 'O1' | 'O2' | 'O3' (default: 'O2')
 *   noCache?: boolean          // Skip cache lookup and force recompilation (default: false)
 * }
 *
 * Response:
 * - 200: JSON with { wasmData, jsData, metadata, cacheHit }
 * - 400: Validation error
 * - 401: Unauthorized
 * - 404: Model not found
 * - 500: Compilation error
 */

import { NextRequest, NextResponse } from 'next/server'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { FileCacheManager, generateCacheKey, hashModel } from '@/lib/wasm/cache'
import { withErrorHandling, AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import {
  getStorage,
  ModelNotFoundError,
  ModelFileMissingError,
  InvalidModelFileError,
  type ModelData
} from '@/lib/server/storage'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { emccExportedFunctionsArg } from '@/lib/wasm/wasmExports'
import { expandForBuild, ModelReferenceError } from '@/lib/server/modelReferenceLoader'

const execAsync = promisify(exec)

export const runtime = 'nodejs'

// Docker image for Emscripten compilation
const DOCKER_IMAGE = 'obliq-emscripten:latest'

// Compilation timeout (30 seconds)
const COMPILATION_TIMEOUT = 30000

async function compileWasmHandler(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()
  console.log('[compile-wasm] API called')

  // Browser session (cookie / JWT) or user API token
  const authResult = await authenticateRequest(request)
  if (!authResult.authenticated) {
    throw new AppError(
      authResult.error || 'Authentication required',
      401,
      ErrorTypes.UNAUTHORIZED
    )
  }

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

  const { modelName, versionToUse, data: modelData } = loadModelSource(modelId, version)
  const model = { name: modelName }

  console.log(`[compile-wasm] Model found: ${model.name}`)

  // Validate model structure
  if (!modelData || !modelData.sheets || !Array.isArray(modelData.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name }
    )
  }

  const sheets = modelData.sheets
  const debugMath = !!modelData.globalSettings?.debugMath

  // Generate cache key (debugMath changes codegen → separate cache entry)
  const integrationAlgorithm = modelData.globalSettings?.integrationAlgorithm === 'euler' ? 'euler' : 'rk4'
  const cacheKey = generateCacheKey(modelId, { sheets }, {
    optimizationLevel,
    includeDebugInfo: debugMath,
    integrationAlgorithm
  })
  console.log(`[compile-wasm] Cache key: ${cacheKey}${debugMath ? ' (debugMath)' : ''}`)

  // Check cache (unless noCache is set)
  const cacheManager = new FileCacheManager()

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
      includeDebugFunctions: false,
      debugMath,
      integrationAlgorithm
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
      emccExportedFunctionsArg() +
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
 * Load model content from local storage. A specific version reads that saved
 * snapshot; version 0 reads the autosave; otherwise the current model file
 * (authoritative, possibly newer than the latest snapshot) is used.
 */
function loadModelSource(
  modelId: string,
  version?: number | null
): { modelName: string; versionToUse: number; data: ModelData } {
  const source = loadRawModelSource(modelId, version)
  // Model references are expanded from the store before code generation
  try {
    return { ...source, data: expandForBuild(getStorage(), source.data, source.modelName).data }
  } catch (error) {
    if (error instanceof ModelReferenceError) {
      throw new AppError(error.message, 422, ErrorTypes.VALIDATION_ERROR, { modelId })
    }
    throw error
  }
}

function loadRawModelSource(
  modelId: string,
  version?: number | null
): { modelName: string; versionToUse: number; data: ModelData } {
  const storage = getStorage()
  try {
    if (version === 0) {
      const autosave = storage.models.getAutosave(modelId)
      if (autosave) {
        return { modelName: storage.models.require(modelId).name, versionToUse: 0, data: autosave.data }
      }
    } else if (version != null) {
      const record = storage.models.require(modelId)
      return { modelName: record.name, versionToUse: version, data: storage.models.getVersion(modelId, version) }
    }
    const current = storage.models.readCurrent(modelId)
    return { modelName: current.record.name, versionToUse: current.record.latest_version, data: current.data }
  } catch (error) {
    if (error instanceof ModelNotFoundError) {
      if (version != null && storage.models.get(modelId)) {
        throw new AppError(
          `Version ${version} not found for this model`,
          404,
          ErrorTypes.NOT_FOUND,
          { modelId, requestedVersion: version }
        )
      }
      throw new AppError('Model not found', 404, ErrorTypes.NOT_FOUND, { modelId })
    }
    if (error instanceof ModelFileMissingError) {
      throw new AppError(error.message, 404, ErrorTypes.NOT_FOUND, { modelId, filePath: error.filePath })
    }
    if (error instanceof InvalidModelFileError) {
      throw new AppError(error.message, 422, ErrorTypes.VALIDATION_ERROR, { modelId })
    }
    throw error
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
