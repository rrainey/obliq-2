import {
  computeWireDecorations, segmentPathWithHops, hopsOnSegment, polylineWithHops, pointOnPolyline,
  hopRadius, junctionRadius, sheetDecorationWires, wireLineCount,
  HOP_RADIUS, JUNCTION_RADIUS, type DecorationWire,
} from '@/lib/wireDecorations'
import { defaultWireRoute } from '@/lib/layout/blockGeometry'
import type { BlockData } from '@/components/BlockNode'

const w = (id: string, net: string, ...pts: Array<[number, number]>): DecorationWire =>
  ({ id, net, points: pts.map(([x, y]) => ({ x, y })) })

describe('hops', () => {
  test('a single crossing: the horizontal wire hops over the vertical wire', () => {
    const d = computeWireDecorations([
      w('v', 'B', [50, -50], [50, 50]),
      w('h', 'A', [0, 0], [100, 0]),
    ])
    expect(d.crossings).toBe(1)
    expect(d.hopped).toBe(1)
    expect(d.hops.get('v')).toBeUndefined()
    expect(d.hops.get('h')).toEqual([{
      segment: 0, from: { x: 50 - HOP_RADIUS, y: 0 }, to: { x: 50 + HOP_RADIUS, y: 0 }, radius: HOP_RADIUS, nets: ['B'],
    }])
  })

  test('a hop follows the direction of its segment', () => {
    const d = computeWireDecorations([w('h', 'A', [100, 0], [0, 0]), w('v', 'B', [50, 50], [50, -50])])
    const [hop] = d.hops.get('h')!
    expect(hop.from.x).toBeCloseTo(54.5)
    expect(hop.to.x).toBeCloseTo(45.5)
  })

  test('parallel wires and wires that only touch do not cross', () => {
    const d = computeWireDecorations([
      w('a', 'A', [0, 0], [100, 0]),
      w('b', 'B', [0, 20], [100, 20]),
      w('c', 'C', [50, 0], [50, 60]), // ends on wire a: a touch, not a crossing
    ])
    expect(d.crossings).toBe(1) // c crosses b only
    expect(d.hops.get('a')).toBeUndefined()
    expect(d.hops.get('b')).toHaveLength(1)
  })

  test('wires of one net never hop, and a crossing without a join gets no dot', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [100, 0]),
      w('a2', 'A', [50, -50], [50, 50]),
    ])
    expect(d.crossings).toBe(0)
    expect(d.hops.size).toBe(0)
    expect(d.junctions).toHaveLength(0)
  })

  test('a crossing near a corner of the hopping wire is drawn plain', () => {
    const d = computeWireDecorations([
      w('h', 'A', [0, 0], [100, 0], [100, 50]),
      w('v', 'B', [97, -50], [97, 50]),
    ])
    expect(d.crossings).toBe(1)
    expect(d.hopped).toBe(0)
    expect(d.hops.size).toBe(0)
  })

  test('a crossing near a wire end is drawn plain, so that the hop cannot touch the arrowhead', () => {
    const d = computeWireDecorations([
      w('h', 'A', [0, 0], [100, 0]),
      w('v1', 'B', [8, -50], [8, 50]),
      w('v2', 'C', [90, -50], [90, 50]),
    ])
    expect(d.crossings).toBe(2)
    expect(d.hops.size).toBe(0)
  })

  test('the crossed wire must not end or turn inside the hop', () => {
    // B ends 3 px above the line: its end is inside the arc
    const above = computeWireDecorations([w('h', 'A', [0, 0], [100, 0]), w('v', 'B', [50, -3], [50, 50])])
    expect(above.crossings).toBe(1)
    expect(above.hopped).toBe(0)
    // B ends 3 px below the line: the arc is clear of it
    const below = computeWireDecorations([w('h', 'A', [0, 0], [100, 0]), w('v', 'B', [50, -50], [50, 3])])
    expect(below.hopped).toBe(1)
  })

  test('several hops on one segment: far apart they stay separate, close together they join', () => {
    const apart = computeWireDecorations([
      w('h', 'A', [0, 0], [100, 0]),
      w('v1', 'B', [40, -50], [40, 50]),
      w('v2', 'C', [60, -50], [60, 50]),
    ])
    expect(apart.hops.get('h')).toHaveLength(2)

    const close = computeWireDecorations([
      w('h', 'A', [0, 0], [100, 0]),
      w('v1', 'B', [40, -50], [40, 50]),
      w('v2', 'C', [48, -50], [48, 50]),
    ])
    const hops = close.hops.get('h')!
    expect(hops).toHaveLength(1)
    expect(hops[0].from.x).toBeCloseTo(40 - HOP_RADIUS)
    expect(hops[0].to.x).toBeCloseTo(48 + HOP_RADIUS)
    expect(hops[0].nets).toEqual(['B', 'C'])
    expect(close.hopped).toBe(2)
  })

  test('a shared trunk hops on each wire that draws it', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [100, 0]),
      w('a2', 'A', [0, 0], [70, 0], [70, 60]),
      w('v', 'B', [40, -50], [40, 50]),
    ])
    expect(d.crossings).toBe(1)
    expect(d.hops.get('a1')).toHaveLength(1)
    expect(d.hops.get('a2')).toHaveLength(1)
  })

  test('a branch that leaves the trunk inside the hop drops the hop for the whole net', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [100, 0]),
      w('a2', 'A', [0, 0], [43, 0], [43, 60]),
      w('v', 'B', [40, -50], [40, 50]),
    ])
    expect(d.hops.size).toBe(0)
  })

  test('waypoint wires: a diagonal segment is nearer to horizontal than a vertical one, so it hops', () => {
    const d = computeWireDecorations([
      w('d', 'A', [0, 0], [100, 20]),
      w('v', 'B', [50, -50], [50, 50]),
      w('h', 'C', [0, 40], [100, 40]),
      w('d2', 'D', [85, 30], [90, 80]), // steep: the horizontal wire hops over it
    ])
    expect(d.hops.get('d')).toHaveLength(1)
    expect(d.hops.get('v')).toBeUndefined()
    const hop = d.hops.get('d')![0]
    expect(Math.hypot(hop.to.x - hop.from.x, hop.to.y - hop.from.y)).toBeCloseTo(2 * HOP_RADIUS)
    expect(d.hops.get('h')).toHaveLength(1)
    expect(d.hops.get('d2')).toBeUndefined()
  })

  test('a five-segment default path (a wire to a flipped block) hops on its horizontal run', () => {
    // A wire whose target is behind its source: out of the source, around, into the target
    const route = defaultWireRoute(
      { x: 106, y: 30, dir: 1 }, { x: -6, y: 30, dir: -1 }, 0,
      { source: { x: 0, y: 0, w: 100, h: 60 }, target: { x: -100, y: 100, w: 94, h: 60 } },
    )
    expect(route.shape).toBe('loop')
    const run = route.points[2].y
    const d = computeWireDecorations([
      { id: 'loop', net: 'A', points: route.points },
      w('v', 'B', [50, run - 40], [50, run + 40]),
    ])
    const hops = d.hops.get('loop')!
    expect(hops).toHaveLength(1)
    expect(hops[0].segment).toBe(2)
    expect(hops[0].from.y).toBeCloseTo(run)
  })

  test('the hop radius grows for vector and matrix wires', () => {
    expect(hopRadius(1, 1)).toBe(HOP_RADIUS)
    expect(hopRadius(2, 1)).toBeGreaterThan(HOP_RADIUS)
    expect(hopRadius(3, 1)).toBeGreaterThan(hopRadius(2, 1))
    expect(hopRadius(1, 3)).toBeGreaterThan(HOP_RADIUS)
    // The inner arc of a bundle stays clear of its own inner line
    expect(hopRadius(3, 1) - 3.5).toBeGreaterThan(3.5)
    expect(junctionRadius(1)).toBe(JUNCTION_RADIUS)
    expect(junctionRadius(3)).toBeGreaterThan(JUNCTION_RADIUS)
  })
})

