// __tests__/integration/code-generation/code-compilation.test.ts

import { execSync, ExecSyncOptions } from 'child_process'
import fs from 'fs'
import path from 'path'
import { generateCCode } from '@/lib/codeGeneration'
import { Sheet } from '@/lib/simulationEngine'

describe('Code Generation Compilation Tests', () => {
  const testDir = path.join(__dirname, 'platformio-test')
  const modelsDir = path.join(__dirname, 'models')
  const dockerDir = path.join(__dirname, 'docker')
  const libDir = path.join(testDir, 'lib', 'generated_model')
  
  // Helper to execute and capture all output
  function executeWithFullOutput(command: string, options: ExecSyncOptions) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`EXECUTING: ${command}`)
    console.log(`IN DIR: ${options.cwd}`)
    console.log(`${'='.repeat(80)}\n`)
    
    try {
      const output = execSync(command, {
        ...options,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { 
          ...process.env, 
          PLATFORMIO_FORCE_COLOR: 'false',
          PLATFORMIO_DISABLE_PROGRESSBAR: 'true'
        }
      })
      
      console.log('STDOUT:')
      console.log(output)
      
      return { success: true, output }
    } catch (error: any) {
      console.log('COMMAND FAILED!')
      
      if (error.stdout) {
        console.log('\nSTDOUT:')
        console.log(error.stdout.toString())
      }
      
      if (error.stderr) {
        console.log('\nSTDERR:')
        console.log(error.stderr.toString())
      }
      
      if (error.message) {
        console.log('\nERROR MESSAGE:')
        console.log(error.message)
      }
      
      return { 
        success: false, 
        error,
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || '',
        message: error.message
      }
    }
  }

  // Load model JSON files from the models directory
  function loadModelFiles(): Array<{ name: string; model: any; filename: string }> {
    if (!fs.existsSync(modelsDir)) {
      console.warn(`Models directory not found: ${modelsDir}`)
      return []
    }

    const modelFiles = fs.readdirSync(modelsDir)
      .filter(file => file.endsWith('.json'))
      .map(filename => {
        const filePath = path.join(modelsDir, filename)
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const model = JSON.parse(content)
          return {
            name: model.metadata?.description || filename.replace('.json', ''),
            model,
            filename
          }
        } catch (error) {
          console.error(`Failed to load model file ${filename}:`, error)
          return null
        }
      })
      .filter(Boolean) as Array<{ name: string; model: any; filename: string }>

    console.log(`Loaded ${modelFiles.length} model files from ${modelsDir}`)
    return modelFiles
  }

  // Build Docker image for PlatformIO
  function buildDockerImage() {
    console.log('\nBuilding Docker image for PlatformIO...')
    
    const dockerfilePath = path.join(dockerDir, 'Dockerfile.platformio')
    
    // Create Dockerfile if it doesn't exist
    if (!fs.existsSync(dockerfilePath)) {
      fs.mkdirSync(dockerDir, { recursive: true })
      
      const dockerfileContent = `FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    g++ \\
    make \\
    git \\
    && rm -rf /var/lib/apt/lists/*

# Install PlatformIO
RUN pip install platformio

# Create working directory
WORKDIR /workspace

# Set up PlatformIO
RUN pio platform install native

CMD ["/bin/bash"]
`
      fs.writeFileSync(dockerfilePath, dockerfileContent)
    }

    // Build the Docker image
    const buildResult = executeWithFullOutput(
      `docker build -t platformio-test -f ${dockerfilePath} ${dockerDir}`,
      { cwd: process.cwd() }
    )

    if (!buildResult.success) {
      throw new Error('Failed to build Docker image')
    }

    console.log('Docker image built successfully')
  }

  // Run compilation in Docker
  function runInDocker(testName: string, modelName: string): { success: boolean; output?: string; binaryPath?: string } {
    console.log(`\nRunning compilation in Docker for ${testName}...`)

    // Create a temporary directory for this test
    const tempDir = path.join(testDir, 'temp', testName.replace(/\s+/g, '_').toLowerCase())
    fs.mkdirSync(tempDir, { recursive: true })

    try {
      // Copy test files to temp directory
      const srcDir = path.join(tempDir, 'src')
      const libModelDir = path.join(tempDir, 'lib', modelName)
      fs.mkdirSync(srcDir, { recursive: true })
      fs.mkdirSync(libModelDir, { recursive: true })

      // Copy platformio.ini with library dependency
      const pioIniContent = `[platformio]
default_envs = native

[env:native]
platform = native
build_flags = -std=c99 -Wall -Wextra
lib_compat_mode = off
lib_deps = 
    ${modelName}
`
      fs.writeFileSync(path.join(tempDir, 'platformio.ini'), pioIniContent)

      // Copy generated files and create proper library structure
      const generatedFiles = fs.readdirSync(libDir)
      
      // Copy C files to library src directory (where PlatformIO expects them for compilation)
      generatedFiles.filter(f => f.endsWith('.c')).forEach(file => {
        fs.copyFileSync(
          path.join(libDir, file),
          path.join(libModelDir, file)
        )
      })
      
      // Copy header files to library root (for includes)
      generatedFiles.filter(f => f.endsWith('.h')).forEach(file => {
        fs.copyFileSync(
          path.join(libDir, file),
          path.join(libModelDir, file)
        )
      })
      
      // Copy other files (like library.properties) to library root
      generatedFiles.filter(f => !f.endsWith('.c') && !f.endsWith('.h')).forEach(file => {
        fs.copyFileSync(
          path.join(libDir, file),
          path.join(libModelDir, file)
        )
      })
      
      // Also create a library.json file for better PlatformIO compatibility
      const libraryJson = {
        name: modelName,
        version: "1.0.0",
        description: `Generated library from visual model ${modelName}`,
        keywords: ["generated", "model", "simulation"],
        authors: [
          {
            name: "Generated",
            email: "generated@example.com"
          }
        ],
        license: "MIT",
        frameworks: "*",
        platforms: "*",
        headers: `${modelName}.h`
      }
      fs.writeFileSync(
        path.join(libModelDir, 'library.json'),
        JSON.stringify(libraryJson, null, 2)
      )

      // Copy main.cpp
      const mainPath = path.join(testDir, 'src', 'main.cpp')
      if (fs.existsSync(mainPath)) {
        fs.copyFileSync(mainPath, path.join(srcDir, 'main.cpp'))
      }

      // Run Docker container with verbose output for debugging
      const dockerCommand = [
        'docker', 'run', '--rm',
        '-v', `${tempDir}:/workspace`,
        '-w', '/workspace',
        'platformio-test',
        'bash', '-c',
        '"pio run -e native -v && .pio/build/native/program"'
      ].join(' ')

      const result = executeWithFullOutput(dockerCommand, { cwd: process.cwd() })

      if (result.success) {
        return {
          success: true,
          output: result.output || '',
          binaryPath: path.join(tempDir, '.pio', 'build', 'native', 'program')
        }
      } else {
        return {
          success: false,
          output: result.stderr || result.message
        }
      }
    } finally {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }
  
  beforeAll(() => {
    try {
      // Build Docker image
      buildDockerImage()
      
      // Verify test directory exists
      if (!fs.existsSync(testDir)) {
        throw new Error(`Test directory not found: ${testDir}`)
      }
    } catch (error) {
      console.error('Setup failed:', error)
      throw error
    }
  })
  
  beforeEach(() => {
    console.log(`\n${'*'.repeat(80)}`)
    console.log('BEFORE EACH - Setting up directories')
    console.log(`${'*'.repeat(80)}\n`)
    
    // Clean up previous test artifacts
    if (fs.existsSync(libDir)) {
      fs.rmSync(libDir, { recursive: true, force: true })
    }
    fs.mkdirSync(libDir, { recursive: true })
  })
  
  afterEach(() => {
    // Clean build artifacts
    const buildDir = path.join(testDir, '.pio')
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true })
    }
  })

  // Load test models from files
  const testModels = loadModelFiles()

  // Test models with the new hierarchical structure
  const hierarchicalTestModels = [
    {
      name: 'Simple Sum Block',
      filename: 'simple_sum',
      model: {
        version: "2.0",
        metadata: {
          created: new Date().toISOString(),
          description: 'Simple Sum Block Test'
        },
        sheets: [{
          id: 'main',
          name: 'Main',
          blocks: [
            {
              id: 'input1',
              type: 'input_port',
              name: 'Input1',
              position: { x: 100, y: 100 },
              parameters: { portName: 'Input1', dataType: 'double' }
            },
            {
              id: 'input2',
              type: 'input_port',
              name: 'Input2',
              position: { x: 100, y: 200 },
              parameters: { portName: 'Input2', dataType: 'double' }
            },
            {
              id: 'sum1',
              type: 'sum',
              name: 'Sum1',
              position: { x: 300, y: 150 },
              parameters: {}
            },
            {
              id: 'output1',
              type: 'output_port',
              name: 'Output1',
              position: { x: 500, y: 150 },
              parameters: { portName: 'Output1' }
            }
          ],
          connections: [
            {
              id: 'wire1',
              sourceBlockId: 'input1',
              sourcePortIndex: 0,
              targetBlockId: 'sum1',
              targetPortIndex: 0
            },
            {
              id: 'wire2',
              sourceBlockId: 'input2',
              sourcePortIndex: 0,
              targetBlockId: 'sum1',
              targetPortIndex: 1
            },
            {
              id: 'wire3',
              sourceBlockId: 'sum1',
              sourcePortIndex: 0,
              targetBlockId: 'output1',
              targetPortIndex: 0
            }
          ],
          extents: { width: 1000, height: 800 }
        }],
        globalSettings: {
          simulationDuration: 1.0,
          simulationTimeStep: 0.01
        }
      }
    },
    {
      name: 'Multi-Sheet with Subsystem',
      filename: 'multi_sheet_subsystem',
      model: {
        version: "2.0",
        metadata: {
          created: new Date().toISOString(),
          description: 'Multi-Sheet Subsystem Test',
          testInputs: {
            MainInput: 5.0
          },
          expectedOutputs: {
            MainOutput: 10.0  // 5.0 * 2.0 (scale factor)
          }
        },
        sheets: [{
          id: 'main',
          name: 'Main',
          blocks: [
            {
              id: 'main_input',
              type: 'input_port',
              name: 'MainInput',
              position: { x: 100, y: 100 },
              parameters: { portName: 'MainInput', dataType: 'double' }
            },
            {
              id: 'subsystem1',
              type: 'subsystem',
              name: 'DoubleSubsystem',
              position: { x: 300, y: 100 },
              parameters: {
                inputPorts: ['in'],
                outputPorts: ['out'],
                sheets: [
                  {
                    id: 'sub_main',
                    name: 'SubMain',
                    blocks: [
                      {
                        id: 'sub_input',
                        type: 'input_port',
                        name: 'in',
                        position: { x: 100, y: 100 },
                        parameters: { portName: 'in', dataType: 'double' }
                      },
                      {
                        id: 'scale_block',
                        type: 'scale',
                        name: 'Scale1',
                        position: { x: 300, y: 100 },
                        parameters: { gain: 2.0 }
                      },
                      {
                        id: 'sub_output',
                        type: 'output_port',
                        name: 'out',
                        position: { x: 500, y: 100 },
                        parameters: { portName: 'out' }
                      }
                    ],
                    connections: [
                      {
                        id: 'sub_wire1',
                        sourceBlockId: 'sub_input',
                        sourcePortIndex: 0,
                        targetBlockId: 'scale_block',
                        targetPortIndex: 0
                      },
                      {
                        id: 'sub_wire2',
                        sourceBlockId: 'scale_block',
                        sourcePortIndex: 0,
                        targetBlockId: 'sub_output',
                        targetPortIndex: 0
                      }
                    ],
                    extents: { width: 800, height: 600 }
                  }
                ]
              }
            },
            {
              id: 'main_output',
              type: 'output_port',
              name: 'MainOutput',
              position: { x: 500, y: 100 },
              parameters: { portName: 'MainOutput' }
            }
          ],
          connections: [
            {
              id: 'main_wire1',
              sourceBlockId: 'main_input',
              sourcePortIndex: 0,
              targetBlockId: 'subsystem1',
              targetPortIndex: 0
            },
            {
              id: 'main_wire2',
              sourceBlockId: 'subsystem1',
              sourcePortIndex: 0,
              targetBlockId: 'main_output',
              targetPortIndex: 0
            }
          ],
          extents: { width: 1000, height: 800 }
        }],
        globalSettings: {
          simulationDuration: 1.0,
          simulationTimeStep: 0.01
        }
      }
    },
    {
      name: 'Sheet Labels Across Multiple Sheets',
      filename: 'sheet_labels',
      model: {
        version: "2.0",
        metadata: {
          created: new Date().toISOString(),
          description: 'Sheet Label Test',
          testInputs: {
            Input1: 3.0
          },
          expectedOutputs: {
            Output1: 6.0  // 3.0 * 2.0
          }
        },
        sheets: [{
          id: 'main',
          name: 'Main',
          blocks: [
            {
              id: 'input1',
              type: 'input_port',
              name: 'Input1',
              position: { x: 100, y: 100 },
              parameters: { portName: 'Input1', dataType: 'double' }
            },
            {
              id: 'sheet_sink1',
              type: 'sheet_label_sink',
              name: 'SignalA_Sink',
              position: { x: 300, y: 100 },
              parameters: { signalName: 'SignalA' }
            },
            {
              id: 'subsystem_with_labels',
              type: 'subsystem',
              name: 'ProcessingSubsystem',
              position: { x: 400, y: 200 },
              parameters: {
                inputPorts: [],
                outputPorts: ['result'],
                sheets: [
                  {
                    id: 'processing_sheet',
                    name: 'Processing',
                    blocks: [
                      {
                        id: 'sheet_source1',
                        type: 'sheet_label_source',
                        name: 'SignalA_Source',
                        position: { x: 100, y: 100 },
                        parameters: { signalName: 'SignalA' }
                      },
                      {
                        id: 'scale2',
                        type: 'scale',
                        name: 'Scale2',
                        position: { x: 300, y: 100 },
                        parameters: { gain: 2.0 }
                      },
                      {
                        id: 'proc_output',
                        type: 'output_port',
                        name: 'result',
                        position: { x: 500, y: 100 },
                        parameters: { portName: 'result' }
                      }
                    ],
                    connections: [
                      {
                        id: 'proc_wire1',
                        sourceBlockId: 'sheet_source1',
                        sourcePortIndex: 0,
                        targetBlockId: 'scale2',
                        targetPortIndex: 0
                      },
                      {
                        id: 'proc_wire2',
                        sourceBlockId: 'scale2',
                        sourcePortIndex: 0,
                        targetBlockId: 'proc_output',
                        targetPortIndex: 0
                      }
                    ],
                    extents: { width: 800, height: 600 }
                  }
                ]
              }
            },
            {
              id: 'output1',
              type: 'output_port',
              name: 'Output1',
              position: { x: 600, y: 200 },
              parameters: { portName: 'Output1' }
            }
          ],
          connections: [
            {
              id: 'wire1',
              sourceBlockId: 'input1',
              sourcePortIndex: 0,
              targetBlockId: 'sheet_sink1',
              targetPortIndex: 0
            },
            {
              id: 'wire2',
              sourceBlockId: 'subsystem_with_labels',
              sourcePortIndex: 0,
              targetBlockId: 'output1',
              targetPortIndex: 0
            }
          ],
          extents: { width: 1000, height: 800 }
        }],
        globalSettings: {
          simulationDuration: 1.0,
          simulationTimeStep: 0.01
        }
      }
    }
  ]

  // Combine all test models
  const allTestModels = [...testModels, ...hierarchicalTestModels]
  
  test.each(allTestModels)('should compile $name (from $filename)', async ({ name, model, filename }) => {
    console.log(`\n${'#'.repeat(80)}`)
    console.log(`TEST: ${name}`)
    console.log(`SOURCE: ${filename}`)
    console.log(`${'#'.repeat(80)}\n`)
    
    // Generate model name from the test name
    const modelName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    
    // Generate code using the new API
    const result = generateCCode({
      modelName,
      sheets: model.sheets,
      globalSettings: model.globalSettings
    })
    
    // Write generated files
    const files = [
      { name: `${result.fileName}.h`, content: result.headerFile },
      { name: `${result.fileName}.c`, content: result.sourceFile },
      { name: 'library.properties', content: generateLibraryProperties(modelName) }
    ]
    
    files.forEach(file => {
      const filePath = path.join(libDir, file.name)
      fs.writeFileSync(filePath, file.content)
      console.log(`\nGenerated file: ${file.name} (${file.content.length} bytes)`)
      console.log('-'.repeat(40))
      console.log(file.content.substring(0, 500) + (file.content.length > 500 ? '\n...' : ''))
      console.log('-'.repeat(40))
    })
    
    // Generate test program
    const testProgram = generateTestProgram(model, modelName)
    
    const srcDir = path.join(testDir, 'src')
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true })
    }
    
    const mainPath = path.join(srcDir, 'main.cpp')
    fs.writeFileSync(mainPath, testProgram)
    
    console.log(`\nTest program: ${mainPath}`)
    console.log('-'.repeat(40))
    console.log(testProgram.substring(0, 800) + (testProgram.length > 800 ? '\n...' : ''))
    console.log('-'.repeat(40))
    
    // Run compilation in Docker
    const compileResult = runInDocker(name, modelName)
    
    if (!compileResult.success) {
      throw new Error(`Compilation failed for ${name}: ${compileResult.output}`)
    }
    
    console.log('\n✅ Compilation and execution successful!')
    console.log(`Output:\n${compileResult.output}`)
    
    // Parse and validate results if expected values are defined
    if (model.metadata?.expectedOutputs || model.metadata?.expectedOutput !== undefined) {
      validateSimulationResults(compileResult.output || '', model)
    }
    
  }, 120000) // 120 second timeout for Docker operations

  // Helper function to generate library properties
  function generateLibraryProperties(modelName: string): string {
    const safeName = modelName.replace(/[^a-zA-Z0-9_]/g, '_')
    return `name=${safeName}
version=1.0.0
author=Generated
maintainer=Generated
sentence=Generated library from visual model ${modelName}
paragraph=This library was automatically generated from a block diagram model.
category=Signal Input/Output
url=
architectures=*
includes=${safeName}.h
`
  }

  function checkIfVectorOutput(output: any, mainSheet: any): { isVector: boolean, size: number } {
    const outputWire = mainSheet.connections.find((w: any) => w.targetBlockId === output.id)
    if (!outputWire) return { isVector: false, size: 0 }
    
    const sourceBlock = mainSheet.blocks.find((b: any) => b.id === outputWire.sourceBlockId)
    if (!sourceBlock) return { isVector: false, size: 0 }
    
    // Check source block type
    if (sourceBlock.type === 'source' || sourceBlock.type === 'input_port') {
      const dataType = sourceBlock.parameters?.dataType
      if (dataType && dataType.includes('[')) {
        const match = dataType.match(/\[(\d+)\]/)
        if (match) {
          return { isVector: true, size: parseInt(match[1]) }
        }
      }
    } else if (sourceBlock.type === 'transfer_function') {
      // Check TF input
      const tfInputWire = mainSheet.connections.find((w: any) => w.targetBlockId === sourceBlock.id)
      if (tfInputWire) {
        const tfSourceBlock = mainSheet.blocks.find((b: any) => b.id === tfInputWire.sourceBlockId)
        if (tfSourceBlock && (tfSourceBlock.type === 'source' || tfSourceBlock.type === 'input_port')) {
          const dataType = tfSourceBlock.parameters?.dataType
          if (dataType && dataType.includes('[')) {
            const match = dataType.match(/\[(\d+)\]/)
            if (match) {
              return { isVector: true, size: parseInt(match[1]) }
            }
          }
        }
      }
    }
    
    return { isVector: false, size: 0 }
  }

  // Helper function to generate test program
  function generateTestProgram(model: any, modelName: string): string {
    // Only consider top-level input/output ports
    const mainSheet = model.sheets[0]
    const inputs = mainSheet.blocks.filter((b: any) => b.type === 'input_port')
    const outputs = mainSheet.blocks.filter((b: any) => b.type === 'output_port')
    
    // Get simulation parameters
    const simulationDuration = model.globalSettings?.simulationDuration || 10.0
    const simulationTimeStep = model.globalSettings?.simulationTimeStep || 0.01
    
    let program = `#include <${modelName}.h>\n`
    program += `#include <stdio.h>\n`
    program += `#include <math.h>\n\n`
    program += `#include <string.h>\n\n`
    
    program += `int main() {\n`
    program += `    ${modelName}_t model;\n`
    program += `    \n`
    program += `    // Initialize model with time step\n`
    program += `    ${modelName}_init(&model, ${simulationTimeStep});\n`
    program += `    \n`
    
    // Set test inputs
    program += `    // Set input values\n`
    if (model.metadata?.testInputs) {
      for (const [portName, value] of Object.entries(model.metadata.testInputs)) {
        const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
        if (Array.isArray(value)) {
          value.forEach((v, i) => {
            program += `    model.inputs.${sanitizedPortName}[${i}] = ${v};\n`
          })
        } else {
          program += `    model.inputs.${sanitizedPortName} = ${value};\n`
        }
      }
    } else {
      inputs.forEach((input: any, index: number) => {
        const portName = input.parameters?.portName || input.name
        const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
        program += `    model.inputs.${sanitizedPortName} = ${index + 1}.0;\n`
      })
    }
    
    program += `    \n`
    program += `    // Simulation parameters\n`
    program += `    double duration = ${simulationDuration};\n`
    program += `    double dt = ${simulationTimeStep};\n`
    program += `    int steps = (int)(duration / dt);\n`
    program += `    \n`
    
    // Variables to track outputs over time
    program += `    // Variables to track final outputs\n`
    outputs.forEach((output: any) => {
      const portName = output.parameters?.portName || output.name
      const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
      
      const vectorInfo = checkIfVectorOutput(output, mainSheet)
      
      if (vectorInfo.isVector) {
        program += `    double final_${sanitizedPortName}[${vectorInfo.size}] = {0};\n`
      } else {
        program += `    double final_${sanitizedPortName} = 0.0;\n`
      }
    })
    
    program += `    \n`
    program += `    // Run simulation\n`
    program += `    printf("Running simulation for %.2f seconds with time step %.4f\\n", duration, dt);\n`
    program += `    printf("Total steps: %d\\n\\n", steps);\n`
    program += `    \n`
    program += `    for (int i = 0; i < steps; i++) {\n`
    program += `        // Use the time_step function which handles integration and algebraic computations\n`
    program += `        ${modelName}_time_step(&model, dt);\n`
    program += `        \n`
    
    // Store final values
    program += `        // Store final values\n`
    outputs.forEach((output: any) => {
      const portName = output.parameters?.portName || output.name
      const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
      
      const vectorInfo = checkIfVectorOutput(output, mainSheet)
      
      if (vectorInfo.isVector) {
        program += `        memcpy(final_${sanitizedPortName}, model.outputs.${sanitizedPortName}, sizeof(final_${sanitizedPortName}));\n`
      } else {
        program += `        final_${sanitizedPortName} = model.outputs.${sanitizedPortName};\n`
      }
    })
    
    program += `        \n`
    program += `        // Print progress\n`
    program += `        if (i % (steps / 10) == 0 && i > 0) {\n`
    program += `            printf("Progress: %d%%\\n", (i * 100) / steps);\n`
    program += `        }\n`
    
    program += `    }\n`
    program += `    \n`
    program += `    printf("\\nSimulation complete!\\n\\n");\n`
    program += `    \n`
    
    // Print final outputs
    program += `    // Print final outputs\n`
    program += `    printf("Final outputs at t=%.2f:\\n", duration);\n`
    outputs.forEach((output: any) => {
      const portName = output.parameters?.portName || output.name
      const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
      
      const vectorInfo = checkIfVectorOutput(output, mainSheet)
      
      if (vectorInfo.isVector) {
        program += `    printf("${sanitizedPortName}:\\n");\n`
        for (let i = 0; i < vectorInfo.size; i++) {
          program += `    printf("  [${i}]: %.6f\\n", final_${sanitizedPortName}[${i}]);\n`
        }
      } else {
        program += `    printf("${sanitizedPortName}: %.6f\\n", final_${sanitizedPortName});\n`
      }
    })
    
    // Validate against expected outputs
    if (model.metadata?.expectedOutputs || model.metadata?.expectedOutput !== undefined) {
      program += `    \n`
      program += `    // Validate expected outputs\n`
      program += `    double tolerance = 0.00001;\n`
      program += `    int all_passed = 1;\n`
      
      if (model.metadata?.expectedOutput !== undefined && outputs.length > 0) {
        const firstOutput = outputs[0]
        const portName = firstOutput.parameters?.portName || firstOutput.name
        const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
        
        program += `    {\n`
        program += `        double expected = ${model.metadata.expectedOutput};\n`
        program += `        double actual = final_${sanitizedPortName};\n`
        program += `        if (fabs(actual - expected) > tolerance) {\n`
        program += `            printf("\\n✗ Test failed for ${sanitizedPortName}! Expected: %.6f, Got: %.6f\\n", expected, actual);\n`
        program += `            all_passed = 0;\n`
        program += `        } else {\n`
        program += `            printf("\\n✓ ${sanitizedPortName} test passed! Output: %.6f\\n", actual);\n`
        program += `        }\n`
        program += `    }\n`
      }
      
      if (model.metadata?.expectedOutputs) {
        for (const [outputPortName, expectedValue] of Object.entries(model.metadata.expectedOutputs)) {
          const sanitizedPortName = outputPortName.replace(/[^a-zA-Z0-9_]/g, '_')
          
          program += `    {\n`
          program += `        double expected = ${expectedValue};\n`
          program += `        double actual = final_${sanitizedPortName};\n`
          program += `        if (fabs(actual - expected) > tolerance) {\n`
          program += `            printf("\\n✗ Test failed for ${sanitizedPortName}! Expected: %.6f, Got: %.6f\\n", expected, actual);\n`
          program += `            all_passed = 0;\n`
          program += `        } else {\n`
          program += `            printf("\\n✓ ${sanitizedPortName} test passed! Output: %.6f\\n", actual);\n`
          program += `        }\n`
          program += `    }\n`
        }
      }
      
      program += `    \n`
      program += `    if (all_passed) {\n`
      program += `        printf("\\n✅ All tests passed!\\n");\n`
      program += `        return 0;\n`
      program += `    } else {\n`
      program += `        printf("\\n❌ Some tests failed!\\n");\n`
      program += `        return 1;\n`
      program += `    }\n`
    }
    
    program += `    \n`
    program += `    return 0;\n`
    program += `}\n`
    
    return program
  }

  // Helper function to validate simulation results
  function validateSimulationResults(output: string, model: any) {
    console.log('\n--- Validating Simulation Results ---')
    
    // Parse output values from the program output
    const outputValues: { [key: string]: number } = {}
    
    const matches = output.matchAll(/(\w+):\s*([-\d.]+)/g)
    for (const match of matches) {
      const [_, name, value] = match
      outputValues[name] = parseFloat(value)
    }
    
    console.log('Parsed output values:', outputValues)
    
    // Validate against expected values
    let allPassed = true
    
    if (model.metadata?.expectedOutput !== undefined) {
      const mainSheet = model.sheets[0]
      const outputs = mainSheet.blocks.filter((b: any) => b.type === 'output_port')
      if (outputs.length > 0) {
        const firstOutput = outputs[0]
        const portName = firstOutput.parameters?.portName || firstOutput.name
        const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
        
        const actual = outputValues[sanitizedPortName]
        const expected = parseFloat(model.metadata.expectedOutput)
        
        if (typeof actual === 'number') {
          expect(actual).toBeCloseTo(expected, 5)
          console.log(`✓ ${sanitizedPortName}: ${actual} ≈ ${expected}`)
        } else {
          allPassed = false
          console.log(`✗ ${sanitizedPortName}: Could not find output value`)
        }
      }
    }
    
    if (model.metadata?.expectedOutputs) {
      for (const [outputPortName, expectedValue] of Object.entries(model.metadata.expectedOutputs)) {
        const sanitizedPortName = outputPortName.replace(/[^a-zA-Z0-9_]/g, '_')
        const actual = outputValues[sanitizedPortName]
        
        expect(actual).toBeCloseTo(expectedValue as number, 5)
        console.log(`✓ ${sanitizedPortName}: ${actual} ≈ ${expectedValue}`)
      }
    }
    
    if (allPassed) {
      console.log('\n✅ All validation checks passed!')
    }
  }
})

