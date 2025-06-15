// __tests__/integration/code-generation/code-compilation.test.ts

import { execSync, ExecSyncOptions } from 'child_process'
import fs from 'fs'
import path from 'path'
import { CodeGenerator } from '@/lib/codeGeneration'

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

  // Also include any hardcoded test models
  const hardcodedModels = [
    {
      name: 'Simple Sum Block',
      filename: 'hardcoded',
      model: {
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
    }
  ]

  // Combine all test models
  const allTestModels = [...testModels, ...hardcodedModels]
  
  test.each(allTestModels)('should compile $name (from $filename)', async ({ name, model, filename }) => {
    console.log(`\n${'#'.repeat(80)}`)
    console.log(`TEST: ${name}`)
    console.log(`SOURCE: ${filename}`)
    console.log(`${'#'.repeat(80)}\n`)
    
    // Generate model name from the test name
    const modelName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    
    // Generate code
    const generator = new CodeGenerator(
      model.sheets[0].blocks,
      model.sheets[0].connections,
      model.sheets,
      modelName
    )
    
    const result = generator.generateCode()
    expect(result.success).toBe(true)
    expect(result.files).toBeDefined()
    
    // Write generated files to PlatformIO library directory
    result.files!.forEach(file => {
      const filePath = path.join(libDir, file.name)
      fs.writeFileSync(filePath, file.content)
      console.log(`\nGenerated file: ${file.name} (${file.content.length} bytes)`)
      console.log('-'.repeat(40))
      console.log(file.content.substring(0, 500) + (file.content.length > 500 ? '\n...' : ''))
      console.log('-'.repeat(40))
    })
    
    // Generate test program based on model structure
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

  // Helper function to generate test program that runs full simulation
  function generateTestProgram(model: any, modelName: string): string {
    const inputs = model.sheets[0].blocks.filter((b: any) => b.type === 'input_port')
    const outputs = model.sheets[0].blocks.filter((b: any) => b.type === 'output_port')
    
    // Get simulation parameters from model or use defaults
    const simulationDuration = model.globalSettings?.simulationDuration || 10.0
    const simulationTimeStep = model.globalSettings?.simulationTimeStep || 0.01
    
    let program = `#include <${modelName}.h>\n`
    program += `#include <stdio.h>\n`
    program += `#include <math.h>\n\n`
    
    program += `int main() {\n`
    program += `    ${modelName}_t model;\n`
    program += `    \n`
    program += `    // Initialize model with time step\n`
    program += `    ${modelName}_init(&model, ${simulationTimeStep});\n`
    program += `    \n`
    
    // Set test inputs based on model metadata or defaults
    program += `    // Set input values\n`
    if (model.metadata?.testInputs) {
      for (const [portName, value] of Object.entries(model.metadata.testInputs)) {
        const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
        if (Array.isArray(value)) {
          // Vector input
          value.forEach((v, i) => {
            program += `    model.inputs.${sanitizedPortName}[${i}] = ${v};\n`
          })
        } else {
          // Scalar input
          program += `    model.inputs.${sanitizedPortName} = ${value};\n`
        }
      }
    } else {
      // Default test values
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
      
      // Check if this is a vector output
      const outputWire = model.sheets[0].connections.find((w: any) => w.targetBlockId === output.id)
      const isVector = checkIfVectorOutput(output, outputWire, model.sheets[0])
      
      if (isVector) {
        program += `    double final_${sanitizedPortName}[${isVector.size}] = {0};\n`
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
    
    // Store final values (from last time step)
    program += `        // Store final values\n`
    outputs.forEach((output: any) => {
      const portName = output.parameters?.portName || output.name
      const sanitizedPortName = portName.replace(/[^a-zA-Z0-9_]/g, '_')
      
      const outputWire = model.sheets[0].connections.find((w: any) => w.targetBlockId === output.id)
      const isVector = checkIfVectorOutput(output, outputWire, model.sheets[0])
      
      if (isVector) {
        for (let i = 0; i < isVector.size; i++) {
          program += `        final_${sanitizedPortName}[${i}] = model.outputs.${sanitizedPortName}[${i}];\n`
        }
      } else {
        program += `        final_${sanitizedPortName} = model.outputs.${sanitizedPortName};\n`
      }
    })
    
    // Optional: Print progress every 10% of simulation
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
      
      const outputWire = model.sheets[0].connections.find((w: any) => w.targetBlockId === output.id)
      const isVector = checkIfVectorOutput(output, outputWire, model.sheets[0])
      
      if (isVector) {
        program += `    printf("${sanitizedPortName}:\\n");\n`
        for (let i = 0; i < isVector.size; i++) {
          program += `    printf("  [${i}]: %.6f\\n", final_${sanitizedPortName}[${i}]);\n`
        }
      } else {
        program += `    printf("${sanitizedPortName}: %.6f\\n", final_${sanitizedPortName});\n`
      }
    })
    
    // Validate against expected outputs if specified
    if (model.metadata?.expectedOutputs || model.metadata?.expectedOutput !== undefined) {
      program += `    \n`
      program += `    // Validate expected outputs\n`
      program += `    double tolerance = 0.00001;\n`
      program += `    int all_passed = 1;\n`
      
      // Handle legacy single expectedOutput
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
      
      // Handle multiple expectedOutputs
      if (model.metadata?.expectedOutputs) {
        for (const [outputPortName, expectedValue] of Object.entries(model.metadata.expectedOutputs)) {
          const sanitizedPortName = outputPortName.replace(/[^a-zA-Z0-9_]/g, '_')
          
          if (Array.isArray(expectedValue)) {
            // Vector expected output
            expectedValue.forEach((expected, i) => {
              program += `    {\n`
              program += `        double expected = ${expected};\n`
              program += `        double actual = final_${sanitizedPortName}[${i}];\n`
              program += `        if (fabs(actual - expected) > tolerance) {\n`
              program += `            printf("\\n✗ Test failed for ${sanitizedPortName}[${i}]! Expected: %.6f, Got: %.6f\\n", expected, actual);\n`
              program += `            all_passed = 0;\n`
              program += `        }\n`
              program += `    }\n`
            })
          } else {
            // Scalar expected output
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

  // Helper function to check if an output is a vector
  function checkIfVectorOutput(output: any, outputWire: any, sheet: any): { size: number } | null {
    if (!outputWire) return null
    
    const sourceBlock = sheet.blocks.find((b: any) => b.id === outputWire.sourceBlockId)
    if (!sourceBlock) return null
    
    // Check if source block has a vector data type
    if (sourceBlock.parameters?.dataType) {
      const typeMatch = sourceBlock.parameters.dataType.match(/^(float|double|long|bool)\[(\d+)\]$/)
      if (typeMatch) {
        return { size: parseInt(typeMatch[2]) }
      }
    }
    
    // Check if the source block has a vector value parameter
    if (sourceBlock.parameters?.value && Array.isArray(sourceBlock.parameters.value)) {
      return { size: sourceBlock.parameters.value.length }
    }
    
    // Check for transfer function with vector input (propagates vector output)
    if (sourceBlock.type === 'transfer_function') {
      const tfInputWire = sheet.connections.find((w: any) => w.targetBlockId === sourceBlock.id)
      if (tfInputWire) {
        const tfSourceBlock = sheet.blocks.find((b: any) => b.id === tfInputWire.sourceBlockId)
        if (tfSourceBlock?.parameters?.dataType) {
          const tfTypeMatch = tfSourceBlock.parameters.dataType.match(/^(float|double|long|bool)\[(\d+)\]$/)
          if (tfTypeMatch) {
            return { size: parseInt(tfTypeMatch[2]) }
          }
        }
      }
    }
    
    return null
  }

  // Helper function to validate simulation results
  function validateSimulationResults(output: string, model: any) {
    console.log('\n--- Validating Simulation Results ---')
    
    // Parse output values from the program output
    const outputValues: { [key: string]: number | number[] } = {}
    
    // Match scalar outputs
    const scalarMatches = output.matchAll(/(\w+):\s*([-\d.]+)/g)
    for (const match of scalarMatches) {
      const [_, name, value] = match
      if (!name.includes('[')) {
        outputValues[name] = parseFloat(value)
      }
    }
    
    // Match vector outputs
    const vectorPattern = /(\w+):\s*\n((?:\s*\[\d+\]:\s*[-\d.]+\s*\n)+)/g
    const vectorMatches = output.matchAll(vectorPattern)
    for (const match of vectorMatches) {
      const [_, name, vectorData] = match
      const elementMatches = vectorData.matchAll(/\[(\d+)\]:\s*([-\d.]+)/g)
      const vector: number[] = []
      for (const elementMatch of elementMatches) {
        const [__, index, value] = elementMatch
        vector[parseInt(index)] = parseFloat(value)
      }
      outputValues[name] = vector
    }
    
    console.log('Parsed output values:', outputValues)
    
    // Validate against expected values
    let allPassed = true
    
    // Check legacy single expected output
    if (model.metadata?.expectedOutput !== undefined) {
      const outputs = model.sheets[0].blocks.filter((b: any) => b.type === 'output_port')
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
    
    // Check multiple expected outputs
    if (model.metadata?.expectedOutputs) {
      for (const [outputPortName, expectedValue] of Object.entries(model.metadata.expectedOutputs)) {
        const sanitizedPortName = outputPortName.replace(/[^a-zA-Z0-9_]/g, '_')
        const actual = outputValues[sanitizedPortName]
        
        if (Array.isArray(expectedValue)) {
          // Vector comparison
          expect(actual).toBeInstanceOf(Array)
          if (Array.isArray(actual)) {
            expect(actual.length).toBe(expectedValue.length)
            expectedValue.forEach((expected, i) => {
              expect(actual[i]).toBeCloseTo(expected as number, 5)
              console.log(`✓ ${sanitizedPortName}[${i}]: ${actual[i]} ≈ ${expected}`)
            })
          }
        } else {
          // Scalar comparison
          expect(actual).toBeCloseTo(expectedValue as number, 5)
          console.log(`✓ ${sanitizedPortName}: ${actual} ≈ ${expectedValue}`)
        }
      }
    }
    
    if (allPassed) {
      console.log('\n✅ All validation checks passed!')
    }
  }
})