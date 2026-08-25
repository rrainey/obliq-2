// lib/signalTypePropagation.ts - Updated to handle enable port type validation

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { areTypesCompatible, getTypeCompatibilityError, parseType, ParsedType, typeToString, isMatrixType, getMatrixDimensions } from './typeValidator'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { collectSheetsRecursive } from './sheetLabelUtils'

// Debug flag for verbose logging - set to true to enable detailed trace output
const DEBUG_PROPAGATION = false

function debugLog(...args: unknown[]) {
  if (DEBUG_PROPAGATION) {
    console.log('[SignalPropagation]', ...args)
  }
}

/**
 * Blocks that hold state and commonly close feedback loops. Their output type can
 * be resolved from an IC / x(0) port (or default double) without waiting for the
 * derivative/input that often depends on this block's own output.
 *
 * transfer_function / discrete_transform are *not* seeded early — they wait for
 * inputs so scalar float/double chains still preserve the driving type. They only
 * use a double default if still untyped after propagation (see final pass).
 */
function isTypeLoopBreaker(blockType: string): boolean {
  return blockType === 'integrator' || blockType === 'unit_delay'
}

/** Configured arity for sum/multiply: signs length, else numInputs/inputCount, else 2. */
function configuredArithmeticInputCount(block: BlockData): number {
  if (typeof block.parameters?.signs === 'string' && block.parameters.signs.length > 0) {
    return block.parameters.signs.length
  }
  const n = block.parameters?.numInputs ?? block.parameters?.inputCount
  if (typeof n === 'number' && n >= 1) return n
  return 2
}

/**
 * Multi-input sum/multiply output type: identical shapes → that shape;
 * scalar/bool may broadcast onto a shared vector/matrix shape.
 */
function elementWiseArithmeticOutputType(parsedTypes: ParsedType[]): string | null {
  if (parsedTypes.length === 0) return null
  const firstType = parsedTypes[0]
  const allSameType = parsedTypes.every(
    t =>
      t.baseType === firstType.baseType &&
      t.isArray === firstType.isArray &&
      t.arraySize === firstType.arraySize &&
      t.isMatrix === firstType.isMatrix &&
      t.rows === firstType.rows &&
      t.cols === firstType.cols
  )
  if (allSameType) return typeToString(firstType)

  const isNumScalar = (t: ParsedType) =>
    !t.isArray &&
    !t.isMatrix &&
    (t.baseType === 'double' || t.baseType === 'float' || t.baseType === 'bool')
  const scalars = parsedTypes.filter(isNumScalar)
  const vectors = parsedTypes.filter(t => t.isArray || t.isMatrix)
  if (scalars.length + vectors.length === parsedTypes.length && vectors.length >= 1) {
    const v0 = vectors[0]
    if (vectors.every(v => typeToString(v) === typeToString(v0))) {
      return typeToString(v0)
    }
  }
  if (vectors.length === 0 && parsedTypes.every(isNumScalar)) {
    return 'double'
  }
  return null
}

/** Sum/multiply: allow scalar/bool broadcast onto a shared vector/matrix shape. */
function elementWiseInputsCompatible(inputTypes: string[], blockType: string): boolean {
  if (inputTypes.length <= 1) return true
  if (inputTypes.every(t => t === inputTypes[0])) return true
  if (blockType !== 'multiply' && blockType !== 'sum') return false
  try {
    const parsed = inputTypes.map(t => parseType(t))
    const isNumScalar = (p: ParsedType) =>
      !p.isArray &&
      !p.isMatrix &&
      (p.baseType === 'double' || p.baseType === 'float' || p.baseType === 'bool')
    const scalars = parsed.filter(isNumScalar)
    const vectors = parsed.filter(p => p.isArray || p.isMatrix)
    if (scalars.length + vectors.length !== parsed.length) return false
    if (vectors.length === 0) {
      // all scalars: bool mixes with double OK
      return parsed.every(isNumScalar)
    }
    // One distinct vector/matrix shape; remaining inputs scalars
    const v0 = vectors[0]
    const sameVec = vectors.every(v => typeToString(v) === typeToString(v0))
    return sameVec && scalars.length >= 1
  } catch {
    return false
  }
}

function isDeferredStateBlock(blockType: string): boolean {
  return (
    blockType === 'transfer_function' ||
    blockType === 'discrete_transform'
  )
}

/**
 * Whether a target block can be enqueued for type resolution given currently
 * known input types.
 */
function canEnqueueForTypePropagation(
  targetBlock: BlockData,
  knownInputCount: number,
  expectedInputCount: number
): boolean {
  if (knownInputCount >= expectedInputCount) return true
  // Sinks and subsystems don't need full input resolution to be "processed"
  if (
    [
      'signal_display',
      'signal_logger',
      'no_connection',
      'output_port',
      'sheet_label_sink',
      'subsystem',
    ].includes(targetBlock.type)
  ) {
    return true
  }
  // State blocks: can resolve with partial inputs (or none → default double)
  if (isTypeLoopBreaker(targetBlock.type)) {
    return true
  }
  return false
}

/**
 * Represents the type information for a signal (wire)
 */
export interface SignalType {
  wireId: string
  sourceBlockId: string
  sourcePortIndex: number
  targetBlockId: string
  targetPortIndex: number
  type: string
  parsedType: ParsedType
}

/**
 * Map of block output port to its signal type
 */
export type BlockOutputTypes = Map<string, string> // key: "blockId:portIndex"

/**
 * Map of all signal types in the model
 */
export type SignalTypeMap = Map<string, SignalType> // key: wireId

/**
 * Result of type propagation analysis
 */
export interface TypePropagationResult {
  signalTypes: SignalTypeMap
  blockOutputTypes: BlockOutputTypes
  errors: TypePropagationError[]
}

/**
 * Type propagation error information
 */
export interface TypePropagationError {
  wireId?: string
  blockId?: string
  message: string
  severity: 'error' | 'warning'
}

type SheetLabelSinkTypes = Map<string, string> // key: signalName, value: type


/**
 * Gets the output type for a block based on its type and parameters
 */
function getBlockOutputType(block: BlockData): string | null {
  switch (block.type) {
    case 'source':
    case 'input_port':
      // These blocks have explicit dataType parameter
      return block.parameters?.dataType || 'double'

    case 'clock':
      // Clock always outputs simulation time as double
      return 'double'
    
    case 'sum':
    case 'multiply':
    case 'divide':
    case 'scale':
    case 'limit':
    case 'saturation_dynamic':
    case 'integrator':
    case 'unit_delay':
    case 'units_conversion':
    case 'transfer_function':
    case 'discrete_transform':
    case 'lookup_1d':
    case 'lookup_2d':
    case 'matrix_multiply':  // New: matrix multiply output depends on inputs
    case 'sign':
    case 'quantizer':
      // These blocks output type depends on their inputs
      // Will be determined during propagation
      return null

    case 'relay':
    case 'rate_limiter':
    case 'edge_detect':
      // Scalar double outputs (v1)
      return 'double'

    case 'atmosphere':
      // Multi-output scalars; first port type for map
      return 'double'

    case 'data_store_read':
      return block.parameters?.dataType || 'double'

    case 'data_store_write':
    case 'signal_display':
    case 'signal_logger':
    case 'no_connection':
      return null

    case 'selector':
      // Output type depends on indices + input — determined during propagation
      return null

    case 'evaluate':
      // RelationalOperator/Logic / MultiPortSwitch may declare outputType.
      // When unset, defer to determineProcessingBlockOutputType (inputs).
      if (block.parameters?.outputType) {
        return block.parameters.outputType
      }
      if (block.parameters?.dataType) {
        return block.parameters.dataType
      }
      return null
    
    case 'mux':  // Mux output type depends on configuration
      // Mux outputType parameter contains the full type string (e.g., 'double[2][2]')
      // If outputType is set, use it directly
      if (block.parameters?.outputType) {
        return block.parameters.outputType
      }
      // Fallback: derive type from rows/cols configuration
      if (block.parameters?.rows && block.parameters?.cols) {
        const baseType = block.parameters?.baseType || 'double'
        return `${baseType}[${block.parameters.rows}][${block.parameters.cols}]`
      }
      // Type will be determined from inputs during propagation
      return null
    
    case 'demux':  // New: demux always outputs scalars
      // Demux always outputs scalars of the input base type
      // Type will be determined from input
      return null
    
    case 'signal_display':
    case 'signal_logger':
    case 'no_connection':
    case 'output_port':
      // These blocks don't have outputs
      return null
    
    case 'subsystem':
      // Subsystem outputs depend on internal implementation
      return null

    case 'sheet_label_sink':
      // Sheet label sinks don't have outputs
      return null
    
    case 'sheet_label_source':
      // Sheet label sources will get their type from the associated sink
      return null

    // Trig: shape follows input (vectorized sin/cos/sincos); mag/dot → scalar
    case 'trig':
      return null
    case 'mag':  // Magnitude always outputs scalar double
    case 'dot':  // Dot product always outputs scalar double
      return 'double'

    // Condition block always outputs bool
    case 'condition':
      return 'bool'

    // Cross product always outputs double[3]
    case 'cross':
      return 'double[3]'

    // Body to quaternion rates always outputs double[4][1]
    case 'body2quaternion_rates':
      return 'double[4][1]'

    // These blocks pass through their input type - determined during propagation
    case 'if':
    case 'abs':
    case 'square':
    case 'uminus':
    case 'sign':
    case 'transpose':
      return null

    default:
      return null
  }
}

/**
 * Determines the output type for arithmetic and processing blocks based on input types
 */
/**
 * Prefer explicit per-port types for state blocks so x(0) can set the output
 * type when the derivative is still unresolved (feedback loops).
 */
function getPortInputType(
  block: BlockData,
  portIndex: number,
  wiresByTarget: Map<string, WireData[]>,
  blockOutputTypes: BlockOutputTypes
): string | null {
  const targetKey = `${block.id}:${portIndex}`
  const wires = wiresByTarget.get(targetKey) || []
  for (const wire of wires) {
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const sourceType = blockOutputTypes.get(sourceKey)
    if (sourceType) return sourceType
  }
  return null
}

/**
 * Resolve output type for integrator / unit_delay / transfer_function family.
 * Uses derivative/input when known, else x(0)/IC, else default double.
 */
function determineStateBlockOutputType(
  block: BlockData,
  wiresByTarget: Map<string, WireData[]>,
  blockOutputTypes: BlockOutputTypes
): string {
  if (block.type === 'integrator') {
    const deriv = getPortInputType(block, 0, wiresByTarget, blockOutputTypes)
    if (deriv) return deriv
    if (block.parameters?.showInitPort) {
      const ic = getPortInputType(block, 1, wiresByTarget, blockOutputTypes)
      if (ic) return ic
    }
    return block.parameters?.dataType || 'double'
  }
  if (block.type === 'unit_delay') {
    const input = getPortInputType(block, 0, wiresByTarget, blockOutputTypes)
    if (input) return input
    return block.parameters?.dataType || 'double'
  }
  // transfer_function / discrete_transform: match input when known
  const input = getPortInputType(block, 0, wiresByTarget, blockOutputTypes)
  if (input) return input
  return block.parameters?.dataType || 'double'
}

