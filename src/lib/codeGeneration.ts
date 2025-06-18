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

interface BlockContext {
  block: BlockData
  sheetId: string
  sheetPath: string[]
  prefixedName: string
}

interface FlattenedModel {
  blocks: BlockData[]
  connections: WireData[]
  blockContextMap: Map<string, BlockContext>
  blockNameMap: Map<string, string>
}

export function generateCCode(options: CodeGenerationOptions): GeneratedCode {
  const { modelName, sheets, globalSettings } = options
  
  // Flatten the multi-sheet model into a single structure
  const flattenedModel = flattenModelStructure(sheets)
  
  // Create a synthetic single sheet from the flattened model
  const flattenedSheet: Sheet = {
    id: 'flattened',
    name: 'Flattened Model',
    blocks: flattenedModel.blocks,
    connections: flattenedModel.connections,
    extents: { width: 10000, height: 10000 } // Large enough for all blocks
  }
  
  // Propagate types through the flattened model
  const typeResult = propagateSignalTypes(flattenedSheet.blocks, flattenedSheet.connections)
  
  // Generate safe C identifier from model name
  const safeName = modelName.replace(/[^a-zA-Z0-9_]/g, '_')
  const upperName = safeName.toUpperCase()
  
  // Generate header file with flattened structure and context
  const headerFile = generateHeaderFileMultiSheet(
    safeName, 
    upperName, 
    flattenedSheet, 
    typeResult.blockOutputTypes,
    flattenedModel.blockContextMap
  )
  
  // Generate source file with flattened structure and context
  const sourceFile = generateSourceFileMultiSheet(
    safeName, 
    flattenedSheet, 
    typeResult.blockOutputTypes, 
    globalSettings,
    flattenedModel.blockContextMap
  )
  
  return {
    headerFile,
    sourceFile,
    fileName: safeName.toLowerCase()
  }
}

function calculateExecutionOrderMultiSheet(
  blocks: BlockData[], 
  wires: WireData[],
  blockContextMap: Map<string, BlockContext>
): string[] {
  // Build dependency graph
  const dependencies = new Map<string, Set<string>>()
  
  // Add wire dependencies
  for (const wire of wires) {
    if (!dependencies.has(wire.targetBlockId)) {
      dependencies.set(wire.targetBlockId, new Set())
    }
    dependencies.get(wire.targetBlockId)!.add(wire.sourceBlockId)
  }
  
  // Topological sort
  const visited = new Set<string>()
  const tempMark = new Set<string>()
  const order: string[] = []
  
  const visit = (blockId: string) => {
    if (tempMark.has(blockId)) {
      // Cycle detected
      const blockContext = blockContextMap.get(blockId)
      console.warn(`Cycle detected at block: ${blockContext?.prefixedName || blockId}`)
      return
    }
    if (visited.has(blockId)) {
      return
    }
    
    tempMark.add(blockId)
    
    const deps = dependencies.get(blockId) || new Set()
    for (const dep of deps) {
      visit(dep)
    }
    
    tempMark.delete(blockId)
    visited.add(blockId)
    order.push(blockId)
  }
  
  // Start with source blocks (no dependencies)
  for (const block of blocks) {
    const hasDependencies = dependencies.has(block.id) && dependencies.get(block.id)!.size > 0
    if (!hasDependencies) {
      visit(block.id)
    }
  }
  
  // Visit any remaining blocks
  for (const block of blocks) {
    if (!visited.has(block.id)) {
      visit(block.id)
    }
  }
  
  return order
}

