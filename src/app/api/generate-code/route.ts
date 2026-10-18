// app/api/generate-code/route.ts - With versioning support and authentication

import { NextRequest, NextResponse } from 'next/server'
import { ModelCodeGenerator } from '@/lib/codeGenerationNew'
import { withErrorHandling, AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import {
  getStorage,
  ModelNotFoundError,
  ModelFileMissingError,
  InvalidModelFileError,
  type ModelData
} from '@/lib/server/storage'
import JSZip from 'jszip'

export const runtime = 'nodejs'

async function generateCodeHandler(request: NextRequest): Promise<NextResponse> {
  console.log('Generate code API called')

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
    console.log('Request body:', requestBody)
  } catch (error) {
    throw new AppError(
      'Invalid JSON in request body',
      400,
      ErrorTypes.VALIDATION_ERROR
    )
  }

  // Validate required fields
  validateRequiredFields(requestBody, ['modelId'])

  const { modelId, version } = requestBody

  // Validate modelId format (should be UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(modelId)) {
    throw new AppError(
      'Invalid model ID format',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { providedModelId: modelId }
    )
  }

  console.log('Fetching model:', modelId)

  const { modelName, versionToUse, data: modelData } = loadModelSource(modelId, version)
  const model = { name: modelName }

  console.log('Model found:', model.name)
  console.log('Using version:', versionToUse)

  // Validate version data structure
  if (!modelData || !modelData.sheets || !Array.isArray(modelData.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name, version: versionToUse }
    )
  }

  // Extract the main sheet, parameters, and global settings
  const sheets = modelData.sheets
  const parameters = modelData.parameters || [] // Feature 3
  const globalSettings = modelData.globalSettings || {}
  const integrationAlgorithm = globalSettings.integrationAlgorithm || 'rk4'
  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

  if (!mainSheet) {
    throw new AppError(
      'No sheets found in model',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name, availableSheets: sheets.length, version: versionToUse }
    )
  }

  // Validate sheet has blocks
  const blocks = mainSheet.blocks || []
  if (blocks.length === 0) {
    throw new AppError(
      'Cannot generate code: model contains no blocks',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name, sheetName: mainSheet.name, version: versionToUse }
    )
  }

  console.log('Generating code for', blocks.length, 'blocks')

  // In the route.ts, before instantiating CodeGenerator:
  console.log('Sheets structure:', sheets.map((s: any) => ({
    id: s.id,
    name: s.name,
    hasBlocks: !!s.blocks,
    blocksCount: s.blocks?.length || 0,
    hasConnections: !!s.connections,
    connectionsCount: s.connections?.length || 0
  })))

  // Generate the code
  let codeGenerator: ModelCodeGenerator
  try {
    codeGenerator = new ModelCodeGenerator({
      integrationAlgorithm: integrationAlgorithm as 'euler' | 'rk4'
    })
  } catch (error) {
    throw new AppError(
      'Failed to initialize code generator',
      500,
      ErrorTypes.INTERNAL_ERROR,
      { originalError: error instanceof Error ? error.message : 'Unknown error' }
    )
  }

  //console.log('CodeGenerator instantiated successfully')

  const result = codeGenerator.generateCode(sheets, model.name, parameters)

  //console.log('generateCode result:', result)

  const safeName = sanitizeFilename(model.name)

  // Log warnings but don't fail - allow users to inspect generated code
  if (result.warnings.length > 0) {
    console.log('Code generation warnings:', result.warnings)
  }

  // Validate generated files
  /*
  if (!result.files || result.files.length === 0) {
    throw new AppError(
      'Code generation produced no files',
      500,
      ErrorTypes.INTERNAL_ERROR,
      { modelId, modelName: model.name, version: versionToUse }
    )
  }
  */

  // Create ZIP file
  let zip: JSZip
  let zipBuffer: Buffer

  try {
    zip = new JSZip()

    // Add main model files
    zip.file(`${safeName}.h`, result.header)
    zip.file(`${safeName}.c`, result.source)

    // Add segregated subsystem files
    if (result.subsystemFiles && result.subsystemFiles.length > 0) {
      console.log(`Adding ${result.subsystemFiles.length} subsystem file(s) to ZIP`)
      for (const subFile of result.subsystemFiles) {
        zip.file(`${subFile.subsystemName}.h`, subFile.header)
        zip.file(`${subFile.subsystemName}.c`, subFile.source)
      }
    }

    zip.file('library.properties', `name=${safeName}\nversion=${versionToUse}\ndescription=Generated C library for ${model.name}\n\n`)

    // Add a README file
    const readmeContent = generateReadmeContent(model.name, versionToUse, result.subsystemFiles)
    zip.file('README.md', readmeContent)

    // Generate the ZIP buffer
    zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  } catch (error) {
    throw new AppError(
      'Failed to create ZIP file',
      500,
      ErrorTypes.INTERNAL_ERROR,
      { 
        originalError: error instanceof Error ? error.message : 'Unknown error',
        modelId,
        modelName: model.name,
        version: versionToUse
      }
    )
  }

  console.log('ZIP created, sending response')

  // Return the ZIP file
  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(model.name)}_v${versionToUse}_library.zip"`
    }
  })
}

function generateReadmeContent(
  modelName: string,
  version: number,
  subsystemFiles?: Array<{ subsystemName: string }>
): string {
  // Build file list
  let filesList = `- ${modelName}.h - Header file with data structures and function declarations
- ${modelName}.c - Implementation file with the model logic`

  if (subsystemFiles && subsystemFiles.length > 0) {
    filesList += '\n\n### Segregated Subsystems:'
    for (const sub of subsystemFiles) {
      filesList += `\n- ${sub.subsystemName}.h - Subsystem header`
      filesList += `\n- ${sub.subsystemName}.c - Subsystem implementation`
    }
  }

  filesList += '\n- library.properties - PlatformIO library configuration'

  return `# ${modelName} - Generated C Library (Version ${version})

This library was automatically generated from a visual block diagram model.

## Files:
${filesList}

## Version Information:
- Model: ${modelName}
- Version: ${version}
- Generated on: ${new Date().toISOString()}

## Usage:
1. Include this library in your PlatformIO project
2. Include the header: #include "${modelName}.h"
3. Create an instance: ${modelName}_t model_instance;
4. Initialize: ${modelName}_init(&model_instance, 0.01); // 10ms time step
5. In your main loop: ${modelName}_step(&model_instance);

## Example:
\`\`\`c
#include "${modelName}.h"

${modelName}_t model;

void setup() {
  ${modelName}_init(&model, 0.01); // 10ms time step
}

void loop() {
  // Set inputs
  model.inputs.Input1 = analogRead(A0) / 1023.0;

  // Execute one step
  ${modelName}_step(&model);

  // Use outputs
  analogWrite(9, (int)(model.outputs.Output1 * 255));

  delay(10); // Match the time step
}
\`\`\`
`
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

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Export the wrapped handler
export const POST = withErrorHandling(generateCodeHandler, 'generate-code')