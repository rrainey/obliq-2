// Block types whose visual size can be adjusted via corner drag handles.
// Extend this set to enable resize for additional block types.

export const RESIZABLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'subsystem',
])

export function isResizable(blockType: string): boolean {
  return RESIZABLE_BLOCK_TYPES.has(blockType)
}

// Snap increment (px) used while dragging resize handles.
export const RESIZE_SNAP = 10

// Absolute lower bound on block width; per-block-type minimums may be larger.
export const RESIZE_MIN_WIDTH = 80
