// lib/codeGeneration.ts

import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { Sheet } from '@/lib/simulationEngine'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'
import { parseType, ParsedType } from '@/lib/typeValidator'

interface CodeGenerationOptions {
  modelName: string
  sheets: Sheet[]
  globalSettings?: {
    simulationTimeStep: number
    simulationDuration: number
  }
}

interface GeneratedCode {
  headerFile: string
  sourceFile: string
  fileName: string
}

export function generateCCode(options: CodeGenerationOptions): GeneratedCode {
  const { modelName, sheets, globalSettings } = options
  const mainSheet = sheets.find(s => s.id === 'main') || sheets[0]
  
  if (!mainSheet) {
    throw new Error('No sheets found in model')
  }
  
  // Propagate types through the model
  const typeResult = propagateSignalTypes(mainSheet.blocks, mainSheet.connections)
  
  // Generate safe C identifier from model name
  const safeName = modelName.replace(/[^a-zA-Z0-9_]/g, '_')
  const upperName = safeName.toUpperCase()
  
  // Generate header file
  const headerFile = generateHeaderFile(safeName, upperName, mainSheet, typeResult.blockOutputTypes)
  
  // Generate source file
  const sourceFile = generateSourceFile(safeName, mainSheet, typeResult.blockOutputTypes, globalSettings)
  
  return {
    headerFile,
    sourceFile,
    fileName: safeName.toLowerCase()
  }
}

function generateHeaderFile(
  safeName: string,
  upperName: string,
  sheet: Sheet,
  blockTypes: Map<string, string>
): string {
  const inputs = sheet.blocks.filter(b => b.type === 'input_port')
  const outputs = sheet.blocks.filter(b => b.type === 'output_port')
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  
  let header = `#ifndef ${upperName}_H
#define ${upperName}_H

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

`

  // Generate input structure
  if (inputs.length > 0) {
    header += `// Input signals structure\n`
    header += `typedef struct {\n`
    for (const input of inputs) {
      const portName = input.parameters?.portName || input.name
      const dataType = input.parameters?.dataType || 'double'
      const cType = getCType(dataType)
      header += `    ${cType} ${sanitizeIdentifier(portName)};\n`
    }
    header += `} ${safeName}_inputs_t;\n\n`
  }

  // Generate output structure
  if (outputs.length > 0) {
    header += `// Output signals structure\n`
    header += `typedef struct {\n`
    for (const output of outputs) {
      const portName = output.parameters?.portName || output.name
      // Get type from connected wire
      const connectedWire = sheet.connections.find(w => w.targetBlockId === output.id)
      if (connectedWire) {
        const sourceKey = `${connectedWire.sourceBlockId}:${connectedWire.sourcePortIndex}`
        const signalType = blockTypes.get(sourceKey) || 'double'
        const cType = getCType(signalType)
        header += `    ${cType} ${sanitizeIdentifier(portName)};\n`
      }
    }
    header += `} ${safeName}_outputs_t;\n\n`
  }

  // Generate states structure
  const needsStates = transferFunctions.length > 0 || hasVectorTransferFunctions(sheet, blockTypes)
  if (needsStates) {
    header += `// Internal states structure\n`
    header += `typedef struct {\n`
    
    // Add states for each transfer function
    for (const tf of transferFunctions) {
      const tfName = sanitizeIdentifier(tf.name)
      const denominator = tf.parameters?.denominator || [1, 1]
      const stateOrder = Math.max(0, denominator.length - 1)
      
      // Check if this TF processes vectors
      const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
      if (inputWire) {
        const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
        const inputType = blockTypes.get(sourceKey)
        if (inputType) {
          const parsed = tryParseType(inputType)
          if (parsed?.isArray && parsed.arraySize) {
            // Vector transfer function - need array of states
            if (stateOrder > 0) {
              header += `    double ${tfName}_states[${parsed.arraySize}][${stateOrder}];\n`
            }
          } else {
            // Scalar transfer function
            if (stateOrder > 0) {
              header += `    double ${tfName}_states[${stateOrder}];\n`
            }
          }
        }
      }
    }
    
    header += `} ${safeName}_states_t;\n\n`
  }

  // Generate main structure
  header += `// Main model structure\n`
  header += `typedef struct {\n`
  if (inputs.length > 0) header += `    ${safeName}_inputs_t inputs;\n`
  if (outputs.length > 0) header += `    ${safeName}_outputs_t outputs;\n`
  if (needsStates) header += `    ${safeName}_states_t states;\n`
  header += `    double time;\n`
  header += `    double dt;\n`
  header += `} ${safeName}_t;\n\n`

  // Function prototypes
  header += `// Initialize the model\n`
  header += `void ${safeName}_init(${safeName}_t* model, double time_step);\n\n`

  header += `// Execute one simulation step\n`
  header += `void ${safeName}_step(${safeName}_t* model);\n\n`

  if (transferFunctions.length > 0) {
    header += `// Compute state derivatives (for RK4 integration)\n`
    header += `void ${safeName}_derivatives(${safeName}_t* model, `
    if (needsStates) header += `const ${safeName}_states_t* current_states, ${safeName}_states_t* state_derivatives`
    header += `);\n\n`
  }

  header += `#ifdef __cplusplus\n}\n#endif\n\n#endif // ${upperName}_H\n`

  return header
}

