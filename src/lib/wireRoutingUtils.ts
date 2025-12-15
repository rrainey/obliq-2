// lib/wireRoutingUtils.ts - Utilities for wire routing and path calculation

import { Wire, Position, Block } from './modelSchema'

/**
 * Configuration for routing reset detection
 */
export const ROUTING_CONFIG = {
  // Distance threshold: if a waypoint is this far from expected position, consider resetting
  waypointDistanceThreshold: 150,
  // Margin around blocks for intersection detection
  blockMargin: 10,
}

/**
 * Represents a path segment (line between two points)
 */
interface PathSegment {
  start: Position
  end: Position
  orientation: 'horizontal' | 'vertical'
}

/**
 * Represents a bounding box for a block
 */
interface BoundingBox {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Calculate the default midpoint X position for a step edge
 * This is what ReactFlow's step edge uses by default
 */
export function calculateDefaultMidpointX(sourceX: number, targetX: number): number {
  return sourceX + (targetX - sourceX) / 2
}

/**
 * Calculate the actual midpoint X position considering any offset
 */
export function calculateMidpointX(
  sourceX: number,
  targetX: number,
  midpointOffset?: number
): number {
  const defaultMidpoint = calculateDefaultMidpointX(sourceX, targetX)
  return defaultMidpoint + (midpointOffset ?? 0)
}

/**
 * Generate path segments for a step edge with optional custom routing
 */
export function generateStepPathSegments(
  sourcePos: Position,
  targetPos: Position,
  routing?: Wire['routing']
): PathSegment[] {
  // If we have explicit waypoints, use them
  if (routing?.waypoints && routing.waypoints.length > 0) {
    return generateWaypointPathSegments(sourcePos, targetPos, routing.waypoints)
  }

  // Otherwise, use simple step routing with optional midpoint offset
  const midX = calculateMidpointX(sourcePos.x, targetPos.x, routing?.midpointOffset)

  return [
    // Horizontal segment from source to midpoint X
    { start: sourcePos, end: { x: midX, y: sourcePos.y }, orientation: 'horizontal' },
    // Vertical segment at midpoint X
    { start: { x: midX, y: sourcePos.y }, end: { x: midX, y: targetPos.y }, orientation: 'vertical' },
    // Horizontal segment from midpoint to target
    { start: { x: midX, y: targetPos.y }, end: targetPos, orientation: 'horizontal' },
  ]
}

/**
 * Generate path segments from explicit waypoints
 */
function generateWaypointPathSegments(
  sourcePos: Position,
  targetPos: Position,
  waypoints: Position[]
): PathSegment[] {
  const segments: PathSegment[] = []
  const allPoints = [sourcePos, ...waypoints, targetPos]

  for (let i = 0; i < allPoints.length - 1; i++) {
    const start = allPoints[i]
    const end = allPoints[i + 1]
    const orientation = Math.abs(end.y - start.y) < 1 ? 'horizontal' : 'vertical'
    segments.push({ start, end, orientation })
  }

  return segments
}

/**
 * Generate SVG path string for step routing
 */
export function generateStepPathString(
  sourcePos: Position,
  targetPos: Position,
  routing?: Wire['routing']
): string {
  const segments = generateStepPathSegments(sourcePos, targetPos, routing)

  if (segments.length === 0) {
    return `M ${sourcePos.x} ${sourcePos.y} L ${targetPos.x} ${targetPos.y}`
  }

  let path = `M ${segments[0].start.x} ${segments[0].start.y}`
  for (const segment of segments) {
    path += ` L ${segment.end.x} ${segment.end.y}`
  }

  return path
}

/**
 * Get bounding box for a block (with optional margin)
 */
export function getBlockBoundingBox(
  block: Block,
  margin: number = ROUTING_CONFIG.blockMargin
): BoundingBox {
  // Standard block dimensions - should match BlockNode.tsx
  const width = 80
  const height = 64

  return {
    left: block.position.x - margin,
    right: block.position.x + width + margin,
    top: block.position.y - margin,
    bottom: block.position.y + height + margin,
  }
}

/**
 * Check if a point is inside a bounding box
 */
export function isPointInBoundingBox(point: Position, box: BoundingBox): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  )
}

/**
 * Check if a line segment intersects a bounding box
 */
