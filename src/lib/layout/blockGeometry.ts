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

/**
 * How far a wire's end lies outside the block edge, in px. BlockNode draws
 * 12px-wide left/right handles that React Flow offsets past the block edge;
 * edges start/end at the handle's outer side, measured at 6px. Wire routing
 * uses this so computed turn positions match what the editor draws.
 */
export const HANDLE_OUTSET = 6

/** Minimal structural shape needed for geometry; satisfied by BlockData. */
export interface GeomBlock {
  type: string
  name?: string
  parameters?: Record<string, any> | null
}

/**
 * A subsystem shows its name inside the block, in large bold text centred
 * and wrapped below its icon. An unsized subsystem grows to fit the name; a
 * resized one keeps its size and the name wraps within it.
 */
export const SUBSYSTEM_NAME_LABEL = {
  fontPx: 20, // 250% of the 8px name other blocks show above themselves
  lineHeightPx: 24,
  iconPx: 24,
  /** Between the icon and the name */
  gapPx: 4,
  /** Inside the block border, around the icon and name */
  paddingPx: 8,
  /** The block's border (BlockNode draws border-2) */
  borderPx: 2,
  /** Widest an unsized subsystem grows to fit its name on one line */
  maxAutoWidthPx: 260,
  /** Safety margin on estimated text widths */
  widthMargin: 1.05,
} as const

/**
 * Advance widths of Arial Bold (the canvas font is Arial/Helvetica), in
 * 1/1000 em, so block sizes and wraps can be estimated without a DOM.
 * Characters not listed use 0.6 em.
 */
const BOLD_WIDTHS: Record<string, number> = (() => {
  const w: Record<string, number> = {}
  const set = (chars: string, width: number) => { for (const c of chars) w[c] = width }
  set('0123456789', 556)
  set('ABCDHKNRU', 722); set('EPSVXY', 667); set('FLTZ', 611); set('GOQ', 778)
  set('I', 278); set('J', 556); set('M', 833); set('W', 944)
  set('acekvxy', 556); set('bdghnopqu', 611); set('fjt', 333); set('il', 278)
  set('m', 889); set('r', 389); set('s', 556); set('w', 778); set('z', 500)
  set(' ', 278); set('_', 556); set('-', 333); set('.,:;', 278); set('()', 333)
  return w
})()

/** Estimated rendered width (px) of text in the subsystem name font. */
export function subsystemNameTextWidth(text: string): number {
  let units = 0
  for (const c of text) units += BOLD_WIDTHS[c] ?? 600
  return (units / 1000) * SUBSYSTEM_NAME_LABEL.fontPx * SUBSYSTEM_NAME_LABEL.widthMargin
}

/** True when a subsystem draws its name inside the block. */
export function hasSubsystemName(data: GeomBlock): boolean {
  return data.type === 'subsystem' && data.parameters?.showName !== false && !!data.name
}

/** Estimated number of lines the name wraps to inside a block of this width. */
export function subsystemNameLines(name: string, blockWidth: number): number {
  const L = SUBSYSTEM_NAME_LABEL
  const avail = Math.max(1, blockWidth - 2 * (L.paddingPx + L.borderPx))
  const space = subsystemNameTextWidth(' ')
  let lines = 1, used = 0
  for (const word of name.split(/\s+/).filter(Boolean)) {
    const w = subsystemNameTextWidth(word)
    if (used > 0 && used + space + w <= avail) {
      used += space + w
      continue
    }
    if (used > 0) lines++
    // A word wider than the line breaks across lines (overflow-wrap: anywhere)
    lines += Math.max(0, Math.ceil(w / avail) - 1)
    used = w > avail ? w % avail || avail : w
  }
  return lines
}

/** Block height the icon and wrapped name need in a subsystem of this width (0 without a name). */
export function subsystemNameContentHeight(data: GeomBlock, blockWidth: number): number {
  if (!hasSubsystemName(data)) return 0
  const L = SUBSYSTEM_NAME_LABEL
  return 2 * (L.paddingPx + L.borderPx) + L.iconPx + L.gapPx + subsystemNameLines(String(data.name), blockWidth) * L.lineHeightPx
}

export function getBlockWidth(data: GeomBlock): number {
  // Resized subsystems carry an explicit width.
  if (data.type === 'subsystem' && typeof data.parameters?.width === 'number') {
    return data.parameters.width
  }
  // Otherwise wide enough for the name on one line, within limits
  if (hasSubsystemName(data)) {
    const L = SUBSYSTEM_NAME_LABEL
    const oneLine = Math.ceil(subsystemNameTextWidth(String(data.name))) + 2 * (L.paddingPx + L.borderPx)
    return Math.max(DEFAULT_WIDTH, Math.min(L.maxAutoWidthPx, oneLine))
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
  const forPorts = Math.max(MIN_HEIGHT, Math.max(inputCount, outputCount) * PORT_SPACING + 20)
  if (hasSubsystemName(data)) return Math.max(forPorts, subsystemNameContentHeight(data, getBlockWidth(data)))
  return forPorts
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
