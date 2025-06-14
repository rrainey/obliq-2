// lib/codeGeneration.ts - New version with proper array handling

import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { Sheet } from '@/lib/simulationEngine'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'
import { parseType, ParsedType } from '@/lib/typeValidator'
import { resolveSheetLabelConnections } from './sheetLabelUtils'

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

// Helper type for C variable declarations
interface CVariable {
  baseType: string
  name: string
  arraySize?: number
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

// Convert a type string to a C variable declaration
function parseTypeToVariable(typeString: string, varName: string): CVariable {
  try {
    const parsed = parseType(typeString)
    return {
      baseType: mapToCBaseType(parsed.baseType),
      name: sanitizeIdentifier(varName),
      arraySize: parsed.isArray ? parsed.arraySize : undefined
    }
  } catch {
    return {
      baseType: 'double',
      name: sanitizeIdentifier(varName)
    }
  }
}

// Map our type names to C types
function mapToCBaseType(baseType: string): string {
  switch (baseType) {
    case 'float': return 'float'
    case 'double': return 'double'
    case 'long': return 'long'
    case 'bool': return 'bool'
    default: return 'double'
  }
}

// Generate a C struct member declaration
function generateStructMember(variable: CVariable): string {
  if (variable.arraySize !== undefined) {
    return `    ${variable.baseType} ${variable.name}[${variable.arraySize}];`
  } else {
    return `    ${variable.baseType} ${variable.name};`
  }
}

// Generate a C variable declaration
function generateVariableDeclaration(variable: CVariable): string {
  if (variable.arraySize !== undefined) {
    return `${variable.baseType} ${variable.name}[${variable.arraySize}]`
  } else {
    return `${variable.baseType} ${variable.name}`
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
      const variable = parseTypeToVariable(dataType, portName)
      header += generateStructMember(variable) + '\n'
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
        const variable = parseTypeToVariable(signalType, portName)
        header += generateStructMember(variable) + '\n'
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
      
      if (stateOrder > 0) {
        // Check if this TF processes vectors
        const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
        if (inputWire) {
          const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
          const inputType = blockTypes.get(sourceKey)
          if (inputType) {
            const parsed = tryParseType(inputType)
            if (parsed?.isArray && parsed.arraySize) {
              // Vector transfer function - need 2D array of states
              header += `    double ${tfName}_states[${parsed.arraySize}][${stateOrder}];\n`
            } else {
              // Scalar transfer function
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
    header += `void ${safeName}_derivatives(${safeName}_t* model`
    if (needsStates) {
      header += `, const ${safeName}_states_t* current_states, ${safeName}_states_t* state_derivatives`
    }
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
      const variable = parseTypeToVariable(dataType, portName)
      
      if (variable.arraySize) {
        // Initialize array
        code += `    for (int i = 0; i < ${variable.arraySize}; i++) {\n`
        code += `        model->inputs.${variable.name}[i] = ${defaultValue};\n`
        code += `    }\n`
      } else {
        // Initialize scalar
        code += `    model->inputs.${variable.name} = ${defaultValue};\n`
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
        code += `    memset(model->states.${tfName}_states, 0, sizeof(model->states.${tfName}_states));\n`
      }
    }
  }

  code += `}\n\n`
  return code
}

function generateStepFunction(safeName: string, sheet: Sheet, blockTypes: Map<string, string>): string {
  console.log('[CodeGen] generateStepFunction called')
  let code = `void ${safeName}_step(${safeName}_t* model) {\n`
  
  try {
    // Generate temporary variables for internal signals
    code += `    // Internal signals\n`
    const internalSignals = new Map<string, CVariable>()
    
    // Collect all internal signals (excluding input/output ports and display blocks)
    console.log('[CodeGen] Collecting internal signals...')
    for (const block of sheet.blocks) {
      if (block.type !== 'input_port' && block.type !== 'output_port' && 
          block.type !== 'signal_display' && block.type !== 'signal_logger' &&
          block.type !== 'sheet_label_sink' && block.type !== 'sheet_label_source') {
        const outputKey = `${block.id}:0`
        const signalType = blockTypes.get(outputKey)
        if (signalType) {
          const signalName = `sig_${sanitizeIdentifier(block.name)}`
          const variable = parseTypeToVariable(signalType, signalName)
          internalSignals.set(outputKey, variable)
          code += `    ${generateVariableDeclaration(variable)};\n`
        }
      }
    }
    
    code += `\n`

    // Generate block computations in execution order
    console.log('[CodeGen] Calculating execution order...')
    const executionOrder = calculateExecutionOrder(sheet.blocks, sheet.connections)
    console.log('[CodeGen] Execution order calculated, blocks:', executionOrder.length)
    
    code += `    // Compute block outputs\n`
    for (const blockId of executionOrder) {
      const block = sheet.blocks.find(b => b.id === blockId)
      if (!block) {
        console.warn('[CodeGen] Block not found in execution order:', blockId)
        continue
      }
      
      console.log('[CodeGen] Processing block:', block.type, block.name)
      
      // Skip certain block types that don't need computation
      if (block.type === 'sheet_label_sink' || 
          block.type === 'sheet_label_source' ||
          block.type === 'input_port' ||
          block.type === 'signal_display' ||
          block.type === 'signal_logger') {
        console.log('[CodeGen] Skipping block type:', block.type)
        continue
      }
      
      try {
        code += generateBlockComputation(block, sheet, blockTypes, internalSignals)
      } catch (error) {
        console.error('[CodeGen] Error generating computation for block:', block.name, error)
        throw error
      }
    }

    // Update time
    code += `\n    // Update simulation time\n`
    code += `    model->time += model->dt;\n`
    
    code += `}\n\n`
    
    console.log('[CodeGen] Step function generation complete')
    return code
  } catch (error) {
    console.error('[CodeGen] Error in generateStepFunction:', error)
    throw error
  }
}

function generateBlockComputation(
  block: BlockData,
  sheet: Sheet,
  blockTypes: Map<string, string>,
  internalSignals: Map<string, CVariable>
): string {
  console.log('[CodeGen] generateBlockComputation for:', block.type, block.name)
  
  let code = ''
  
  // Get output signal info only for blocks that produce outputs
  if (block.type !== 'output_port') {
    const outputKey = `${block.id}:0`
    const outputSignal = internalSignals.get(outputKey)
    if (!outputSignal) {
      console.warn('[CodeGen] No output signal found for block:', block.name)
      return ''
    }
  }
  
  // Get input connections
  const inputWires = sheet.connections.filter(w => w.targetBlockId === block.id)
  console.log('[CodeGen] Block has', inputWires.length, 'input connections')
  
  try {
    switch (block.type) {
      case 'source':
        code += generateSourceBlock(block, internalSignals.get(`${block.id}:0`)!, blockTypes.get(`${block.id}:0`))
        break
        
      case 'sum':
        code += generateSumBlock(block, internalSignals.get(`${block.id}:0`)!, inputWires, internalSignals, sheet, blockTypes.get(`${block.id}:0`))
        break
        
      case 'multiply':
        code += generateMultiplyBlock(block, internalSignals.get(`${block.id}:0`)!, inputWires, internalSignals, sheet, blockTypes.get(`${block.id}:0`))
        break
        
      case 'scale':
        code += generateScaleBlock(block, internalSignals.get(`${block.id}:0`)!, inputWires, internalSignals, sheet, blockTypes.get(`${block.id}:0`))
        break
        
      case 'transfer_function':
        code += generateTransferFunctionBlock(block, internalSignals.get(`${block.id}:0`)!, inputWires, internalSignals, sheet, blockTypes.get(`${block.id}:0`))
        break
        
      case 'lookup_1d':
        code += generateLookup1DBlock(block, internalSignals.get(`${block.id}:0`)!, inputWires, internalSignals)
        break
        
      case 'lookup_2d':
        code += generateLookup2DBlock(block, internalSignals.get(`${block.id}:0`)!, inputWires, internalSignals)
        break
        
      case 'output_port':
        code += generateOutputPortBlock(block, inputWires, internalSignals, sheet)
        break
        
      case 'subsystem':
        const subsystemOutput = internalSignals.get(`${block.id}:0`)!
        code += `    // TODO: Subsystem ${block.name}\n`
        if (subsystemOutput.arraySize) {
          code += `    for (int i = 0; i < ${subsystemOutput.arraySize}; i++) ${subsystemOutput.name}[i] = 0.0;\n`
        } else {
          code += `    ${subsystemOutput.name} = 0.0;\n`
        }
        break
        
      default:
        console.warn('[CodeGen] Unsupported block type:', block.type)
        code += `    // Unsupported block type: ${block.type}\n`
    }
    
    return code
  } catch (error) {
    console.error('[CodeGen] Error in block computation generation:', error)
    throw error
  }
}

function generateSourceBlock(block: BlockData, outputVar: CVariable, outputType?: string): string {
  const signalType = block.parameters?.signalType || 'constant'
  const value = block.parameters?.value || 0
  
  let code = `    // Source block: ${block.name}\n`
  
  if (signalType === 'constant') {
    if (outputVar.arraySize) {
      // Check if value is an array in parameters
      if (Array.isArray(value)) {
        // Use actual array values
        code += `    const ${outputVar.baseType} ${outputVar.name}_init[] = {`
        code += value.map((v: any) => String(v)).join(', ')
        code += `};\n`
        code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
        code += `        ${outputVar.name}[i] = ${outputVar.name}_init[i];\n`
        code += `    }\n`
      } else {
        // Fill array with scalar value
        code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
        code += `        ${outputVar.name}[i] = ${value};\n`
        code += `    }\n`
      }
    } else {
      code += `    ${outputVar.name} = ${value};\n`
    }
  } else {
    // For time-varying sources, generate appropriate code
    code += `    // TODO: Implement ${signalType} signal generation\n`
    if (outputVar.arraySize) {
      code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
      code += `        ${outputVar.name}[i] = 0.0; // Placeholder\n`
      code += `    }\n`
    } else {
      code += `    ${outputVar.name} = 0.0; // Placeholder\n`
    }
  }
  
  return code
}

function generateSumBlock(
  block: BlockData,
  outputVar: CVariable,
  inputWires: WireData[],
  signals: Map<string, CVariable>,
  sheet: Sheet,
  outputType: string | undefined
): string {
  let code = `    // Sum block: ${block.name}\n`
  
  if (inputWires.length === 0) {
    if (outputVar.arraySize) {
      code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) ${outputVar.name}[i] = 0.0;\n`
    } else {
      code += `    ${outputVar.name} = 0.0; // No inputs\n`
    }
    return code
  }
  
  if (outputVar.arraySize) {
    // Vector sum
    code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
    code += `        ${outputVar.name}[i] = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
      
      if (i > 0) code += ` + `
      
      if (sourceBlock?.type === 'input_port') {
        // Direct reference to input port
        const portName = sourceBlock.parameters?.portName || sourceBlock.name
        code += `model->inputs.${sanitizeIdentifier(portName)}[i]`
      } else {
        // Reference to internal signal
        const inputSignal = signals.get(sourceKey)
        if (inputSignal) {
          code += `${inputSignal.name}[i]`
        }
      }
    }
    
    code += `;\n    }\n`
  } else {
    // Scalar sum
    code += `    ${outputVar.name} = `
    
    let hasTerms = false
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
      
      if (sourceBlock?.type === 'input_port') {
        if (hasTerms) code += ` + `
        const portName = sourceBlock.parameters?.portName || sourceBlock.name
        code += `model->inputs.${sanitizeIdentifier(portName)}`
        hasTerms = true
      } else {
        const inputSignal = signals.get(sourceKey)
        if (inputSignal) {
          if (hasTerms) code += ` + `
          code += inputSignal.name
          hasTerms = true
        }
      }
    }
    
    if (!hasTerms) {
      code += `0.0 // No valid inputs`
    }
    
    code += `;\n`
  }
  
  return code
}

function generateMultiplyBlock(
  block: BlockData,
  outputVar: CVariable,
  inputWires: WireData[],
  signals: Map<string, CVariable>,
  sheet: Sheet,
  outputType: string | undefined
): string {
  let code = `    // Multiply block: ${block.name}\n`
  
  if (inputWires.length === 0) {
    if (outputVar.arraySize) {
      code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) ${outputVar.name}[i] = 0.0;\n`
    } else {
      code += `    ${outputVar.name} = 0.0; // No inputs\n`
    }
    return code
  }
  