describe('junctions', () => {
  test('a T junction gets one dot, drawn by one wire', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [100, 0]),
      w('a2', 'A', [0, 0], [50, 0], [50, 50]),
    ])
    expect(d.junctions).toEqual([{ net: 'A', x: 50, y: 0, radius: JUNCTION_RADIUS }])
    expect(d.dots.get('a1')).toEqual([{ x: 50, y: 0, radius: JUNCTION_RADIUS }])
    expect(d.dots.get('a2')).toBeUndefined()
  })

  test('a four-way junction gets one dot', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [100, 0]),
      w('a2', 'A', [0, 0], [50, 0], [50, 50]),
      w('a3', 'A', [0, 0], [50, 0], [50, -50]),
    ])
    expect(d.junctions).toHaveLength(1)
    expect(d.junctions[0]).toMatchObject({ x: 50, y: 0 })
  })

  test('corners, a shared corner and the port ends get no dot', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [30, 0], [30, 40], [100, 40]),
      w('a2', 'A', [0, 0], [30, 0], [30, 80], [100, 80]),
    ])
    // The branch leaves the shared prefix at (30, 40); (30, 0) is a corner of both wires
    expect(d.junctions.map(j => [j.x, j.y])).toEqual([[30, 40]])
  })

  test('a single wire has no junction', () => {
    const d = computeWireDecorations([w('a', 'A', [0, 0], [50, 0], [50, 50], [100, 50])])
    expect(d.junctions).toHaveLength(0)
  })

  test('the dot owner is a wire that passes through the junction', () => {
    const d = computeWireDecorations([
      w('a1', 'A', [0, 0], [20, 0], [20, 80], [100, 80]),
      w('a2', 'A', [0, 0], [20, 0], [20, 40], [100, 40]),
    ])
    expect(d.junctions).toHaveLength(1)
    const [owner] = [...d.dots.keys()]
    expect(owner).toBe('a1')
    expect(pointOnPolyline(d.junctions[0], [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 80 }])).toBe(true)
  })
})

