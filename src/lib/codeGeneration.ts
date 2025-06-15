// lib/codeGeneration.ts - Complete module with proper RK4 integration support

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

  // Generate internal signals structure for algebraic computations
  header += `// Internal signals structure (for algebraic computations)\n`
  header += `typedef struct {\n`
  // Add members for each internal signal that needs to be stored
  for (const block of sheet.blocks) {
    if (block.type !== 'input_port' && block.type !== 'output_port' && 
        block.type !== 'signal_display' && block.type !== 'signal_logger' &&
        block.type !== 'sheet_label_sink' && block.type !== 'sheet_label_source') {
      const outputKey = `${block.id}:0`
      const signalType = blockTypes.get(outputKey) || 'double'
      const signalName = `${sanitizeIdentifier(block.name)}`
      const variable = parseTypeToVariable(signalType, signalName)
      header += generateStructMember(variable) + '\n'
    }
  }
  header += `} ${safeName}_signals_t;\n\n`

  // Generate main structure
  header += `// Main model structure\n`
  header += `typedef struct {\n`
  if (inputs.length > 0) header += `    ${safeName}_inputs_t inputs;\n`
  if (outputs.length > 0) header += `    ${safeName}_outputs_t outputs;\n`
  if (needsStates) header += `    ${safeName}_states_t states;\n`
  header += `    ${safeName}_signals_t signals;\n`
  header += `    double time;\n`
  header += `    double dt;\n`
  header += `} ${safeName}_t;\n\n`

  // Function prototypes
  header += `// Initialize the model\n`
  header += `void ${safeName}_init(${safeName}_t* model, double time_step);\n\n`

  header += `// Compute algebraic outputs (no integration)\n`
  header += `void ${safeName}_step(${safeName}_t* model);\n\n`

  header += `// High-level time step with integration\n`
  header += `void ${safeName}_time_step(${safeName}_t* model, double h);\n\n`

  if (transferFunctions.length > 0) {
    header += `// RK4 integrator for state variables\n`
    header += `void ${safeName}_rk4_integrate(${safeName}_t* model, double h);\n\n`
    
    header += `// Compute state derivatives\n`
    header += `void ${safeName}_derivatives(\n`
    header += `    const ${safeName}_t* model,\n`
    header += `    const ${safeName}_states_t* current_states,\n`
    header += `    ${safeName}_states_t* state_derivatives\n`
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
  
  // Generate step function (algebraic computations only)
  source += generateStepFunction(safeName, sheet, blockTypes)
  
  // Generate time_step function
  source += generateTimeStepFunction(safeName, sheet)
  
  // Generate RK4 and derivatives functions if needed
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  if (transferFunctions.length > 0) {
    source += generateRK4Function(safeName, sheet, blockTypes)
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
    code += `\n`
  }

  // Initialize internal signals
  code += `    // Initialize internal signals\n`
  code += `    memset(&model->signals, 0, sizeof(model->signals));\n`

  code += `}\n\n`
  return code
}