  if (outputVar.arraySize) {
    // Vector multiply
    code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
    code += `        ${outputVar.name}[i] = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
      
      if (i > 0) code += ` * `
      
      if (sourceBlock?.type === 'input_port') {
        const portName = sourceBlock.parameters?.portName || sourceBlock.name
        code += `model->inputs.${sanitizeIdentifier(portName)}[i]`
      } else {
        const inputSignal = signals.get(sourceKey)
        if (inputSignal) {
          code += `${inputSignal.name}[i]`
        }
      }
    }
    
    code += `;\n    }\n`
  } else {
    // Scalar multiply
    code += `    ${outputVar.name} = `
    
    let hasTerms = false
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
      
      if (sourceBlock?.type === 'input_port') {
        if (hasTerms) code += ` * `
        const portName = sourceBlock.parameters?.portName || sourceBlock.name
        code += `model->inputs.${sanitizeIdentifier(portName)}`
        hasTerms = true
      } else {
        const inputSignal = signals.get(sourceKey)
        if (inputSignal) {
          if (hasTerms) code += ` * `
          code += inputSignal.name
          hasTerms = true
        }
      }
    }
    
    if (!hasTerms) {
      code += `1.0 // No valid inputs`
    }
    
    code += `;\n`
  }
  
  return code
}

