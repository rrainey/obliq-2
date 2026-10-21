/**
 * WASM Compilation API with Server-Sent Events
 *
 * Endpoint: POST /api/compile-wasm-stream
 *
 * Streams compilation progress using Server-Sent Events (SSE).
 *
 * Authentication: Bearer token required (Authorization: Bearer <token>)
 *
 * Request body:
 * {
 *   modelId: string,          // UUID of the model
 *   version?: number,          // Optional saved version; 0 = autosave (defaults to the current model file)
 *   optimizationLevel?: string // 'O0' | 'O1' | 'O2' | 'O3' (default: 'O2')
 *   noCache?: boolean          // Skip cache lookup and force recompilation (default: false)
 * }
 *
 * Response: text/event-stream
 * Events:
 * - progress: { step: string, progress: number, message: string }
 * - complete: { wasmData: string, jsData: string, metadata: object }
 * - error: { error: string, details: object }
 */

import { NextRequest } from 'next/server'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { FileCacheManager, generateCacheKey, hashModel } from '@/lib/wasm/cache'
import { validateRequiredFields } from '@/lib/apiErrorHandler'
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

/**
 * Sanitize model name for use as C identifier
 */
function sanitizeModelName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9]/g, '_')
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = '_' + sanitized
  }
  return sanitized
}

/**
 * Send SSE event to client
 */
function sendEvent(controller: ReadableStreamDefaultController, event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  controller.enqueue(new TextEncoder().encode(message))
}

/**
 * Main compilation handler with progress streaming
 */