// Update the original calculateExecutionOrder to use the new one when context is available
function calculateExecutionOrder(blocks: BlockData[], wires: WireData[]): string[] {
  // For backward compatibility, use the original simple implementation
  // when called without context
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

function generateHeaderFileMultiSheet(
  safeName: string,
  upperName: string,
  sheet: Sheet,
  blockTypes: Map<string, string>,
  blockContextMap: Map<string, BlockContext>
): string {
  // Filter to only get top-level input/output ports
  const inputs = sheet.blocks.filter(b => {
    if (b.type !== 'input_port') return false
    const context = blockContextMap.get(b.id)
    return !context || context.sheetPath.length === 0
  })
  
  const outputs = sheet.blocks.filter(b => {
      if (b.type !== 'output_port') return false
      const context = blockContextMap.get(b.id)
      // Include if no context (shouldn't happen) OR if at top level (sheetPath.length === 0)
      return !context || context.sheetPath.length === 0
  })
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

  // Generate input structure with prefixed names
  if (inputs.length > 0) {
    header += `// Input signals structure\n`
    header += `typedef struct {\n`
    for (const input of inputs) {
      const context = blockContextMap.get(input.id)
      const portName = context?.prefixedName || input.name
      const dataType = input.parameters?.dataType || 'double'
      const variable = parseTypeToVariable(dataType, portName)
      header += generateStructMember(variable) + '\n'
    }
    header += `} ${safeName}_inputs_t;\n\n`
  }

  // Generate output structure with prefixed names
  if (outputs.length > 0) {
    header += `// Output signals structure\n`
    header += `typedef struct {\n`
    for (const output of outputs) {
      // Use the portName from parameters, NOT the block name
      const portName = output.parameters?.portName || output.name
      // Get type from connected wire
      const connectedWire = sheet.connections.find(w => w.targetBlockId === output.id)
      if (connectedWire) {
        const sourceKey = `${connectedWire.sourceBlockId}:${connectedWire.sourcePortIndex}`
        const signalType = blockTypes.get(sourceKey) || 'double'
        const variable = parseTypeToVariable(signalType, portName)  // Use portName here
        header += generateStructMember(variable) + '\n'
      }
    }
    header += `} ${safeName}_outputs_t;\n\n`
  }

  // Generate states structure with prefixed names
  const needsStates = transferFunctions.length > 0 || hasVectorTransferFunctions(sheet, blockTypes)
  if (needsStates) {
    header += `// Internal states structure\n`
    header += `typedef struct {\n`
    
    // Add states for each transfer function with prefixed names
    for (const tf of transferFunctions) {
      const context = blockContextMap.get(tf.id)
      const tfName = context?.prefixedName || tf.name
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
              header += `    double ${sanitizeIdentifier(tfName)}_states[${parsed.arraySize}][${stateOrder}];\n`
            } else {
              // Scalar transfer function
              header += `    double ${sanitizeIdentifier(tfName)}_states[${stateOrder}];\n`
            }
          }
        }
      }
    }
    
    header += `} ${safeName}_states_t;\n\n`
  }

  // Generate internal signals structure with prefixed names and comments
  header += `// Internal signals structure (for algebraic computations)\n`
  header += `typedef struct {\n`

  // Group blocks by their original sheet for better organization
  const blocksBySheet = new Map<string, BlockData[]>()
  for (const block of sheet.blocks) {
    // Include all blocks except top-level input/output ports and certain display blocks
    const context = blockContextMap.get(block.id)
    const isTopLevelPort = (block.type === 'input_port' || block.type === 'output_port') && 
                          (!context || context.sheetPath.length === 0)
    
    if (!isTopLevelPort && 
        block.type !== 'signal_display' && 
        block.type !== 'signal_logger' &&
        block.type !== 'sheet_label_sink' && 
        block.type !== 'sheet_label_source') {
      const sheetId = context?.sheetId || 'unknown'
      if (!blocksBySheet.has(sheetId)) {
        blocksBySheet.set(sheetId, [])
      }
      blocksBySheet.get(sheetId)!.push(block)
    }
  }
  
  // Generate signals grouped by sheet with comments
  for (const [sheetId, blocks] of blocksBySheet) {
    if (blocks.length > 0) {
      const sheetPath = blocks[0] ? blockContextMap.get(blocks[0].id)?.sheetPath : []
      const sheetComment = sheetPath?.length ? sheetPath.join(' > ') : 'Main'
      header += `    // Signals from: ${sheetComment}\n`
      
      for (const block of blocks) {
        const context = blockContextMap.get(block.id)
        const outputKey = `${block.id}:0`
        const signalType = blockTypes.get(outputKey) || 'double'
        const signalName = context?.prefixedName || block.name
        const variable = parseTypeToVariable(signalType, signalName)
        header += generateStructMember(variable) + '\n'
      }
    }
  }
  
  header += `} ${safeName}_signals_t;\n\n`

  // Rest of the header generation remains the same
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

function generateSourceFileMultiSheet(
  safeName: string,
  sheet: Sheet,
  blockTypes: Map<string, string>,
  globalSettings: any,
  blockContextMap: Map<string, BlockContext>
): string {
  let source = `#include "${safeName}.h"\n\n`

  // Generate init function with prefixed names
  source += generateInitFunctionMultiSheet(safeName, sheet, blockTypes, blockContextMap)
  
  // Generate step function with prefixed names and execution order
  source += generateStepFunctionMultiSheet(safeName, sheet, blockTypes, blockContextMap)
  
  // Generate time_step function
  source += generateTimeStepFunction(safeName, sheet)
  
  // Generate RK4 and derivatives functions if needed
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  if (transferFunctions.length > 0) {
    source += generateRK4FunctionMultiSheet(safeName, sheet, blockTypes, blockContextMap)
    source += generateDerivativesFunctionMultiSheet(safeName, sheet, blockTypes, blockContextMap)
  }

  return source
}