function generateScaleBlock(
  block: BlockData,
  outputVar: CVariable,
  inputWires: WireData[],
  signals: Map<string, CVariable>,
  sheet: Sheet,
  outputType?: string
): string {
  const gain = block.parameters?.gain || 1
  let code = `    // Scale block: ${block.name}\n`
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
    
    if (sourceBlock?.type === 'input_port') {
      const portName = sourceBlock.parameters?.portName || sourceBlock.name
      const inputName = `model->inputs.${sanitizeIdentifier(portName)}`
      
      if (outputVar.arraySize) {
        code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
        code += `        ${outputVar.name}[i] = ${inputName}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        code += `    ${outputVar.name} = ${inputName} * ${gain};\n`
      }
    } else {
      const inputSignal = signals.get(sourceKey)
      if (inputSignal) {
        if (outputVar.arraySize) {
          code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
          code += `        ${outputVar.name}[i] = ${inputSignal.name}[i] * ${gain};\n`
          code += `    }\n`
        } else {
          code += `    ${outputVar.name} = ${inputSignal.name} * ${gain};\n`
        }
      }
    }
  }
  
  return code
}

function generateTransferFunctionBlock(
  block: BlockData,
  outputVar: CVariable,
  inputWires: WireData[],
  signals: Map<string, CVariable>,
  sheet: Sheet,
  outputType?: string
): string {
  const numerator = block.parameters?.numerator || [1]
  const denominator = block.parameters?.denominator || [1, 1]
  const tfName = sanitizeIdentifier(block.name)
  const stateOrder = Math.max(0, denominator.length - 1)
  
  let code = `    // Transfer function block: ${block.name}\n`
  
  if (inputWires.length === 0) {
    code += `    // No input connected\n`
    if (outputVar.arraySize) {
      code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
      code += `        ${outputVar.name}[i] = 0.0;\n`
      code += `    }\n`
    } else {
      code += `    ${outputVar.name} = 0.0;\n`
    }
    return code
  }
  
  const wire = inputWires[0]
  const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
  const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
  
  let inputRef: string
  if (sourceBlock?.type === 'input_port') {
    const portName = sourceBlock.parameters?.portName || sourceBlock.name
    inputRef = `model->inputs.${sanitizeIdentifier(portName)}`
  } else {
    const inputSignal = signals.get(sourceKey)
    if (!inputSignal) {
      code += `    // Input signal not found\n`
      return code
    }
    inputRef = inputSignal.name
  }
  
  if (outputVar.arraySize) {
    // Vector transfer function processing
    code += `    // Vector transfer function (element-wise processing)\n`
    
    // Pure gain case (no dynamics)
    if (denominator.length === 1) {
      const gain = (numerator[0] || 0) / (denominator[0] || 1)
      code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
      code += `        ${outputVar.name}[i] = ${inputRef}[i] * ${gain};\n`
      code += `    }\n`
    } else if (stateOrder === 1) {
      // First-order system: H(s) = b0 / (a1*s + a0)
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) {
        // Degenerate case - pure gain
        const gain = a0 !== 0 ? b0 / a0 : 0
        code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
        code += `        ${outputVar.name}[i] = ${inputRef}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        // Dynamic first-order system with RK4 integration
        code += `    for (int i = 0; i < ${outputVar.arraySize}; i++) {\n`
        code += `        double u = ${inputRef}[i];\n`
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
        code += `        ${outputVar.name}[i] = model->states.${tfName}_states[i][0];\n`
        code += `    }\n`
      }
    } else {
      // Higher-order systems - placeholder
      code += `    // TODO: Implement higher-order transfer function for vectors\n`
      for (let i = 0; i < outputVar.arraySize; i++) {
        code += `    ${outputVar.name}[${i}] = 0.0; // Placeholder\n`
      }
    }
  } else {
    // Scalar transfer function processing
    code += `    // Scalar transfer function\n`
    
    // Pure gain case (no dynamics)
    if (denominator.length === 1) {
      const gain = (numerator[0] || 0) / (denominator[0] || 1)
      code += `    ${outputVar.name} = ${inputRef} * ${gain};\n`
    } else if (stateOrder === 1) {
      // First-order system: H(s) = b0 / (a1*s + a0)
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) {
        // Degenerate case - pure gain
        const gain = a0 !== 0 ? b0 / a0 : 0
        code += `    ${outputVar.name} = ${inputRef} * ${gain};\n`
      } else {
        // Dynamic first-order system with RK4 integration
        code += `    double u = ${inputRef};\n`
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
        code += `    ${outputVar.name} = model->states.${tfName}_states[0];\n`
      }
    } else if (stateOrder === 2) {
      // Second-order system
      const a2 = denominator[0]
      const a1 = denominator[1]
      const a0 = denominator[2]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a2 === 0) {
        code += `    ${outputVar.name} = 0.0; // Invalid transfer function\n`
      } else {
        code += `    double u = ${inputRef};\n`
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
        code += `    ${outputVar.name} = model->states.${tfName}_states[0];\n`
      }
    } else {
      // Higher-order systems - simplified implementation
      code += `    // TODO: Implement higher-order transfer function\n`
      code += `    ${outputVar.name} = 0.0; // Placeholder\n`
    }
  }
  
  return code
}