export async function POST(request: NextRequest) {
  // Accept browser session (cookie or access_token JWT) or user API token
  const authResult = await authenticateRequest(request)
  if (!authResult.authenticated) {
    return new Response(JSON.stringify({
      error: authResult.error || 'Authentication required. Sign in, or pass Authorization: Bearer <token>.'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Create a ReadableStream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now()

      try {
        // Parse and validate request body
        let requestBody: any
        try {
          requestBody = await request.json()
        } catch (error) {
          sendEvent(controller, 'error', {
            error: 'Invalid JSON in request body'
          })
          controller.close()
          return
        }

        // Validate required fields
        try {
          validateRequiredFields(requestBody, ['modelId'])
        } catch (error) {
          sendEvent(controller, 'error', {
            error: error instanceof Error ? error.message : 'Validation failed'
          })
          controller.close()
          return
        }

        const { modelId, version, optimizationLevel = 'O2', enableSimd = false, noCache = false } = requestBody

        // Validate optimization level
        if (!['O0', 'O1', 'O2', 'O3'].includes(optimizationLevel)) {
          sendEvent(controller, 'error', {
            error: 'Invalid optimization level. Must be O0, O1, O2, or O3'
          })
          controller.close()
          return
        }

        // Validate modelId format (UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(modelId)) {
          sendEvent(controller, 'error', {
            error: 'Invalid model ID format'
          })
          controller.close()
          return
        }

        // Step 1: Fetching model
        sendEvent(controller, 'progress', {
          step: 'fetch',
          progress: 10,
          message: 'Loading model...'
        })

        // Load model content. Explicit version: that saved snapshot; version 0:
        // the autosave (falls back to the model file); otherwise the current
        // model file, which is authoritative.
        const storage = getStorage()
        let model: { name: string }
        let modelData: ModelData
        let versionToUse: number
        try {
          const autosave = version === 0 ? storage.models.getAutosave(modelId) : null
          if (autosave) {
            model = storage.models.require(modelId)
            modelData = autosave.data
            versionToUse = 0
          } else if (version != null && version !== 0) {
            model = storage.models.require(modelId)
            modelData = storage.models.getVersion(modelId, version)
            versionToUse = version
          } else {
            const current = storage.models.readCurrent(modelId)
            model = current.record
            modelData = current.data
            versionToUse = current.record.latest_version
          }
        } catch (error) {
          if (error instanceof ModelNotFoundError) {
            sendEvent(controller, 'error', version != null && storage.models.get(modelId)
              ? { error: `Version ${version} not found for this model` }
              : { error: 'Model not found', modelId })
          } else if (error instanceof ModelFileMissingError || error instanceof InvalidModelFileError) {
            sendEvent(controller, 'error', { error: error.message, modelId })
          } else {
            throw error
          }
          controller.close()
          return
        }
        console.log(`[compile-wasm-stream] Requested version: ${version}, using version: ${versionToUse}`)

        // Model references are expanded from the store before code generation
        if (modelData?.sheets) {
          try {
            modelData = expandForBuild(storage, modelData, model.name).data
          } catch (error) {
            if (error instanceof ModelReferenceError) {
              sendEvent(controller, 'error', { error: error.message, modelId })
              controller.close()
              return
            }
            throw error
          }
        }

        // Validate model structure
        if (!modelData || !modelData.sheets || !Array.isArray(modelData.sheets)) {
          sendEvent(controller, 'error', {
            error: 'Invalid model structure: missing or invalid sheets data'
          })
          controller.close()
          return
        }

        const sheets = modelData.sheets
        const parameters = modelData.parameters || [] // Feature 3
        const debugMath = !!modelData.globalSettings?.debugMath

        const integrationAlgorithm = modelData.globalSettings?.integrationAlgorithm === 'euler' ? 'euler' : 'rk4'
        const cacheKey = generateCacheKey(modelId, { sheets, parameters }, {
          optimizationLevel,
          enableSimd,
          includeDebugInfo: debugMath,
          integrationAlgorithm
        })
        console.log(`[compile-wasm-stream] Generated cache key: ${cacheKey}`)

        const cacheManager = new FileCacheManager()

        // Step 2: Checking cache (unless noCache is set)
        if (!noCache) {
          sendEvent(controller, 'progress', {
            step: 'cache-check',
            progress: 20,
            message: 'Checking compilation cache...'
          })

          const cachedResult = await cacheManager.get(cacheKey)
          console.log(`[compile-wasm-stream] Cache lookup result: ${cachedResult ? 'HIT' : 'MISS'}`)

          if (cachedResult) {
            // Cache hit - return immediately
            sendEvent(controller, 'progress', {
              step: 'cache-hit',
              progress: 100,
              message: 'Using cached compilation'
            })

            // Log cache hit metric
            await cacheManager.logCompilationMetric({
              modelId,
              cacheHit: true,
              blockCount: sheets.flatMap((s: any) => s.blocks).length,
              optimizationLevel
            })

            sendEvent(controller, 'complete', {
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

            controller.close()
            return
          }

          // Cache miss - proceed with compilation
          sendEvent(controller, 'progress', {
            step: 'cache-miss',
            progress: 25,
            message: 'Cache miss - starting compilation...'
          })
        } else {
          // Cache bypassed
          console.log(`[compile-wasm-stream] Cache BYPASSED (noCache=true)`)
          sendEvent(controller, 'progress', {
            step: 'cache-bypass',
            progress: 25,
            message: 'Cache bypassed - forcing recompilation...'
          })
        }

        // Step 3: Generate C code
        sendEvent(controller, 'progress', {
          step: 'codegen',
          progress: 30,
          message: 'Generating C code...'
        })

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

          generatedCode = generator.generateWasm(sheets, parameters)

          sendEvent(controller, 'progress', {
            step: 'codegen-complete',
            progress: 45,
            message: 'C code generated successfully'
          })
        } catch (error) {
          sendEvent(controller, 'error', {
            error: 'Failed to generate C code',
            details: error instanceof Error ? error.message : 'Unknown error'
          })
          controller.close()
          return
        }

        // Step 4: Write files and compile
        sendEvent(controller, 'progress', {
          step: 'write-files',
          progress: 50,
          message: 'Writing temporary files...'
        })

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm-compile-'))

        try {
          // Write C files
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

          // Step 5: Compile with Emscripten
          const simdLabel = enableSimd ? ', SIMD enabled' : ''
          sendEvent(controller, 'progress', {
            step: 'compile',
            progress: 60,
            message: `Compiling to WebAssembly (${optimizationLevel}${simdLabel})...`
          })

          const outputPath = path.join(tempDir, `${safeName}.js`)
          const wasmOutputPath = path.join(tempDir, `${safeName}.wasm`)

          const isWindows = process.platform === 'win32'
          const volumeMount = isWindows
            ? tempDir.replace(/\\/g, '/')
            : tempDir

          // Build SIMD flag if enabled
          const simdFlag = enableSimd ? '-msimd128 ' : ''

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
            `${simdFlag}-${optimizationLevel} -lm`

          try {
            const result = await execAsync(emccCmd, { timeout: COMPILATION_TIMEOUT })

            if (result.stderr && !result.stderr.includes('cache:INFO')) {
              console.warn(`[compile-wasm-stream] Compilation warnings: ${result.stderr}`)
            }

            sendEvent(controller, 'progress', {
              step: 'compile-complete',
              progress: 85,
              message: 'Compilation successful'
            })
          } catch (error: any) {
            const errorMessage = error.stderr || error.message || 'Unknown compilation error'

            sendEvent(controller, 'error', {
              error: 'WASM compilation failed',
              details: errorMessage
            })

            // Clean up
            await fs.rm(tempDir, { recursive: true, force: true })
            controller.close()
            return
          }

          // Step 6: Read compiled files
          sendEvent(controller, 'progress', {
            step: 'read-output',
            progress: 90,
            message: 'Reading compiled files...'
          })

          const wasmData = await fs.readFile(wasmOutputPath)
          const jsData = await fs.readFile(outputPath)

          // Step 7: Cache result
          sendEvent(controller, 'progress', {
            step: 'cache-store',
            progress: 95,
            message: 'Storing in cache...'
          })

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
              enableSimd,
              wasmSize: wasmData.length,
              jsSize: jsData.length,
              blockCount: sheets.flatMap((s: any) => s.blocks).length
            }
          )

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

          // Step 8: Complete
          sendEvent(controller, 'progress', {
            step: 'complete',
            progress: 100,
            message: 'Compilation complete!'
          })

          sendEvent(controller, 'complete', {
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
              enableSimd,
              blockCount: sheets.flatMap((s: any) => s.blocks).length,
              inputMap: Array.from(generatedCode.inputMap.entries()),
              outputMap: Array.from(generatedCode.outputMap.entries())
            }
          })

          controller.close()
        } catch (error) {
          // Clean up temp directory on error
          try {
            await fs.rm(tempDir, { recursive: true, force: true })
          } catch (cleanupError) {
            console.error(`[compile-wasm-stream] Failed to clean up temp dir:`, cleanupError)
          }

          sendEvent(controller, 'error', {
            error: 'Unexpected error during compilation',
            details: error instanceof Error ? error.message : 'Unknown error'
          })

          controller.close()
        }
      } catch (error) {
        sendEvent(controller, 'error', {
          error: 'Unexpected error',
          details: error instanceof Error ? error.message : 'Unknown error'
        })

        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
