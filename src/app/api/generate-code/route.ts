// app/api/generate-code/route.ts - With versioning support

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CodeGenerator } from '@/lib/codeGeneration'
import { withErrorHandling, AppError, ErrorTypes, validateRequiredFields } from '@/lib/apiErrorHandler'
import JSZip from 'jszip'

// Create a server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
})

async function generateCodeHandler(request: NextRequest): Promise<NextResponse> {
  console.log('Generate code API called')
  
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

  // Fetch the model metadata from the database using service role key
  const { data: model, error: dbError } = await supabaseServer
    .from('models')
    .select('*')
    .eq('id', modelId)
    .single()

  if (dbError) {
    console.error('Database error:', dbError)
    throw new AppError(
      dbError.message || 'Database error',
      dbError.code === 'PGRST116' ? 404 : 500,
      dbError.code === 'PGRST116' ? ErrorTypes.NOT_FOUND : ErrorTypes.DATABASE_ERROR,
      { modelId, dbError }
    )
  }

  if (!model) {
    throw new AppError(
      'Model not found',
      404,
      ErrorTypes.NOT_FOUND,
      { modelId }
    )
  }

  console.log('Model found:', model.name)

  // Determine which version to use
  const versionToUse = version || model.latest_version || 1
  console.log('Using version:', versionToUse)

  // Fetch the specific version data
  const { data: versionData, error: versionError } = await supabaseServer
    .from('model_versions')
    .select('*')
    .eq('model_id', modelId)
    .eq('version', versionToUse)
    .single()

  if (versionError) {
    console.error('Version fetch error:', versionError)
    throw new AppError(
      `Version ${versionToUse} not found for this model`,
      404,
      ErrorTypes.NOT_FOUND,
      { modelId, requestedVersion: versionToUse, availableVersion: model.latest_version }
    )
  }

  if (!versionData) {
    throw new AppError(
      `Version ${versionToUse} data not found`,
      404,
      ErrorTypes.NOT_FOUND,
      { modelId, requestedVersion: versionToUse }
    )
  }

  // Validate version data structure
  if (!versionData.data || !versionData.data.sheets || !Array.isArray(versionData.data.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name, version: versionToUse }
    )
  }

  // Extract the main sheet
  const sheets = versionData.data.sheets
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

  // Generate the code
  let codeGenerator: CodeGenerator
  try {
    codeGenerator = new CodeGenerator(
      blocks,
      mainSheet.connections || [],
      sheets,
      model.name
    )
  } catch (error) {
    throw new AppError(
      'Failed to initialize code generator',
      500,
      ErrorTypes.INTERNAL_ERROR,
      { originalError: error instanceof Error ? error.message : 'Unknown error' }
    )
  }

  const result = codeGenerator.generateCode()

  if (!result.success) {
    throw new AppError(
      'Code generation failed',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { 
        errors: result.errors,
        modelId,
        modelName: model.name,
        version: versionToUse
      }
    )
  }

  // Validate generated files
  if (!result.files || result.files.length === 0) {
    throw new AppError(
      'Code generation produced no files',
      500,
      ErrorTypes.INTERNAL_ERROR,
      { modelId, modelName: model.name, version: versionToUse }
    )
  }

  console.log('Code generated successfully, creating ZIP')

  // Create ZIP file
  let zip: JSZip
  let zipBuffer: Buffer

  try {
    zip = new JSZip()
    
    // Add generated files to the zip
    for (const file of result.files) {
      if (!file.name || !file.content) {
        throw new AppError(
          'Generated file missing name or content',
          500,
          ErrorTypes.INTERNAL_ERROR,
          { fileName: file.name, hasContent: !!file.content }
        )
      }
      zip.file(file.name, file.content)
    }

    // Add a README file
    const readmeContent = generateReadmeContent(model.name, versionToUse)
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

function generateReadmeContent(modelName: string, version: number): string {
  return `# ${modelName} - Generated C Library (Version ${version})

This library was automatically generated from a visual block diagram model.

## Files:
- ${modelName}.h - Header file with data structures and function declarations
- ${modelName}.c - Implementation file with the model logic
- library.properties - PlatformIO library configuration

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

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Export the wrapped handler
export const POST = withErrorHandling(generateCodeHandler, 'generate-code')