describe('drawing helpers', () => {
  const hop = { segment: 0, from: { x: 45.5, y: 0 }, to: { x: 54.5, y: 0 }, radius: 4.5 }

  test('SVG path: a semicircular hop that bulges up on a wire to the right', () => {
    expect(segmentPathWithHops({ x: 0, y: 0 }, { x: 100, y: 0 }, [hop]))
      .toBe('M 0 0 L 45.5 0 A 4.5 4.5 0 0 1 50 -4.5 A 4.5 4.5 0 0 1 54.5 0 L 100 0')
  })

  test('SVG path: a wire to the left also bulges up', () => {
    const left = { segment: 0, from: { x: 54.5, y: 0 }, to: { x: 45.5, y: 0 }, radius: 4.5 }
    expect(segmentPathWithHops({ x: 100, y: 0 }, { x: 0, y: 0 }, [left]))
      .toBe('M 100 0 L 54.5 0 A 4.5 4.5 0 0 0 50 -4.5 A 4.5 4.5 0 0 0 45.5 0 L 0 0')
  })

  test('SVG path: a joined hop has a straight run at the hop height', () => {
    const wide = { segment: 0, from: { x: 35.5, y: 0 }, to: { x: 52.5, y: 0 }, radius: 4.5 }
    expect(segmentPathWithHops({ x: 0, y: 0 }, { x: 100, y: 0 }, [wide]))
      .toBe('M 0 0 L 35.5 0 A 4.5 4.5 0 0 1 40 -4.5 L 48 -4.5 A 4.5 4.5 0 0 1 52.5 0 L 100 0')
  })

  test('a hop that no longer fits its segment (the segment moved) is not drawn', () => {
    expect(hopsOnSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, [hop], 0)).toHaveLength(1)
    expect(hopsOnSegment({ x: 0, y: 10 }, { x: 100, y: 10 }, [hop], 0)).toHaveLength(0)
    expect(hopsOnSegment({ x: 0, y: 0 }, { x: 50, y: 0 }, [hop], 0)).toHaveLength(0)
    expect(hopsOnSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, [hop], 1)).toHaveLength(0)
  })

  test('the sampled polyline keeps its ends and rises to the hop height', () => {
    const pts = polylineWithHops([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], [hop])
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 50 })
    const ys = pts.slice(0, -1).map(p => p.y)
    expect(Math.min(...ys)).toBeCloseTo(-4.5)
    expect(Math.max(...ys)).toBeCloseTo(0)
    // Only the hop adds points
    expect(polylineWithHops([{ x: 0, y: 0 }, { x: 100, y: 0 }], undefined)).toHaveLength(2)
  })

  test('the line count of a wire comes from its type', () => {
    expect(wireLineCount('double')).toBe(1)
    expect(wireLineCount('double[3]')).toBe(2)
    expect(wireLineCount('double[3][3]')).toBe(3)
    expect(wireLineCount(undefined)).toBe(1)
  })
})

describe('sheet adapter', () => {
  const block = (id: string, type: string, x: number, y: number, params: Record<string, any> = {}): BlockData =>
    ({ id, type, name: id, position: { x, y }, parameters: params } as BlockData)

  test('wires start and end HANDLE_OUTSET px outside the ports; control and comment wires are left out', () => {
    const blocks = [
      block('s', 'source', 0, 0, { value: 1 }),
      block('g', 'scale', 200, 0, { gain: 2 }),
      block('c', 'comment', 400, 0),
    ]
    const wires = [
      { id: 'w1', sourceBlockId: 's', sourcePortIndex: 0, targetBlockId: 'g', targetPortIndex: 0 },
      { id: 'w2', sourceBlockId: 's', sourcePortIndex: 0, targetBlockId: 'g', targetPortIndex: -1 },
      { id: 'w3', sourceBlockId: 'g', sourcePortIndex: 0, targetBlockId: 'c', targetPortIndex: 0 },
    ]
    const dw = sheetDecorationWires(blocks, wires as any)
    expect(dw.map(x => x.id)).toEqual(['w1'])
    expect(dw[0].net).toBe('s:0')
    expect(dw[0].points[0].x).toBe(80 + 6)
    expect(dw[0].points[dw[0].points.length - 1].x).toBe(200 - 6)
  })

  test('a wire into a flipped block enters from the right', () => {
    const blocks = [
      block('s', 'source', 0, 0, { value: 1 }),
      block('g', 'scale', 200, 200, { gain: 2, flipped: true }),
    ]
    const dw = sheetDecorationWires(blocks, [
      { id: 'w', sourceBlockId: 's', sourcePortIndex: 0, targetBlockId: 'g', targetPortIndex: 0 },
    ] as any)
    const last = dw[0].points[dw[0].points.length - 1]
    expect(last.x).toBe(200 + 80 + 6)
  })
})