function generateSourceFile(
  safeName: string,
  sheet: Sheet,
  blockTypes: Map<string, string>,
  globalSettings?: any
): string {
  let source = `#include "${safeName}.h"\n\n`

  // Generate init function
  source += generateInitFunction(safeName, sheet, blockTypes)
  
  // Generate step function
  source += generateStepFunction(safeName, sheet, blockTypes)
  
  // Generate derivatives function if needed
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  if (transferFunctions.length > 0) {
    source += generateDerivativesFunction(safeName, sheet, blockTypes)
  }

  return source
}

function generateInitFunction(safeName: string, sheet: Sheet, blockTypes: Map<string, string>): string {
  let code = `void ${safeName}_init(${safeName}_t* model, double time_step) {\n`
  code += `    // Initialize model parameters\n`
  code += `    model->time = 0.0;\n`
  code += `    model->dt = time_step;\n\n`

  // Initialize inputs
  const inputs = sheet.blocks.filter(b => b.type === 'input_port')
  if (inputs.length > 0) {
    code += `    // Initialize inputs\n`
    for (const input of inputs) {
      const portName = input.parameters?.portName || input.name
      const dataType = input.parameters?.dataType || 'double'
      const defaultValue = input.parameters?.defaultValue || 0
      const parsed = tryParseType(dataType)
      
      if (parsed?.isArray && parsed.arraySize) {
        // Initialize array
        code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
        code += `        model->inputs.${sanitizeIdentifier(portName)}[i] = ${defaultValue};\n`
        code += `    }\n`
      } else {
        // Initialize scalar
        code += `    model->inputs.${sanitizeIdentifier(portName)} = ${defaultValue};\n`
      }
    }
    code += `\n`
  }

  // Initialize states
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  if (transferFunctions.length > 0) {
    code += `    // Initialize transfer function states\n`
    for (const tf of transferFunctions) {
      const tfName = sanitizeIdentifier(tf.name)
      const denominator = tf.parameters?.denominator || [1, 1]
      const stateOrder = Math.max(0, denominator.length - 1)
      
      if (stateOrder > 0) {
        // Check if this TF processes vectors
        const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
        if (inputWire) {
          const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
          const inputType = blockTypes.get(sourceKey)
          if (inputType) {
            const parsed = tryParseType(inputType)
            if (parsed?.isArray && parsed.arraySize) {
              // Vector transfer function - initialize 2D array
              code += `    memset(model->states.${tfName}_states, 0, sizeof(model->states.${tfName}_states));\n`
            } else {
              // Scalar transfer function
              code += `    memset(model->states.${tfName}_states, 0, sizeof(model->states.${tfName}_states));\n`
            }
          }
        }
      }
    }
  }

  code += `}\n\n`
  return code
}

