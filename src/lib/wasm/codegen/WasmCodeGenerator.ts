/**
 * WASM Code Generator
 *
 * Extends the base CodeGenerator to add WebAssembly-specific features:
 * - EMSCRIPTEN_KEEPALIVE macros for exported functions
 * - Simplified interface functions for JS interop
 * - Input/output index mapping
 * - Memory management helpers
 */

import { CodeGenerator, CodeGenerationOptions, CodeGenerationResult } from '@/lib/codegen/CodeGenerator'
import { Sheet } from '@/lib/simulationEngine'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'

export interface WasmCodeGenerationOptions extends CodeGenerationOptions {
  /** Whether to include Emscripten-specific exports (default: true) */
  includeEmscriptenExports?: boolean

  /** Whether to include debug/logging functions (default: false) */
  includeDebugFunctions?: boolean
}

export interface WasmCodeGenerationResult extends CodeGenerationResult {
  /** Model name (for reference) */
  modelName: string

  /** Generated WASM wrapper file content */
  wasmWrapper: string

  /** Input port index mapping */
  inputMap: Map<string, number>

  /** Output port index mapping */
  outputMap: Map<string, number>
}

/**
 * Code generator that produces WASM-compatible C code
 */
export class WasmCodeGenerator extends CodeGenerator {
  private wasmOptions: Required<WasmCodeGenerationOptions>

  constructor(options: WasmCodeGenerationOptions = {}) {
    super(options)
    this.wasmOptions = {
      ...this.options,
      includeEmscriptenExports: options.includeEmscriptenExports ?? true,
      includeDebugFunctions: options.includeDebugFunctions ?? false
    }
  }

  /**
   * Generate C code with WASM exports
   */
  generateWasm(sheets: Sheet[]): WasmCodeGenerationResult {
    // Generate base code using parent class
    const baseResult = this.generate(sheets)

    // Extract input/output mappings
    const { inputMap, outputMap, outputSourceMap } = this.extractPortMappings(sheets)

    // Generate WASM wrapper
    const wasmWrapper = this.generateWasmWrapper(
      this.options.modelName,
      inputMap,
      outputMap,
      outputSourceMap
    )

    return {
      ...baseResult,
      modelName: this.options.modelName,
      wasmWrapper,
      inputMap,
      outputMap
    }
  }