function determineProcessingBlockOutputType(
  blockType: string,
  inputTypes: string[],
  block?: BlockData
): string | null {
  // Fixed-output blocks (do not require typed inputs)
  if (blockType === 'atmosphere') {
    // All four ports are always scalar double (COESA / table)
    return 'double'
  }

  // Filter empty placeholders from sparse port maps
  const knownInputTypes = inputTypes.filter((t) => !!t && t.length > 0)

  if (knownInputTypes.length === 0) {
    if (blockType === 'data_store_read' && block) {
      return block.parameters?.dataType || 'double'
    }
    // Integrator / unit_delay default to double when no inputs are typed yet
    if (isTypeLoopBreaker(blockType) || isDeferredStateBlock(blockType)) {
      return block?.parameters?.dataType || 'double'
    }
    return null
  }
  
  // Parse all known input types
  const parsedTypes = knownInputTypes.map(type => {
    try {
      return parseType(type)
    } catch {
      return null
    }
  }).filter(t => t !== null) as ParsedType[]
  
  if (parsedTypes.length === 0) return null
  
  switch (blockType) {
    case 'atmosphere':
      // All outputs are scalar double regardless of altitude type (must be scalar)
      return 'double'

    case 'sum': {
      // Sum of Elements (configured numInputs/signs length === 1):
      // vector/matrix → scalar base type (sum of all elements).
      if (block && configuredArithmeticInputCount(block) === 1 && parsedTypes.length === 1) {
        const only = parsedTypes[0]
        if (only.isArray || only.isMatrix) return only.baseType
        return typeToString(only)
      }
      // Multi-input: same-shaped → element-wise; scalar broadcasts onto vector/matrix
      return elementWiseArithmeticOutputType(parsedTypes)
    }
    case 'multiply': {
      return elementWiseArithmeticOutputType(parsedTypes)
    }

    case 'divide': {
      // Same shape → that shape; non-scalar / scalar → numerator shape; scalar / non-scalar invalid
      if (parsedTypes.length < 2) {
        return typeToString(parsedTypes[0])
      }
      const num = parsedTypes[0]
      const den = parsedTypes[1]
      const numScalar = !num.isArray && !num.isMatrix
      const denScalar = !den.isArray && !den.isMatrix
      if (numScalar && !denScalar) {
        return null
      }
      if (!numScalar && denScalar) {
        return typeToString(num)
      }
      // Same dimensionality required when both non-scalar
      if (!numScalar && !denScalar) {
        const same =
          num.baseType === den.baseType &&
          num.isArray === den.isArray &&
          num.arraySize === den.arraySize &&
          num.isMatrix === den.isMatrix &&
          num.rows === den.rows &&
          num.cols === den.cols
        return same ? typeToString(num) : null
      }
      return typeToString(num)
    }
    
    case 'scale':
    case 'limit':
    case 'saturation_dynamic':
    case 'integrator':
    case 'unit_delay':
    case 'units_conversion':
    case 'sign':
    case 'quantizer':
      // Scale/Limit/SaturationDynamic/…: output follows primary data input
      if (block?.type === 'saturation_dynamic' && parsedTypes.length >= 2) {
        const u = parsedTypes[1]
        if (u && (u.isArray || u.isMatrix)) return typeToString(u)
        const vec = parsedTypes.find(t => t.isArray || t.isMatrix)
        if (vec) return typeToString(vec)
      }
      return typeToString(parsedTypes[0])

    case 'selector': {
      if (block) {
        try {
          return BlockModuleFactory.getBlockModule('selector').getOutputType(block, inputTypes)
        } catch {
          /* fall through */
        }
      }
      // Fallback without block params: first element scalar
      return parsedTypes[0].baseType
    }

    case 'relay':
    case 'rate_limiter':
      // Scalar double (v1)
      return 'double'

    case 'trig':
      // Preserve vector shape (incl. both sincos ports)
      return typeToString(parsedTypes[0])

    case 'transfer_function':
    case 'discrete_transform':
      // Transfer function: output type matches input type
      // Arrays and matrices are processed element-wise
      return typeToString(parsedTypes[0])
    
    case 'lookup_1d':
    case 'lookup_2d':
      // Lookup blocks: output type matches input type
      // Must be scalar (not array or matrix)
      if (!parsedTypes[0].isArray && !parsedTypes[0].isMatrix) {
        return typeToString(parsedTypes[0])
      }
      return null // Lookup blocks don't accept arrays or matrices
    
    case 'matrix_multiply':
      // Shared rules with MatrixMultiplyBlockModule (scalar×vector, mat×vec, etc.)
      if (knownInputTypes.length < 2) return null
      return calculateMatrixMultiplyOutputType(knownInputTypes[0], knownInputTypes[1])

    case 'if':
      // If block passes through input1's type (first input)
      // Control is second input, input2 is third
      return typeToString(parsedTypes[0])

    case 'abs':
    case 'square':
    case 'uminus':
      // Pass-through blocks: output type matches input type exactly
      return typeToString(parsedTypes[0])

    case 'transpose':
      // Transpose swaps rows and cols for matrices
      const transposeInput = parsedTypes[0]
      if (transposeInput.isMatrix && transposeInput.rows && transposeInput.cols) {
        return `${transposeInput.baseType}[${transposeInput.cols}][${transposeInput.rows}]`
      }
      // For non-matrices, return as-is
      return typeToString(transposeInput)

    case 'demux':
      // Demux always outputs the base type as scalar
      const demuxInputType = parsedTypes[0]
      return demuxInputType.baseType

    case 'mux':
      // Mux combines scalars into a vector or matrix
      // All inputs must be scalars of the same base type
      if (parsedTypes.length === 0) return null
      const muxBaseType = parsedTypes[0].baseType
      const allMuxScalars = parsedTypes.every(t =>
        !t.isArray && !t.isMatrix && t.baseType === muxBaseType
      )
      if (!allMuxScalars) return null
      // Output type depends on input count - create a vector by default
      return `${muxBaseType}[${parsedTypes.length}]`

    case 'evaluate': {
      if (block?.parameters?.outputType) {
        return String(block.parameters.outputType)
      }
      if (block?.parameters?.dataType) {
        return String(block.parameters.dataType)
      }
      const expr = String(block?.parameters?.expression || '')
      // MultiPortSwitch: nested (in(0)==k ? in(j) : …) selecting whole ports
      const isMultiport =
        /^\(in\(0\)==\(/.test(expr) && /\?in\(\d+\)/.test(expr)
      if (isMultiport) {
        const vectors = parsedTypes.filter(t => t.isArray || t.isMatrix)
        if (vectors.length > 0) {
          return typeToString(vectors[0])
        }
        return 'double'
      }
      // Element extract in(i)[k] / in(i)(k) → scalar
      if (/in\(\d+\)\[/.test(expr) || /in\(\d+\)\(/.test(expr)) {
        return 'double'
      }
      // Constant / no input references (e.g. "0.0", "1.0") — do not inherit
      // unused wired input shapes (matrix-mux cells often wire a shared vector
      // into every Fcn even when the expression ignores it).
      if (!/\bin\s*\(/.test(expr)) {
        return 'double'
      }
      if (parsedTypes.length === 1) {
        return typeToString(parsedTypes[0])
      }
      if (parsedTypes.every(t => !t.isArray && !t.isMatrix)) {
        return 'double'
      }
      const vectors = parsedTypes.filter(t => t.isArray || t.isMatrix)
      if (vectors.length === 1) {
        return typeToString(vectors[0])
      }
      return typeToString(parsedTypes[0])
    }

    default:
      return null
  }
}

/**
 * Propagates signal types through the model
 */
export function propagateSignalTypes(
  blocks: BlockData[],
  wires: WireData[]
): TypePropagationResult {
  debugLog('  [propagateSignalTypes] Starting - blocks:', blocks.length, 'wires:', wires.length)

  const signalTypes: SignalTypeMap = new Map()
  const blockOutputTypes: BlockOutputTypes = new Map()
  const errors: TypePropagationError[] = []
  const sheetLabelSinkTypes: SheetLabelSinkTypes = new Map()

  // Create maps for quick lookup
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  const wiresByTarget = new Map<string, WireData[]>() // key: "targetBlockId:targetPortIndex"
  const wiresBySource = new Map<string, WireData[]>() // key: "sourceBlockId:sourcePortIndex"

  for (const wire of wires) {
    const targetKey = `${wire.targetBlockId}:${wire.targetPortIndex}`
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`

    if (!wiresByTarget.has(targetKey)) {
      wiresByTarget.set(targetKey, [])
    }
    wiresByTarget.get(targetKey)!.push(wire)

    if (!wiresBySource.has(sourceKey)) {
      wiresBySource.set(sourceKey, [])
    }
    wiresBySource.get(sourceKey)!.push(wire)
  }

  // Step 1: Initialize types for source blocks (blocks with explicit types)
  debugLog('  Step 1: Initialize types for blocks with explicit types')
  for (const block of blocks) {
    const outputType = getBlockOutputType(block)
    if (outputType) {
      // Validate the type
      try {
        parseType(outputType)
        const portCount = getBlockOutputPortCount(block)
        // Multi-output fixed-type blocks (e.g. atmosphere) need every port keyed
        const n = Math.max(1, portCount)
        for (let p = 0; p < n; p++) {
          const key = `${block.id}:${p}`
          blockOutputTypes.set(key, outputType)
          debugLog(`    "${block.name}" (${block.type}): ${key} = ${outputType}`)
        }
      } catch (error) {
        errors.push({
          blockId: block.id,
          message: `Invalid data type in ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error'
        })
      }
    }
  }

  // Step 2: Propagate types through the network
  // Use a queue-based approach to handle dependencies
  const processingQueue: string[] = [] // Block IDs to process
  const processedBlocks = new Set<string>()

  // Start with blocks that have known output types
  for (const [key, _] of blockOutputTypes) {
    const blockId = key.split(':')[0]
    if (!processedBlocks.has(blockId)) {
      processingQueue.push(blockId)
      processedBlocks.add(blockId)
    }
  }

  // Add subsystems to the initial queue - they can be processed independently
  // because their internal input_port blocks have explicit dataType parameters
  for (const block of blocks) {
    if (block.type === 'subsystem' && !processedBlocks.has(block.id)) {
      processingQueue.push(block.id)
      processedBlocks.add(block.id)
    }
  }

  // Seed state blocks so feedback loops (e.g. ẋ = f(x)) can type-resolve.
  // Output type comes from x(0)/IC when available, else default double.
  for (const block of blocks) {
    if (isTypeLoopBreaker(block.type) && !processedBlocks.has(block.id)) {
      processingQueue.push(block.id)
      processedBlocks.add(block.id)
    }
  }

  debugLog(`  Step 2: Propagate. Initial queue: ${processingQueue.length} blocks`)
  debugLog(`    Queue: ${processingQueue.map(id => blockMap.get(id)?.name || id).join(', ')}`)

  // Process blocks in topological order
  let iterCount = 0
  while (processingQueue.length > 0) {
    iterCount++
    const currentBlockId = processingQueue.shift()!
    const currentBlock = blockMap.get(currentBlockId)
    if (!currentBlock) continue

    debugLog(`    [${iterCount}] Processing "${currentBlock.name}" (${currentBlock.type})`)

    // Special handling for Sheet Label Sink blocks
    if (currentBlock.type === 'sheet_label_sink') {
      const signalName = currentBlock.parameters?.signalName
      if (signalName) {
        // Get the input type from connected wire
        const inputTypes = getBlockInputTypes(currentBlock, wiresByTarget, blockOutputTypes)
        debugLog(`      sheet_label_sink "${signalName}": inputTypes=[${inputTypes.join(', ')}]`)
        if (inputTypes.length > 0) {
          // Store the sink's input type indexed by signal name
          sheetLabelSinkTypes.set(signalName, inputTypes[0])
        }
      }
      continue // Sinks don't have outputs
    }

    // Special handling for Sheet Label Source blocks
    if (currentBlock.type === 'sheet_label_source') {
      const signalName = currentBlock.parameters?.signalName
      debugLog(`      sheet_label_source "${signalName}": looking for sink type...`)
      if (signalName && sheetLabelSinkTypes.has(signalName)) {
        // Get type from associated sink
        const sinkType = sheetLabelSinkTypes.get(signalName)!
        const outputKey = `${currentBlockId}:0`
        blockOutputTypes.set(outputKey, sinkType)
        debugLog(`      Found sink type: ${sinkType}`)

        // Continue processing connected blocks
        const connectedWires = wiresBySource.get(outputKey) || []
        debugLog(`      Connected to ${connectedWires.length} wires`)
        for (const wire of connectedWires) {
          try {
            const parsedType = parseType(sinkType)
            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: sinkType,
              parsedType
            })
            
            // Add target block to processing queue
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              const targetInputs = getBlockInputTypes(targetBlock, wiresByTarget, blockOutputTypes)
              const expectedInputs = getBlockInputPortCount(targetBlock)
              if (
                canEnqueueForTypePropagation(
                  targetBlock,
                  targetInputs.length,
                  expectedInputs
                )
              ) {
                processingQueue.push(wire.targetBlockId)
                processedBlocks.add(wire.targetBlockId)
              }
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type from sheet label: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      } else if (signalName) {
        // Source references non-existent sink
        errors.push({
          blockId: currentBlock.id,
          message: `Sheet Label Source "${currentBlock.name}" references non-existent signal "${signalName}"`,
          severity: 'error'
        })
      }
      continue
    }

    if (currentBlock.type === 'subsystem') {
      const outputPorts = currentBlock.parameters?.outputPorts || []
      
      for (let portIndex = 0; portIndex < outputPorts.length; portIndex++) {
        const outputPortName = outputPorts[portIndex]
        const outputKey = `${currentBlockId}:${portIndex}`
        
        // Find the output type by looking inside the subsystem
        const subsystemOutputType = getSubsystemOutputType(
          currentBlock,
          outputPortName,
          blockOutputTypes
        )
        
        if (subsystemOutputType) {
          blockOutputTypes.set(outputKey, subsystemOutputType)
          
          // Propagate to connected wires
          const connectedWires = wiresBySource.get(outputKey) || []
          for (const wire of connectedWires) {
            try {
              const parsedType = parseType(subsystemOutputType)
              signalTypes.set(wire.id, {
                wireId: wire.id,
                sourceBlockId: wire.sourceBlockId,
                sourcePortIndex: wire.sourcePortIndex,
                targetBlockId: wire.targetBlockId,
                targetPortIndex: wire.targetPortIndex,
                type: subsystemOutputType,
                parsedType
              })
              
              // Wait for all inputs (e.g. mat×vec needs DCM and vector) before enqueue
              const targetBlock = blockMap.get(wire.targetBlockId)
              if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
                const targetInputs = getBlockInputTypes(
                  targetBlock,
                  wiresByTarget,
                  blockOutputTypes
                )
                const expectedInputs = getBlockInputPortCount(targetBlock)
                if (
                  canEnqueueForTypePropagation(
                    targetBlock,
                    targetInputs.length,
                    expectedInputs
                  )
                ) {
                  processingQueue.push(wire.targetBlockId)
                  processedBlocks.add(wire.targetBlockId)
                }
              }
            } catch (error) {
              errors.push({
                wireId: wire.id,
                message: `Invalid signal type from subsystem: ${error instanceof Error ? error.message : 'Unknown error'}`,
                severity: 'error'
              })
            }
          }
        } else {
          errors.push({
            blockId: currentBlock.id,
            message: `Cannot determine output type for ${currentBlock.name} port ${outputPortName}`,
            severity: 'error'
          })
        }
      }
      continue
    }

    // Special handling for orientation_conversion blocks
    if (currentBlock.type === 'orientation_conversion') {
      const conversionType = currentBlock.parameters?.conversionType || 'euler_to_dcm'
      let outputTypes: string[] = []

      switch (conversionType) {
        case 'euler_to_dcm':
        case 'quat_to_dcm':
          outputTypes = ['double[3][3]']  // Single DCM output
          break
        case 'euler_to_quat':
        case 'dcm_to_quat':
          outputTypes = ['double[4][1]']  // Single quaternion output
          break
        case 'dcm_to_euler':
        case 'quat_to_euler':
          outputTypes = ['double[3]']  // Single vector {phi,theta,psi} (Simulink Aerospace)
          break
        default:
          outputTypes = ['double']
      }

      for (let portIndex = 0; portIndex < outputTypes.length; portIndex++) {
        const outputKey = `${currentBlockId}:${portIndex}`
        const outputType = outputTypes[portIndex]

        blockOutputTypes.set(outputKey, outputType)

        // Propagate to connected wires
        const connectedWires = wiresBySource.get(outputKey) || []
        for (const wire of connectedWires) {
          try {
            const parsedType = parseType(outputType)
            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: outputType,
              parsedType
            })

            // Same wait-for-inputs rule as general path (e.g. C_bE · v_b)
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              const targetInputs = getBlockInputTypes(
                targetBlock,
                wiresByTarget,
                blockOutputTypes
              )
              const expectedInputs = getBlockInputPortCount(targetBlock)
              if (
                canEnqueueForTypePropagation(
                  targetBlock,
                  targetInputs.length,
                  expectedInputs
                )
              ) {
                processingQueue.push(wire.targetBlockId)
                processedBlocks.add(wire.targetBlockId)
              }
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type from orientation_conversion: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      }
      continue
    }

    // Process all output ports of the current block
    const outputPortCount = getBlockOutputPortCount(currentBlock)
    debugLog(`      Output ports: ${outputPortCount}`)

    for (let portIndex = 0; portIndex < outputPortCount; portIndex++) {
      const outputKey = `${currentBlockId}:${portIndex}`
      let outputType = blockOutputTypes.get(outputKey)

      if (!outputType) {
        // Try to determine output type based on inputs
        const inputTypes = getBlockInputTypes(currentBlock, wiresByTarget, blockOutputTypes)
        debugLog(`      Port ${portIndex}: No preset type. inputTypes=[${inputTypes.join(', ')}]`)
        let determinedType: string | null = null
        if (isTypeLoopBreaker(currentBlock.type)) {
          determinedType = determineStateBlockOutputType(
            currentBlock,
            wiresByTarget,
            blockOutputTypes
          )
        } else {
          determinedType = determineProcessingBlockOutputType(
            currentBlock.type,
            inputTypes,
            currentBlock
          )
        }

        if (determinedType) {
          blockOutputTypes.set(outputKey, determinedType)
          outputType = determinedType
          debugLog(`      Port ${portIndex}: Determined type = ${determinedType}`)
        } else if (inputTypes.length > 0) {
          // We have inputs but couldn't determine output type
          debugLog(`      Port ${portIndex}: FAILED to determine type with inputs`)
          errors.push({
            blockId: currentBlock.id,
            message: `Cannot determine output type for ${currentBlock.name}. Check input type compatibility.`,
            severity: 'error'
          })
          continue
        } else {
          debugLog(`      Port ${portIndex}: No inputs available yet`)
        }
      } else {
        debugLog(`      Port ${portIndex}: Already has type = ${outputType}`)
      }

      // Propagate type to connected wires
      const connectedWires = wiresBySource.get(outputKey) || []
      const wireType = blockOutputTypes.get(outputKey)
      debugLog(`      Port ${portIndex}: Propagating ${wireType || 'NO TYPE'} to ${connectedWires.length} wires`)

      for (const wire of connectedWires) {
        if (wireType) {
          try {
            const parsedType = parseType(wireType)

            // Special validation for enable port connections
            if (wire.targetPortIndex === -1) {
              // This is an enable port connection
              const targetBlock = blockMap.get(wire.targetBlockId)
              if (targetBlock && targetBlock.type === 'subsystem' && targetBlock.parameters?.showEnableInput) {
                // Validate that the signal is boolean
                if (parsedType.baseType !== 'bool') {
                  errors.push({
                    wireId: wire.id,
                    message: `Enable port on ${targetBlock.name} requires boolean signal but received ${wireType}`,
                    severity: 'error'
                  })
                  continue
                }
              } else {
                errors.push({
                  wireId: wire.id,
                  message: `Invalid enable port connection`,
                  severity: 'error'
                })
                continue
              }
            }

            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: wireType,
              parsedType
            })

            // Add target block to processing queue if not already processed
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              // Check if all inputs are available before processing
              const targetInputs = getBlockInputTypes(targetBlock, wiresByTarget, blockOutputTypes)
              const expectedInputs = getBlockInputPortCount(targetBlock)

              debugLog(`        -> Target "${targetBlock.name}" (${targetBlock.type}): ${targetInputs.length}/${expectedInputs} inputs`)
              if (
                canEnqueueForTypePropagation(
                  targetBlock,
                  targetInputs.length,
                  expectedInputs
                )
              ) {
                processingQueue.push(wire.targetBlockId)
                processedBlocks.add(wire.targetBlockId)
                debugLog(`           Added to queue`)
              } else {
                debugLog(`           NOT added (waiting for ${expectedInputs - targetInputs.length} more inputs)`)
              }
            } else if (targetBlock) {
              debugLog(`        -> Target "${targetBlock.name}" already processed`)
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      }
    }
  }

  // Resolve arithmetic / etc. that had all inputs typed but missed the queue
  // (e.g. Sum after late same-sheet Goto/From, Sum-of-Elements with numInputs=1).
  resolvePendingBlocksWithKnownInputs(blocks, wires, blockOutputTypes, signalTypes)

  // Final pass: deferred state blocks (TF / discrete) still missing a type → double
  for (const block of blocks) {
    if (!isDeferredStateBlock(block.type)) continue
    const outputKey = `${block.id}:0`
    if (blockOutputTypes.has(outputKey)) continue
    const fallback =
      getPortInputType(block, 0, wiresByTarget, blockOutputTypes) ||
      block.parameters?.dataType ||
      'double'
    blockOutputTypes.set(outputKey, fallback)
    const connectedWires = wiresBySource.get(outputKey) || []
    for (const wire of connectedWires) {
      try {
        const parsedType = parseType(fallback)
        signalTypes.set(wire.id, {
          wireId: wire.id,
          sourceBlockId: wire.sourceBlockId,
          sourcePortIndex: wire.sourcePortIndex,
          targetBlockId: wire.targetBlockId,
          targetPortIndex: wire.targetPortIndex,
          type: fallback,
          parsedType
        })
      } catch {
        /* ignore */
      }
    }
  }

  debugLog(`  [propagateSignalTypes] Complete: ${blockOutputTypes.size} output types, ${signalTypes.size} signal types`)
  
  // Step 3: Check for type mismatches on multi-input blocks
  for (const block of blocks) {
    if (['sum', 'multiply'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 1 && !elementWiseInputsCompatible(inputTypes, block.type)) {
        errors.push({
          blockId: block.id,
          message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${inputTypes.join(', ')}`,
          severity: 'error'
        })
      }
    }
  }

  // Step 3.5: Check for matrix-specific constraints
  for (const block of blocks) {
    // Check matrix multiply dimension compatibility
    if (block.type === 'matrix_multiply') {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length === 2) {
        try {
          const type1 = parseType(inputTypes[0])
          const type2 = parseType(inputTypes[1])
          
          // Check if dimensions are compatible for multiplication
          if (type1.isMatrix && type2.isMatrix) {
            if (type1.cols !== type2.rows) {
              errors.push({
                blockId: block.id,
                message: `Matrix dimension mismatch at ${block.name}: Cannot multiply ${type1.rows}×${type1.cols} matrix by ${type2.rows}×${type2.cols} matrix. Inner dimensions must match.`,
                severity: 'error'
              })
            }
          } else if (type1.isArray && type2.isMatrix) {
            if (type1.arraySize !== type2.rows) {
              errors.push({
                blockId: block.id,
                message: `Vector-matrix dimension mismatch at ${block.name}: Cannot multiply vector[${type1.arraySize}] by ${type2.rows}×${type2.cols} matrix.`,
                severity: 'error'
              })
            }
          } else if (type1.isMatrix && type2.isArray) {
            if (type1.cols !== type2.arraySize) {
              errors.push({
                blockId: block.id,
                message: `Matrix-vector dimension mismatch at ${block.name}: Cannot multiply ${type1.rows}×${type1.cols} matrix by vector[${type2.arraySize}].`,
                severity: 'error'
              })
            }
          }
        } catch {
          // Type parsing errors already reported
        }
      }
    }
    
    // Check mux inputs are all scalars
    if (block.type === 'mux') {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      for (let i = 0; i < inputTypes.length; i++) {
        try {
          const parsed = parseType(inputTypes[i])
          if (parsed.isArray || parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} input ${i + 1} must be scalar but received ${inputTypes[i]}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
    
    // Validate demux input is vector or matrix
    if (block.type === 'demux') {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 0) {
        try {
          const parsed = parseType(inputTypes[0])
          if (!parsed.isArray && !parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires vector or matrix input but received scalar ${inputTypes[0]}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
    
    // Update validation for sum and multiply blocks to include matrices
    if (['sum', 'multiply'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 1 && !elementWiseInputsCompatible(inputTypes, block.type)) {
        try {
          const parsed = inputTypes.map(t => parseType(t))
          const hasMatrix = parsed.some(p => p.isMatrix)
          if (hasMatrix) {
            const descriptions = inputTypes.map((t, i) => {
              const p = parsed[i]
              if (p.isMatrix) return `${p.rows}×${p.cols} matrix`
              if (p.isArray) return `vector[${p.arraySize}]`
              return `scalar`
            })
            errors.push({
              blockId: block.id,
              message: `Type mismatch at ${block.name}: All inputs must have the same dimensions. Found: ${descriptions.join(', ')}`,
              severity: 'error'
            })
          } else {
            errors.push({
              blockId: block.id,
              message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${inputTypes.join(', ')}`,
              severity: 'error'
            })
          }
        } catch {
          errors.push({
            blockId: block.id,
            message: `Type mismatch at ${block.name}: All inputs must have the same type. Found: ${inputTypes.join(', ')}`,
            severity: 'error'
          })
        }
      }
    }
    
    // Check that lookup blocks don't receive matrices
    if (['lookup_1d', 'lookup_2d'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      for (const inputType of inputTypes) {
        try {
          const parsed = parseType(inputType)
          if (parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires scalar inputs but received matrix type: ${inputType}`,
              severity: 'error'
            })
          } else if (parsed.isArray) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires scalar inputs but received array type: ${inputType}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
    
    // Validate that signal display and logger blocks don't receive matrices
    if (['signal_display', 'signal_logger'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length > 0) {
        try {
          const parsed = parseType(inputTypes[0])
          if (parsed.isMatrix) {
            errors.push({
              blockId: block.id,
              message: `${block.name} cannot display matrix signals. Use a demux block to extract individual elements.`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
  }
  
  // Step 4: Check lookup blocks for scalar inputs
  for (const block of blocks) {
    if (['lookup_1d', 'lookup_2d'].includes(block.type)) {
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      for (const inputType of inputTypes) {
        try {
          const parsed = parseType(inputType)
          if (parsed.isArray) {
            errors.push({
              blockId: block.id,
              message: `${block.name} requires scalar inputs but received array type: ${inputType}`,
              severity: 'error'
            })
          }
        } catch {
          // Type parsing error already reported
        }
      }
    }
  }
  
  return {
    signalTypes,
    blockOutputTypes,
    errors
  }
}

function getSubsystemOutputType(
  subsystemBlock: BlockData,
  outputPortName: string,
  blockOutputTypes: BlockOutputTypes
): string | null {
  debugLog(`  getSubsystemOutputType: subsystem="${subsystemBlock.name}", port="${outputPortName}"`)

  if (!subsystemBlock.parameters?.sheets) {
    debugLog(`    FAIL: No sheets in subsystem parameters`)
    return null
  }

  debugLog(`    Searching ${subsystemBlock.parameters.sheets.length} sheets`)

  // Search through subsystem sheets for the output port block
  for (const sheet of subsystemBlock.parameters.sheets) {
    debugLog(`    Sheet "${sheet.name || sheet.id}": ${sheet.blocks?.length || 0} blocks, ${sheet.connections?.length || 0} connections`)

    // Log all blocks in this sheet for debugging
    for (const block of sheet.blocks || []) {
      if (block.type === 'input_port') {
        debugLog(`      input_port: "${block.name}", portName="${block.parameters?.portName}", dataType="${block.parameters?.dataType}"`)
      } else if (block.type === 'output_port') {
        debugLog(`      output_port: "${block.name}", portName="${block.parameters?.portName}"`)
      }
    }

    for (const block of sheet.blocks || []) {
      // Match portName from parameters, falling back to block name (same logic as syncSubsystemPortsFromSheets)
      const blockPortName = block.parameters?.portName || block.name
      if (block.type === 'output_port' && blockPortName === outputPortName) {
        debugLog(`    Found output_port block: id="${block.id}", name="${block.name}", dataType="${block.parameters?.dataType}"`)

        // Prefer type inferred from the internal driver (e.g. Mux → double[3]).
        // mdl2obliq often declares Outport dataType as plain "double" when
        // PortDimensions are absent — that must not shadow a vector/matrix source.
        const inputWire = sheet.connections?.find((w : any) =>
          w.targetBlockId === block.id && w.targetPortIndex === 0
        )

        if (inputWire) {
          const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
          debugLog(`    Wire found: sourceKey="${sourceKey}"`)

          let sourceType = blockOutputTypes.get(sourceKey)
          debugLog(`    External blockOutputTypes lookup: ${sourceType || 'NOT FOUND'}`)

          if (!sourceType) {
            debugLog(`    Running recursive propagation on subsystem sheet...`)
            const subsystemResult = propagateSignalTypes(
              sheet.blocks,
              sheet.connections
            )
            for (const [key, type] of subsystemResult.blockOutputTypes) {
              blockOutputTypes.set(`${subsystemBlock.id}:${key}`, type)
            }
            sourceType = subsystemResult.blockOutputTypes.get(sourceKey)
            debugLog(`    Internal lookup for "${sourceKey}": ${sourceType || 'NOT FOUND'}`)
          }

          if (sourceType) {
            const declared = block.parameters?.dataType as string | undefined
            // Unresolved From/Goto often types as scalar double while the Outport
            // correctly declares double[3]/[4][1]. Prefer the richer declared type.
            if (
              declared &&
              declared.includes('[') &&
              !sourceType.includes('[')
            ) {
              debugLog(
                `    Preferring declared ${declared} over inferred scalar ${sourceType}`
              )
              return declared
            }
            return sourceType
          }
        } else {
          debugLog(`    FAIL: No wire connecting to output_port input`)
        }

        // Fallback: declared dataType (segregated / explicit ports)
        if (block.parameters?.dataType) {
          debugLog(`    Using explicit dataType fallback: ${block.parameters.dataType}`)
          return block.parameters.dataType
        }
      }
    }
  }

  debugLog(`    FAIL: No matching output_port found for "${outputPortName}"`)
  return null
}

export function propagateSignalTypesMultiSheet(
  sheets: Array<{ blocks: BlockData[], connections: WireData[] }>
): TypePropagationResult {
  debugLog('=== propagateSignalTypesMultiSheet START ===')
  debugLog(`Processing ${sheets.length} sheets`)

  const allErrors: TypePropagationError[] = []
  const signalTypes: SignalTypeMap = new Map()
  const blockOutputTypes: BlockOutputTypes = new Map()

  // Include nested subsystem sheets so global Goto sinks under IU are typed
  // before root From* sources are resolved (matches ModelFlattener).
  const expandedSheets = collectSheetsRecursive(sheets)
  debugLog(`Expanded to ${expandedSheets.length} sheets (incl. nested)`)

  // First pass: propagate types within each sheet and collect sheet label sink types
  debugLog('--- PASS 1: Initial propagation within each sheet ---')
  const sheetLabelSinkTypes: Map<string, string> = new Map()

  for (let sheetIdx = 0; sheetIdx < expandedSheets.length; sheetIdx++) {
    const sheet = expandedSheets[sheetIdx]
    debugLog(`\nSheet ${sheetIdx}: ${sheet.blocks.length} blocks, ${sheet.connections.length} connections`)

    // Log block summary
    const blockSummary = sheet.blocks.map(b => `${b.name}(${b.type})`).join(', ')
    debugLog(`  Blocks: ${blockSummary}`)

    // Run type propagation on each sheet
    const sheetResult = propagateSignalTypes(sheet.blocks, sheet.connections)

    debugLog(`  Pass 1 result: ${sheetResult.blockOutputTypes.size} output types, ${sheetResult.signalTypes.size} signal types, ${sheetResult.errors.length} errors`)

    // Merge results
    for (const [key, value] of sheetResult.blockOutputTypes) {
      blockOutputTypes.set(key, value)
      debugLog(`    BlockOutputType: ${key} = ${value}`)
    }
    for (const [key, value] of sheetResult.signalTypes) {
      signalTypes.set(key, value)
    }
    allErrors.push(...sheetResult.errors)

    // Collect sheet label sink types
    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
        // Find the input wire to this sink
        const inputWire = sheet.connections.find(w => w.targetBlockId === block.id)
        if (inputWire) {
          const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
          const sourceType = blockOutputTypes.get(sourceKey)
          debugLog(`  SheetLabelSink "${block.parameters.signalName}": sourceKey=${sourceKey}, sourceType=${sourceType || 'NOT FOUND'}`)
          if (sourceType) {
            sheetLabelSinkTypes.set(block.parameters.signalName, sourceType)
          }
        } else {
          debugLog(`  SheetLabelSink "${block.parameters.signalName}": NO INPUT WIRE FOUND`)
        }
      }
    }
  }

  // Drop Pass-1 "missing sink" errors that nested sheets later resolved (global Goto).
  for (let i = allErrors.length - 1; i >= 0; i--) {
    const msg = allErrors[i]?.message || ''
    const m = msg.match(/references non-existent signal "([^"]+)"/)
    if (m && sheetLabelSinkTypes.has(m[1])) {
      allErrors.splice(i, 1)
    }
  }

  debugLog('\n--- PASS 2: Set sheet label source types from sink types ---')
  debugLog(`SheetLabelSinkTypes collected: ${Array.from(sheetLabelSinkTypes.entries()).map(([k,v]) => `${k}=${v}`).join(', ')}`)

  // Second pass: Set sheet label source types from sink types
  // This pre-populates the source types before re-running propagation
  for (const sheet of expandedSheets) {
    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_source' && block.parameters?.signalName) {
        const sinkType = sheetLabelSinkTypes.get(block.parameters.signalName)
        debugLog(`  SheetLabelSource "${block.name}" (signal="${block.parameters.signalName}"): sinkType=${sinkType || 'NOT FOUND'}`)
        if (sinkType) {
          const outputKey = `${block.id}:0`
          blockOutputTypes.set(outputKey, sinkType)
          debugLog(`    Set blockOutputType: ${outputKey} = ${sinkType}`)
        }
      }
    }
  }

  // Pass 2b: seed nested input_port types from external wires into subsystems.
  // Simulink inherits vector size on Inports; mdl2obliq often declares plain double.
  debugLog('\n--- PASS 2b: Seed subsystem input_port types from parent wires ---')
  for (const sheet of expandedSheets) {
    for (const wire of sheet.connections) {
      if ((wire.targetPortIndex ?? 0) < 0) continue
      const sub = sheet.blocks.find(b => b.id === wire.targetBlockId)
      if (!sub || sub.type !== 'subsystem') continue
      const srcType = blockOutputTypes.get(
        `${wire.sourceBlockId}:${wire.sourcePortIndex ?? 0}`
      )
      if (!srcType) continue
      const portNames: string[] = sub.parameters?.inputPorts || []
      const portName = portNames[wire.targetPortIndex ?? 0]
      if (!portName) continue
      for (const nested of sub.parameters?.sheets || []) {
        for (const ip of nested.blocks || []) {
          if (ip.type !== 'input_port') continue
          const ipName = ip.parameters?.portName || ip.name
          if (ipName !== portName) continue
          const key = `${ip.id}:0`
          const declared = String(ip.parameters?.dataType || 'double')
          // Prefer richer external type over scalar default declaration
          if (
            !blockOutputTypes.has(key) ||
            (srcType.includes('[') && !declared.includes('['))
          ) {
            blockOutputTypes.set(key, srcType)
            if (srcType.includes('[') && !declared.includes('[')) {
              ip.parameters = { ...(ip.parameters || {}), dataType: srcType }
            }
            debugLog(
              `  Seeded ${sub.name}.${portName} (${ip.id}) = ${srcType}`
            )
          }
        }
      }
    }
  }

  debugLog('\n--- PASS 3: Re-run propagation with preset types ---')
  debugLog(`BlockOutputTypes before pass 3: ${blockOutputTypes.size} entries`)

  // Third pass: Re-run propagation with sheet label source types now set
  // This allows downstream blocks to get their types resolved
  for (let sheetIdx = 0; sheetIdx < expandedSheets.length; sheetIdx++) {
    const sheet = expandedSheets[sheetIdx]
    debugLog(`\nSheet ${sheetIdx} pass 3:`)

    const sheetResult = propagateSignalTypesWithPreset(
      sheet.blocks,
      sheet.connections,
      blockOutputTypes,
      sheetLabelSinkTypes
    )

    debugLog(`  Pass 3 result: ${sheetResult.blockOutputTypes.size} output types, ${sheetResult.signalTypes.size} signal types`)

    // Merge results (overwriting previous incomplete results)
    for (const [key, value] of sheetResult.blockOutputTypes) {
      const oldValue = blockOutputTypes.get(key)
      if (oldValue !== value) {
        debugLog(`    BlockOutputType UPDATED: ${key} = ${oldValue} -> ${value}`)
      }
      blockOutputTypes.set(key, value)
    }
    for (const [key, value] of sheetResult.signalTypes) {
      signalTypes.set(key, value)
    }
    // Don't add duplicate errors
  }

  // Pass 4: Handle sheet_label_source blocks whose sink types were discovered during Pass 3
  // This handles cases where an integrator's input comes from a sheet_label_source,
  // creating a deeper dependency chain that isn't resolved until Pass 3
  debugLog('\n--- PASS 4: Update late-discovered sink types and re-propagate ---')

  // First, update sheetLabelSinkTypes with any newly discovered sink types from Pass 3
  for (const sheet of expandedSheets) {
    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
        const signalName = block.parameters.signalName
        // Check if we already have this sink type
        if (!sheetLabelSinkTypes.has(signalName)) {
          // Find the input wire to this sink
          const inputWire = sheet.connections.find(w => w.targetBlockId === block.id)
          if (inputWire) {
            const sourceKey = `${inputWire.sourceBlockId}:${inputWire.sourcePortIndex}`
            const sourceType = blockOutputTypes.get(sourceKey)
            if (sourceType) {
              sheetLabelSinkTypes.set(signalName, sourceType)
              debugLog(`  Late sink type discovered: "${signalName}" = ${sourceType}`)
            }
          }
        }
      }
    }
  }

  // Now re-process sheet_label_source blocks that still don't have types
  let pass4Updates = 0
  for (const sheet of expandedSheets) {
    // Create wire lookup maps for this sheet
    const wiresBySource = new Map<string, WireData[]>()
    for (const wire of sheet.connections) {
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      if (!wiresBySource.has(sourceKey)) {
        wiresBySource.set(sourceKey, [])
      }
      wiresBySource.get(sourceKey)!.push(wire)
    }

    for (const block of sheet.blocks) {
      if (block.type === 'sheet_label_source' && block.parameters?.signalName) {
        const outputKey = `${block.id}:0`
        // Check if this source still doesn't have a type
        if (!blockOutputTypes.has(outputKey)) {
          const sinkType = sheetLabelSinkTypes.get(block.parameters.signalName)
          if (sinkType) {
            blockOutputTypes.set(outputKey, sinkType)
            debugLog(`  Late source type set: "${block.name}" (${block.parameters.signalName}) = ${sinkType}`)
            pass4Updates++

            // Propagate to connected wires
            const connectedWires = wiresBySource.get(outputKey) || []
            for (const wire of connectedWires) {
              try {
                const parsedType = parseType(sinkType)
                signalTypes.set(wire.id, {
                  wireId: wire.id,
                  sourceBlockId: wire.sourceBlockId,
                  sourcePortIndex: wire.sourcePortIndex,
                  targetBlockId: wire.targetBlockId,
                  targetPortIndex: wire.targetPortIndex,
                  type: sinkType,
                  parsedType
                })
                debugLog(`    Wire ${wire.id} updated with type ${sinkType}`)
              } catch (error) {
                debugLog(`    Wire ${wire.id} parse error: ${error}`)
              }
            }
          }
        }
      }
    }
  }
  debugLog(`  Pass 4 updated ${pass4Updates} sheet_label_source blocks`)

  // Pass 5: resolve blocks that now have all inputs typed but never ran
  // (e.g. Sum waiting on a late From/Goto, or Sum-of-Elements with numInputs=1).
  debugLog('\n--- PASS 5: Resolve pending blocks with known inputs ---')
  for (const sheet of expandedSheets) {
    resolvePendingBlocksWithKnownInputs(
      sheet.blocks,
      sheet.connections,
      blockOutputTypes,
      signalTypes
    )
  }

  debugLog('\n=== propagateSignalTypesMultiSheet END ===')
  debugLog(`Final: ${blockOutputTypes.size} block output types, ${signalTypes.size} signal types, ${allErrors.length} errors`)

  return {
    signalTypes,
    blockOutputTypes,
    errors: allErrors
  }
}

/**
 * Fixpoint: for any block still missing an output type whose inputs are all
 * typed, determine the output and stamp connected wires. Repeats until stable
 * so chains (Sum → Evaluate → …) catch up after late sheet-label typing.
 */
function resolvePendingBlocksWithKnownInputs(
  blocks: BlockData[],
  wires: WireData[],
  blockOutputTypes: BlockOutputTypes,
  signalTypes: SignalTypeMap
): void {
  const wiresByTarget = new Map<string, WireData[]>()
  const wiresBySource = new Map<string, WireData[]>()
  for (const wire of wires) {
    const tk = `${wire.targetBlockId}:${wire.targetPortIndex}`
    const sk = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    if (!wiresByTarget.has(tk)) wiresByTarget.set(tk, [])
    wiresByTarget.get(tk)!.push(wire)
    if (!wiresBySource.has(sk)) wiresBySource.set(sk, [])
    wiresBySource.get(sk)!.push(wire)
  }

  let changed = true
  let guard = 0
  while (changed && guard++ < blocks.length + 8) {
    changed = false
    for (const block of blocks) {
      const outPorts = getBlockOutputPortCount(block)
      if (outPorts <= 0) continue
      const outKey = `${block.id}:0`
      if (blockOutputTypes.has(outKey)) continue

      const expected = getBlockInputPortCount(block)
      if (expected <= 0) continue
      const inputTypes = getBlockInputTypes(block, wiresByTarget, blockOutputTypes)
      if (inputTypes.length < expected) continue

      let determined: string | null = null
      if (isTypeLoopBreaker(block.type)) {
        determined = determineStateBlockOutputType(block, wiresByTarget, blockOutputTypes)
      } else {
        determined = determineProcessingBlockOutputType(block.type, inputTypes, block)
      }
      if (!determined) continue

      for (let p = 0; p < outPorts; p++) {
        blockOutputTypes.set(`${block.id}:${p}`, determined)
      }
      const connected = wiresBySource.get(outKey) || []
      for (const wire of connected) {
        try {
          const parsedType = parseType(determined)
          signalTypes.set(wire.id, {
            wireId: wire.id,
            sourceBlockId: wire.sourceBlockId,
            sourcePortIndex: wire.sourcePortIndex,
            targetBlockId: wire.targetBlockId,
            targetPortIndex: wire.targetPortIndex,
            type: determined,
            parsedType
          })
        } catch {
          /* ignore */
        }
      }
      changed = true
      debugLog(`  Pass5 resolved "${block.name}" (${block.type}) → ${determined}`)
    }
  }
}

/**
 * Propagates signal types with pre-populated block output types and sheet label sink types.
 * This allows sheet label sources to have their types already set before propagation.
 */
function propagateSignalTypesWithPreset(
  blocks: BlockData[],
  wires: WireData[],
  presetBlockOutputTypes: BlockOutputTypes,
  presetSheetLabelSinkTypes: SheetLabelSinkTypes
): TypePropagationResult {
  debugLog('  [propagateSignalTypesWithPreset] Starting with', presetBlockOutputTypes.size, 'preset types')

  const signalTypes: SignalTypeMap = new Map()
  const blockOutputTypes: BlockOutputTypes = new Map(presetBlockOutputTypes)
  const errors: TypePropagationError[] = []
  const sheetLabelSinkTypes: SheetLabelSinkTypes = new Map(presetSheetLabelSinkTypes)

  // Create maps for quick lookup
  const blockMap = new Map(blocks.map(b => [b.id, b]))
  const wiresByTarget = new Map<string, WireData[]>()
  const wiresBySource = new Map<string, WireData[]>()

  for (const wire of wires) {
    const targetKey = `${wire.targetBlockId}:${wire.targetPortIndex}`
    const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`

    if (!wiresByTarget.has(targetKey)) {
      wiresByTarget.set(targetKey, [])
    }
    wiresByTarget.get(targetKey)!.push(wire)

    if (!wiresBySource.has(sourceKey)) {
      wiresBySource.set(sourceKey, [])
    }
    wiresBySource.get(sourceKey)!.push(wire)
  }

  // Initialize types for source blocks (blocks with explicit types)
  for (const block of blocks) {
    const outputType = getBlockOutputType(block)
    if (outputType) {
      try {
        parseType(outputType)
        const portCount = Math.max(1, getBlockOutputPortCount(block))
        for (let p = 0; p < portCount; p++) {
          const key = `${block.id}:${p}`
          if (!blockOutputTypes.has(key)) {
            blockOutputTypes.set(key, outputType)
            debugLog(`    Init block "${block.name}" (${block.type}): ${key} = ${outputType}`)
          }
        }
      } catch (error) {
        errors.push({
          blockId: block.id,
          message: `Invalid data type in ${block.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'error'
        })
      }
    }
  }

  // Process sheet_label_source blocks with preset sink types
  for (const block of blocks) {
    if (block.type === 'sheet_label_source' && block.parameters?.signalName) {
      const sinkType = sheetLabelSinkTypes.get(block.parameters.signalName)
      if (sinkType) {
        const outputKey = `${block.id}:0`
        blockOutputTypes.set(outputKey, sinkType)
        debugLog(`    SheetLabelSource "${block.name}": ${outputKey} = ${sinkType}`)
      }
    }
  }

  // Build processing queue starting with blocks that have known output types
  const processingQueue: string[] = []
  const processedBlocks = new Set<string>()

  // Only add blocks from THIS sheet to the queue
  const blockIdsInSheet = new Set(blocks.map(b => b.id))

  for (const [key, _] of blockOutputTypes) {
    const blockId = key.split(':')[0]
    // Only process blocks that are in this sheet
    if (blockIdsInSheet.has(blockId) && !processedBlocks.has(blockId)) {
      processingQueue.push(blockId)
      processedBlocks.add(blockId)
    }
  }

  // Add subsystems to the initial queue - they can be processed independently
  // because their internal input_port blocks have explicit dataType parameters
  for (const block of blocks) {
    if (block.type === 'subsystem' && !processedBlocks.has(block.id)) {
      processingQueue.push(block.id)
      processedBlocks.add(block.id)
    }
  }

  // Seed state blocks so feedback loops can type-resolve
  for (const block of blocks) {
    if (isTypeLoopBreaker(block.type) && !processedBlocks.has(block.id)) {
      processingQueue.push(block.id)
      processedBlocks.add(block.id)
    }
  }

  debugLog(`    Initial queue: ${processingQueue.length} blocks`)
  debugLog(`    Queue contents: ${processingQueue.map(id => blockMap.get(id)?.name || id).join(', ')}`)

  // Process blocks in topological order
  let iterationCount = 0
  while (processingQueue.length > 0) {
    iterationCount++
    const currentBlockId = processingQueue.shift()!
    const currentBlock = blockMap.get(currentBlockId)
    if (!currentBlock) {
      debugLog(`    [Iter ${iterationCount}] Block ${currentBlockId} not found in blockMap, skipping`)
      continue
    }

    debugLog(`    [Iter ${iterationCount}] Processing "${currentBlock.name}" (${currentBlock.type})`)

    // Skip sink blocks and sources (they don't produce outputs or already have types)
    if (currentBlock.type === 'sheet_label_sink') {
      const signalName = currentBlock.parameters?.signalName
      if (signalName) {
        const inputTypes = getBlockInputTypes(currentBlock, wiresByTarget, blockOutputTypes)
        debugLog(`      sheet_label_sink "${signalName}": inputTypes=[${inputTypes.join(', ')}]`)
        if (inputTypes.length > 0 && !sheetLabelSinkTypes.has(signalName)) {
          sheetLabelSinkTypes.set(signalName, inputTypes[0])
        }
      }
      continue
    }

    if (currentBlock.type === 'sheet_label_source') {
      const signalName = currentBlock.parameters?.signalName
      if (signalName && sheetLabelSinkTypes.has(signalName)) {
        const sinkType = sheetLabelSinkTypes.get(signalName)!
        const outputKey = `${currentBlockId}:0`
        blockOutputTypes.set(outputKey, sinkType)
        debugLog(`      sheet_label_source "${signalName}": output=${sinkType}`)

        // Propagate to connected wires
        const connectedWires = wiresBySource.get(outputKey) || []
        debugLog(`      Connected to ${connectedWires.length} wires`)
        for (const wire of connectedWires) {
          try {
            const parsedType = parseType(sinkType)
            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: sinkType,
              parsedType
            })

            // Add target block to processing queue
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              const targetInputs = getBlockInputTypes(targetBlock, wiresByTarget, blockOutputTypes)
              const expectedInputs = getBlockInputPortCount(targetBlock)

              debugLog(`        Target "${targetBlock.name}": has ${targetInputs.length}/${expectedInputs} inputs`)
              if (
                canEnqueueForTypePropagation(
                  targetBlock,
                  targetInputs.length,
                  expectedInputs
                )
              ) {
                processingQueue.push(wire.targetBlockId)
                processedBlocks.add(wire.targetBlockId)
                debugLog(`        -> Added to queue`)
              } else {
                debugLog(`        -> NOT added (waiting for more inputs)`)
              }
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type from sheet label: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      } else {
        debugLog(`      sheet_label_source "${signalName}": NO SINK TYPE AVAILABLE`)
      }
      continue
    }

    // Special handling for segregated subsystems - use declared output port types
    if (currentBlock.type === 'subsystem') {
      const outputPorts = currentBlock.parameters?.outputPorts || []
      debugLog(`      Subsystem with ${outputPorts.length} output ports`)

      for (let portIndex = 0; portIndex < outputPorts.length; portIndex++) {
        const outputPortName = outputPorts[portIndex]
        const outputKey = `${currentBlockId}:${portIndex}`

        // Get output type from the subsystem's internal output port declaration
        const subsystemOutputType = getSubsystemOutputType(
          currentBlock,
          outputPortName,
          blockOutputTypes
        )

        if (subsystemOutputType) {
          blockOutputTypes.set(outputKey, subsystemOutputType)
          debugLog(`      Port ${portIndex} ("${outputPortName}"): ${subsystemOutputType}`)

          // Propagate to connected wires
          const connectedWires = wiresBySource.get(outputKey) || []
          for (const wire of connectedWires) {
            try {
              const parsedType = parseType(subsystemOutputType)
              signalTypes.set(wire.id, {
                wireId: wire.id,
                sourceBlockId: wire.sourceBlockId,
                sourcePortIndex: wire.sourcePortIndex,
                targetBlockId: wire.targetBlockId,
                targetPortIndex: wire.targetPortIndex,
                type: subsystemOutputType,
                parsedType
              })

              // Wait for all inputs before enqueue (same rule as single-sheet path)
              const targetBlock = blockMap.get(wire.targetBlockId)
              if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
                const targetInputs = getBlockInputTypes(
                  targetBlock,
                  wiresByTarget,
                  blockOutputTypes
                )
                const expectedInputs = getBlockInputPortCount(targetBlock)
                if (
                  canEnqueueForTypePropagation(
                    targetBlock,
                    targetInputs.length,
                    expectedInputs
                  )
                ) {
                  processingQueue.push(wire.targetBlockId)
                  processedBlocks.add(wire.targetBlockId)
                }
              }
            } catch (error) {
              errors.push({
                wireId: wire.id,
                message: `Invalid signal type from subsystem: ${error instanceof Error ? error.message : 'Unknown error'}`,
                severity: 'error'
              })
            }
          }
        } else {
          errors.push({
            blockId: currentBlock.id,
            message: `Cannot determine output type for ${currentBlock.name} port ${outputPortName}`,
            severity: 'error'
          })
        }
      }
      continue
    }

    // Process all output ports of the current block
    const outputPortCount = getBlockOutputPortCount(currentBlock)
    debugLog(`      Output ports: ${outputPortCount}`)

    for (let portIndex = 0; portIndex < outputPortCount; portIndex++) {
      const outputKey = `${currentBlockId}:${portIndex}`
      let outputType = blockOutputTypes.get(outputKey)

      if (!outputType) {
        // Try to determine output type based on inputs
        const inputTypes = getBlockInputTypes(currentBlock, wiresByTarget, blockOutputTypes)
        debugLog(`      Port ${portIndex}: No preset type. inputTypes=[${inputTypes.join(', ')}]`)
        let determinedType: string | null = null
        if (isTypeLoopBreaker(currentBlock.type)) {
          determinedType = determineStateBlockOutputType(
            currentBlock,
            wiresByTarget,
            blockOutputTypes
          )
        } else {
          determinedType = determineProcessingBlockOutputType(
            currentBlock.type,
            inputTypes,
            currentBlock
          )
        }

        if (determinedType) {
          blockOutputTypes.set(outputKey, determinedType)
          outputType = determinedType
          debugLog(`      Port ${portIndex}: Determined type = ${determinedType}`)
        } else {
          debugLog(`      Port ${portIndex}: Could NOT determine type`)
        }
      } else {
        debugLog(`      Port ${portIndex}: Already has type = ${outputType}`)
      }

      // Propagate type to connected wires
      if (outputType) {
        const connectedWires = wiresBySource.get(outputKey) || []
        debugLog(`      Port ${portIndex}: Propagating to ${connectedWires.length} connected wires`)
        for (const wire of connectedWires) {
          try {
            const parsedType = parseType(outputType)

            signalTypes.set(wire.id, {
              wireId: wire.id,
              sourceBlockId: wire.sourceBlockId,
              sourcePortIndex: wire.sourcePortIndex,
              targetBlockId: wire.targetBlockId,
              targetPortIndex: wire.targetPortIndex,
              type: outputType,
              parsedType
            })

            // Add target block to processing queue if not already processed
            const targetBlock = blockMap.get(wire.targetBlockId)
            if (targetBlock && !processedBlocks.has(wire.targetBlockId)) {
              const targetInputs = getBlockInputTypes(targetBlock, wiresByTarget, blockOutputTypes)
              const expectedInputs = getBlockInputPortCount(targetBlock)

              debugLog(`        -> Target "${targetBlock.name}" (${targetBlock.type}): ${targetInputs.length}/${expectedInputs} inputs`)
              if (
                canEnqueueForTypePropagation(
                  targetBlock,
                  targetInputs.length,
                  expectedInputs
                )
              ) {
                processingQueue.push(wire.targetBlockId)
                processedBlocks.add(wire.targetBlockId)
                debugLog(`           Added to queue`)
              } else {
                debugLog(`           NOT added (waiting for ${expectedInputs - targetInputs.length} more inputs)`)
              }
            } else if (targetBlock) {
              debugLog(`        -> Target "${targetBlock.name}" already processed`)
            }
          } catch (error) {
            errors.push({
              wireId: wire.id,
              message: `Invalid signal type: ${error instanceof Error ? error.message : 'Unknown error'}`,
              severity: 'error'
            })
          }
        }
      }
    }
  }

  return {
    signalTypes,
    blockOutputTypes,
    errors
  }
}
/**
 * Gets the number of output ports for a block
 */
function getBlockOutputPortCount(block: BlockData): number {
  switch (block.type) {
    case 'sum':
    case 'multiply':
    case 'divide':
    case 'scale':
    case 'limit':
    case 'saturation_dynamic':
    case 'integrator':
    case 'unit_delay':
    case 'units_conversion':
    case 'transfer_function':
    case 'discrete_transform':
    case 'lookup_1d':
    case 'lookup_2d':
    case 'input_port':
    case 'source':
    case 'clock':
    case 'matrix_multiply':
    case 'evaluate':
    case 'if':
    case 'condition':
    case 'sign':
    case 'abs':
    case 'square':
    case 'uminus':
    case 'mag':
    case 'cross':
    case 'dot':
    case 'transpose':
    case 'mux':  // Mux always has single output (vector/matrix)
    case 'body2quaternion_rates':  // Always outputs 4x1 quaternion rate vector
    case 'relay':
    case 'rate_limiter':
    case 'quantizer':
    case 'selector':
    case 'data_store_read':
    case 'edge_detect':
      return 1
    case 'atmosphere':
      return 4
    case 'trig': {
      // sincos has 2 outputs, all others have 1
      const func = block.parameters?.function || 'sin'
      return func === 'sincos' ? 2 : 1
    }
    case 'output_port':
    case 'signal_display':
    case 'signal_logger':
    case 'no_connection':
    case 'data_store_write':
      return 0
    case 'subsystem':
      return block.parameters?.outputPorts?.length || 1
    case 'sheet_label_sink':
      return 0
    case 'sheet_label_source':
      return 1
    case 'demux':
      // Demux has dynamic outputs based on outputCount configuration
      return block.parameters?.outputCount || 1
    case 'orientation_conversion': {
      // All conversion modes expose a single output port (DCM, quat, or Euler vector)
      return 1
    }
    default:
      return 0
  }
}

/**
 * Gets the number of input ports for a block
 */
function getBlockInputPortCount(block: BlockData): number {
  switch (block.type) {
    case 'sum':
    case 'multiply':
      return configuredArithmeticInputCount(block)
    case 'scale':
    case 'limit':
    case 'units_conversion':
    case 'transfer_function':
    case 'discrete_transform':
    case 'signal_display':
    case 'signal_logger':
    case 'no_connection':
    case 'output_port':
    case 'lookup_1d':
    case 'sign':
    case 'relay':
    case 'rate_limiter':
    case 'quantizer':
    case 'selector':
    case 'data_store_write':
    case 'edge_detect':
    case 'atmosphere':
      return 1
    case 'saturation_dynamic':
      return 3
    case 'data_store_read':
      return 0
    case 'integrator': {
      // Data ports only: derivative (+ x(0) when showInitPort).
      // Enable (-1) and reset (-2) are control ports, not counted here.
      return block.parameters?.showInitPort ? 2 : 1
    }
    case 'unit_delay':
      return 1
    case 'lookup_2d':
    case 'matrix_multiply':
    case 'cross':  // Cross product takes 2 vectors
    case 'dot':    // Dot product takes 2 vectors
    case 'divide':
      return 2
    case 'if':
      // If block takes 3 inputs: input1, control, input2
      return 3
    case 'body2quaternion_rates':
      // Body2QuaternionRates takes 4 inputs: q (quaternion), P, Q, R (body rates)
      return 4
    case 'evaluate':
      // Evaluate blocks have configurable number of inputs
      return block.parameters?.numInputs || 1
    case 'condition':
    case 'mag':      // Magnitude takes 1 vector
    case 'abs':      // Absolute value takes 1 input
    case 'square':   // Element-wise x^2 takes 1 input
    case 'uminus':   // Unary minus takes 1 input
    case 'transpose': // Transpose takes 1 matrix
    case 'demux':    // Demux takes 1 vector/matrix input
      return 1
    case 'mux':
      // Mux has dynamic inputs based on rows * cols configuration
      return (block.parameters?.rows || 2) * (block.parameters?.cols || 2)
    case 'trig': {
      // atan2 requires 2 inputs (y, x), all others require 1
      const func = block.parameters?.function || 'sin'
      return func === 'atan2' ? 2 : 1
    }
    case 'input_port':
    case 'source':
    case 'clock':
      return 0
    case 'subsystem':
      // Don't count enable port in regular input count
      return block.parameters?.inputPorts?.length || 1
    case 'sheet_label_sink':
      return 1
    case 'sheet_label_source':
      return 0
    case 'orientation_conversion': {
      const conversionType = block.parameters?.conversionType || 'euler_to_dcm'
      // euler_to_dcm, euler_to_quat: 3 inputs (Phi, Theta, Psi)
      // All others: 1 input (DCM or quaternion)
      if (conversionType === 'euler_to_dcm' || conversionType === 'euler_to_quat') {
        return 3
      }
      return 1
    }
    default:
      return 1
  }
}

/**
 * Gets the types of all inputs connected to a block
 */
function getBlockInputTypes(
  block: BlockData,
  wiresByTarget: Map<string, WireData[]>,
  blockOutputTypes: BlockOutputTypes
): string[] {
  const inputTypes: string[] = []
  const inputPortCount = getBlockInputPortCount(block)
  
  // Handle regular input ports
  for (let portIndex = 0; portIndex < inputPortCount; portIndex++) {
    const targetKey = `${block.id}:${portIndex}`
    const wires = wiresByTarget.get(targetKey) || []
    
    for (const wire of wires) {
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceType = blockOutputTypes.get(sourceKey)
      if (sourceType) {
        inputTypes.push(sourceType)
      }
    }
  }
  
  // Handle enable port separately if it exists
  if (block.type === 'subsystem' && block.parameters?.showEnableInput) {
    const enableKey = `${block.id}:-1`
    const enableWires = wiresByTarget.get(enableKey) || []
    
    for (const wire of enableWires) {
      const sourceKey = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
      const sourceType = blockOutputTypes.get(sourceKey)
      if (sourceType) {
        // Enable port type is handled separately in validation
        // Don't include it in regular input types
      }
    }
  }
  
  return inputTypes
}

/**
 * Validates that all connections in the model have compatible types
 */
export function validateSignalTypes(result: TypePropagationResult): TypePropagationError[] {
  const additionalErrors: TypePropagationError[] = []
  
  // Check for any wires without determined types
  for (const [wireId, signalType] of result.signalTypes) {
    if (!signalType.type) {
      additionalErrors.push({
        wireId,
        message: 'Unable to determine signal type',
        severity: 'warning'
      })
    }
  }
  
  return [...result.errors, ...additionalErrors]
}

/**
 * Calculates the output dimensions for matrix multiplication
 * @param type1 - First input type
 * @param type2 - Second input type
 * @returns Output type string or null if incompatible
 */
export function calculateMatrixMultiplyOutputType(type1: string, type2: string): string | null {
  try {
    const parsed1 = parseType(type1)
    const parsed2 = parseType(type2)

    // Must have same base type
    if (parsed1.baseType !== parsed2.baseType) return null

    const s1 = !parsed1.isMatrix && !parsed1.isArray
    const s2 = !parsed2.isMatrix && !parsed2.isArray

    // Scalar × Scalar
    if (s1 && s2) {
      return type1
    }

    // Scalar × Vector = Vector (and reverse) — used e.g. F_aero = D · v̂
    if (s1 && parsed2.isArray) {
      return type2
    }
    if (parsed1.isArray && s2) {
      return type1
    }

    // Scalar × Matrix or Matrix × Scalar
    if (s1 && parsed2.isMatrix) {
      return type2
    }
    if (parsed1.isMatrix && s2) {
      return type1
    }

    // Vector × Vector element-wise (same size) — matches MatrixMultiplyBlockModule
    if (parsed1.isArray && parsed2.isArray) {
      if (parsed1.arraySize === parsed2.arraySize) {
        return type1
      }
      return null
    }

    // Vector × Matrix: [n] × [n×m] = [m]
    if (parsed1.isArray && parsed2.isMatrix) {
      if (parsed1.arraySize === parsed2.rows) {
        return `${parsed1.baseType}[${parsed2.cols}]`
      }
      return null
    }

    // Matrix × Vector: [m×n] × [n] = [m]
    if (parsed1.isMatrix && parsed2.isArray) {
      if (parsed1.cols === parsed2.arraySize) {
        return `${parsed1.baseType}[${parsed1.rows}]`
      }
      return null
    }

    // Matrix × Matrix: [m×n] × [n×p] = [m×p]
    if (parsed1.isMatrix && parsed2.isMatrix) {
      if (parsed1.cols === parsed2.rows) {
        return `${parsed1.baseType}[${parsed1.rows}][${parsed2.cols}]`
      }
      return null
    }

    return null
  } catch {
    return null
  }
}

/**
 * Gets a detailed error message for matrix multiply incompatibility
 * @param type1 - First input type
 * @param type2 - Second input type
 * @returns Error message explaining the incompatibility
 */
export function getMatrixMultiplyError(type1: string, type2: string): string {
  try {
    const parsed1 = parseType(type1)
    const parsed2 = parseType(type2)
    
    if (parsed1.baseType !== parsed2.baseType) {
      return `Cannot multiply ${parsed1.baseType} and ${parsed2.baseType} - types must match`
    }
    
    const desc1 = parsed1.isMatrix ? `${parsed1.rows}×${parsed1.cols} matrix` :
                  parsed1.isArray ? `vector[${parsed1.arraySize}]` : 'scalar'
    const desc2 = parsed2.isMatrix ? `${parsed2.rows}×${parsed2.cols} matrix` :
                  parsed2.isArray ? `vector[${parsed2.arraySize}]` : 'scalar'
    
    if (parsed1.isArray && parsed2.isMatrix) {
      if (parsed1.arraySize !== parsed2.rows) {
        return `Cannot multiply ${desc1} by ${desc2}: vector size (${parsed1.arraySize}) must match matrix rows (${parsed2.rows})`
      }
    }
    
    if (parsed1.isMatrix && parsed2.isArray) {
      if (parsed1.cols !== parsed2.arraySize) {
        return `Cannot multiply ${desc1} by ${desc2}: matrix columns (${parsed1.cols}) must match vector size (${parsed2.arraySize})`
      }
    }
    
    if (parsed1.isMatrix && parsed2.isMatrix) {
      if (parsed1.cols !== parsed2.rows) {
        return `Cannot multiply ${desc1} by ${desc2}: first matrix columns (${parsed1.cols}) must match second matrix rows (${parsed2.rows})`
      }
    }
    
    return `Cannot multiply ${desc1} by ${desc2}`
  } catch {
    return 'Invalid types for matrix multiplication'
  }
}

/**
 * Determines output type rules for matrix-specific blocks
 */
export function getMatrixBlockOutputType(
  block: BlockData,
  inputTypes: string[]
): string | null {
  const parsedInputs = inputTypes.map(type => {
    try {
      return parseType(type)
    } catch {
      return null
    }
  }).filter(t => t !== null) as ParsedType[]

  switch (block.type) {
    case 'matrix_multiply':
      return getMatrixMultiplyOutputType(inputTypes)
    
    case 'mux':
      return getMuxOutputType(block, parsedInputs)
    
    case 'demux':
      return getDemuxOutputType(parsedInputs)
    
    // Element-wise operations maintain input dimensions
    case 'sum': {
      // Sum of Elements: single vector/matrix → scalar
      if (configuredArithmeticInputCount(block) === 1 && parsedInputs.length === 1) {
        const only = parsedInputs[0]
        if (only.isArray || only.isMatrix) return only.baseType
        return typeToString(only)
      }
      return getElementWiseOutputType(block.type, parsedInputs)
    }
    case 'multiply':
    case 'scale':
      return getElementWiseOutputType(block.type, parsedInputs)

    case 'limit':
    case 'saturation_dynamic':
    case 'integrator':
    case 'unit_delay':
    case 'units_conversion':
    case 'transfer_function':
    case 'discrete_transform':
    case 'sign':
    case 'square':
    case 'quantizer':
      // Limit / saturation_dynamic / integrator / unit delay / … element-wise.
      // saturation_dynamic: prefer u (in1) shape when present.
      if (block.type === 'saturation_dynamic' && parsedInputs.length >= 2) {
        const u = parsedInputs[1]
        if (u && (u.isArray || u.isMatrix)) return typeToString(u)
        const vec = parsedInputs.find(t => t.isArray || t.isMatrix)
        if (vec) return typeToString(vec)
      }
      return parsedInputs.length > 0 ? typeToString(parsedInputs[0]) : null

    case 'divide':
      // Output follows numerator; scalar/vector broadcast handled in determineProcessingBlockOutputType
      return parsedInputs.length > 0 ? typeToString(parsedInputs[0]) : null

    case 'relay':
    case 'rate_limiter':
      return 'double'
    
    default:
      return null
  }
}

/**
 * Get output type for matrix multiply operation
 */
function getMatrixMultiplyOutputType(inputTypes: string[]): string | null {
  if (inputTypes.length < 2) return null
  return calculateMatrixMultiplyOutputType(inputTypes[0], inputTypes[1])
}

/**
 * Get output type for mux block based on configuration
 */
function getMuxOutputType(block: BlockData, inputs: ParsedType[]): string | null {
  // All inputs must be scalars of the same base type
  if (inputs.length === 0) return null
  
  const baseType = inputs[0].baseType
  const allScalars = inputs.every(t => 
    !t.isArray && !t.isMatrix && t.baseType === baseType
  )
  
  if (!allScalars) return null
  
  // Output type depends on mux configuration
  if (block.parameters?.outputType === 'matrix') {
    const rows = block.parameters?.rows
    const cols = block.parameters?.cols
    if (rows && cols && inputs.length === rows * cols) {
      return `${baseType}[${rows}][${cols}]`
    }
  } else if (block.parameters?.outputType === 'vector') {
    const size = block.parameters?.size || inputs.length
    if (inputs.length === size) {
      return `${baseType}[${size}]`
    }
  }
  
  return null
}

/**
 * Get output type for demux block
 */
function getDemuxOutputType(inputs: ParsedType[]): string | null {
  if (inputs.length !== 1) return null
  
  const input = inputs[0]
  // Demux always outputs the base type as scalars
  return input.baseType
}

/**
 * Get output type for element-wise operations
 */
function getElementWiseOutputType(
  operation: string,
  inputs: ParsedType[]
): string | null {
  if (inputs.length === 0) return null
  
  const first = inputs[0]
  
  if (operation === 'scale') {
    // Scale preserves input type exactly
    return typeToString(first)
  }
  
  // For sum and multiply, all inputs must have identical dimensions
  const allSame = inputs.every(t => 
    t.baseType === first.baseType &&
    t.isArray === first.isArray &&
    t.arraySize === first.arraySize &&
    t.isMatrix === first.isMatrix &&
    t.rows === first.rows &&
    t.cols === first.cols
  )
  
  return allSame ? typeToString(first) : null
}

/**
 * Matrix operation validation rules
 */
export interface MatrixOperationRule {
  operation: string
  validate: (inputs: ParsedType[]) => { valid: boolean; error?: string }
  getOutputType: (inputs: ParsedType[]) => ParsedType | null
}

export const matrixOperationRules: Record<string, MatrixOperationRule> = {
  'matrix_multiply': {
    operation: 'matrix_multiply',
    validate: (inputs) => {
      if (inputs.length !== 2) {
        return { valid: false, error: 'Matrix multiply requires exactly 2 inputs' }
      }
      
      const [a, b] = inputs
      
      // Check base type compatibility
      if (a.baseType !== b.baseType) {
        return { valid: false, error: 'Input types must match' }
      }
      
      // Check dimension compatibility
      if (a.isMatrix && b.isMatrix) {
        if (a.cols !== b.rows) {
          return { 
            valid: false, 
            error: `Inner dimensions must match: ${a.cols} ≠ ${b.rows}` 
          }
        }
      } else if (a.isArray && b.isMatrix) {
        if (a.arraySize !== b.rows) {
          return { 
            valid: false, 
            error: `Vector size must match matrix rows: ${a.arraySize} ≠ ${b.rows}` 
          }
        }
      } else if (a.isMatrix && b.isArray) {
        if (a.cols !== b.arraySize) {
          return { 
            valid: false, 
            error: `Matrix columns must match vector size: ${a.cols} ≠ ${b.arraySize}` 
          }
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => {
      const [a, b] = inputs
      const t = calculateMatrixMultiplyOutputType(
        typeToString(a),
        typeToString(b)
      )
      if (!t) return null
      try {
        return parseType(t)
      } catch {
        return null
      }
    }
  },
  
  'element_wise': {
    operation: 'element_wise',
    validate: (inputs) => {
      if (inputs.length < 2) {
        return { valid: true } // Single input is always valid
      }
      
      const first = inputs[0]
      const allMatch = inputs.every(t => 
        t.baseType === first.baseType &&
        t.isArray === first.isArray &&
        t.arraySize === first.arraySize &&
        t.isMatrix === first.isMatrix &&
        t.rows === first.rows &&
        t.cols === first.cols
      )
      
      if (!allMatch) {
        return { 
          valid: false, 
          error: 'All inputs must have identical dimensions for element-wise operations' 
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => inputs[0]
  },
  
  'mux': {
    operation: 'mux',
    validate: (inputs) => {
      // All inputs must be scalars of the same type
      if (inputs.length === 0) {
        return { valid: false, error: 'Mux requires at least one input' }
      }
      
      const baseType = inputs[0].baseType
      const allScalars = inputs.every(t => 
        !t.isArray && !t.isMatrix && t.baseType === baseType
      )
      
      if (!allScalars) {
        return { 
          valid: false, 
          error: 'All mux inputs must be scalars of the same type' 
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => {
      // Output type depends on mux configuration, handled elsewhere
      return null
    }
  },
  
  'demux': {
    operation: 'demux',
    validate: (inputs) => {
      if (inputs.length !== 1) {
        return { valid: false, error: 'Demux requires exactly one input' }
      }
      
      const input = inputs[0]
      if (!input.isArray && !input.isMatrix) {
        return { 
          valid: false, 
          error: 'Demux input must be a vector or matrix' 
        }
      }
      
      return { valid: true }
    },
    getOutputType: (inputs) => ({
      baseType: inputs[0].baseType,
      isArray: false,
      isMatrix: false
    })
  }
}

/**
 * Validates matrix operation inputs according to rules
 */
export function validateMatrixOperation(
  operation: string,
  inputTypes: string[]
): { valid: boolean; error?: string; outputType?: string } {
  const rule = matrixOperationRules[operation]
  if (!rule) {
    return { valid: false, error: `Unknown operation: ${operation}` }
  }
  
  const parsedInputs = inputTypes.map(type => {
    try {
      return parseType(type)
    } catch {
      return null
    }
  }).filter(t => t !== null) as ParsedType[]
  
  if (parsedInputs.length !== inputTypes.length) {
    return { valid: false, error: 'Invalid input types' }
  }
  
  const validation = rule.validate(parsedInputs)
  if (!validation.valid) {
    return validation
  }
  
  const outputType = rule.getOutputType(parsedInputs)
  if (outputType) {
    return { valid: true, outputType: typeToString(outputType) }
  }
  
  return { valid: true }
}

/**
 * Checks if a source type can be connected to a target type with detailed rules
 */
export function canConnect(
  sourceType: string,
  targetType: string,
  targetBlockType?: string
): { canConnect: boolean; error?: string } {
  try {
    const source = parseType(sourceType)
    const target = parseType(targetType)
    
    // Special cases for specific block types
    if (targetBlockType) {
      switch (targetBlockType) {
        case 'signal_display':
        case 'signal_logger':
          if (source.isMatrix) {
            return {
              canConnect: false,
              error: 'Display blocks cannot accept matrix inputs. Use a demux block to extract individual signals.'
            }
          }
          break
          
        case 'lookup_1d':
        case 'lookup_2d':
          if (source.isMatrix || source.isArray) {
            return {
              canConnect: false,
              error: 'Lookup blocks require scalar inputs'
            }
          }
          break
          
        case 'mux':
          if (source.isMatrix || source.isArray) {
            return {
              canConnect: false,
              error: 'Mux blocks require scalar inputs'
            }
          }
          break
          
        case 'demux':
          if (!source.isMatrix && !source.isArray) {
            return {
              canConnect: false,
              error: 'Demux blocks require vector or matrix inputs'
            }
          }
          break
      }
    }
    
    // General compatibility rules
    if (areTypesCompatible(sourceType, targetType)) {
      return { canConnect: true }
    }
    
    // Get detailed error message
    const error = getTypeCompatibilityError(sourceType, targetType)
    return { canConnect: false, error }
    
  } catch (error) {
    return {
      canConnect: false,
      error: `Invalid type: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Get dimension string for display
 */
export function getDimensionString(typeString: string): string {
  try {
    const parsed = parseType(typeString)
    
    if (parsed.isMatrix) {
      return `${parsed.rows}×${parsed.cols}`
    }
    
    if (parsed.isArray) {
      return `[${parsed.arraySize}]`
    }
    
    return 'scalar'
  } catch {
    return 'invalid'
  }
}

/**
 * Check if two matrix types have compatible dimensions for operations
 */
export function areMatrixDimensionsCompatible(
  type1: string,
  type2: string,
  operation: 'add' | 'multiply' | 'matrix_multiply'
): { compatible: boolean; error?: string } {
  try {
    const parsed1 = parseType(type1)
    const parsed2 = parseType(type2)
    
    // Must have same base type
    if (parsed1.baseType !== parsed2.baseType) {
      return {
        compatible: false,
        error: `Cannot ${operation} ${parsed1.baseType} and ${parsed2.baseType}`
      }
    }
    
    switch (operation) {
      case 'add':
      case 'multiply':
        // Element-wise operations require exact dimension match
        if (parsed1.isMatrix && parsed2.isMatrix) {
          if (parsed1.rows !== parsed2.rows || parsed1.cols !== parsed2.cols) {
            return {
              compatible: false,
              error: `Cannot ${operation} ${parsed1.rows}×${parsed1.cols} and ${parsed2.rows}×${parsed2.cols} matrices - dimensions must match`
            }
          }
        } else if (parsed1.isArray && parsed2.isArray) {
          if (parsed1.arraySize !== parsed2.arraySize) {
            return {
              compatible: false,
              error: `Cannot ${operation} arrays of different sizes: [${parsed1.arraySize}] and [${parsed2.arraySize}]`
            }
          }
        } else if (parsed1.isMatrix !== parsed2.isMatrix || parsed1.isArray !== parsed2.isArray) {
          return {
            compatible: false,
            error: `Cannot ${operation} different types: ${getDimensionString(type1)} and ${getDimensionString(type2)}`
          }
        }
        return { compatible: true }
        
      case 'matrix_multiply':
        // Matrix multiply has special rules
        const result = calculateMatrixMultiplyOutputType(type1, type2)
        if (!result) {
          return {
            compatible: false,
            error: getMatrixMultiplyError(type1, type2)
          }
        }
        return { compatible: true }
        
      default:
        return { compatible: false, error: `Unknown operation: ${operation}` }
    }
  } catch (error) {
    return {
      compatible: false,
      error: error instanceof Error ? error.message : 'Invalid types'
    }
  }
}

/**
 * Matrix-specific validation error types
 */
export enum MatrixErrorType {
  DIMENSION_MISMATCH = 'DIMENSION_MISMATCH',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  INVALID_INPUT = 'INVALID_INPUT',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION'
}

/**
 * Enhanced error message generator for matrix operations
 */
export class MatrixValidationError {
  static dimensionMismatch(
    blockName: string,
    operation: string,
    input1: string,
    input2: string,
    details?: string
  ): string {
    const dim1 = getDimensionString(input1)
    const dim2 = getDimensionString(input2)
    
    switch (operation) {
      case 'add':
      case 'sum':
        return `Cannot add ${dim1} and ${dim2} at ${blockName}. Matrix addition requires identical dimensions.`
        
      case 'multiply':
        return `Cannot element-wise multiply ${dim1} and ${dim2} at ${blockName}. Element-wise operations require identical dimensions.`
        
      case 'matrix_multiply':
        try {
          const p1 = parseType(input1)
          const p2 = parseType(input2)
          
          if (p1.isMatrix && p2.isMatrix) {
            return `Cannot multiply ${p1.rows}×${p1.cols} by ${p2.rows}×${p2.cols} at ${blockName}. ` +
                   `Matrix multiplication requires inner dimensions to match: ` +
                   `first matrix columns (${p1.cols}) must equal second matrix rows (${p2.rows}).`
          } else if (p1.isArray && p2.isMatrix) {
            return `Cannot multiply vector[${p1.arraySize}] by ${p2.rows}×${p2.cols} matrix at ${blockName}. ` +
                   `Vector length (${p1.arraySize}) must match matrix rows (${p2.rows}).`
          } else if (p1.isMatrix && p2.isArray) {
            return `Cannot multiply ${p1.rows}×${p1.cols} matrix by vector[${p2.arraySize}] at ${blockName}. ` +
                   `Matrix columns (${p1.cols}) must match vector length (${p2.arraySize}).`
          }
        } catch {
          // Fallback
        }
        return `Cannot multiply ${dim1} by ${dim2} at ${blockName}. ${details || ''}`
        
      default:
        return `Dimension mismatch for ${operation} at ${blockName}: ${dim1} and ${dim2} are incompatible. ${details || ''}`
    }
  }
  
  static typeMismatch(
    blockName: string,
    expectedType: string,
    actualType: string,
    portName?: string
  ): string {
    const expected = getDimensionString(expectedType)
    const actual = getDimensionString(actualType)
    const port = portName ? ` on port "${portName}"` : ''
    
    try {
      const parsedExpected = parseType(expectedType)
      const parsedActual = parseType(actualType)
      
      if (parsedExpected.isMatrix && !parsedActual.isMatrix) {
        return `${blockName}${port} expects a ${parsedExpected.rows}×${parsedExpected.cols} matrix ` +
               `but received ${actual}.`
      }
      
      if (!parsedExpected.isMatrix && parsedActual.isMatrix) {
        return `${blockName}${port} expects ${expected} ` +
               `but received a ${parsedActual.rows}×${parsedActual.cols} matrix.`
      }
      
      if (parsedExpected.baseType !== parsedActual.baseType) {
        return `${blockName}${port} expects ${parsedExpected.baseType} type ` +
               `but received ${parsedActual.baseType}.`
      }
    } catch {
      // Fallback
    }
    
    return `Type mismatch at ${blockName}${port}: expected ${expected}, got ${actual}.`
  }
  
  static invalidMatrixInput(
    blockName: string,
    blockType: string,
    actualType: string
  ): string {
    const actual = getDimensionString(actualType)
    
    switch (blockType) {
      case 'signal_display':
      case 'signal_logger':
        return `${blockName} cannot display matrix signals (received ${actual}). ` +
               `Use a Demux block to extract individual scalar signals for display.`
        
      case 'lookup_1d':
      case 'lookup_2d':
        return `${blockName} requires scalar inputs but received ${actual}. ` +
               `Lookup tables operate on scalar values only.`
        
      case 'mux':
        return `${blockName} requires scalar inputs but received ${actual}. ` +
               `Mux combines multiple scalar signals into a vector or matrix.`
        
      case 'demux':
        return `${blockName} requires vector or matrix input but received ${actual}. ` +
               `Demux splits a vector or matrix into individual scalar signals.`
        
      default:
        return `${blockName} cannot accept ${actual} input.`
    }
  }
  
  static matrixOperationHint(operation: string): string {
    switch (operation) {
      case 'matrix_multiply':
        return 'Hint: For matrix multiplication A×B, the number of columns in A must equal the number of rows in B. ' +
               'The result will have dimensions (rows of A) × (columns of B).'
        
      case 'element_wise':
        return 'Hint: Element-wise operations (addition, multiplication) require matrices with exactly the same dimensions.'
        
      case 'transpose':
        return 'Hint: Matrix transpose swaps rows and columns. An m×n matrix becomes n×m after transpose.'
        
      default:
        return ''
    }
  }
}

/**
 * Generate helpful suggestions for fixing matrix errors
 */
export function getMatrixErrorSuggestion(
  error: TypePropagationError,
  blocks: BlockData[]
): string | null {
  if (!error.blockId) return null
  
  const block = blocks.find(b => b.id === error.blockId)
  if (!block) return null
  
  // Check for common matrix error patterns
  if (error.message.includes('cannot display matrix')) {
    return 'Solution: Insert a Demux block between the matrix signal and the display block to extract individual elements.'
  }
  
  if (error.message.includes('inner dimensions must match')) {
    return 'Solution: Check matrix dimensions. For A×B multiplication, columns of A must equal rows of B. ' +
           'You may need to transpose one of the matrices.'
  }
  
  if (error.message.includes('dimensions must match') && block.type === 'sum') {
    return 'Solution: Ensure all inputs to the sum block have identical dimensions. ' +
           'Use Scale blocks to resize matrices if needed.'
  }
  
  if (error.message.includes('requires scalar inputs') && block.type === 'mux') {
    return 'Solution: Connect only scalar signals to Mux inputs. ' +
           'If you have a matrix, use a Demux block first to extract scalars.'
  }
  
  return null
}