function generateStepFunction(safeName: string, sheet: Sheet, blockTypes: Map<string, string>): string {
  let code = `void ${safeName}_step(${safeName}_t* model) {\n`
  
  // Generate temporary variables for internal signals
  code += `    // Internal signals\n`
  const internalSignals = new Map<string, { type: string, name: string }>()
  
  // Collect all internal signals (not input/output ports)
  for (const block of sheet.blocks) {
    if (block.type !== 'input_port' && block.type !== 'output_port' && 
        block.type !== 'signal_display' && block.type !== 'signal_logger') {
      const outputKey = `${block.id}:0`
      const signalType = blockTypes.get(outputKey)
      if (signalType) {
        const signalName = `sig_${sanitizeIdentifier(block.name)}`
        internalSignals.set(outputKey, { type: signalType, name: signalName })
        const cType = getCType(signalType)
        code += `    ${cType} ${signalName};\n`
      }
    }
  }
  code += `\n`

  // Generate block computations in execution order
  const executionOrder = calculateExecutionOrder(sheet.blocks, sheet.connections)
  
  code += `    // Compute block outputs\n`
  for (const blockId of executionOrder) {
    const block = sheet.blocks.find(b => b.id === blockId)
    if (!block) continue
    
    code += generateBlockComputation(block, sheet, blockTypes, internalSignals)
  }

  // Update time
  code += `\n    // Update simulation time\n`
  code += `    model->time += model->dt;\n`
  
  code += `}\n\n`
  return code
}

function generateBlockComputation(
  block: BlockData,
  sheet: Sheet,
  blockTypes: Map<string, string>,
  internalSignals: Map<string, { type: string, name: string }>
): string {
  let code = ''
  
  // Skip display and logger blocks
  if (block.type === 'signal_display' || block.type === 'signal_logger') {
    return ''
  }
  
  // Get output signal name
  const outputKey = `${block.id}:0`
  const outputSignal = internalSignals.get(outputKey)
  const outputName = outputSignal?.name || `sig_${sanitizeIdentifier(block.name)}`
  
  // Get input connections
  const inputWires = sheet.connections.filter(w => w.targetBlockId === block.id)
  
  switch (block.type) {
    case 'input_port':
      const portName = block.parameters?.portName || block.name
      code += `    // Input port: ${block.name}\n`
      const dataType = block.parameters?.dataType || 'double'
      const parsed = tryParseType(dataType)
      if (parsed?.isArray && parsed.arraySize) {
        // Copy array
        code += `    memcpy(${outputName}, model->inputs.${sanitizeIdentifier(portName)}, sizeof(${outputName}));\n`
      } else {
        // Copy scalar
        code += `    ${outputName} = model->inputs.${sanitizeIdentifier(portName)};\n`
      }
      break
      
    case 'source':
      code += generateSourceBlock(block, outputName, blockTypes.get(outputKey))
      break
      
    case 'sum':
      code += generateSumBlock(block, outputName, inputWires, internalSignals, blockTypes.get(outputKey))
      break
      
    case 'multiply':
      code += generateMultiplyBlock(block, outputName, inputWires, internalSignals, blockTypes.get(outputKey))
      break
      
    case 'scale':
      code += generateScaleBlock(block, outputName, inputWires, internalSignals, blockTypes.get(outputKey))
      break
      
    case 'transfer_function':
      code += generateTransferFunctionBlock(block, outputName, inputWires, internalSignals, blockTypes.get(outputKey))
      break
      
    case 'output_port':
      code += generateOutputPortBlock(block, inputWires, internalSignals)
      break
  }
  
  return code
}

function generateSourceBlock(block: BlockData, outputName: string, outputType?: string): string {
  const signalType = block.parameters?.signalType || 'constant'
  const value = block.parameters?.value || 0
  const parsed = outputType ? tryParseType(outputType) : null
  
  let code = `    // Source block: ${block.name}\n`
  
  if (signalType === 'constant') {
    if (parsed?.isArray && parsed.arraySize) {
      code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${value};\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${value};\n`
    }
  } else {
    // For time-varying sources, generate appropriate code
    code += `    // TODO: Implement ${signalType} signal generation\n`
    if (parsed?.isArray && parsed.arraySize) {
      code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = 0.0; // Placeholder\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = 0.0; // Placeholder\n`
    }
  }
  
  return code
}

function generateSumBlock(
  block: BlockData,
  outputName: string,
  inputWires: WireData[],
  signals: Map<string, { type: string, name: string }>,
  outputType?: string
): string {
  let code = `    // Sum block: ${block.name}\n`
  const parsed = outputType ? tryParseType(outputType) : null
  
  if (parsed?.isArray && parsed.arraySize) {
    // Vector sum
    code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
    code += `        ${outputName}[i] = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const inputSignal = signals.get(sourceKey)
      if (inputSignal) {
        if (i > 0) code += ` + `
        code += `${inputSignal.name}[i]`
      }
    }
    
    code += `;\n    }\n`
  } else {
    // Scalar sum
    code += `    ${outputName} = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const inputSignal = signals.get(sourceKey)
      if (inputSignal) {
        if (i > 0) code += ` + `
        code += inputSignal.name
      }
    }
    
    code += `;\n`
  }
  
  return code
}