function generateLookup1DBlock(
  block: BlockData,
  outputVar: CVariable,
  inputWires: WireData[],
  signals: Map<string, CVariable>
): string {
  let code = `    // 1D Lookup block: ${block.name}\n`
  
  const inputValues = block.parameters?.inputValues || [0, 1]
  const outputValues = block.parameters?.outputValues || [0, 1]
  const extrapolation = block.parameters?.extrapolation || 'clamp'
  
  if (inputWires.length === 0) {
    code += `    ${outputVar.name} = 0.0; // No input\n`
    return code
  }
  
  const wire = inputWires[0]
  const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
  const inputSignal = signals.get(sourceKey)
  
  if (!inputSignal) {
    code += `    ${outputVar.name} = 0.0; // Input not found\n`
    return code
  }
  
  // Generate lookup table as static arrays
  code += `    static const double ${outputVar.name}_x[] = {`
  code += inputValues.map((v: number) => v.toString()).join(', ')
  code += `};\n`
  
  code += `    static const double ${outputVar.name}_y[] = {`
  code += outputValues.map((v: number) => v.toString()).join(', ')
  code += `};\n`
  
  code += `    const int ${outputVar.name}_n = ${inputValues.length};\n`
  code += `    double ${outputVar.name}_input = ${inputSignal.name};\n`
  code += `    \n`
  
  // Generate interpolation code
  code += `    // Linear interpolation\n`
  code += `    if (${outputVar.name}_input <= ${outputVar.name}_x[0]) {\n`
  if (extrapolation === 'clamp') {
    code += `        ${outputVar.name} = ${outputVar.name}_y[0];\n`
  } else {
    code += `        // Extrapolate\n`
    code += `        if (${outputVar.name}_n >= 2) {\n`
    code += `            double slope = (${outputVar.name}_y[1] - ${outputVar.name}_y[0]) / (${outputVar.name}_x[1] - ${outputVar.name}_x[0]);\n`
    code += `            ${outputVar.name} = ${outputVar.name}_y[0] + slope * (${outputVar.name}_input - ${outputVar.name}_x[0]);\n`
    code += `        } else {\n`
    code += `            ${outputVar.name} = ${outputVar.name}_y[0];\n`
    code += `        }\n`
  }
  code += `    } else if (${outputVar.name}_input >= ${outputVar.name}_x[${outputVar.name}_n - 1]) {\n`
  if (extrapolation === 'clamp') {
    code += `        ${outputVar.name} = ${outputVar.name}_y[${outputVar.name}_n - 1];\n`
  } else {
    code += `        // Extrapolate\n`
    code += `        if (${outputVar.name}_n >= 2) {\n`
    code += `            double slope = (${outputVar.name}_y[${outputVar.name}_n - 1] - ${outputVar.name}_y[${outputVar.name}_n - 2]) / `
    code += `(${outputVar.name}_x[${outputVar.name}_n - 1] - ${outputVar.name}_x[${outputVar.name}_n - 2]);\n`
    code += `            ${outputVar.name} = ${outputVar.name}_y[${outputVar.name}_n - 1] + slope * (${outputVar.name}_input - ${outputVar.name}_x[${outputVar.name}_n - 1]);\n`
    code += `        } else {\n`
    code += `            ${outputVar.name} = ${outputVar.name}_y[${outputVar.name}_n - 1];\n`
    code += `        }\n`
  }
  code += `    } else {\n`
  code += `        // Find interpolation interval\n`
  code += `        int i;\n`
  code += `        for (i = 0; i < ${outputVar.name}_n - 1; i++) {\n`
  code += `            if (${outputVar.name}_input >= ${outputVar.name}_x[i] && ${outputVar.name}_input <= ${outputVar.name}_x[i + 1]) {\n`
  code += `                double t = (${outputVar.name}_input - ${outputVar.name}_x[i]) / (${outputVar.name}_x[i + 1] - ${outputVar.name}_x[i]);\n`
  code += `                ${outputVar.name} = ${outputVar.name}_y[i] + t * (${outputVar.name}_y[i + 1] - ${outputVar.name}_y[i]);\n`
  code += `                break;\n`
  code += `            }\n`
  code += `        }\n`
  code += `    }\n`
  
  return code
}

