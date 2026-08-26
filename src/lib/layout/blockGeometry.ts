// Pure block geometry, shared by the canvas renderer (BlockNode) and the
// auto-layout engine.
//
// These two used to carry independent copies of the size and port-position
// math. Keeping a single source of truth matters because auto-layout computes
// wire endpoints from these formulas: if they drift from what actually gets
// drawn, routed wires attach at the wrong place.
//
// Deliberately dependency-free (no React, no block modules) so it can be
// imported from either side without a cycle. Port counts are passed in by the
// caller rather than derived here.

export const PORT_SPACING = 20
export const MIN_HEIGHT = 64
export const TERMINATOR_HEIGHT = 45 // Flatter height for terminator blocks
export const DEFAULT_WIDTH = 80

/** Minimal structural shape needed for geometry; satisfied by BlockData. */
export interface GeomBlock {
  type: string
  name?: string
  parameters?: Record<string, any> | null
}

export function getBlockWidth(data: GeomBlock): number {
  // Resized subsystems carry an explicit width.
  if (data.type === 'subsystem' && typeof data.parameters?.width === 'number') {
    return data.parameters.width
  }
  if (data.type === 'transfer_function') {
    const numerator = data.parameters?.numerator || [1]
    const denominator = data.parameters?.denominator || [1, 1]
    const maxLength = Math.max(numerator.length, denominator.length)
    return Math.max(80, 60 + maxLength * 15)
  }
  if (data.type === 'discrete_transform') {
    const numerator = data.parameters?.numerator || [1]
    const denominator = data.parameters?.denominator || [1, -0.5]
    const maxLength = Math.max(numerator.length, denominator.length)
    return Math.max(80, 60 + maxLength * 20)  // Slightly wider due to z^-n notation
  }

  if (data.type === 'source' && data.parameters?.value !== undefined) {
    const value = String(data.parameters.value)
    const estimatedWidth = value.length * 8 + 20
    return Math.max(80, Math.min(200, estimatedWidth))
  }

  if (data.type === 'sheet_label_sink' || data.type === 'sheet_label_source') {
    const signalName = data.parameters?.signalName || ''
    if (signalName.length > 5) {
      return Math.min(120, 80 + signalName.length * 4)
    }
  }

  // Input/Output port blocks need width based on port name
  if (data.type === 'input_port' || data.type === 'output_port') {
    const portName = data.parameters?.portName || data.parameters?.signalName || data.name || ''
    const estimatedWidth = Math.max(100, portName.length * 8 + 40) // Extra padding for terminator shape
    return Math.min(200, estimatedWidth)
  }

  // Lookup blocks need space for the SVG diagram
  if (data.type === 'lookup_1d' || data.type === 'lookup_2d') {
    return 80 // Slightly wider to accommodate the 60px SVG
  }

  // Matrix blocks might need extra width for dimension display
  if (data.type === 'mux' || data.type === 'matrix_multiply') {
    return 90 // Slightly wider for dimension info
  }

  // Handle evaluate block - adjust width based on expression length
  if (data.type === 'evaluate') {
    const expression = data.parameters?.expression || 'in(0)'
    // Use monospace font metrics: ~7px per character at text-xs
    const estimatedWidth = expression.length * 7 + 40 // Add padding
    return Math.max(100, Math.min(300, estimatedWidth)) // Min 100px, max 300px
  }

  // Handle condition block similarly
  if (data.type === 'condition') {
    const condition = data.parameters?.condition || '> 0'
    const fullText = `x1 ${condition}`
    const estimatedWidth = fullText.length * 7 + 40
    return Math.max(80, Math.min(200, estimatedWidth))
  }

  // No Connection block is half the default size
  if (data.type === 'no_connection') {
    return 40
  }

  return DEFAULT_WIDTH
}

/**
 * Rendered height of a block. `inputCount`/`outputCount` are the *effective*
 * port counts (i.e. after any per-type overrides the caller applies).
 */
export function getBlockHeight(
  data: GeomBlock,
  inputCount: number,
  outputCount: number,
): number {
  if (data.type === 'subsystem' && typeof data.parameters?.height === 'number') {
    return data.parameters.height
  }
  return getIntrinsicBlockHeight(data, inputCount, outputCount)
}

/**
 * Height a block wants at its natural size, ignoring any stored resize
 * override. This is the floor auto-layout must respect when resizing a block:
 * below it, ports would be packed tighter than PORT_SPACING.
 */
export function getIntrinsicBlockHeight(
  data: GeomBlock,
  inputCount: number,
  outputCount: number,
): number {
  if (data.type === 'input_port' || data.type === 'output_port') {
    return TERMINATOR_HEIGHT
  }
  if (data.type === 'no_connection') {
    return 32 // Half size for no_connection block
  }
  return Math.max(MIN_HEIGHT, Math.max(inputCount, outputCount) * PORT_SPACING + 20)
}

/**
 * Where a port sits along a block's vertical axis, as a fraction in [0, 1].
 * Ports are distributed evenly with equal padding at top and bottom, so a
 * resized (taller) block spreads its ports out rather than clumping them.
 */
export function portFraction(index: number, count: number): number {
  if (count <= 1) return 0.5 // Center a single port
  return (index + 1) / (count + 1)
}

/** Port offset in pixels from the block's top edge. */
export function portOffsetY(index: number, count: number, blockHeight: number): number {
  return blockHeight * portFraction(index, count)
}