function generateMultiplyBlock(
  block: BlockData,
  outputName: string,
  inputWires: WireData[],
  signals: Map<string, { type: string, name: string }>,
  outputType?: string
): string {
  let code = `    // Multiply block: ${block.name}\n`
  const parsed = outputType ? tryParseType(outputType) : null
  
  if (parsed?.isArray && parsed.arraySize) {
    // Vector multiply
    code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
    code += `        ${outputName}[i] = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const inputSignal = signals.get(sourceKey)
      if (inputSignal) {
        if (i > 0) code += ` * `
        code += `${inputSignal.name}[i]`
      }
    }
    
    code += `;\n    }\n`
  } else {
    // Scalar multiply
    code += `    ${outputName} = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const inputSignal = signals.get(sourceKey)
      if (inputSignal) {
        if (i > 0) code += ` * `
        code += inputSignal.name
      }
    }
    
    code += `;\n`
  }
  
  return code
}

function generateScaleBlock(
  block: BlockData,
  outputName: string,
  inputWires: WireData[],
  signals: Map<string, { type: string, name: string }>,
  outputType?: string
): string {
  const gain = block.parameters?.gain || 1
  let code = `    // Scale block: ${block.name}\n`
  const parsed = outputType ? tryParseType(outputType) : null
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const inputSignal = signals.get(sourceKey)
    
    if (inputSignal) {
      if (parsed?.isArray && parsed.arraySize) {
        // Vector scale
        code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = ${inputSignal.name}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        // Scalar scale
        code += `    ${outputName} = ${inputSignal.name} * ${gain};\n`
      }
    }
  }
  
  return code
}