function generateInitFunctionMultiSheet(
  safeName: string, 
  sheet: Sheet, 
  blockTypes: Map<string, string>,
  blockContextMap: Map<string, BlockContext>
): string {
  let code = `void ${safeName}_init(${safeName}_t* model, double time_step) {\n`
  code += `    // Initialize model parameters\n`
  code += `    model->time = 0.0;\n`
  code += `    model->dt = time_step;\n\n`

  // Initialize inputs with prefixed names
  const inputs = sheet.blocks.filter(b => b.type === 'input_port')
  if (inputs.length > 0) {
    code += `    // Initialize inputs\n`
    
    // Group by original sheet
    const inputsBySheet = new Map<string, BlockData[]>()
    for (const input of inputs) {
      const context = blockContextMap.get(input.id)
      const sheetId = context?.sheetId || 'main'
      if (!inputsBySheet.has(sheetId)) {
        inputsBySheet.set(sheetId, [])
      }
      inputsBySheet.get(sheetId)!.push(input)
    }
    
    for (const [sheetId, sheetInputs] of inputsBySheet) {
      const context = blockContextMap.get(sheetInputs[0].id)
      const sheetPath = context?.sheetPath || []
      if (sheetPath.length > 0) {
        code += `    // From: ${sheetPath.join(' > ')}\n`
      }
      
      for (const input of sheetInputs) {
        const context = blockContextMap.get(input.id)
        const portName = context?.prefixedName || input.name
        const dataType = input.parameters?.dataType || 'double'
        const defaultValue = input.parameters?.defaultValue || 0
        const variable = parseTypeToVariable(dataType, portName)
        
        if (variable.arraySize) {
          // Initialize array
          code += `    for (int i = 0; i < ${variable.arraySize}; i++) {\n`
          code += `        model->inputs.${sanitizeIdentifier(variable.name)}[i] = ${defaultValue};\n`
          code += `    }\n`
        } else {
          // Initialize scalar
          code += `    model->inputs.${sanitizeIdentifier(variable.name)} = ${defaultValue};\n`
        }
      }
    }
    code += `\n`
  }

  // Initialize states with prefixed names
  const transferFunctions = sheet.blocks.filter(b => b.type === 'transfer_function')
  if (transferFunctions.length > 0) {
    code += `    // Initialize transfer function states\n`
    for (const tf of transferFunctions) {
      const context = blockContextMap.get(tf.id)
      const tfName = context?.prefixedName || tf.name
      const denominator = tf.parameters?.denominator || [1, 1]
      const stateOrder = Math.max(0, denominator.length - 1)
      
      if (stateOrder > 0) {
        code += `    memset(model->states.${sanitizeIdentifier(tfName)}_states, 0, sizeof(model->states.${sanitizeIdentifier(tfName)}_states));\n`
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

function generateStepFunctionMultiSheet(
  safeName: string, 
  sheet: Sheet, 
  blockTypes: Map<string, string>,
  blockContextMap: Map<string, BlockContext>
): string {
  let code = `void ${safeName}_step(${safeName}_t* model) {\n`
  code += `    // This function computes algebraic outputs only (no integration)\n`
  code += `    // For time integration, use ${safeName}_time_step()\n\n`
  
  // Calculate execution order using the multi-sheet aware version
  const executionOrder = calculateExecutionOrderMultiSheet(sheet.blocks, sheet.connections, blockContextMap)
  
  code += `    // Compute block outputs in execution order\n`
  
  // Group execution by original sheet for comments
  let currentSheetPath: string[] = []
  
  for (const blockId of executionOrder) {
    const block = sheet.blocks.find(b => b.id === blockId)
    if (!block) continue
    
    const context = blockContextMap.get(blockId)
    
    // Add comment when entering a new subsystem
    if (context && JSON.stringify(context.sheetPath) !== JSON.stringify(currentSheetPath)) {
      currentSheetPath = context.sheetPath
      if (currentSheetPath.length > 0) {
        code += `\n    // Subsystem: ${currentSheetPath.join(' > ')}\n`
      } else {
        code += `\n    // Main system\n`
      }
    }
    
    // Skip certain block types that don't need computation
    if (block.type === 'sheet_label_sink' || 
        block.type === 'sheet_label_source' ||
        block.type === 'input_port' ||
        block.type === 'signal_display' ||
        block.type === 'signal_logger') {
      continue
    }
    
    code += generateBlockComputation(block, sheet, blockTypes, blockContextMap)
  }

  // Update time
  code += `\n    // Update simulation time\n`
  code += `    model->time += model->dt;\n`
  
  code += `}\n\n`
  
  return code
}


// Helper function to generate source blocks with prefixed names
function generateSourceBlockMultiSheet(
  block: BlockData, 
  outputType: string | undefined,
  prefixedName: string
): string {
  const signalType = block.parameters?.signalType || 'constant'
  const value = block.parameters?.value || 0
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName)}`
  
  let code = ``
  
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

/**
 * Recursively collect all sheets including those nested in subsystems
 */
function getAllSheets(sheets: Sheet[]): Sheet[] {
  const allSheets: Sheet[] = []
  
  function collectSheets(currentSheets: Sheet[]) {
    for (const sheet of currentSheets) {
      allSheets.push(sheet)
      
      // Look for subsystem blocks and collect their sheets
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          collectSheets(block.parameters.sheets as Sheet[])
        }
      }
    }
  }
  
  collectSheets(sheets)
  return allSheets
}

// Add this function after flattenModelStructure in codeGeneration.ts:

/**
 * Extract sheet label signal mappings from the original model structure
 * This is used to generate appropriate signal assignments in the C code
 */
function extractSheetLabelMappings(
  sheets: Sheet[]
): Map<string, { sinkWireId: string, sourceSignal: string, sinkSignal: string }[]> {
  const mappings = new Map<string, { sinkWireId: string, sourceSignal: string, sinkSignal: string }[]>()
  const allSheets = getAllSheets(sheets)
  
  // Process each sheet to find sheet label connections
  for (const sheet of allSheets) {
    const sheetMappings: { sinkWireId: string, sourceSignal: string, sinkSignal: string }[] = []
    
    // Find all sheet label sinks with their input connections
    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
        const sinkWire = sheet.connections.find(w => w.targetBlockId === block.id)
        if (sinkWire) {
          // Find all sources with the same signal name
          const sourcesWithSameName = sheet.blocks.filter(b => 
            b.type === 'sheet_label_source' && 
            b.parameters?.signalName === block.parameters?.signalName
          )
          
          for (const sourceBlock of sourcesWithSameName) {
            sheetMappings.push({
              sinkWireId: sinkWire.id,
              sourceSignal: `${sinkWire.sourceBlockId}_output_${sinkWire.sourcePortIndex}`,
              sinkSignal: `${sourceBlock.id}_output_0`
            })
          }
        }
      }
    }
    
    if (sheetMappings.length > 0) {
      mappings.set(sheet.id, sheetMappings)
    }
  }
  
  return mappings
}


/**
 * Generate a unique prefixed name for a block based on its location in the hierarchy
 */
function getPrefixedBlockName(blockName: string, sheetPath: string[], blockContextMap: Map<string, BlockContext>, allSheets: Sheet[]): string {
  if (sheetPath.length === 0) {
    return sanitizeIdentifier(blockName)
  }
  
  // Create prefix from subsystem names (not IDs)
  const prefixParts: string[] = []
  for (const subsystemId of sheetPath) {
    // Find the subsystem block to get its name
    for (const sheet of allSheets) {
      const subsystemBlock = sheet.blocks.find(b => b.id === subsystemId && b.type === 'subsystem')
      if (subsystemBlock) {
        prefixParts.push(sanitizeIdentifier(subsystemBlock.name))
        break
      }
    }
  }
  
  const prefix = prefixParts.join('_')
  return `${prefix}_${sanitizeIdentifier(blockName)}`
}

/**
 * Get the subsystem path for a sheet (array of subsystem IDs to reach this sheet)
 */
function getSheetPath(sheetId: string, sheets: Sheet[]): string[] {
  // If it's a root sheet, return empty path
  if (sheets.some(s => s.id === sheetId)) {
    return []
  }
  
  // Find which subsystem contains this sheet
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        const subsystemSheets = block.parameters.sheets as Sheet[]
        
        // Check if target sheet is directly in this subsystem
        if (subsystemSheets.some(s => s.id === sheetId)) {
          const parentPath = getSheetPath(sheet.id, sheets)
          return [...parentPath, block.id]
        }
        
        // Check nested subsystems
        const nestedPath = getSheetPath(sheetId, subsystemSheets)
        if (nestedPath.length > 0) {
          const parentPath = getSheetPath(sheet.id, sheets)
          return [...parentPath, block.id, ...nestedPath]
        }
      }
    }
  }
  
  return []
}

/**
 * Build a map of all blocks with their context information
 */
function buildBlockContextMap(sheets: Sheet[]): Map<string, BlockContext> {
  const blockContextMap = new Map<string, BlockContext>()
  const allSheets = getAllSheets(sheets)
  
  for (const sheet of allSheets) {
    const sheetPath = getSheetPath(sheet.id, sheets)
    
    for (const block of sheet.blocks) {
      // Skip subsystem blocks as they're just containers
      if (block.type === 'subsystem') {
        continue
      }
      
      const prefixedName = getPrefixedBlockName(block.name, sheetPath, blockContextMap, allSheets)
      
      blockContextMap.set(block.id, {
        block,
        sheetId: sheet.id,
        sheetPath,
        prefixedName
      })
    }
  }
  
  return blockContextMap
}

/**
 * Build a map of original block IDs to their prefixed names
 */
function buildBlockNameMap(blockContextMap: Map<string, BlockContext>): Map<string, string> {
  const nameMap = new Map<string, string>()
  
  for (const [blockId, context] of blockContextMap) {
    nameMap.set(blockId, context.prefixedName)
  }
  
  return nameMap
}

/**
 * Flatten a multi-sheet model into a single sheet structure
 * This is similar to what MultiSheetSimulationEngine does for simulation
 */
function flattenModelStructure(sheets: Sheet[]): FlattenedModel {
  const blocks: BlockData[] = []
  const connections: WireData[] = []
  const blockContextMap = buildBlockContextMap(sheets)
  const blockNameMap = buildBlockNameMap(blockContextMap)
  const subsystemPortMappings = new Map<string, { inputPorts: Map<number, string>, outputPorts: Map<number, string> }>()
  
  // Collect all sheets first
  const allSheets = getAllSheets(sheets)
  
  // Collect all blocks from all sheets (excluding subsystems)
  for (const sheet of allSheets) {
    const sheetPath = getSheetPath(sheet.id, sheets)
    
    for (const block of sheet.blocks) {
      // Skip subsystem blocks - they're just containers
      if (block.type === 'subsystem') {
        // But first, build port mappings for this subsystem
        const portMapping = {
          inputPorts: new Map<number, string>(),
          outputPorts: new Map<number, string>()
        }
        
        // Find input/output port blocks inside this subsystem
        if (block.parameters?.sheets) {
          const subsystemSheets = block.parameters.sheets as Sheet[]
          for (const subSheet of subsystemSheets) {
            for (const subBlock of subSheet.blocks) {
              if (subBlock.type === 'input_port') {
                const portName = subBlock.parameters?.portName
                const portIndex = block.parameters.inputPorts?.indexOf(portName) ?? -1
                if (portIndex >= 0) {
                  portMapping.inputPorts.set(portIndex, subBlock.id)
                }
              } else if (subBlock.type === 'output_port') {
                const portName = subBlock.parameters?.portName
                const portIndex = block.parameters.outputPorts?.indexOf(portName) ?? -1
                if (portIndex >= 0) {
                  portMapping.outputPorts.set(portIndex, subBlock.id)
                }
              }
            }
          }
        }
        
        subsystemPortMappings.set(block.id, portMapping)
        continue
      }
      
      // Create a new block with prefixed name
      const prefixedName = getPrefixedBlockName(block.name, sheetPath, blockContextMap, allSheets)
      const flattenedBlock: BlockData = {
        ...block,
        id: block.id, // Keep original ID for wire remapping
        name: prefixedName // Use prefixed name for C code generation
      }
      
      blocks.push(flattenedBlock)
    }
  }
  
  // Collect all wires from all sheets
  for (const sheet of allSheets) {
    for (const wire of sheet.connections) {
      // Check if source is a subsystem output
      const sourcePortMapping = subsystemPortMappings.get(wire.sourceBlockId)
      const actualSourceId = sourcePortMapping?.outputPorts.get(wire.sourcePortIndex) || wire.sourceBlockId
      
      // Check if target is a subsystem input
      const targetPortMapping = subsystemPortMappings.get(wire.targetBlockId)
      const actualTargetId = targetPortMapping?.inputPorts.get(wire.targetPortIndex) || wire.targetBlockId
      
      // Check if both actual blocks exist in our flattened model
      const sourceExists = blocks.some(b => b.id === actualSourceId)
      const targetExists = blocks.some(b => b.id === actualTargetId)
      
      if (sourceExists && targetExists) {
        // Create remapped wire
        connections.push({
          id: `${sheet.id}_${wire.id}`,
          sourceBlockId: actualSourceId,
          sourcePortIndex: actualSourceId !== wire.sourceBlockId ? 0 : wire.sourcePortIndex,
          targetBlockId: actualTargetId,
          targetPortIndex: actualTargetId !== wire.targetBlockId ? 0 : wire.targetPortIndex
        })
      }
    }
  }
  
  // Handle connections to output ports inside subsystems
  for (const sheet of allSheets) {
    for (const block of sheet.blocks) {
      if (block.type === 'output_port') {
        // Find wires that connect to this output port
        const inputWires = sheet.connections.filter(w => w.targetBlockId === block.id)
        
        // Find which subsystem this output port belongs to
        for (const [subsystemId, mapping] of subsystemPortMappings) {
          for (const [portIndex, portBlockId] of mapping.outputPorts) {
            if (portBlockId === block.id) {
              // This output port is part of a subsystem
              // Find wires from the subsystem in the parent sheet
              for (const parentSheet of allSheets) {
                const outputWires = parentSheet.connections.filter(w => 
                  w.sourceBlockId === subsystemId && w.sourcePortIndex === portIndex
                )
                
                // Connect the internal source directly to external targets
                for (const inputWire of inputWires) {
                  for (const outputWire of outputWires) {
                    const sourceExists = blocks.some(b => b.id === inputWire.sourceBlockId)
                    const targetExists = blocks.some(b => b.id === outputWire.targetBlockId)
                    
                    if (sourceExists && targetExists) {
                      connections.push({
                        id: `subsystem_bypass_${inputWire.id}_${outputWire.id}`,
                        sourceBlockId: inputWire.sourceBlockId,
                        sourcePortIndex: inputWire.sourcePortIndex,
                        targetBlockId: outputWire.targetBlockId,
                        targetPortIndex: outputWire.targetPortIndex
                      })
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  // Resolve sheet label connections
  const sheetLabelSinks = new Map<string, { blockId: string, inputWireId: string }>()
  const sheetLabelSources = new Map<string, string[]>() // Map to array of source block IDs
  
  // First, collect all sheet label sinks and sources with their scopes
  for (const sheet of allSheets) {
    // Determine the scope of this sheet
    let scope = 'root'
    
    // Find which subsystem contains this sheet
    for (const [subsystemId, mapping] of subsystemPortMappings) {
      const subsystemBlock = allSheets.flatMap((s: Sheet) => s.blocks).find((b: BlockData) => b.id === subsystemId)
      if (subsystemBlock?.parameters?.sheets) {
        const subsystemSheets = subsystemBlock.parameters.sheets as Sheet[]
        if (subsystemSheets.some((s: Sheet) => s.id === sheet.id)) {
          scope = subsystemId
          break
        }
      }
    }
    
    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
        const scopedName = `${scope}:${block.parameters.signalName}`
        
        // Find the wire that feeds this sink
        const inputWire = connections.find(w => w.targetBlockId === block.id)
        if (inputWire) {
          sheetLabelSinks.set(scopedName, {
            blockId: block.id,
            inputWireId: inputWire.id
          })
        }
      } else if (block.type === 'sheet_label_source' && block.parameters?.signalName) {
        const scopedName = `${scope}:${block.parameters.signalName}`
        
        if (!sheetLabelSources.has(scopedName)) {
          sheetLabelSources.set(scopedName, [])
        }
        sheetLabelSources.get(scopedName)!.push(block.id)
      }
    }
  }
  
  // Create direct connections from sheet label sinks to sources
  const wiresToRemove = new Set<string>()
  
  for (const [scopedName, sourceBlockIds] of sheetLabelSources) {
    const sink = sheetLabelSinks.get(scopedName)
    if (sink) {
      // Find the wire that feeds the sink
      const sinkInputWire = connections.find(w => w.id === sink.inputWireId)
      if (sinkInputWire) {
        // For each source, find wires that connect from it
        for (const sourceBlockId of sourceBlockIds) {
          const sourceOutputWires = connections.filter(w => w.sourceBlockId === sourceBlockId)
          
          for (const outputWire of sourceOutputWires) {
            // Create a direct connection from sink's input to source's output
            connections.push({
              id: `sheet_label_bypass_${sinkInputWire.id}_${outputWire.id}`,
              sourceBlockId: sinkInputWire.sourceBlockId,
              sourcePortIndex: sinkInputWire.sourcePortIndex,
              targetBlockId: outputWire.targetBlockId,
              targetPortIndex: outputWire.targetPortIndex
            })
            
            // Mark the original wires for removal
            wiresToRemove.add(outputWire.id)
          }
          
          // Mark source block's input wire for removal
          const sourceInputWires = connections.filter(w => w.targetBlockId === sourceBlockId)
          sourceInputWires.forEach(w => wiresToRemove.add(w.id))
        }
        
        // Mark sink's output wires for removal
        const sinkOutputWires = connections.filter(w => w.sourceBlockId === sink.blockId)
        sinkOutputWires.forEach(w => wiresToRemove.add(w.id))
      }
    }
  }
  
  // Remove sheet label blocks from the flattened model
  const sheetLabelBlockIds = new Set<string>()
  for (const [_, sink] of sheetLabelSinks) {
    sheetLabelBlockIds.add(sink.blockId)
  }
  for (const [_, sources] of sheetLabelSources) {
    sources.forEach(id => sheetLabelBlockIds.add(id))
  }
  
  // Filter out sheet label blocks
  const filteredBlocks = blocks.filter(b => !sheetLabelBlockIds.has(b.id))
  
  // Filter out marked wires and wires connected to sheet label blocks
  const filteredConnections = connections.filter(w => 
    !wiresToRemove.has(w.id) &&
    !sheetLabelBlockIds.has(w.sourceBlockId) &&
    !sheetLabelBlockIds.has(w.targetBlockId)
  )
  
  return {
    blocks: filteredBlocks,
    connections: filteredConnections,
    blockContextMap,
    blockNameMap
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
          let signalType = 'double' // default type
          
          if (connectedWire) {
              const sourceKey = `${connectedWire.sourceBlockId}:${connectedWire.sourcePortIndex}`
              signalType = blockTypes.get(sourceKey) || 'double'
          }
          
          const variable = parseTypeToVariable(signalType, portName)
          header += generateStructMember(variable) + '\n'
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

function generateRK4FunctionMultiSheet(
  safeName: string, 
  sheet: Sheet, 
  blockTypes: Map<string, string>,
  blockContextMap: Map<string, BlockContext>
): string {
  // Just delegate to the original function with context
  return generateRK4Function(safeName, sheet, blockTypes)
}

function generateDerivativesFunctionMultiSheet(
  safeName: string, 
  sheet: Sheet, 
  blockTypes: Map<string, string>,
  blockContextMap: Map<string, BlockContext>
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
  
  code += `    // Note: This function assumes algebraic signals have been computed\n`
  code += `    // and are available in model->signals\n`
  code += `    \n`
  
  // For each transfer function, compute derivatives
  for (const tf of transferFunctions) {
    const context = blockContextMap.get(tf.id)
    const tfName = context?.prefixedName || tf.name
    const numerator = tf.parameters?.numerator || [1]
    const denominator = tf.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) continue // No states
    
    // Get the input signal for this transfer function
    const inputWire = sheet.connections.find(w => w.targetBlockId === tf.id)
    if (!inputWire) continue
    
    // Determine how to access the input
    const inputExpression = generateInputExpressionMultiSheet(inputWire, sheet, 'model', blockContextMap)
    
    code += `    // Transfer function: ${tf.name}`
    if (context && context.sheetPath.length > 0) {
      code += ` (from ${context.sheetPath.join(' > ')})`
    }
    code += `\n`
    
    // Generate state-space form derivatives
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
        code += `        double y = current_states->${sanitizeIdentifier(tfName)}_states[i][0];\n`
        code += `        state_derivatives->${sanitizeIdentifier(tfName)}_states[i][0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpression};\n`
        code += `        double y = current_states->${sanitizeIdentifier(tfName)}_states[0];\n`
        code += `        state_derivatives->${sanitizeIdentifier(tfName)}_states[0] = (${b0} * u - ${a0} * y) / ${a1};\n`
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
        code += `        double x1 = current_states->${sanitizeIdentifier(tfName)}_states[i][0];\n`
        code += `        double x2 = current_states->${sanitizeIdentifier(tfName)}_states[i][1];\n`
        code += `        state_derivatives->${sanitizeIdentifier(tfName)}_states[i][0] = x2;\n`
        code += `        state_derivatives->${sanitizeIdentifier(tfName)}_states[i][1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpression};\n`
        code += `        double x1 = current_states->${sanitizeIdentifier(tfName)}_states[0];\n`
        code += `        double x2 = current_states->${sanitizeIdentifier(tfName)}_states[1];\n`
        code += `        state_derivatives->${sanitizeIdentifier(tfName)}_states[0] = x2;\n`
        code += `        state_derivatives->${sanitizeIdentifier(tfName)}_states[1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      }
    }
    
    code += `    \n`
  }
  
  code += `}\n\n`
  return code
}

// Add helper function for multi-sheet input expression generation
function generateInputExpressionMultiSheet(
  inputWire: WireData,
  sheet: Sheet,
  modelVar: string,
  blockContextMap: Map<string, BlockContext>
): string {
  const sourceBlock = sheet.blocks.find(b => b.id === inputWire.sourceBlockId)
  if (!sourceBlock) return "0.0"
  
  const context = blockContextMap.get(sourceBlock.id)
  const sourceName = context?.prefixedName || sourceBlock.name
  
  if (sourceBlock.type === 'input_port') {
    return `${modelVar}->inputs.${sanitizeIdentifier(sourceName)}`
  } else {
    return `${modelVar}->signals.${sanitizeIdentifier(sourceName)}`
  }
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
    
    // Determine how to access the input - IMPORTANT: use 'model' not safeName
    const inputExpression = generateInputExpression(inputWire, sheet, 'model')
    
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

// Helper function that should be used
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

// Helper to sanitize identifiers
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

function generateBlockComputation(
  block: BlockData,
  sheet: Sheet,
  blockTypes: Map<string, string>,
  blockContextMap?: Map<string, BlockContext>
): string {
  const context = blockContextMap?.get(block.id)
  const prefixedName = context?.prefixedName || block.name
  
  let code = ''
  
  // Get input connections
  const inputWires = sheet.connections.filter(w => w.targetBlockId === block.id)
  
  // Check if any input wires are sheet label bypasses
  const hasSheetLabelInputs = inputWires.some(w => w.id.includes('sheet_label_bypass'))
  
  // Add comment with original location if context is available
  if (context && context.sheetPath.length > 0) {
    code += `    // ${block.type}: ${block.name} (from ${context.sheetPath.join(' > ')})`
    if (hasSheetLabelInputs) {
      code += ` [receives sheet label signal]`
    }
    code += `\n`
  } else {
    code += `    // ${block.type}: ${block.name}`
    if (hasSheetLabelInputs) {
      code += ` [receives sheet label signal]`
    }
    code += `\n`
  }
  
  // Generate computation - pass prefixedName to existing functions
  switch (block.type) {
    case 'source':
      code += generateSourceBlock(block, blockTypes.get(`${block.id}:0`), prefixedName)
      break
      
    case 'sum':
      code += generateSumBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      break
      
    case 'multiply':
      code += generateMultiplyBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      break
      
    case 'scale':
      code += generateScaleBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      break
      
    case 'transfer_function':
      code += generateTransferFunctionBlock(block, inputWires, sheet, blockTypes, prefixedName, blockContextMap)
      break
      
    case 'lookup_1d':
      code += generateLookup1DBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      break
      
    case 'lookup_2d':
      code += generateLookup2DBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      break
      
    case 'output_port':
      const context = blockContextMap?.get(block.id)
      if (context && context.sheetPath.length > 0) {
        // This is an output port inside a subsystem - store in signals
        code += generateSubsystemOutputPortBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      } else {
        // This is a top-level output port - store in outputs
        code += generateOutputPortBlock(block, inputWires, sheet, prefixedName, blockContextMap)
      }
      break
      
    case 'subsystem':
      code += `    // TODO: Subsystem ${prefixedName}\n`
      code += `    model->signals.${sanitizeIdentifier(prefixedName)} = 0.0;\n`
      break
      
    default:
      code += `    // Unsupported block type: ${block.type}\n`
  }
  
  return code
}