function generateLookup2DBlock(
  block: BlockData,
  outputVar: CVariable,
  inputWires: WireData[],
  signals: Map<string, CVariable>
): string {
  let code = `    // 2D Lookup block: ${block.name}\n`
  
  const input1Values = block.parameters?.input1Values || [0, 1]
  const input2Values = block.parameters?.input2Values || [0, 1]
  const outputTable = block.parameters?.outputTable || [[0, 1], [2, 3]]
  const extrapolation = block.parameters?.extrapolation || 'clamp'
  
  if (inputWires.length < 2) {
    code += `    ${outputVar.name} = 0.0; // Insufficient inputs\n`
    return code
  }
  
  const wire1 = inputWires.find(w => w.targetPortIndex === 0)
  const wire2 = inputWires.find(w => w.targetPortIndex === 1)
  
  if (!wire1 || !wire2) {
    code += `    ${outputVar.name} = 0.0; // Missing input\n`
    return code
  }
  
  const sourceKey1 = `${wire1.sourceBlockId}:${wire1.sourcePortIndex}`
  const sourceKey2 = `${wire2.sourceBlockId}:${wire2.sourcePortIndex}`
  const inputSignal1 = signals.get(sourceKey1)
  const inputSignal2 = signals.get(sourceKey2)
  
  if (!inputSignal1 || !inputSignal2) {
    code += `    ${outputVar.name} = 0.0; // Input signals not found\n`
    return code
  }
  
  // For 2D lookup, we'd generate a more complex interpolation routine
  // This is a simplified version
  code += `    // 2D bilinear interpolation\n`
  code += `    double ${outputVar.name}_u = ${inputSignal1.name};\n`
  code += `    double ${outputVar.name}_v = ${inputSignal2.name};\n`
  code += `    // TODO: Implement 2D interpolation\n`
  code += `    ${outputVar.name} = 0.0; // Placeholder\n`
  
  return code
}