function generateTransferFunctionBlock(
  block: BlockData,
  outputName: string,
  inputWires: WireData[],
  signals: Map<string, { type: string, name: string }>,
  outputType?: string
): string {
  const numerator = block.parameters?.numerator || [1]
  const denominator = block.parameters?.denominator || [1, 1]
  const tfName = sanitizeIdentifier(block.name)
  const stateOrder = Math.max(0, denominator.length - 1)
  
  let code = `    // Transfer function block: ${block.name}\n`
  const parsed = outputType ? tryParseType(outputType) : null
  
  if (inputWires.length === 0) {
    code += `    // No input connected\n`
    if (parsed?.isArray && parsed.arraySize) {
      for (let i = 0; i < parsed.arraySize; i++) {
        code += `    ${outputName}[${i}] = 0.0;\n`
      }
    } else {
      code += `    ${outputName} = 0.0;\n`
    }
    return code
  }
  
  const wire = inputWires[0]
  const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
  const inputSignal = signals.get(sourceKey)
  
  if (!inputSignal) {
    code += `    // Input signal not found\n`
    return code
  }
  
  if (parsed?.isArray && parsed.arraySize) {
    // Vector transfer function processing
    code += `    // Vector transfer function (element-wise processing)\n`
    
    // Pure gain case (no dynamics)
    if (denominator.length === 1) {
      const gain = (numerator[0] || 0) / (denominator[0] || 1)
      code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${inputSignal.name}[i] * ${gain};\n`
      code += `    }\n`
    } else if (stateOrder === 1) {
      // First-order system: H(s) = b0 / (a1*s + a0)
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) {
        // Degenerate case - pure gain
        const gain = a0 !== 0 ? b0 / a0 : 0
        code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = ${inputSignal.name}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        // Dynamic first-order system with RK4 integration
        code += `    for (int i = 0; i < ${parsed.arraySize}; i++) {\n`
        code += `        double u = ${inputSignal.name}[i];\n`
        code += `        double y = model->states.${tfName}_states[i][0];\n`
        code += `        double h = model->dt;\n`
        code += `        \n`
        code += `        // RK4 integration for dy/dt = (b0*u - a0*y) / a1\n`
        code += `        double k1 = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `        double k2 = (${b0} * u - ${a0} * (y + 0.5 * h * k1)) / ${a1};\n`
        code += `        double k3 = (${b0} * u - ${a0} * (y + 0.5 * h * k2)) / ${a1};\n`
        code += `        double k4 = (${b0} * u - ${a0} * (y + h * k3)) / ${a1};\n`
        code += `        \n`
        code += `        model->states.${tfName}_states[i][0] = y + (h / 6.0) * (k1 + 2*k2 + 2*k3 + k4);\n`
        code += `        ${outputName}[i] = model->states.${tfName}_states[i][0];\n`
        code += `    }\n`
      }
    } else {
      // Higher-order systems - placeholder
      code += `    // TODO: Implement higher-order transfer function for vectors\n`
      for (let i = 0; i < parsed.arraySize; i++) {
        code += `    ${outputName}[${i}] = 0.0; // Placeholder\n`
      }
    }
  } else {
    // Scalar transfer function processing
    code += `    // Scalar transfer function\n`
    
    // Pure gain case (no dynamics)
    if (denominator.length === 1) {
      const gain = (numerator[0] || 0) / (denominator[0] || 1)
      code += `    ${outputName} = ${inputSignal.name} * ${gain};\n`
    } else if (stateOrder === 1) {
      // First-order system: H(s) = b0 / (a1*s + a0)
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) {
        // Degenerate case - pure gain
        const gain = a0 !== 0 ? b0 / a0 : 0
        code += `    ${outputName} = ${inputSignal.name} * ${gain};\n`
      } else {
        // Dynamic first-order system with RK4 integration
        code += `    double u = ${inputSignal.name};\n`
        code += `    double y = model->states.${tfName}_states[0];\n`
        code += `    double h = model->dt;\n`
        code += `    \n`
        code += `    // RK4 integration for dy/dt = (b0*u - a0*y) / a1\n`
        code += `    double k1 = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    double k2 = (${b0} * u - ${a0} * (y + 0.5 * h * k1)) / ${a1};\n`
        code += `    double k3 = (${b0} * u - ${a0} * (y + 0.5 * h * k2)) / ${a1};\n`
        code += `    double k4 = (${b0} * u - ${a0} * (y + h * k3)) / ${a1};\n`
        code += `    \n`
        code += `    model->states.${tfName}_states[0] = y + (h / 6.0) * (k1 + 2*k2 + 2*k3 + k4);\n`
        code += `    ${outputName} = model->states.${tfName}_states[0];\n`
      }
    } else if (stateOrder === 2) {
      // Second-order system
      const a2 = denominator[0]
      const a1 = denominator[1]
      const a0 = denominator[2]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a2 === 0) {
        code += `    ${outputName} = 0.0; // Invalid transfer function\n`
      } else {
        code += `    double u = ${inputSignal.name};\n`
        code += `    double x1 = model->states.${tfName}_states[0];\n`
        code += `    double x2 = model->states.${tfName}_states[1];\n`
        code += `    double h = model->dt;\n`
        code += `    \n`
        code += `    // RK4 integration for second-order system\n`
        code += `    // dx1/dt = x2, dx2/dt = (b0*u - a0*x1 - a1*x2) / a2\n`
        code += `    double k1_1 = x2;\n`
        code += `    double k1_2 = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    \n`
        code += `    double k2_1 = x2 + 0.5 * h * k1_2;\n`
        code += `    double k2_2 = (${b0} * u - ${a0} * (x1 + 0.5 * h * k1_1) - ${a1} * (x2 + 0.5 * h * k1_2)) / ${a2};\n`
        code += `    \n`
        code += `    double k3_1 = x2 + 0.5 * h * k2_2;\n`
        code += `    double k3_2 = (${b0} * u - ${a0} * (x1 + 0.5 * h * k2_1) - ${a1} * (x2 + 0.5 * h * k2_2)) / ${a2};\n`
        code += `    \n`
        code += `    double k4_1 = x2 + h * k3_2;\n`
        code += `    double k4_2 = (${b0} * u - ${a0} * (x1 + h * k3_1) - ${a1} * (x2 + h * k3_2)) / ${a2};\n`
        code += `    \n`
        code += `    model->states.${tfName}_states[0] = x1 + (h / 6.0) * (k1_1 + 2*k2_1 + 2*k3_1 + k4_1);\n`
        code += `    model->states.${tfName}_states[1] = x2 + (h / 6.0) * (k1_2 + 2*k2_2 + 2*k3_2 + k4_2);\n`
        code += `    ${outputName} = model->states.${tfName}_states[0];\n`
      }
    } else {
      // Higher-order systems - simplified implementation
      code += `    // TODO: Implement higher-order transfer function\n`
      code += `    ${outputName} = 0.0; // Placeholder\n`
    }
  }
  
  return code
}