describe('Multi-sheet and Subsystem Code Generation', () => {
  it('should generate correct C code for models with subsystems', () => {
    // Create a hierarchical test model
    const modelData = {
      version: "2.0",
      metadata: {
        created: new Date().toISOString(),
        description: "Multi-sheet subsystem test"
      },
      sheets: [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'input1',
            type: 'input_port' as const,
            name: 'input1',
            position: { x: 100, y: 100 },
            parameters: { portName: 'input1', dataType: 'double' }
          },
          {
            id: 'outer_subsystem',
            type: 'subsystem' as const,
            name: 'DoubleSubsystem',
            position: { x: 300, y: 100 },
            parameters: {
              inputPorts: ['in'],
              outputPorts: ['out'],
              sheets: [{
                id: 'double_main',
                name: 'DoubleMain',
                blocks: [
                  {
                    id: 'double_input',
                    type: 'input_port' as const,
                    name: 'in',
                    position: { x: 100, y: 100 },
                    parameters: { portName: 'in', dataType: 'double' }
                  },
                  {
                    id: 'scale1',
                    type: 'scale' as const,
                    name: 'Scale1',
                    position: { x: 300, y: 100 },
                    parameters: { gain: 2.0 }
                  },
                  {
                    id: 'double_output',
                    type: 'output_port' as const,
                    name: 'out',
                    position: { x: 500, y: 100 },
                    parameters: { portName: 'out' }
                  }
                ],
                connections: [
                  {
                    id: 'double_w1',
                    sourceBlockId: 'double_input',
                    sourcePortIndex: 0,
                    targetBlockId: 'scale1',
                    targetPortIndex: 0
                  },
                  {
                    id: 'double_w2',
                    sourceBlockId: 'scale1',
                    sourcePortIndex: 0,
                    targetBlockId: 'double_output',
                    targetPortIndex: 0
                  }
                ],
                extents: { width: 800, height: 600 }
              }]
            }
          },
          {
            id: 'output1',
            type: 'output_port' as const,
            name: 'output1',
            position: { x: 500, y: 100 },
            parameters: { portName: 'output1' }
          }
        ],
        connections: [
          {
            id: 'main_w1',
            sourceBlockId: 'input1',
            sourcePortIndex: 0,
            targetBlockId: 'outer_subsystem',
            targetPortIndex: 0
          },
          {
            id: 'main_w2',
            sourceBlockId: 'outer_subsystem',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }],
      globalSettings: {
        simulationTimeStep: 0.01,
        simulationDuration: 1.0
      }
    }
    
    // Generate C code
    const result = generateCCode({
      modelName: 'subsystem_test',
      sheets: modelData.sheets as Sheet[],
      globalSettings: modelData.globalSettings
    })
    
    // Verify the generated code structure
    expect(result.headerFile).toBeDefined()
    expect(result.sourceFile).toBeDefined()
    
    // Check that subsystem blocks are properly prefixed
    expect(result.sourceFile).toContain('DoubleSubsystem_Scale1')
    
    // Check that sheet labels are removed
    expect(result.sourceFile).not.toContain('sheet_label_sink')
    expect(result.sourceFile).not.toContain('sheet_label_source')
    
    // Check that the scale operation is included
    expect(result.sourceFile).toContain('* 2.0') // gain of 2.0
    
    // Check that signals flow correctly through the flattened structure
    expect(result.headerFile).toContain('subsystem_test_inputs_t')
    expect(result.headerFile).toContain('subsystem_test_outputs_t')
    expect(result.headerFile).toContain('subsystem_test_signals_t')
    
    // Verify comments indicate subsystem origin
    expect(result.sourceFile).toContain('(from DoubleSubsystem)')
  })
  
  it('should handle nested subsystems with sheet labels', () => {
    // Create a model with nested subsystems and sheet labels
    const nestedModel = {
      version: "2.0",
      metadata: {
        created: new Date().toISOString(),
        description: "Nested subsystem with sheet labels test"
      },
      sheets: [
        {
          id: "main",
          name: "Main",
          blocks: [
            {
              id: "input1",
              type: "input_port" as const,
              name: "input1",
              position: { x: 100, y: 100 },
              parameters: { portName: "input1", dataType: "double" }
            },
            {
              id: "main_sink",
              type: "sheet_label_sink" as const,
              name: "MainSignal_Sink",
              position: { x: 300, y: 100 },
              parameters: { signalName: "MainSignal" }
            },
            {
              id: "outer_subsystem",
              type: "subsystem" as const,
              name: "OuterSub",
              position: { x: 400, y: 200 },
              parameters: {
                inputPorts: [],
                outputPorts: ["out"],
                sheets: [
                  {
                    id: "outer_main",
                    name: "OuterMain",
                    blocks: [
                      {
                        id: "outer_source",
                        type: "sheet_label_source" as const,
                        name: "MainSignal_Source",
                        position: { x: 100, y: 100 },
                        parameters: { signalName: "MainSignal" }
                      },
                      {
                        id: "outer_scale",
                        type: "scale" as const,
                        name: "OuterScale",
                        position: { x: 300, y: 100 },
                        parameters: { gain: 3.0 }
                      },
                      {
                        id: "outer_output",
                        type: "output_port" as const,
                        name: "out",
                        position: { x: 500, y: 100 },
                        parameters: { portName: "out" }
                      }
                    ],
                    connections: [
                      {
                        id: "outer_w1",
                        sourceBlockId: "outer_source",
                        sourcePortIndex: 0,
                        targetBlockId: "outer_scale",
                        targetPortIndex: 0
                      },
                      {
                        id: "outer_w2",
                        sourceBlockId: "outer_scale",
                        sourcePortIndex: 0,
                        targetBlockId: "outer_output",
                        targetPortIndex: 0
                      }
                    ],
                    extents: { width: 800, height: 600 }
                  }
                ]
              }
            },
            {
              id: "output1",
              type: "output_port" as const,
              name: "output1",
              position: { x: 600, y: 200 },
              parameters: { portName: "output1" }
            }
          ],
          connections: [
            {
              id: "main_w1",
              sourceBlockId: "input1",
              sourcePortIndex: 0,
              targetBlockId: "main_sink",
              targetPortIndex: 0
            },
            {
              id: "main_w2",
              sourceBlockId: "outer_subsystem",
              sourcePortIndex: 0,
              targetBlockId: "output1",
              targetPortIndex: 0
            }
          ],
          extents: { width: 800, height: 600 }
        }
      ],
      globalSettings: {
        simulationTimeStep: 0.01,
        simulationDuration: 1.0
      }
    }
    
    const result = generateCCode({
      modelName: 'nested_test',
      sheets: nestedModel.sheets as Sheet[],
      globalSettings: nestedModel.globalSettings
    })
    
    // Check that sheet labels are replaced with direct connections
    expect(result.sourceFile).not.toContain('sheet_label_sink')
    expect(result.sourceFile).not.toContain('sheet_label_source')
    
    // Check that the signal flows through properly
    expect(result.sourceFile).toContain('OuterSub_OuterScale')
    expect(result.sourceFile).toContain('* 3.0') // Scale factor
  })
})