function generateOutputPortBlock(
  block: BlockData,
  inputWires: WireData[],
  signals: Map<string, CVariable>,
  sheet: Sheet 
): string {
  const portName = block.parameters?.portName || block.name
  let code = `    // Output port: ${block.name}\n`
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
    
    if (sourceBlock?.type === 'input_port') {
      // Direct connection from input to output
      const inputPortName = sourceBlock.parameters?.portName || sourceBlock.name
      const inputRef = `model->inputs.${sanitizeIdentifier(inputPortName)}`
      const outputRef = `model->outputs.${sanitizeIdentifier(portName)}`
      
      // Check if it's an array by looking at the source block's type
      const dataType = sourceBlock.parameters?.dataType || 'double'
      const parsed = tryParseType(dataType)
      
      if (parsed?.isArray && parsed.arraySize) {
        code += `    memcpy(${outputRef}, ${inputRef}, sizeof(${outputRef}));\n`
      } else {
        code += `    ${outputRef} = ${inputRef};\n`
      }
    } else {
      const inputSignal = signals.get(sourceKey)
      if (inputSignal) {
        if (inputSignal.arraySize) {
          // Copy array
          code += `    memcpy(model->outputs.${sanitizeIdentifier(portName)}, ${inputSignal.name}, sizeof(model->outputs.${sanitizeIdentifier(portName)}));\n`
        } else {
          // Copy scalar
          code += `    model->outputs.${sanitizeIdentifier(portName)} = ${inputSignal.name};\n`
        }
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
  
  const needsStates = hasVectorTransferFunctions(sheet, blockTypes) || transferFunctions.some(tf => {
    const denominator = tf.parameters?.denominator || [1, 1]
    return denominator.length > 1
  })
  
  let code = `void ${safeName}_derivatives(${safeName}_t* model`
  if (needsStates) {
    code += `, const ${safeName}_states_t* current_states, ${safeName}_states_t* state_derivatives`
  }
  code += `) {\n`
  
  if (!needsStates) {
    code += `    // No states in this model\n`
    code += `}\n\n`
    return code
  }
  
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