function generateOutputPortBlock(
  block: BlockData,
  inputWires: WireData[],
  signals: Map<string, { type: string, name: string }>
): string {
  const portName = block.parameters?.portName || block.name
  let code = `    // Output port: ${block.name}\n`
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const inputSignal = signals.get(sourceKey)
    
    if (inputSignal) {
      const inputType = tryParseType(inputSignal.type)
      if (inputType?.isArray && inputType.arraySize) {
        // Copy array
        code += `    memcpy(model->outputs.${sanitizeIdentifier(portName)}, ${inputSignal.name}, sizeof(model->outputs.${sanitizeIdentifier(portName)}));\n`
      } else {
        // Copy scalar
        code += `    model->outputs.${sanitizeIdentifier(portName)} = ${inputSignal.name};\n`
      }
    }
  }
  
  return code
}

function generateDerivativesFunction(safeName: string, sheet: Sheet, blockTypes: Map<string, string>): string {
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  
  if (transferFunctions.length === 0) {
    return ''
  }
  
  let code = `void ${safeName}_derivatives(${safeName}_t* model, const ${safeName}_states_t* current_states, ${safeName}_states_t* state_derivatives) {\n`
  code += `    // Clear state derivatives\n`
  code += `    memset(state_derivatives, 0, sizeof(${safeName}_states_t));\n\n`
  
  // Generate derivative calculations for each transfer function
  for (const tf of transferFunctions) {
    const tfName = sanitizeIdentifier(tf.name)
    const numerator = tf.parameters?.numerator || [1]
    const denominator = tf.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) continue // No states for pure gain
    
    // Get input type to determine if vector
    const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
    if (inputWire) {
      const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
      const inputType = blockTypes.get(sourceKey)
      const parsed = inputType ? tryParseType(inputType) : null
      
      code += `    // Transfer function: ${tf.name}\n`
      
      if (parsed?.isArray && parsed.arraySize) {
        // Vector transfer function
        code += `    // Vector processing - ${parsed.arraySize} elements\n`
        
        if (stateOrder === 1) {
          // First-order system
          const a1 = denominator[0]
          const a0 = denominator[1]
          const b0 = numerator[numerator.length - 1] || 0
          
          for (let i = 0; i < parsed.arraySize; i++) {
            code += `    // Element ${i}: dy/dt = (b0*u - a0*y) / a1\n`
            code += `    state_derivatives->${tfName}_states[${i}][0] = `
            code += `(${b0} * input_${i} - ${a0} * current_states->${tfName}_states[${i}][0]) / ${a1};\n`
          }
        } else if (stateOrder === 2) {
          // Second-order system
          const a2 = denominator[0]
          const a1 = denominator[1]
          const a0 = denominator[2]
          const b0 = numerator[numerator.length - 1] || 0
          
          for (let i = 0; i < parsed.arraySize; i++) {
            code += `    // Element ${i}: dx1/dt = x2, dx2/dt = (b0*u - a0*x1 - a1*x2) / a2\n`
            code += `    state_derivatives->${tfName}_states[${i}][0] = current_states->${tfName}_states[${i}][1];\n`
            code += `    state_derivatives->${tfName}_states[${i}][1] = `
            code += `(${b0} * input_${i} - ${a0} * current_states->${tfName}_states[${i}][0] - `
            code += `${a1} * current_states->${tfName}_states[${i}][1]) / ${a2};\n`
          }
        }
      } else {
        // Scalar transfer function
        if (stateOrder === 1) {
          // First-order system
          const a1 = denominator[0]
          const a0 = denominator[1]
          const b0 = numerator[numerator.length - 1] || 0
          
          code += `    // Scalar: dy/dt = (b0*u - a0*y) / a1\n`
          code += `    state_derivatives->${tfName}_states[0] = `
          code += `(${b0} * input - ${a0} * current_states->${tfName}_states[0]) / ${a1};\n`
        } else if (stateOrder === 2) {
          // Second-order system
          const a2 = denominator[0]
          const a1 = denominator[1]
          const a0 = denominator[2]
          const b0 = numerator[numerator.length - 1] || 0
          
          code += `    // Scalar: dx1/dt = x2, dx2/dt = (b0*u - a0*x1 - a1*x2) / a2\n`
          code += `    state_derivatives->${tfName}_states[0] = current_states->${tfName}_states[1];\n`
          code += `    state_derivatives->${tfName}_states[1] = `
          code += `(${b0} * input - ${a0} * current_states->${tfName}_states[0] - `
          code += `${a1} * current_states->${tfName}_states[1]) / ${a2};\n`
        }
      }
      
      code += `\n`
    }
  }
  
  code += `}\n\n`
  return code
}

