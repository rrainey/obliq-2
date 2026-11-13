// Keep wire waypoints valid when the user moves or resizes a block.
//
// `routing.waypoints` are absolute canvas positions, and the editor joins
// source -> waypoints -> target with straight lines (CustomEdge.tsx,
// pdfRenderer.ts). When a block moves, the end of each of its wires moves
// too, but the waypoints do not, so the end segment becomes diagonal.
//
// After a move or a resize is complete, `repairWiresAfterBlockChange` looks at
// each wire with waypoints that connects to a changed block:
//   1. Both ends moved by the same distance (the blocks moved together): move
//      all waypoints by that distance.
//   2. Otherwise, for each end that moved: move the first (or last) waypoint
//      to the new port y. The next waypoint has the same x, so the end segment
//      stays horizontal and the segment after it stays vertical. The end
//      segment must keep its direction: out of the source port, and into the
//      target port, in the direction that the port faces (dataPortGeometry()
//      in blockGeometry.ts). A port that changed sides (the block was flipped)
//      fails this test.
//   3. The repaired wire must be orthogonal and must not go through a block
//      (with the new block geometry) that the old wire did not go through.
//      If any of these conditions fails, the wire's routing is removed, and
//      the editor draws its default shape.
// When a block is flipped or unflipped, the turn offset (`midpointOffset`) of
// each of its wires is removed too: the offset was for the old port sides.
// The block geometry is that of blockGeometry.ts (through layoutMetrics.ts),
// not a fixed block size.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { blockWireGeometry, polylineHitsRect } from './layoutMetrics'

interface Pt { x: number; y: number }

/** Coordinates closer than this (px) are the same. */
const TOL = 0.5

const same = (a: number, b: number) => Math.abs(a - b) < TOL

function geometryKey(b: BlockData): string {
  const p = b.parameters ?? {}
  return [b.position?.x ?? 0, b.position?.y ?? 0, p.width, p.height, b.type, b.name, p.showName, p.flipped === true].join('|')
}

/** True when each segment of the polyline is horizontal or vertical. */
function orthogonal(points: Pt[]): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    if (!same(a.x, b.x) && !same(a.y, b.y)) return false
  }
  return true
}

/** Remove repeated points and points in the middle of a straight run. */
function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && same(last.x, p.x) && same(last.y, p.y)) continue
    out.push(p)
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3)
      if (!((same(a.x, b.x) && same(b.x, c.x)) || (same(a.y, b.y) && same(b.y, c.y)))) break
      out.splice(out.length - 2, 1)
    }
  }
  return out
}

function hits(points: Pt[], blocks: Map<string, BlockData>): Set<string> {
  const ids = new Set<string>()
  for (const [id, b] of blocks) {
    if (b.type === 'comment') continue
    if (polylineHitsRect(points, blockWireGeometry(b).rect)) ids.add(id)
  }
  return ids
}

export type RepairResult =
  | { kind: 'unchanged' }
  | { kind: 'repaired'; waypoints: Pt[] }
  | { kind: 'cleared' }

/**
 * Repair the waypoints of one wire after its source or target block changed.
 * Pure. `before` and `after` hold the sheet's blocks by id.
 */
