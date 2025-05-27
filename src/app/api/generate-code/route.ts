// app/api/generate-code/route.ts - Add better error logging

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
  
  const { modelId } = requestBody

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

  // Fetch the model from the database using service role key
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

  // Validate model structure
  if (!model.data || !model.data.sheets || !Array.isArray(model.data.sheets)) {
    throw new AppError(
      'Invalid model structure: missing or invalid sheets data',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name }
    )
  }

  // Extract the main sheet
  const sheets = model.data.sheets
  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

  if (!mainSheet) {
    throw new AppError(
      'No sheets found in model',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name, availableSheets: sheets.length }
    )
  }

  // Validate sheet has blocks
  const blocks = mainSheet.blocks || []
  if (blocks.length === 0) {
    throw new AppError(
      'Cannot generate code: model contains no blocks',
      400,
      ErrorTypes.VALIDATION_ERROR,
      { modelId, modelName: model.name, sheetName: mainSheet.name }
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
        modelName: model.name
      }
    )
  }

  // Validate generated files
  if (!result.files || result.files.length === 0) {
    throw new AppError(
      'Code generation produced no files',
      500,
      ErrorTypes.INTERNAL_ERROR,
      { modelId, modelName: model.name }
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
    const readmeContent = generateReadmeContent(model.name)
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
        modelName: model.name
      }
    )
  }

  console.log('ZIP created, sending response')

  // Return the ZIP file
  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(model.name)}_library.zip"`
    }
  })
}

function generateReadmeContent(modelName: string): string {
  return `# ${modelName} - Generated C Library

This library was automatically generated from a visual block diagram model.

## Files:
- ${modelName}.h - Header file with data structures and function declarations
- ${modelName}.c - Implementation file with the model logic
- library.properties - PlatformIO library configuration

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

Generated on: ${new Date().toISOString()}
`
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Export the wrapped handler
export const POST = withErrorHandling(generateCodeHandler, 'generate-code')