  /**
   * Extract input and output port mappings for index-based access
   */
  private extractPortMappings(sheets: Sheet[]): {
    inputMap: Map<string, number>
    outputMap: Map<string, number>
    outputSourceMap: Map<string, string> // Maps output port name to source block name
  } {
    const inputMap = new Map<string, number>()
    const outputMap = new Map<string, number>()
    const outputSourceMap = new Map<string, string>()

    let inputIndex = 0
    let outputIndex = 0

    // Process all sheets to find input/output ports
    for (const sheet of sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'input_port') {
          const portName = block.parameters?.portName || block.name
          inputMap.set(portName, inputIndex++)
        } else if (block.type === 'output_port') {
          const portName = block.parameters?.portName || block.name
          outputMap.set(portName, outputIndex++)

          // Find the connection that feeds this output port
          const feedingConnection = sheet.connections.find(conn => conn.target === block.id)
          if (feedingConnection) {
            const sourceBlock = sheet.blocks.find(b => b.id === feedingConnection.source)
            if (sourceBlock) {
              outputSourceMap.set(portName, sourceBlock.name)
            }
          }
        }
      }
    }

    return { inputMap, outputMap, outputSourceMap }
  }

  /**
   * Generate WASM wrapper file with Emscripten exports
   */
  private generateWasmWrapper(
    modelName: string,
    inputMap: Map<string, number>,
    outputMap: Map<string, number>,
    outputSourceMap: Map<string, string>
  ): string {
    const sanitizedName = CCodeBuilder.sanitizeIdentifier(modelName)
    let wrapper = ''

    // Header comments
    const exportNote = this.wasmOptions.includeEmscriptenExports
      ? '\n * Functions are exported using EMSCRIPTEN_KEEPALIVE for direct calling from JS.'
      : ''
    wrapper += `/*
 * WASM Wrapper for ${modelName}
 *
 * This file provides a simple interface for WebAssembly/JavaScript interop.${exportNote}
 */

`

    // Includes
    wrapper += `#include "${sanitizedName}.h"\n\n`

    if (this.wasmOptions.includeEmscriptenExports) {
      wrapper += `#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

`
    }

    // Global model instance
    wrapper += `// Global model instance
static ${sanitizedName}_t ${sanitizedName}_instance = {0};

`

    // Input/output name arrays (for debugging)
    if (this.wasmOptions.includeDebugFunctions) {
      wrapper += this.generatePortNameArrays(inputMap, outputMap)
    }

    // Initialize function
    wrapper += this.generateWasmInitFunction(sanitizedName)

    // Set input function
    wrapper += this.generateWasmSetInputFunction(sanitizedName, inputMap)

    // Get output function
    wrapper += this.generateWasmGetOutputFunction(sanitizedName, outputMap, outputSourceMap)

    // Step function
    wrapper += this.generateWasmStepFunction(sanitizedName)

    // Get time function
    wrapper += this.generateWasmGetTimeFunction(sanitizedName)

    // Debug functions (optional)
    if (this.wasmOptions.includeDebugFunctions) {
      wrapper += this.generateWasmDebugFunctions(sanitizedName, inputMap, outputMap)
    }

    return wrapper
  }

  /**
   * Generate port name arrays for debugging
   */
  private generatePortNameArrays(
    inputMap: Map<string, number>,
    outputMap: Map<string, number>
  ): string {
    let code = '// Port name mappings for debugging\n'

    // Input names
    code += `static const char* input_names[] = {\n`
    const sortedInputs = Array.from(inputMap.entries())
      .sort((a, b) => a[1] - b[1])
    sortedInputs.forEach(([name], idx) => {
      code += `    "${name}"${idx < sortedInputs.length - 1 ? ',' : ''}\n`
    })
    code += `};\n\n`

    // Output names
    code += `static const char* output_names[] = {\n`
    const sortedOutputs = Array.from(outputMap.entries())
      .sort((a, b) => a[1] - b[1])
    sortedOutputs.forEach(([name], idx) => {
      code += `    "${name}"${idx < sortedOutputs.length - 1 ? ',' : ''}\n`
    })
    code += `};\n\n`

    return code
  }

  /**
   * Generate wasm_init function
   */
  private generateWasmInitFunction(modelName: string): string {
    const keepalive = this.wasmOptions.includeEmscriptenExports
      ? 'EMSCRIPTEN_KEEPALIVE\n'
      : ''

    return `// Initialize the model with a given timestep
${keepalive}void wasm_init(double dt) {
    ${modelName}_init(&${modelName}_instance, dt);
}

`
  }

  /**
   * Generate wasm_set_input function
   */
  private generateWasmSetInputFunction(
    modelName: string,
    inputMap: Map<string, number>
  ): string {
    const keepalive = this.wasmOptions.includeEmscriptenExports
      ? 'EMSCRIPTEN_KEEPALIVE\n'
      : ''

    let code = `// Set an input value by index
${keepalive}void wasm_set_input(int index, double value) {
    switch(index) {\n`

    // Generate switch cases for each input
    const sortedInputs = Array.from(inputMap.entries())
      .sort((a, b) => a[1] - b[1])

    sortedInputs.forEach(([portName, index]) => {
      const sanitizedPort = CCodeBuilder.sanitizeIdentifier(portName)
      code += `        case ${index}: ${modelName}_instance.inputs.${sanitizedPort} = value; break;\n`
    })

    code += `        default: break; // Invalid index\n`
    code += `    }\n`
    code += `}\n\n`

    return code
  }

  /**
   * Generate wasm_get_output function
   */
  private generateWasmGetOutputFunction(
    modelName: string,
    outputMap: Map<string, number>,
    outputSourceMap: Map<string, string>
  ): string {
    const keepalive = this.wasmOptions.includeEmscriptenExports
      ? 'EMSCRIPTEN_KEEPALIVE\n'
      : ''

    let code = `// Get an output value by index
${keepalive}double wasm_get_output(int index) {
    switch(index) {\n`

    // Generate switch cases for each output
    const sortedOutputs = Array.from(outputMap.entries())
      .sort((a, b) => a[1] - b[1])

    if (sortedOutputs.length > 0) {
      sortedOutputs.forEach(([portName, index]) => {
        // Output ports are fed by signals, not stored directly in outputs struct
        // Use the source signal if available
        const sourceBlock = outputSourceMap.get(portName)
        if (sourceBlock) {
          const sanitizedSource = CCodeBuilder.sanitizeIdentifier(sourceBlock)
          code += `        case ${index}: return ${modelName}_instance.signals.${sanitizedSource};\n`
        } else {
          // Fallback: try outputs struct (may not exist)
          const sanitizedPort = CCodeBuilder.sanitizeIdentifier(portName)
          code += `        case ${index}: return ${modelName}_instance.outputs.${sanitizedPort};\n`
        }
      })
    } else {
      code += `        // No output ports defined\n`
    }

    code += `        default: return 0.0; // Invalid index\n`
    code += `    }\n`
    code += `}\n\n`

    return code
  }

  /**
   * Generate wasm_step function
   */
  private generateWasmStepFunction(modelName: string): string {
    const keepalive = this.wasmOptions.includeEmscriptenExports
      ? 'EMSCRIPTEN_KEEPALIVE\n'
      : ''

    return `// Execute one simulation step
${keepalive}void wasm_step(double dt) {
    // Update dt if changed
    ${modelName}_instance.dt = dt;
    ${modelName}_step(&${modelName}_instance);
}

`
  }

  /**
   * Generate wasm_get_time function
   */
  private generateWasmGetTimeFunction(modelName: string): string {
    const keepalive = this.wasmOptions.includeEmscriptenExports
      ? 'EMSCRIPTEN_KEEPALIVE\n'
      : ''

    return `// Get current simulation time
${keepalive}double wasm_get_time() {
    return ${modelName}_instance.time;
}

`
  }

  /**
   * Generate debug functions (optional)
   */
  private generateWasmDebugFunctions(
    modelName: string,
    inputMap: Map<string, number>,
    outputMap: Map<string, number>
  ): string {
    const keepalive = this.wasmOptions.includeEmscriptenExports
      ? 'EMSCRIPTEN_KEEPALIVE\n'
      : ''

    let code = '// Debug functions\n\n'

    // Get input count
    code += `${keepalive}int wasm_get_input_count() {
    return ${inputMap.size};
}

`

    // Get output count
    code += `${keepalive}int wasm_get_output_count() {
    return ${outputMap.size};
}

`

    // Get input name
    code += `${keepalive}const char* wasm_get_input_name(int index) {
    if (index < 0 || index >= ${inputMap.size}) return NULL;
    return input_names[index];
}

`

    // Get output name
    code += `${keepalive}const char* wasm_get_output_name(int index) {
    if (index < 0 || index >= ${outputMap.size}) return NULL;
    return output_names[index];
}

`

    return code
  }
}