// Helper functions

function getCType(typeString: string): string {
  try {
    const parsed = parseType(typeString)
    let baseType = parsed.baseType
    
    // Map to C types
    switch (baseType) {
      case 'float':
        baseType = 'float'
        break
      case 'double':
        baseType = 'double'
        break
      case 'long':
        baseType = 'long'
        break
      case 'bool':
        baseType = 'bool'
        break
      default:
        baseType = 'double'
    }
    
    if (parsed.isArray && parsed.arraySize) {
      return `${baseType}[${parsed.arraySize}]`
    }
    
    return baseType
  } catch {
    return 'double'
  }
}

function tryParseType(typeString: string): ParsedType | null {
  try {
    return parseType(typeString)
  } catch {
    return null
  }
}

function sanitizeIdentifier(name: string): string {
  // Replace non-alphanumeric characters with underscores
  let safe = name.replace(/[^a-zA-Z0-9_]/g, '_')
  
  // Ensure it doesn't start with a number
  if (/^\d/.test(safe)) {
    safe = '_' + safe
  }
  
  // Ensure it's not empty
  if (!safe) {
    safe = 'signal'
  }
  
  return safe
}

function calculateExecutionOrder(blocks: BlockData[], wires: WireData[]): string[] {
  // Simple topological sort
  const visited = new Set<string>()
  const order: string[] = []
  
  const visit = (blockId: string) => {
    if (visited.has(blockId)) return
    visited.add(blockId)
    
    // Visit dependencies first
    const inputWires = wires.filter(w => w.targetBlockId === blockId)
    for (const wire of inputWires) {
      visit(wire.sourceBlockId)
    }
    
    order.push(blockId)
  }
  
  // Start with source blocks
  for (const block of blocks) {
    if (block.type === 'input_port' || block.type === 'source') {
      visit(block.id)
    }
  }
  
  // Visit remaining blocks
  for (const block of blocks) {
    visit(block.id)
  }
  
  return order
}

function hasVectorTransferFunctions(sheet: Sheet, blockTypes: Map<string, string>): boolean {
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  
  for (const tf of transferFunctions) {
    const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
    if (inputWire) {
      const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
      const inputType = blockTypes.get(sourceKey)
      if (inputType) {
        const parsed = tryParseType(inputType)
        if (parsed?.isArray) {
          return true
        }
      }
    }
  }
  
  return false
}

export class CodeGenerator {
  private blocks: BlockData[]
  private connections: WireData[]
  private sheets: Sheet[]
  private modelName: string

  constructor(blocks: BlockData[], connections: WireData[], sheets: Sheet[], modelName: string) {
    this.blocks = blocks
    this.connections = connections
    this.sheets = sheets
    this.modelName = modelName
  }

  generateCode(): { success: boolean; files?: { name: string; content: string }[]; errors?: string[] } {
    try {
      // Create options for the existing generateCCode function
      const options: CodeGenerationOptions = {
        modelName: this.modelName,
        sheets: this.sheets,
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      }

      // Call the existing function
      const result = generateCCode(options)

      // Return in the expected format
      return {
        success: true,
        files: [
          {
            name: `${result.fileName}.h`,
            content: result.headerFile
          },
          {
            name: `${result.fileName}.c`,
            content: result.sourceFile
          },
          {
            name: 'library.properties',
            content: this.generateLibraryProperties()
          }
        ]
      }
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error during code generation']
      }
    }
  }

  private generateLibraryProperties(): string {
    const safeName = this.modelName.replace(/[^a-zA-Z0-9_]/g, '_')
    return `name=${safeName}
version=1.0.0
author=Generated
maintainer=Generated
sentence=Generated library from visual model ${this.modelName}
paragraph=This library was automatically generated from a block diagram model.
category=Signal Input/Output
url=
architectures=*
includes=${safeName}.h
`
  }
}