function generateSubsystemOutputPortBlock(
  block: BlockData,
  inputWires: WireData[],
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  let code = ''
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const inputExpr = getInputExpression(wire, sheet, 'model', blockContextMap)
    
    // Store in signals, not outputs
    code += `    model->signals.${sanitizeIdentifier(prefixedName || block.name)} = ${inputExpr};\n`
  }
  
  return code
}

function generateSourceBlock(
  block: BlockData, 
  outputType?: string,
  prefixedName?: string
): string {
  const signalType = block.parameters?.signalType || 'constant'
  const value = block.parameters?.value || 0
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
  
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
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
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
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
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
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const gain = block.parameters?.gain || 1
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
  let code = ``
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const inputExpr = getInputExpression(wire, sheet, 'model', blockContextMap)
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
  blockTypes: Map<string, string>,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
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
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
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
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const outputName = `model->signals.${sanitizeIdentifier(prefixedName || block.name)}`
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
  sheet: Sheet,
  prefixedName?: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  let code = ''
  
  if (inputWires.length > 0) {
    const wire = inputWires[0]
    const inputExpr = getInputExpression(wire, sheet, 'model', blockContextMap)
    
    // Check if this output port is inside a subsystem
    const context = blockContextMap?.get(block.id)
    const isInSubsystem = context && context.sheetPath.length > 0
    
    if (isInSubsystem) {
      // For output ports inside subsystems, store in signals
      const signalName = prefixedName || block.name
      code += `    model->signals.${sanitizeIdentifier(signalName)} = ${inputExpr};\n`
    } else {
      // For top-level output ports, use the portName for the output struct member
      const portName = block.parameters?.portName || block.name
      
      // Determine if this is a vector output by checking the source block type
      const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
      let isVector = false
      let vectorSize = 0
      
      if (sourceBlock) {
        // Check the output type of the source block
        const outputKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
        const outputType = blockContextMap ? 
          // Use blockTypes if available through context
          undefined : // We need to pass blockTypes to this function
          undefined
        
        // For now, check common vector cases
        if (sourceBlock.type === 'source' || sourceBlock.type === 'input_port') {
          const dataType = sourceBlock.parameters?.dataType
          if (dataType && dataType.includes('[')) {
            isVector = true
            const match = dataType.match(/\[(\d+)\]/)
            if (match) {
              vectorSize = parseInt(match[1])
            }
          }
        } else if (sourceBlock.type === 'transfer_function') {
          // Check if TF is processing vectors - need to check its input
          const tfInputWire = sheet.connections.find(w => w.targetBlockId === sourceBlock.id)
          if (tfInputWire) {
            const tfSourceBlock = sheet.blocks.find(b => b.id === tfInputWire.sourceBlockId)
            if (tfSourceBlock && (tfSourceBlock.type === 'source' || tfSourceBlock.type === 'input_port')) {
              const dataType = tfSourceBlock.parameters?.dataType
              if (dataType && dataType.includes('[')) {
                isVector = true
                const match = dataType.match(/\[(\d+)\]/)
                if (match) {
                  vectorSize = parseInt(match[1])
                }
              }
            }
          }
        }
      }
      
      if (isVector && vectorSize > 0) {
        // Use memcpy for vector assignment
        code += `    memcpy(model->outputs.${sanitizeIdentifier(portName)}, ${inputExpr}, sizeof(model->outputs.${sanitizeIdentifier(portName)}));\n`
      } else {
        // Scalar assignment
        code += `    model->outputs.${sanitizeIdentifier(portName)} = ${inputExpr};\n`
      }
    }
  }
  
  return code
}

// Get input expression without model variable prefix (for simpler cases)
function getInputExpression(
  wire: WireData,
  sheet: Sheet,
  modelVar: string,
  blockContextMap?: Map<string, BlockContext>
): string {
  const sourceBlock = sheet.blocks.find(b => b.id === wire.sourceBlockId)
  if (!sourceBlock) return "0.0"
  
  const context = blockContextMap?.get(sourceBlock.id)
  
  if (sourceBlock.type === 'input_port') {
    // Always use the prefixed name for input ports
    const inputName = context?.prefixedName || sourceBlock.name
    return `${modelVar}->inputs.${sanitizeIdentifier(inputName)}`
  } else {
    // For other blocks, use prefixed name from signals
    const sourceName = context?.prefixedName || sourceBlock.name
    return `${modelVar}->signals.${sanitizeIdentifier(sourceName)}`
  }
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


// Helper functions

function tryParseType(typeString: string): ParsedType | null {
  try {
    return parseType(typeString)
  } catch {
    return null
  }
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