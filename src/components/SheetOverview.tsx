'use client'

import { MiniMap, getNodesBounds, useStore, type ReactFlowState } from 'reactflow'

/** Pixels of slack (on screen) before a block counts as outside the view. */
const TOLERANCE_PX = 2

const MAP_WIDTH = 220
const MAP_HEIGHT = 160
/** Width of the visible-region outline, in screen pixels. */
const OUTLINE_PX = 2

/**
 * Flow units per overview pixel. The overview shows the union of the sheet's
 * extents and the current view, scaled to fit. Rounded so panning doesn't
 * re-render on every frame.
 */
export function overviewScale(state: ReactFlowState): number {
  const nodes = Array.from(state.nodeInternals.values()).filter(n => n.width && n.height && !n.hidden)
  if (nodes.length === 0 || !state.width || !state.height) return 1
  const b = getNodesBounds(nodes, state.nodeOrigin)
  const [tx, ty, zoom] = state.transform
  const vx = -tx / zoom, vy = -ty / zoom, vw = state.width / zoom, vh = state.height / zoom
  const w = Math.max(b.x + b.width, vx + vw) - Math.min(b.x, vx)
  const h = Math.max(b.y + b.height, vy + vh) - Math.min(b.y, vy)
  const scale = Math.max(w / MAP_WIDTH, h / MAP_HEIGHT)
  return Math.max(1, Math.round(scale * 4) / 4)
}

/**
 * True when some block on the sheet lies outside the visible part of the
 * canvas, i.e. the view shows less than the sheet's full extents (the
 * bounding box of all its blocks).
 */
export function viewIsPartial(state: ReactFlowState): boolean {
  const nodes = Array.from(state.nodeInternals.values()).filter(n => n.width && n.height && !n.hidden)
  if (nodes.length === 0 || !state.width || !state.height) return false
  const bounds = getNodesBounds(nodes, state.nodeOrigin)
  const [tx, ty, zoom] = state.transform
  const view = { x: -tx / zoom, y: -ty / zoom, w: state.width / zoom, h: state.height / zoom }
  const slack = TOLERANCE_PX / zoom
  return (
    bounds.x < view.x - slack ||
    bounds.y < view.y - slack ||
    bounds.x + bounds.width > view.x + view.w + slack ||
    bounds.y + bounds.height > view.y + view.h + slack
  )
}

/**
 * Overview map of the whole sheet with the visible region outlined. Shown only
 * while the view covers less than the full sheet; drag in it to pan, scroll in
 * it to zoom. Must be rendered inside <ReactFlow>.
 */
export default function SheetOverview({ dark }: { dark: boolean }) {
  // The selector returns a boolean, so panning re-renders this component only
  // when the overview needs to appear or disappear.
  const partial = useStore(viewIsPartial)
  // React Flow 11 draws the outline in flow units, so a fixed width vanishes on
  // a big sheet; scale it to stay OUTLINE_PX on screen.
  const scale = useStore(overviewScale)
  if (!partial) return null

  return (
    <MiniMap
      position="bottom-right"
      // Sit above the zoom indicator and the instructions bar along the bottom.
      // The background comes from CSS (.react-flow-dark .react-flow__minimap in dark mode).
      style={{
        marginBottom: 64,
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        border: `1px solid ${dark ? '#4b5563' : '#d1d5db'}`,
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      }}
      nodeColor={dark ? '#9ca3af' : '#6b7280'}
      nodeStrokeColor={dark ? '#d1d5db' : '#374151'}
      nodeStrokeWidth={scale}
      nodeBorderRadius={2}
      maskColor={dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(100, 116, 139, 0.35)'}
      maskStrokeColor="#3b82f6"
      maskStrokeWidth={OUTLINE_PX * scale}
      pannable
      zoomable
      ariaLabel="Sheet overview"
    />
  )
}
