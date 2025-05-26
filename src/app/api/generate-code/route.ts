import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { CodeGenerator } from '@/lib/codeGeneration'
import JSZip from 'jszip'

export async function POST(request: NextRequest) {
  try {
    const { modelId } = await request.json()

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      )
    }

    // Fetch the model from the database
    const { data: model, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', modelId)
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch model' },
        { status: 500 }
      )
    }

    if (!model) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }

    // Extract the main sheet (for now, we'll generate code for the main sheet)
    const sheets = model.data.sheets || []
    const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]

    if (!mainSheet) {
      return NextResponse.json(
        { error: 'No main sheet found in model' },
        { status: 400 }
      )
    }

    // Generate the code
    const codeGenerator = new CodeGenerator(
      mainSheet.blocks || [],
      mainSheet.connections || [],
      sheets,
      model.name
    )

    const result = codeGenerator.generateCode()

    if (!result.success) {
      return NextResponse.json(
        { 
          error: 'Code generation failed',
          details: result.errors
        },
        { status: 400 }
      )
    }

    // Create a ZIP file with the generated code
    const zip = new JSZip()
    
    // Add generated files to the zip
    for (const file of result.files) {
      zip.file(file.name, file.content)
    }

    // Add a README file
    const readmeContent = `# ${model.name} - Generated C Library

This library was automatically generated from a visual block diagram model.

## Files:
- ${model.name}.h - Header file with data structures and function declarations
- ${model.name}.c - Implementation file with the model logic
- library.properties - PlatformIO library configuration

## Usage:
1. Include this library in your PlatformIO project
2. Include the header: #include "${model.name}.h"
3. Create an instance: ${model.name}_t model_instance;
4. Initialize: ${model.name}_init(&model_instance, 0.01); // 10ms time step
5. In your main loop: ${model.name}_step(&model_instance);

## Example:
\`\`\`c
#include "${model.name}.h"

${model.name}_t model;

void setup() {
  ${model.name}_init(&model, 0.01); // 10ms time step
}

void loop() {
  // Set inputs
  model.inputs.Input1 = analogRead(A0) / 1023.0;
  
  // Execute one step
  ${model.name}_step(&model);
  
  // Use outputs
  analogWrite(9, (int)(model.outputs.Output1 * 255));
  
  delay(10); // Match the time step
}
\`\`\`

Generated on: ${new Date().toISOString()}
`
    
    zip.file('README.md', readmeContent)

    // Generate the ZIP file
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    // Return the ZIP file
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${model.name}_library.zip"`
      }
    })

  } catch (error) {
    console.error('Code generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}