export function repairWireWaypoints(
  wire: WireData,
  before: Map<string, BlockData>,
  after: Map<string, BlockData>,
): RepairResult {
  const waypoints = wire.routing?.waypoints
  if (!waypoints || waypoints.length === 0) return { kind: 'unchanged' }
  const s0 = before.get(wire.sourceBlockId), t0 = before.get(wire.targetBlockId)
  const s1 = after.get(wire.sourceBlockId), t1 = after.get(wire.targetBlockId)
  if (!s0 || !t0 || !s1 || !t1) return { kind: 'unchanged' }
  // Enable and reset wires attach to the top or bottom: no repair rule
  if (wire.targetPortIndex < 0) return { kind: 'cleared' }

  const oldSrc = blockWireGeometry(s0).sourceEnd(wire.sourcePortIndex)
  const oldTgt = blockWireGeometry(t0).targetEnd(wire.targetPortIndex)
  const newSrc = blockWireGeometry(s1).sourceEnd(wire.sourcePortIndex)
  const newTgt = blockWireGeometry(t1).targetEnd(wire.targetPortIndex)

  const oldPath = [oldSrc, ...waypoints, oldTgt]
  const srcMoved = !same(oldSrc.x, newSrc.x) || !same(oldSrc.y, newSrc.y)
  const tgtMoved = !same(oldTgt.x, newTgt.x) || !same(oldTgt.y, newTgt.y)
  // A port that changed sides (the block was flipped): the old path does not apply
  if (oldSrc.dir !== newSrc.dir || oldTgt.dir !== newTgt.dir) return { kind: 'cleared' }

  let next: Pt[] = waypoints.map(p => ({ x: p.x, y: p.y }))
  if (srcMoved && tgtMoved
    && same(newSrc.x - oldSrc.x, newTgt.x - oldTgt.x) && same(newSrc.y - oldSrc.y, newTgt.y - oldTgt.y)) {
    // 1. Moved together
    const dx = newSrc.x - oldSrc.x, dy = newSrc.y - oldSrc.y
    next = next.map(p => ({ x: p.x + dx, y: p.y + dy }))
  } else {
    // 2. Move the end waypoints. The old path must be orthogonal with
    // horizontal end segments, else there is nothing to keep.
    if (!orthogonal(oldPath) || next.length < 2) return { kind: 'cleared' }
    if (!same(next[0].y, oldSrc.y) || !same(next[next.length - 1].y, oldTgt.y)) return { kind: 'cleared' }
    // Out of the source port in its direction (dir), into the target port from its front
    if (srcMoved) {
      const first = next[0]
      const d = newSrc.dir
      if (Math.sign(first.x - oldSrc.x) !== Math.sign(first.x - newSrc.x) || (first.x - newSrc.x) * d <= 0) {
        return { kind: 'cleared' }
      }
      first.y = newSrc.y
    }
    if (tgtMoved) {
      const last = next[next.length - 1]
      const d = newTgt.dir
      if (Math.sign(oldTgt.x - last.x) !== Math.sign(newTgt.x - last.x) || (last.x - newTgt.x) * d <= 0) {
        return { kind: 'cleared' }
      }
      last.y = newTgt.y
    }
  }

  const newPath = simplify([newSrc, ...next, newTgt])
  if (!orthogonal(newPath)) return { kind: 'cleared' }
  // 3. No new block in the way
  const was = hits(oldPath, before)
  for (const id of hits(newPath, after)) if (!was.has(id)) return { kind: 'cleared' }
  if (!srcMoved && !tgtMoved) return { kind: 'unchanged' }
  const bends = newPath.slice(1, -1)
  if (bends.length === 0) return { kind: 'cleared' } // straight now: the default shape is the same
  return { kind: 'repaired', waypoints: bends }
}

/**
 * Repair or clear the waypoints of the wires of changed blocks. A block has
 * changed when its position, stored size or other size inputs differ between
 * `before` and `after`. Returns `wires` itself when no wire changed.
 */
export function repairWiresAfterBlockChange(
  wires: WireData[],
  before: BlockData[],
  after: BlockData[],
): WireData[] {
  const beforeById = new Map(before.map(b => [b.id, b]))
  const afterById = new Map(after.map(b => [b.id, b]))
  const changed = new Set<string>()
  const flipped = new Set<string>()
  for (const b of after) {
    const old = beforeById.get(b.id)
    if (old && old !== b && geometryKey(old) !== geometryKey(b)) changed.add(b.id)
    if (old && (old.parameters?.flipped === true) !== (b.parameters?.flipped === true)) flipped.add(b.id)
  }
  if (changed.size === 0) return wires

  let any = false
  const out = wires.map(wire => {
    if (!wire.routing) return wire
    if (!changed.has(wire.sourceBlockId) && !changed.has(wire.targetBlockId)) return wire
    if (!wire.routing.waypoints?.length) {
      // A turn offset was for the old port sides of a flipped block
      if (wire.routing.midpointOffset === undefined) return wire
      if (!flipped.has(wire.sourceBlockId) && !flipped.has(wire.targetBlockId)) return wire
      any = true
      return { ...wire, routing: undefined }
    }
    const r = repairWireWaypoints(wire, beforeById, afterById)
    if (r.kind === 'unchanged') return wire
    any = true
    if (r.kind === 'cleared') return { ...wire, routing: undefined }
    return { ...wire, routing: { waypoints: r.waypoints } }
  })
  return any ? out : wires
}
