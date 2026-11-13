// Waypoint repair after a block move or resize (src/lib/layout/waypointRepair.ts).
//
// A `scale` block is 80 x 64 px with one port at mid-height: its output end is
// at (x + 86, y + 32) and its input end at (x - 6, y + 32).

import { repairWiresAfterBlockChange, repairWireWaypoints } from '@/lib/layout/waypointRepair'
import { scoreSheetLayout } from '@/lib/layout/layoutMetrics'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

const blk = (id: string, x: number, y: number, type = 'scale', parameters: Record<string, any> = { gain: 1 }): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters })
const wire = (id: string, s: string, t: string, routing?: WireData['routing'], tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: 0, targetBlockId: t, targetPortIndex: tp, routing })
const moved = (blocks: BlockData[], id: string, x: number, y: number) =>
  blocks.map(b => (b.id === id ? { ...b, position: { x, y } } : b))

// a at (0, 0): source end (86, 32). c at (400, 0): target end (394, 32).
// The wire goes around the block m at (200, 0): right, down, right, up, right.
const around = [{ x: 150, y: 32 }, { x: 150, y: 120 }, { x: 350, y: 120 }, { x: 350, y: 32 }]
const before = [blk('a', 0, 0), blk('m', 200, 0), blk('c', 400, 0)]
const w = wire('w', 'a', 'c', { waypoints: around })

describe('repairWiresAfterBlockChange', () => {
  it('moves the first waypoint to the new source port y after a vertical move', () => {
    const after = moved(before, 'a', 0, -20)
    const [r] = repairWiresAfterBlockChange([w], before, after)
    expect(r.routing).toEqual({ waypoints: [{ x: 150, y: 12 }, { x: 150, y: 120 }, { x: 350, y: 120 }, { x: 350, y: 32 }] })
    expect(scoreSheetLayout(after, [r])).toMatchObject({ diagonalSegments: 0, throughBlock: 0 })
  })

  it('moves the last waypoint to the new target port y', () => {
    const after = moved(before, 'c', 400, 30)
    const [r] = repairWiresAfterBlockChange([w], before, after)
    expect(r.routing?.waypoints?.[3]).toEqual({ x: 350, y: 62 })
    expect(scoreSheetLayout(after, [r]).diagonalSegments).toBe(0)
  })

  it('keeps the waypoints after a horizontal move that leaves the end segment in its direction', () => {
    const after = moved(before, 'a', -40, 0)
    const [r] = repairWiresAfterBlockChange([w], before, after)
    expect(r.routing).toEqual({ waypoints: around })
  })

  it('moves all waypoints when both ends move together', () => {
    const after = before.map(b => ({ ...b, position: { x: b.position.x + 10, y: b.position.y + 50 } }))
    const [r] = repairWiresAfterBlockChange([w], before, after)
    expect(r.routing?.waypoints).toEqual(around.map(p => ({ x: p.x + 10, y: p.y + 50 })))
  })

  it('clears the routing when the source moves past the first bend', () => {
    // Source end at 186 + ... is right of the bend at x = 150
    const after = moved(before, 'a', 100, 0)
    const [r] = repairWiresAfterBlockChange([w], before, after)
    expect(r.routing).toBeUndefined()
  })

  it('clears the routing when the repaired wire would go through a block', () => {
    // a moves down: its new end segment at y = 152 is below the detour at y = 120.
    // The block k (x 110..190, y 130..194) is not on the old path, but it is
    // on the new end segment and on the new vertical run at x = 150.
    const withBlock = [...before, blk('k', 110, 130)]
    const after = moved(withBlock, 'a', 0, 120)
    const [r] = repairWiresAfterBlockChange([w], withBlock, after)
    expect(r.routing).toBeUndefined()
  })

  it('clears the routing when a resize moves the wire end past the first bend', () => {
    // a grows from 80 px to 200 px wide: its output end moves from x = 86 to x = 206
    const sub = (wd: number) => blk('a', 0, 0, 'subsystem', { inputPorts: [], outputPorts: ['y'], sheets: [], width: wd, height: 64 })
    const b0 = [sub(80), blk('m', 200, 0), blk('c', 400, 0)]
    const b1 = [sub(200), blk('m', 200, 0), blk('c', 400, 0)]
    const [r] = repairWiresAfterBlockChange([w], b0, b1)
    expect(r.routing).toBeUndefined()
  })

  it('moves the first waypoint when a resize moves the source port', () => {
    // a grows from 64 px to 100 px high: its single port moves from y = 32 to y = 50
    const sub = (h: number) => blk('a', 0, 0, 'subsystem', { inputPorts: [], outputPorts: ['y'], sheets: [], width: 80, height: h })
    const b0 = [sub(64), blk('m', 200, 0), blk('c', 400, 0)]
    const b1 = [sub(100), blk('m', 200, 0), blk('c', 400, 0)]
    const [r] = repairWiresAfterBlockChange([w], b0, b1)
    expect(r.routing?.waypoints?.[0]).toEqual({ x: 150, y: 50 })
    expect(scoreSheetLayout(b1, [r])).toMatchObject({ diagonalSegments: 0, throughBlock: 0 })
  })

  it('does not look at wires of other blocks: a block that grows over a wire leaves it as it is', () => {
    // m is not an end of w. The repair looks only at the wires of changed blocks.
    const sub = (h: number) => blk('m', 200, 0, 'subsystem', { inputPorts: [], outputPorts: [], sheets: [], width: 80, height: h })
    const b0 = [blk('a', 0, 0), sub(64), blk('c', 400, 0)]
    const b1 = [blk('a', 0, 0), sub(200), blk('c', 400, 0)]
    const wires = [w]
    expect(repairWiresAfterBlockChange(wires, b0, b1)).toBe(wires)
  })

  it('clears a route that is no longer orthogonal at its ends', () => {
    const bad = wire('w', 'a', 'c', { waypoints: [{ x: 150, y: 40 }, { x: 350, y: 40 }] })
    const [r] = repairWiresAfterBlockChange([bad], before, moved(before, 'a', 0, 10))
    expect(r.routing).toBeUndefined()
  })

  it('leaves wires of blocks that did not change, and wires without waypoints', () => {
    const other = wire('o', 'm', 'c', { midpointOffset: 12 })
    const far = wire('f', 'm', 'c', { waypoints: [{ x: 300, y: 32 }, { x: 300, y: 32 }] })
    const wires = [other, far]
    expect(repairWiresAfterBlockChange(wires, before, moved(before, 'a', 0, 50))).toBe(wires)
  })

  it('returns the same array when no block changed', () => {
    const wires = [w]
    expect(repairWiresAfterBlockChange(wires, before, [...before])).toBe(wires)
  })

  it('clears an enable wire with waypoints', () => {
    const ctl = wire('e', 'a', 'c', { waypoints: [{ x: 150, y: 32 }, { x: 150, y: -50 }] }, -1)
    const after = moved(before, 'a', 0, 10)
    expect(repairWireWaypoints(ctl, new Map(before.map(b => [b.id, b])), new Map(after.map(b => [b.id, b])))).toEqual({ kind: 'cleared' })
  })

  it('clears the routing when the move makes the wire straight', () => {
    // A two-bend waypoint route; c moves up so that its port is on the source row
    const z = wire('z', 'a', 'c', { waypoints: [{ x: 200, y: 32 }, { x: 200, y: 132 }] })
    const b0 = [blk('a', 0, 0), blk('c', 400, 100)]
    const [r] = repairWiresAfterBlockChange([z], b0, moved(b0, 'c', 400, 0))
    expect(r.routing).toBeUndefined()
  })
})