export function doesSegmentIntersectBox(segment: PathSegment, box: BoundingBox): boolean {
  const { start, end } = segment

  // Quick check: if both endpoints are outside on the same side, no intersection
  if (start.x < box.left && end.x < box.left) return false
  if (start.x > box.right && end.x > box.right) return false
  if (start.y < box.top && end.y < box.top) return false
  if (start.y > box.bottom && end.y > box.bottom) return false

  // Check if either endpoint is inside the box
  if (isPointInBoundingBox(start, box) || isPointInBoundingBox(end, box)) {
    return true
  }

  // For axis-aligned segments (which step edges are), check if segment crosses the box
  if (segment.orientation === 'horizontal') {
    // Horizontal segment: check if it crosses the box vertically
    const y = start.y
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    return y >= box.top && y <= box.bottom && minX <= box.right && maxX >= box.left
  } else {
    // Vertical segment: check if it crosses the box horizontally
    const x = start.x
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    return x >= box.left && x <= box.right && minY <= box.bottom && maxY >= box.top
  }
}

/**
 * Determine if a wire's custom routing should be reset based on block positions
 *
 * Returns true if:
 * 1. Any waypoint falls inside a block's bounding box
 * 2. Any path segment intersects a block (other than source/target)
 * 3. Waypoints are too far from their expected positions (path is "stretched")
 */
export function shouldResetWireRouting(
  wire: Wire,
  blocks: Block[],
  sourcePos: Position,
  targetPos: Position
): boolean {
  // No custom routing = nothing to reset
  if (!wire.routing) {
    return false
  }

  // Get all blocks except source and target
  const otherBlocks = blocks.filter(
    b => b.id !== wire.sourceBlockId && b.id !== wire.targetBlockId
  )

  // Check midpointOffset case
  if (wire.routing.midpointOffset !== undefined && !wire.routing.waypoints) {
    const midX = calculateMidpointX(sourcePos.x, targetPos.x, wire.routing.midpointOffset)
    const midPoint: Position = { x: midX, y: (sourcePos.y + targetPos.y) / 2 }

    // Check if midpoint falls inside any other block
    for (const block of otherBlocks) {
      const box = getBlockBoundingBox(block)
      if (isPointInBoundingBox(midPoint, box)) {
        return true
      }
    }

    return false
  }

  // Check waypoints case
  if (wire.routing.waypoints && wire.routing.waypoints.length > 0) {
    const waypoints = wire.routing.waypoints

    // Check 1: Are any waypoints inside a block?
    for (const waypoint of waypoints) {
      for (const block of otherBlocks) {
        const box = getBlockBoundingBox(block)
        if (isPointInBoundingBox(waypoint, box)) {
          return true
        }
      }
    }

    // Check 2: Do any path segments intersect blocks?
    const segments = generateStepPathSegments(sourcePos, targetPos, wire.routing)
    for (const segment of segments) {
      for (const block of otherBlocks) {
        const box = getBlockBoundingBox(block)
        if (doesSegmentIntersectBox(segment, box)) {
          return true
        }
      }
    }

    // Check 3: Is the first waypoint too far from source, or last from target?
    const firstWaypoint = waypoints[0]
    const lastWaypoint = waypoints[waypoints.length - 1]
    const threshold = ROUTING_CONFIG.waypointDistanceThreshold

    const distToSource = Math.hypot(
      firstWaypoint.x - sourcePos.x,
      firstWaypoint.y - sourcePos.y
    )
    const distToTarget = Math.hypot(
      lastWaypoint.x - targetPos.x,
      lastWaypoint.y - targetPos.y
    )

    if (distToSource > threshold || distToTarget > threshold) {
      return true
    }
  }

  return false
}

/**
 * Process block movement and reset routing for affected wires
 * Returns the list of wire IDs that had their routing reset
 */
export function resetAffectedWireRouting(
  movedBlockIds: string[],
  wires: Wire[],
  blocks: Block[],
  getPortPosition: (blockId: string, portIndex: number, isOutput: boolean) => Position
): string[] {
  const resetWireIds: string[] = []

  for (const wire of wires) {
    // Skip wires without custom routing
    if (!wire.routing) continue

    // Check if this wire is connected to any moved block, or if any moved block
    // might now intersect the wire's path
    const sourcePos = getPortPosition(wire.sourceBlockId, wire.sourcePortIndex, true)
    const targetPos = getPortPosition(wire.targetBlockId, wire.targetPortIndex, false)

    if (shouldResetWireRouting(wire, blocks, sourcePos, targetPos)) {
      resetWireIds.push(wire.id)
    }
  }

  return resetWireIds
}

/**
 * Clear routing data from a wire (reset to auto-routing)
 */
export function clearWireRouting(wire: Wire): Wire {
  const { routing, ...rest } = wire
  return rest
}
