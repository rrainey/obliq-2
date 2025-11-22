/**
 * WASM Compilation API with Server-Sent Events
 *
 * Endpoint: POST /api/compile-wasm-stream
 *
 * Streams compilation progress using Server-Sent Events (SSE).
 *
 * Request body:
 * {
 *   modelId: string,          // UUID of the model
 *   version?: number,          // Optional version (defaults to latest)
 *   optimizationLevel?: string // 'O0' | 'O1' | 'O2' | 'O3' (default: 'O2')
 * }
 *
 * Response: text/event-stream
 * Events:
 * - progress: { step: string, progress: number, message: string }
 * - complete: { wasmData: string, jsData: string, metadata: object }
 * - error: { error: string, details: object }
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { SupabaseCacheManager, generateCacheKey, hashModel } from '@/lib/wasm/cache'
import { AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
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

        const { modelId, version, optimizationLevel = 'O2' } = requestBody

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
          message: 'Fetching model from database...'
        })

        const { data: model, error: dbError } = await supabaseServer
          .from('models')
          .select('*')
          .eq('id', modelId)
          .single()

        if (dbError || !model) {
          sendEvent(controller, 'error', {
            error: 'Model not found',
            modelId
          })
          controller.close()
          return
        }

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
          sendEvent(controller, 'error', {
            error: `Version ${versionToUse} not found for this model`
          })
          controller.close()
          return
        }

        // Validate model structure
        if (!versionData.data || !versionData.data.sheets || !Array.isArray(versionData.data.sheets)) {
          sendEvent(controller, 'error', {
            error: 'Invalid model structure: missing or invalid sheets data'
          })
          controller.close()
          return
        }

        const sheets = versionData.data.sheets

        // Step 2: Checking cache
        sendEvent(controller, 'progress', {
          step: 'cache-check',
          progress: 20,
          message: 'Checking compilation cache...'
        })

        const cacheKey = generateCacheKey(modelId, { sheets }, { optimizationLevel })
        const cacheManager = new SupabaseCacheManager()
        const cachedResult = await cacheManager.get(cacheKey)

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
        }

        try {
          const generator = new WasmCodeGenerator({
            modelName: sanitizeModelName(model.name),
            includeEmscriptenExports: true,
            includeDebugFunctions: false
          })

          generatedCode = generator.generateWasm(sheets)

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

          // Step 5: Compile with Emscripten
          sendEvent(controller, 'progress', {
            step: 'compile',
            progress: 60,
            message: `Compiling to WebAssembly (${optimizationLevel})...`
          })

          const outputPath = path.join(tempDir, `${safeName}.js`)
          const wasmOutputPath = path.join(tempDir, `${safeName}.wasm`)

          const isWindows = process.platform === 'win32'
          const volumeMount = isWindows
            ? tempDir.replace(/\\/g, '/')
            : tempDir

          const emccCmd = `docker run --rm -v "${volumeMount}:/workspace" ${DOCKER_IMAGE} ` +
            `emcc /workspace/${safeName}.c /workspace/${safeName}_wasm.c ` +
            `-I/workspace -o /workspace/${safeName}.js ` +
            `-s WASM=1 ` +
            `-s "EXPORTED_FUNCTIONS=[\\"_wasm_init\\",\\"_wasm_set_input\\",\\"_wasm_get_output\\",\\"_wasm_step\\",\\"_wasm_get_time\\",\\"_malloc\\",\\"_free\\"]" ` +
            `-s "EXPORTED_RUNTIME_METHODS=[\\"ccall\\",\\"cwrap\\"]" ` +
            `-s MODULARIZE=1 ` +
            `-s "EXPORT_NAME=createModule" ` +
            `-s ALLOW_MEMORY_GROWTH=1 ` +
            `-s INITIAL_MEMORY=16MB ` +
            `-${optimizationLevel} -lm`

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