function generateStepFunction(safeName: string, sheet: Sheet, blockTypes: Map<string, string>): string {
  console.log('[CodeGen] generateStepFunction called')
  let code = `void ${safeName}_step(${safeName}_t* model) {\n`
  
  try {
    code += `    // This function computes algebraic outputs only (no integration)\n`
    code += `    // For time integration, use ${safeName}_time_step()\n\n`
    
    // Calculate execution order
    console.log('[CodeGen] Calculating execution order...')
    const executionOrder = calculateExecutionOrder(sheet.blocks, sheet.connections)
    console.log('[CodeGen] Execution order calculated, blocks:', executionOrder.length)
    
    code += `    // Compute block outputs in execution order\n`
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
        code += generateBlockComputation(block, sheet, blockTypes)
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

function generateTimeStepFunction(safeName: string, sheet: Sheet): string {
  const hasStates = sheet.blocks.some(b => 
    b.type === 'transfer_function' && 
    (b.parameters?.denominator?.length || 0) > 1
  )
  
  let code = `void ${safeName}_time_step(${safeName}_t* model, double h) {\n`
  code += `    // High-level time step function with integration\n`
  
  if (hasStates) {
    code += `    // First, integrate state variables using RK4\n`
    code += `    ${safeName}_rk4_integrate(model, h);\n`
    code += `    \n`
  }
  
  code += `    // Then compute algebraic outputs\n`
  code += `    ${safeName}_step(model);\n`
  code += `}\n\n`
  
  return code
}

function generateRK4Function(safeName: string, sheet: Sheet, blockTypes: Map<string, string>): string {
  const transferFunctions = sheet.blocks.filter(b => 
    b.type === 'transfer_function' && 
    (b.parameters?.denominator?.length || 0) > 1
  )
  
  if (transferFunctions.length === 0) return ''
  
  let code = `void ${safeName}_rk4_integrate(${safeName}_t* model, double h) {\n`
  code += `    // RK4 integration for state variables\n`
  code += `    ${safeName}_states_t k1, k2, k3, k4;\n`
  code += `    ${safeName}_states_t temp_states;\n`
  code += `    \n`
  
  // Step 1: k1 = f(t, y)
  code += `    // Calculate k1 = f(t, y)\n`
  code += `    ${safeName}_derivatives(model, &model->states, &k1);\n`
  code += `    \n`
  
  // Step 2: k2 = f(t + h/2, y + h*k1/2)
  code += `    // Calculate k2 = f(t + h/2, y + h*k1/2)\n`
  code += `    temp_states = model->states;\n`
  
  // Update temp_states for each transfer function
  for (const tf of transferFunctions) {
    const tfName = sanitizeIdentifier(tf.name)
    const stateOrder = tf.parameters!.denominator!.length - 1
    
    // Check if vector or scalar
    const isVector = checkIfVectorTransferFunction(tf, sheet, blockTypes)
    
    if (isVector) {
      code += `    for (int j = 0; j < ${isVector.size}; j++) {\n`
      code += `        for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `            temp_states.${tfName}_states[j][i] += 0.5 * h * k1.${tfName}_states[j][i];\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      code += `    for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `        temp_states.${tfName}_states[i] += 0.5 * h * k1.${tfName}_states[i];\n`
      code += `    }\n`
    }
  }
  
  code += `    ${safeName}_derivatives(model, &temp_states, &k2);\n`
  code += `    \n`
  
  // Step 3: k3 = f(t + h/2, y + h*k2/2)
  code += `    // Calculate k3 = f(t + h/2, y + h*k2/2)\n`
  code += `    temp_states = model->states;\n`
  
  for (const tf of transferFunctions) {
    const tfName = sanitizeIdentifier(tf.name)
    const stateOrder = tf.parameters!.denominator!.length - 1
    const isVector = checkIfVectorTransferFunction(tf, sheet, blockTypes)
    
    if (isVector) {
      code += `    for (int j = 0; j < ${isVector.size}; j++) {\n`
      code += `        for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `            temp_states.${tfName}_states[j][i] += 0.5 * h * k2.${tfName}_states[j][i];\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      code += `    for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `        temp_states.${tfName}_states[i] += 0.5 * h * k2.${tfName}_states[i];\n`
      code += `    }\n`
    }
  }
  
  code += `    ${safeName}_derivatives(model, &temp_states, &k3);\n`
  code += `    \n`
  
  // Step 4: k4 = f(t + h, y + h*k3)
  code += `    // Calculate k4 = f(t + h, y + h*k3)\n`
  code += `    temp_states = model->states;\n`
  
  for (const tf of transferFunctions) {
    const tfName = sanitizeIdentifier(tf.name)
    const stateOrder = tf.parameters!.denominator!.length - 1
    const isVector = checkIfVectorTransferFunction(tf, sheet, blockTypes)
    
    if (isVector) {
      code += `    for (int j = 0; j < ${isVector.size}; j++) {\n`
      code += `        for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `            temp_states.${tfName}_states[j][i] += h * k3.${tfName}_states[j][i];\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      code += `    for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `        temp_states.${tfName}_states[i] += h * k3.${tfName}_states[i];\n`
      code += `    }\n`
    }
  }
  
  code += `    ${safeName}_derivatives(model, &temp_states, &k4);\n`
  code += `    \n`
  
  // Final update: y = y + (h/6) * (k1 + 2*k2 + 2*k3 + k4)
  code += `    // Update states: y = y + (h/6) * (k1 + 2*k2 + 2*k3 + k4)\n`
  for (const tf of transferFunctions) {
    const tfName = sanitizeIdentifier(tf.name)
    const stateOrder = tf.parameters!.denominator!.length - 1
    const isVector = checkIfVectorTransferFunction(tf, sheet, blockTypes)
    
    if (isVector) {
      code += `    for (int j = 0; j < ${isVector.size}; j++) {\n`
      code += `        for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `            model->states.${tfName}_states[j][i] += (h/6.0) * (\n`
      code += `                k1.${tfName}_states[j][i] + \n`
      code += `                2.0 * k2.${tfName}_states[j][i] + \n`
      code += `                2.0 * k3.${tfName}_states[j][i] + \n`
      code += `                k4.${tfName}_states[j][i]\n`
      code += `            );\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      code += `    for (int i = 0; i < ${stateOrder}; i++) {\n`
      code += `        model->states.${tfName}_states[i] += (h/6.0) * (\n`
      code += `            k1.${tfName}_states[i] + \n`
      code += `            2.0 * k2.${tfName}_states[i] + \n`
      code += `            2.0 * k3.${tfName}_states[i] + \n`
      code += `            k4.${tfName}_states[i]\n`
      code += `        );\n`
      code += `    }\n`
    }
  }
  
  code += `}\n\n`
  return code
}

function generateDerivativesFunction(
  safeName: string, 
  sheet: Sheet, 
  blockTypes: Map<string, string>
): string {
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  
  let code = `void ${safeName}_derivatives(\n`
  code += `    const ${safeName}_t* model,\n`
  code += `    const ${safeName}_states_t* current_states,\n`
  code += `    ${safeName}_states_t* state_derivatives\n`
  code += `) {\n`
  
  code += `    // Clear state derivatives\n`
  code += `    memset(state_derivatives, 0, sizeof(${safeName}_states_t));\n`
  code += `    \n`
  
  // Need to compute algebraic signals first if they're used as inputs to transfer functions
  code += `    // Note: This function assumes algebraic signals have been computed\n`
  code += `    // and are available in model->signals\n`
  code += `    \n`
  
  // For each transfer function, compute derivatives
  for (const tf of transferFunctions) {
    const tfName = sanitizeIdentifier(tf.name)
    const numerator = tf.parameters?.numerator || [1]
    const denominator = tf.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) continue // No states
    
    // Get the input signal for this transfer function
    const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
    if (!inputWire) continue
    
    // Determine how to access the input
    const inputExpression = generateInputExpression(inputWire, sheet, safeName)
    
    code += `    // Transfer function: ${tf.name}\n`
    
    // Generate state-space form derivatives
    // For a transfer function H(s) = b(s)/a(s), we convert to controllable canonical form
    
    if (stateOrder === 1) {
      // First-order: dy/dt = (b0*u - a0*y) / a1
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      // Handle vector vs scalar
      const isVector = checkIfVectorTransferFunction(tf, sheet, blockTypes)
      if (isVector) {
        code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
        code += `        double u = ${inputExpression}[i];\n`
        code += `        double y = current_states->${tfName}_states[i][0];\n`
        code += `        state_derivatives->${tfName}_states[i][0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpression};\n`
        code += `        double y = current_states->${tfName}_states[0];\n`
        code += `        state_derivatives->${tfName}_states[0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      }
    } else if (stateOrder === 2) {
      // Second-order system in controllable canonical form
      const a2 = denominator[0]
      const a1 = denominator[1]
      const a0 = denominator[2]
      const b0 = numerator[numerator.length - 1] || 0
      
      const isVector = checkIfVectorTransferFunction(tf, sheet, blockTypes)
      if (isVector) {
        code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
        code += `        double u = ${inputExpression}[i];\n`
        code += `        double x1 = current_states->${tfName}_states[i][0];\n`
        code += `        double x2 = current_states->${tfName}_states[i][1];\n`
        code += `        state_derivatives->${tfName}_states[i][0] = x2;\n`
        code += `        state_derivatives->${tfName}_states[i][1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpression};\n`
        code += `        double x1 = current_states->${tfName}_states[0];\n`
        code += `        double x2 = current_states->${tfName}_states[1];\n`
        code += `        state_derivatives->${tfName}_states[0] = x2;\n`
        code += `        state_derivatives->${tfName}_states[1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      }
    }
    // Higher order systems would follow similar pattern...
    
    code += `    \n`
  }
  
  code += `}\n\n`
  return code
}

function generateBlockComputation(
  block: BlockData,
  sheet: Sheet,
  blockTypes: Map<string, string>
): string {
  console.log('[CodeGen] generateBlockComputation for:', block.type, block.name)
  
  let code = ''
  
  // Get input connections
  const inputWires = sheet.connections.filter(w => w.targetBlockId === block.id)
  console.log('[CodeGen] Block has', inputWires.length, 'input connections')
  
  try {
    switch (block.type) {
      case 'source':
        code += generateSourceBlock(block, blockTypes.get(`${block.id}:0`))
        break
        
      case 'sum':
        code += generateSumBlock(block, inputWires, sheet)
        break
        
      case 'multiply':
        code += generateMultiplyBlock(block, inputWires, sheet)
        break
        
      case 'scale':
        code += generateScaleBlock(block, inputWires, sheet)
        break
        
      case 'transfer_function':
        code += generateTransferFunctionBlock(block, inputWires, sheet, blockTypes)
        break
        
      case 'lookup_1d':
        code += generateLookup1DBlock(block, inputWires, sheet)
        break
        
      case 'lookup_2d':
        code += generateLookup2DBlock(block, inputWires, sheet)
        break
        
      case 'output_port':
        code += generateOutputPortBlock(block, inputWires, sheet)
        break
        
      case 'subsystem':
        code += `    // TODO: Subsystem ${block.name}\n`
        code += `    model->signals.${sanitizeIdentifier(block.name)} = 0.0;\n`
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

function generateSourceBlock(block: BlockData, outputType?: string): string {
  const signalType = block.parameters?.signalType || 'constant'
  const value = block.parameters?.value || 0
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  
  let code = `    // Source block: ${block.name}\n`
  
  if (signalType === 'constant') {
    const parsedType = outputType ? tryParseType(outputType) : null
    if (parsedType?.isArray && parsedType.arraySize) {
      // Vector source
      if (Array.isArray(value)) {
        // Use actual array values
        code += `    {\n`
        code += `        const double init[] = {`
        code += value.map((v: any) => String(v)).join(', ')
        code += `};\n`
        code += `        for (int i = 0; i < ${parsedType.arraySize}; i++) {\n`
        code += `            ${outputName}[i] = init[i];\n`
        code += `        }\n`
        code += `    }\n`
      } else {
        // Fill array with scalar value
        code += `    for (int i = 0; i < ${parsedType.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = ${value};\n`
        code += `    }\n`
      }
    } else {
      code += `    ${outputName} = ${value};\n`
    }
  } else {
    // For time-varying sources, generate appropriate code
    code += `    // TODO: Implement ${signalType} signal generation\n`
    code += `    ${outputName} = 0.0; // Placeholder\n`
  }
  
  return code
}

function generateSumBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet
): string {
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  let code = `    // Sum block: ${block.name}\n`
  
  if (inputWires.length === 0) {
    code += `    ${outputName} = 0.0; // No inputs\n`
    return code
  }
  
  // Check if we're dealing with vectors
  const firstInput = getInputExpression(inputWires[0], sheet, 'model')
  const isVector = checkIfVectorOperation(inputWires[0], sheet)
  
  if (isVector) {
    // Vector sum
    code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
    code += `        ${outputName}[i] = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const inputExpr = getInputExpression(wire, sheet, 'model')
      if (i > 0) code += ` + `
      code += `${inputExpr}[i]`
    }
    
    code += `;\n    }\n`
  } else {
    // Scalar sum
    code += `    ${outputName} = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const inputExpr = getInputExpression(wire, sheet, 'model')
      if (i > 0) code += ` + `
      code += inputExpr
    }
    
    code += `;\n`
  }
  
  return code
}

function generateMultiplyBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet
): string {
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  let code = `    // Multiply block: ${block.name}\n`
  
  if (inputWires.length === 0) {
    code += `    ${outputName} = 0.0; // No inputs\n`
    return code
  }
  
  // Check if we're dealing with vectors
  const isVector = checkIfVectorOperation(inputWires[0], sheet)
  
  if (isVector) {
    // Vector multiply
    code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
    code += `        ${outputName}[i] = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const inputExpr = getInputExpression(wire, sheet, 'model')
      if (i > 0) code += ` * `
      code += `${inputExpr}[i]`
    }
    
    code += `;\n    }\n`
  } else {
    // Scalar multiply
    code += `    ${outputName} = `
    
    for (let i = 0; i < inputWires.length; i++) {
      const wire = inputWires[i]
      const inputExpr = getInputExpression(wire, sheet, 'model')
      if (i > 0) code += ` * `
      code += inputExpr
    }
    
    code += `;\n`
  }
  
  return code
}

function generateScaleBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet
): string {
  const gain = block.parameters?.gain || 1
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  let code = `    // Scale block: ${block.name}\n`
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const inputExpr = getInputExpression(wire, sheet, 'model')
    const isVector = checkIfVectorOperation(wire, sheet)
    
    if (isVector) {
      code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
      code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${inputExpr} * ${gain};\n`
    }
  }
  
  return code
}

function generateTransferFunctionBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet,
  blockTypes: Map<string, string>
): string {
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  const tfName = sanitizeIdentifier(block.name)
  const denominator = block.parameters?.denominator || [1, 1]
  
  let code = `    // Transfer function block: ${block.name}\n`
  
  if (inputWires.length === 0) {
    code += `    ${outputName} = 0.0; // No input\n`
    return code
  }
  
  const stateOrder = Math.max(0, denominator.length - 1)
  
  if (stateOrder === 0) {
    // Pure gain (no dynamics)
    const numerator = block.parameters?.numerator || [1]
    const gain = (numerator[0] || 0) / (denominator[0] || 1)
    const inputExpr = getInputExpression(inputWires[0], sheet, 'model')
    const isVector = checkIfVectorOperation(inputWires[0], sheet)
    
    if (isVector) {
      code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
      code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${inputExpr} * ${gain};\n`
    }
  } else {
    // Dynamic system - output equals first state
    const isVector = checkIfVectorTransferFunction(block, sheet, blockTypes)
    
    if (isVector) {
      code += `    for (int i = 0; i < ${isVector.size}; i++) {\n`
      code += `        ${outputName}[i] = model->states.${tfName}_states[i][0];\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = model->states.${tfName}_states[0];\n`
    }
  }
  
  return code
}

function generateLookup1DBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet
): string {
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  let code = `    // 1D Lookup block: ${block.name}\n`
  
  const inputValues = block.parameters?.inputValues || [0, 1]
  const outputValues = block.parameters?.outputValues || [0, 1]
  const extrapolation = block.parameters?.extrapolation || 'clamp'
  
  if (inputWires.length === 0) {
    code += `    ${outputName} = 0.0; // No input\n`
    return code
  }
  
  const inputExpr = getInputExpression(inputWires[0], sheet, 'model')
  
  // Generate lookup table as static arrays
  code += `    static const double ${outputName}_x[] = {`
  code += inputValues.map((v: number) => v.toString()).join(', ')
  code += `};\n`
  
  code += `    static const double ${outputName}_y[] = {`
  code += outputValues.map((v: number) => v.toString()).join(', ')
  code += `};\n`
  
  code += `    const int ${outputName}_n = ${inputValues.length};\n`
  code += `    double ${outputName}_input = ${inputExpr};\n`
  code += `    \n`
  
  // Generate interpolation code
  code += `    // Linear interpolation\n`
  code += `    if (${outputName}_input <= ${outputName}_x[0]) {\n`
  if (extrapolation === 'clamp') {
    code += `        ${outputName} = ${outputName}_y[0];\n`
  } else {
    code += `        // Extrapolate\n`
    code += `        if (${outputName}_n >= 2) {\n`
    code += `            double slope = (${outputName}_y[1] - ${outputName}_y[0]) / (${outputName}_x[1] - ${outputName}_x[0]);\n`
    code += `            ${outputName} = ${outputName}_y[0] + slope * (${outputName}_input - ${outputName}_x[0]);\n`
    code += `        } else {\n`
    code += `            ${outputName} = ${outputName}_y[0];\n`
    code += `        }\n`
  }
  code += `    } else if (${outputName}_input >= ${outputName}_x[${outputName}_n - 1]) {\n`
  if (extrapolation === 'clamp') {
    code += `        ${outputName} = ${outputName}_y[${outputName}_n - 1];\n`
  } else {
    code += `        // Extrapolate\n`
    code += `        if (${outputName}_n >= 2) {\n`
    code += `            double slope = (${outputName}_y[${outputName}_n - 1] - ${outputName}_y[${outputName}_n - 2]) / `
    code += `(${outputName}_x[${outputName}_n - 1] - ${outputName}_x[${outputName}_n - 2]);\n`
    code += `            ${outputName} = ${outputName}_y[${outputName}_n - 1] + slope * (${outputName}_input - ${outputName}_x[${outputName}_n - 1]);\n`
    code += `        } else {\n`
    code += `            ${outputName} = ${outputName}_y[${outputName}_n - 1];\n`
    code += `        }\n`
  }
  code += `    } else {\n`
  code += `        // Find interpolation interval\n`
  code += `        int i;\n`
  code += `        for (i = 0; i < ${outputName}_n - 1; i++) {\n`
  code += `            if (${outputName}_input >= ${outputName}_x[i] && ${outputName}_input <= ${outputName}_x[i + 1]) {\n`
  code += `                double t = (${outputName}_input - ${outputName}_x[i]) / (${outputName}_x[i + 1] - ${outputName}_x[i]);\n`
  code += `                ${outputName} = ${outputName}_y[i] + t * (${outputName}_y[i + 1] - ${outputName}_y[i]);\n`
  code += `                break;\n`
  code += `            }\n`
  code += `        }\n`
  code += `    }\n`
  
  return code
}

function generateLookup2DBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet
): string {
  const outputName = `model->signals.${sanitizeIdentifier(block.name)}`
  let code = `    // 2D Lookup block: ${block.name}\n`
  
  if (inputWires.length < 2) {
    code += `    ${outputName} = 0.0; // Insufficient inputs\n`
    return code
  }
  
  const wire1 = inputWires.find(w => w.targetPortIndex === 0)
  const wire2 = inputWires.find(w => w.targetPortIndex === 1)
  
  if (!wire1 || !wire2) {
    code += `    ${outputName} = 0.0; // Missing input\n`
    return code
  }
  
  const inputExpr1 = getInputExpression(wire1, sheet, 'model')
  const inputExpr2 = getInputExpression(wire2, sheet, 'model')
  
  // For 2D lookup, we'd generate a more complex interpolation routine
  // This is a simplified version
  code += `    // 2D bilinear interpolation\n`
  code += `    double ${outputName}_u = ${inputExpr1};\n`
  code += `    double ${outputName}_v = ${inputExpr2};\n`
  code += `    // TODO: Implement 2D interpolation\n`
  code += `    ${outputName} = 0.0; // Placeholder\n`
  
  return code
}

function generateOutputPortBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet
): string {
  const portName = block.parameters?.portName || block.name
  let code = `    // Output port: ${block.name}\n`
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const inputExpr = getInputExpression(wire, sheet, 'model')
    const isVector = checkIfVectorOperation(wire, sheet)
    
    if (isVector) {
      // Copy array
      code += `    memcpy(model->outputs.${sanitizeIdentifier(portName)}, ${inputExpr}, sizeof(model->outputs.${sanitizeIdentifier(portName)}));\n`
    } else {
      // Copy scalar
      code += `    model->outputs.${sanitizeIdentifier(portName)} = ${inputExpr};\n`
    }
  }
  
  return code
}

// Helper function to generate the expression to access an input signal
function generateInputExpression(
  inputWire: WireData,
  sheet: Sheet,
  modelVar: string
): string {
  const sourceBlock = sheet.blocks.find(b => b.id === inputWire.sourceBlockId)
  if (!sourceBlock) return "0.0"
  
  if (sourceBlock.type === 'input_port') {
    const portName = sourceBlock.parameters?.portName || sourceBlock.name
    return `${modelVar}->inputs.${sanitizeIdentifier(portName)}`
  } else {
    // For internal signals
    return `${modelVar}->signals.${sanitizeIdentifier(sourceBlock.name)}`
  }
}

// Get input expression without model variable prefix (for simpler cases)
function getInputExpression(
  wire: WireData,
  sheet: Sheet,
  modelVar: string
): string {
  return generateInputExpression(wire, sheet, modelVar)
}

// Check if an operation involves vectors
function checkIfVectorOperation(
  wire: WireData,
  sheet: Sheet
): { size: number } | null {
  const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
  if (!sourceBlock) return null
  
  if (sourceBlock.type === 'input_port' || sourceBlock.type === 'source') {
    const dataType = sourceBlock.parameters?.dataType || 'double'
    const parsed = tryParseType(dataType)
    if (parsed?.isArray && parsed.arraySize) {
      return { size: parsed.arraySize }
    }
  }
  
  return null
}

// Helper to check if a transfer function processes vectors
function checkIfVectorTransferFunction(
  tf: BlockData,
  sheet: Sheet,
  blockTypes: Map<string, string>
): { size: number } | null {
  const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
  if (!inputWire) return null
  
  const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
  const inputType = blockTypes.get(sourceKey)
  if (!inputType) return null
  
  const parsed = tryParseType(inputType)
  if (parsed?.isArray && parsed.arraySize) {
    return { size: parsed.arraySize }
  }
  
  return null
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

// Export the CodeGenerator class for compatibility
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
      // Create options for the generateCCode function
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