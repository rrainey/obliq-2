import { computeAutoLayout } from '@/lib/layout/autoLayout'
import { getBlockHeight, portOffsetY } from '@/lib/layout/blockGeometry'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

const block = (
  id: string,
  type: string,
  parameters: Record<string, any> = {},
  y = 0,
): BlockData => ({ id, type, name: id, position: { x: 0, y }, parameters })

const wire = (
  id: string,
  sourceBlockId: string,
  sourcePortIndex: number,
  targetBlockId: string,
  targetPortIndex: number,
): WireData => ({ id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex })

const layout = (
  blocks: BlockData[],
  wires: WireData[],
  options?: Parameters<typeof computeAutoLayout>[2],
) => computeAutoLayout(blocks, wires, options).moves

const posOf = (moves: ReturnType<typeof layout>, id: string) =>
  moves.find(m => m.id === id)!.position

describe('computeAutoLayout', () => {
  describe('left-to-right ranking', () => {
    it('places sources left of sinks', () => {
      const blocks = [
        block('src', 'source'),
        block('gain', 'scale'),
        block('out', 'output_port'),
      ]
      const wires = [wire('w1', 'src', 0, 'gain', 0), wire('w2', 'gain', 0, 'out', 0)]
      const moves = layout(blocks, wires)

      expect(posOf(moves, 'src').x).toBeLessThan(posOf(moves, 'gain').x)
      expect(posOf(moves, 'gain').x).toBeLessThan(posOf(moves, 'out').x)
    })

    it('orders a chained integrator pair lowest-derivative first despite feedback', () => {
      // in -> sum -> i1 -> i2 -> out, with i2 feeding back into sum.
      const blocks = [
        block('in', 'input_port'),
        block('sum', 'sum', { signs: '++' }),
        block('i1', 'integrator'),
        block('i2', 'integrator'),
        block('out', 'output_port'),
      ]
      const wires = [
        wire('w1', 'in', 0, 'sum', 0),
        wire('w2', 'sum', 0, 'i1', 0),
        wire('w3', 'i1', 0, 'i2', 0),
        wire('w4', 'i2', 0, 'out', 0),
        wire('w5', 'i2', 0, 'sum', 1), // feedback
      ]
      const moves = layout(blocks, wires)

      expect(posOf(moves, 'i1').x).toBeLessThan(posOf(moves, 'i2').x)
      expect(posOf(moves, 'sum').x).toBeLessThan(posOf(moves, 'i1').x)
    })
  })

  describe('local plumbing: Goto / From', () => {
    // in -> g1 -> g2 -> g3 -> out, with g1 also driving a Goto and a From feeding g3.
    const blocks = [
      block('in', 'input_port'),
      block('g1', 'scale'),
      block('g2', 'scale'),
      block('g3', 'sum', { signs: '++' }),
      block('out', 'output_port'),
      block('goto', 'sheet_label_sink', { signalName: 'a' }),
      block('from', 'sheet_label_source', { signalName: 'b' }),
    ]
    const wires = [
      wire('w1', 'in', 0, 'g1', 0),
      wire('w2', 'g1', 0, 'g2', 0),
      wire('w3', 'g2', 0, 'g3', 0),
      wire('w4', 'g3', 0, 'out', 0),
      wire('w5', 'g1', 0, 'goto', 0),
      wire('w6', 'from', 0, 'g3', 1),
    ]
    const moves = layout(blocks, wires)
    const x = (id: string) => posOf(moves, id).x

    it('keeps a Goto one column after the block that drives it', () => {
      expect(x('goto')).toBe(x('g2'))
      expect(x('goto')).toBeLessThan(x('out'))
    })

    it('moves a From to just before the block it feeds', () => {
      expect(x('from')).toBe(x('g2'))
      expect(x('from')).toBeGreaterThan(x('in'))
    })

    it('still pins the sheet boundary: Input Ports left, Output Ports right', () => {
      const xs = moves.map(m => m.position.x)
      expect(x('in')).toBe(Math.min(...xs))
      expect(x('out')).toBe(Math.max(...xs))
    })
  })

  describe('feedback loops', () => {
    it('puts blocks wired alike in the same column (four motors on one battery)', () => {
      // split feeds four motors; each motor feeds a power mux; the mux feeds the
      // battery, whose voltage goes back to every motor (a loop through each)
      const blocks = [
        block('in', 'input_port'),
        block('split', 'demux', { outputCount: 4 }),
        ...['m0', 'm1', 'm2', 'm3'].map(id => block(id, 'sum', { signs: '++' })),
        block('mux', 'mux', { rows: 4, cols: 1 }),
        block('battery', 'scale'),
        block('out', 'output_port'),
      ]
      const wires = [
        wire('w0', 'in', 0, 'split', 0),
        ...[0, 1, 2, 3].flatMap(i => [
          wire(`s${i}`, 'split', i, `m${i}`, 0),
          wire(`p${i}`, `m${i}`, 0, 'mux', i),
          wire(`v${i}`, 'battery', 0, `m${i}`, 1),
        ]),
        wire('wb', 'mux', 0, 'battery', 0),
        wire('wo', 'battery', 0, 'out', 0),
      ]
      const moves = layout(blocks, wires)
      const x = (id: string) => posOf(moves, id).x
      expect(new Set(['m0', 'm1', 'm2', 'm3'].map(x)).size).toBe(1)
      // Flow reads outward from the input; the battery's voltage is the feedback
      expect(x('split')).toBeLessThan(x('m0'))
      expect(x('m0')).toBeLessThan(x('mux'))
      expect(x('mux')).toBeLessThan(x('battery'))
    })
  })

  describe('long wires', () => {
    it('orders Output Ports by the ports that feed them, however far back', () => {
      // Path A (seeded at the top) is a long chain; path B (seeded at the bottom)
      // reaches its Output Port from column 1, far from the output column. The
      // outputs are seeded in the opposite order to their sources.
      const blocks = [
        block('inA', 'input_port', {}, 0),
        block('a1', 'scale', {}, 0),
        block('a2', 'scale', {}, 0),
        block('a3', 'scale', {}, 0),
        block('outA', 'output_port', {}, 500),
        block('inB', 'input_port', {}, 500),
        block('b1', 'scale', {}, 500),
        block('outB', 'output_port', {}, 0),
      ]
      const wires = [
        wire('w1', 'inA', 0, 'a1', 0),
        wire('w2', 'a1', 0, 'a2', 0),
        wire('w3', 'a2', 0, 'a3', 0),
        wire('w4', 'a3', 0, 'outA', 0),
        wire('w5', 'inB', 0, 'b1', 0),
        wire('w6', 'b1', 0, 'outB', 0),
      ]
      const moves = layout(blocks, wires)
      const y = (id: string) => posOf(moves, id).y

      // Which path ends up on top is immaterial; the outputs must follow their sources.
      expect(Math.sign(y('outA') - y('outB'))).toBe(Math.sign(y('a3') - y('b1')))
      // Both wires into the outputs end up straight (port to port).
      const portY = (id: string) => {
        const b = blocks.find(x => x.id === id)!
        const outs = b.type === 'output_port' ? 0 : 1
        return y(id) + portOffsetY(0, 1, getBlockHeight(b, 1, outs))
      }
      expect(Math.abs(portY('outA') - portY('a3'))).toBeLessThanOrEqual(0.5)
      expect(Math.abs(portY('outB') - portY('b1'))).toBeLessThanOrEqual(0.5)
    })
  })

  describe('1A: port-aware vertical ordering', () => {
    it('orders downstream blocks by the subsystem output port that feeds them', () => {
      const sub = block('sub', 'subsystem', {
        inputPorts: ['In1'],
        outputPorts: ['A', 'B', 'C', 'D'],
        sheets: [],
      })
      // Seed the consumers in deliberately reversed y so the result cannot be
      // an accident of the initial ordering.
      const blocks = [
        block('feed', 'source'),
        sub,
        block('cA', 'scale', {}, 400),
        block('cB', 'scale', {}, 300),
        block('cC', 'scale', {}, 200),
        block('cD', 'scale', {}, 100),
      ]
      const wires = [
        wire('w0', 'feed', 0, 'sub', 0),
        wire('wA', 'sub', 0, 'cA', 0),
        wire('wB', 'sub', 1, 'cB', 0),
        wire('wC', 'sub', 2, 'cC', 0),
        wire('wD', 'sub', 3, 'cD', 0),
      ]
      const moves = layout(blocks, wires)

      const ys = ['cA', 'cB', 'cC', 'cD'].map(id => posOf(moves, id).y)
      // Port 0 is topmost, so its consumer must be topmost, and so on down.
      expect(ys[0]).toBeLessThan(ys[1])
      expect(ys[1]).toBeLessThan(ys[2])
      expect(ys[2]).toBeLessThan(ys[3])
    })

    it('orders upstream blocks by the subsystem input port they feed', () => {
      const sub = block('sub', 'subsystem', {
        inputPorts: ['P', 'Q', 'R'],
        outputPorts: ['Out'],
        sheets: [],
      })
      const blocks = [
        block('sP', 'source', {}, 300),
        block('sQ', 'source', {}, 200),
        block('sR', 'source', {}, 100),
        sub,
      ]
      const wires = [
        wire('wP', 'sP', 0, 'sub', 0),
        wire('wQ', 'sQ', 0, 'sub', 1),
        wire('wR', 'sR', 0, 'sub', 2),
      ]
      const moves = layout(blocks, wires)

      expect(posOf(moves, 'sP').y).toBeLessThan(posOf(moves, 'sQ').y)
      expect(posOf(moves, 'sQ').y).toBeLessThan(posOf(moves, 'sR').y)
    })
  })

  describe('1C: port-aligned coordinates', () => {
    it('makes a simple chain perfectly horizontal', () => {
      const blocks = [
        block('src', 'source'),
        block('gain', 'scale'),
        block('out', 'output_port'),
      ]
      const wires = [wire('w1', 'src', 0, 'gain', 0), wire('w2', 'gain', 0, 'out', 0)]
      const moves = layout(blocks, wires)

      const portY = (id: string, port: number, count: number) => {
        const b = blocks.find(x => x.id === id)!
        const h = getBlockHeight(b, 1, id === 'out' ? 0 : 1)
        return posOf(moves, id).y + portOffsetY(port, count, h)
      }
      // Single-port blocks centre their port, so every wire should be flat.
      // Tolerance is sub-pixel: final positions are rounded to integers and
      // the terminator block's 45px height puts its centre on a half-pixel.
      expect(Math.abs(portY('src', 0, 1) - portY('gain', 0, 1))).toBeLessThanOrEqual(0.5)
      expect(Math.abs(portY('gain', 0, 1) - portY('out', 0, 1))).toBeLessThanOrEqual(0.5)
    })

    // Consumers need `blockHeight + rowSpacing` (64 + 80 = 144px) of vertical
    // clearance, while a subsystem's ports are only `height/(n+1)` apart. Exact
    // alignment is therefore only reachable on a subsystem tall enough to space
    // its ports beyond that clearance -- 800px for three ports (200px apart).
    const SUB_HEIGHT = 800

    it('aligns each consumer with the specific output port feeding it', () => {
      const sub = block('sub', 'subsystem', {
        inputPorts: ['In1'],
        outputPorts: ['A', 'B', 'C'],
        sheets: [],
        height: SUB_HEIGHT,
      })
      const blocks = [
        block('feed', 'source'),
        sub,
        block('cA', 'scale'),
        block('cB', 'scale'),
        block('cC', 'scale'),
      ]
      const wires = [
        wire('w0', 'feed', 0, 'sub', 0),
        wire('wA', 'sub', 0, 'cA', 0),
        wire('wB', 'sub', 1, 'cB', 0),
        wire('wC', 'sub', 2, 'cC', 0),
      ]
      const moves = layout(blocks, wires)

      const subY = posOf(moves, 'sub').y
      const consumers: Array<[string, number]> = [['cA', 0], ['cB', 1], ['cC', 2]]
      for (const [id, port] of consumers) {
        const srcPortY = subY + portOffsetY(port, 3, SUB_HEIGHT)
        const consumerH = getBlockHeight(blocks.find(b => b.id === id)!, 1, 1)
        const tgtPortY = posOf(moves, id).y + portOffsetY(0, 1, consumerH)
        expect(Math.abs(srcPortY - tgtPortY)).toBeLessThanOrEqual(1)
      }
    })

    it('falls back to order-preserving spacing when ports are too close to align', () => {
      // Default-height subsystem: ports ~20px apart, far below the 144px of
      // clearance consumers need. Alignment is impossible, so the guarantee
      // degrades to correct order plus non-overlap.
      const sub = block('sub', 'subsystem', {
        inputPorts: ['In1'],
        outputPorts: ['A', 'B', 'C'],
        sheets: [],
      })
      const blocks = [
        block('feed', 'source'),
        sub,
        block('cA', 'scale', {}, 300),
        block('cB', 'scale', {}, 200),
        block('cC', 'scale', {}, 100),
      ]
      const wires = [
        wire('w0', 'feed', 0, 'sub', 0),
        wire('wA', 'sub', 0, 'cA', 0),
        wire('wB', 'sub', 1, 'cB', 0),
        wire('wC', 'sub', 2, 'cC', 0),
      ]
      const moves = layout(blocks, wires)

      const yA = posOf(moves, 'cA').y
      const yB = posOf(moves, 'cB').y
      const yC = posOf(moves, 'cC').y
      expect(yA).toBeLessThan(yB)
      expect(yB).toBeLessThan(yC)
      const h = getBlockHeight(blocks[2], 1, 1)
      expect(yB - yA).toBeGreaterThanOrEqual(h + 80 - 0.5)
      expect(yC - yB).toBeGreaterThanOrEqual(h + 80 - 0.5)
    })

    it('never overlaps blocks in a column, even when alignment pulls them together', () => {
      // All three consumers hang off the same port, so all want the same y.
      const blocks = [
        block('src', 'source'),
        block('c1', 'scale'),
        block('c2', 'scale'),
        block('c3', 'scale'),
      ]
      const wires = [
        wire('w1', 'src', 0, 'c1', 0),
        wire('w2', 'src', 0, 'c2', 0),
        wire('w3', 'src', 0, 'c3', 0),
      ]
      const moves = layout(blocks, wires, { rowSpacing: 80 })

      const ys = ['c1', 'c2', 'c3'].map(id => posOf(moves, id).y).sort((a, b) => a - b)
      const h = getBlockHeight(blocks[1], 1, 1)
      expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(h + 80 - 0.5)
      expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(h + 80 - 0.5)
    })

    it('centres the finished layout on originY', () => {
      const blocks = [
        block('src', 'source'),
        block('a', 'scale'),
        block('b', 'scale'),
      ]
      const wires = [wire('w1', 'src', 0, 'a', 0), wire('w2', 'src', 0, 'b', 0)]
      const moves = layout(blocks, wires, { originY: 500 })

      let minY = Infinity, maxY = -Infinity
      for (const m of moves) {
        const b = blocks.find(x => x.id === m.id)!
        const h = getBlockHeight(b, 1, 1)
        minY = Math.min(minY, m.position.y)
        maxY = Math.max(maxY, m.position.y + h)
      }
      expect((minY + maxY) / 2).toBeCloseTo(500, 0)
    })
  })

  describe('resizeBlocks', () => {
    const threePortSubsystem = () => {
      const sub = block('sub', 'subsystem', {
        inputPorts: ['In1'],
        outputPorts: ['A', 'B', 'C'],
        sheets: [],
      })
      const blocks = [
        block('feed', 'source'),
        sub,
        block('cA', 'scale'),
        block('cB', 'scale'),
        block('cC', 'scale'),
      ]
      const wires = [
        wire('w0', 'feed', 0, 'sub', 0),
        wire('wA', 'sub', 0, 'cA', 0),
        wire('wB', 'sub', 1, 'cB', 0),
        wire('wC', 'sub', 2, 'cC', 0),
      ]
      return { blocks, wires }
    }

    it('reports no resizes unless asked', () => {
      const { blocks, wires } = threePortSubsystem()
      expect(computeAutoLayout(blocks, wires).resizes).toEqual([])
    })

    it('grows a subsystem toward its consumers, with ports at most 40px apart by default', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })

      const sub = resizes.find(r => r.id === 'sub')
      expect(sub).toBeDefined()
      // Lining the consumers up exactly would need ports 144px apart (64 + 80
      // of clearance); the default limit stops at (3 + 1) * 40 = 160px, twice
      // the natural 3 * 20 + 20 = 80px.
      expect(sub!.height).toBe(160)
    })

    it('honours a different maximum port spacing', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true, maxPortSpacing: 60 })
      expect(resizes.find(r => r.id === 'sub')!.height).toBe(240)
      // At the natural spacing (or less) nothing grows
      expect(computeAutoLayout(blocks, wires, { resizeBlocks: true, maxPortSpacing: 20 }).resizes).toEqual([])
    })

    it('leaves out neighbours shared with another resizable block', () => {
      // Two subsystems both feed the same three consumers: no heights can line
      // either up with all of them, so neither is grown to try.
      const sub = (id: string) => block(id, 'subsystem', { inputPorts: ['In1'], outputPorts: ['A', 'B', 'C'], sheets: [] })
      const blocks = [block('feed', 'source'), sub('s1'), sub('s2'), block('cA', 'sum'), block('cB', 'sum'), block('cC', 'sum')]
      const wires = [
        wire('f1', 'feed', 0, 's1', 0),
        wire('f2', 'feed', 0, 's2', 0),
        ...['cA', 'cB', 'cC'].flatMap((c, i) => [wire(`a${i}`, 's1', i, c, 0), wire(`b${i}`, 's2', i, c, 1)]),
      ]
      expect(computeAutoLayout(blocks, wires, { resizeBlocks: true }).resizes).toEqual([])
    })

    it('raises a block stored below its natural height, even with nothing to fit', () => {
      // Shared neighbours only, and stored at 60px though 3 ports need 80
      const sub = (id: string) =>
        block(id, 'subsystem', { inputPorts: ['In1'], outputPorts: ['A', 'B', 'C'], sheets: [], height: 60, width: 120 })
      const blocks = [block('feed', 'source'), sub('s1'), sub('s2'), block('cA', 'sum'), block('cB', 'sum'), block('cC', 'sum')]
      const wires = [
        wire('f1', 'feed', 0, 's1', 0),
        wire('f2', 'feed', 0, 's2', 0),
        ...['cA', 'cB', 'cC'].flatMap((c, i) => [wire(`a${i}`, 's1', i, c, 0), wire(`b${i}`, 's2', i, c, 1)]),
      ]
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })
      expect(resizes.map(r => [r.id, r.height]).sort()).toEqual([['s1', 80], ['s2', 80]])
    })

    it('fits from natural size: an oversized block comes back down, and resizing twice is stable', () => {
      // Shared neighbours only, left 1200px tall by an earlier resize
      const sub = (id: string) =>
        block(id, 'subsystem', { inputPorts: ['In1'], outputPorts: ['A', 'B', 'C'], sheets: [], height: 1200, width: 200 })
      const blocks = [block('feed', 'source'), sub('s1'), sub('s2'), block('cA', 'sum'), block('cB', 'sum'), block('cC', 'sum')]
      const wires = [
        wire('f1', 'feed', 0, 's1', 0),
        wire('f2', 'feed', 0, 's2', 0),
        ...['cA', 'cB', 'cC'].flatMap((c, i) => [wire(`a${i}`, 's1', i, c, 0), wire(`b${i}`, 's2', i, c, 1)]),
      ]
      const first = computeAutoLayout(blocks, wires, { resizeBlocks: true }).resizes
      expect(first.map(r => [r.id, r.height]).sort()).toEqual([['s1', 80], ['s2', 80]])
      expect(first.every(r => r.width < 200)).toBe(true)

      // Apply and resize again: nothing changes
      const applied = blocks.map(b => {
        const r = first.find(x => x.id === b.id)
        return r ? { ...b, parameters: { ...b.parameters, height: r.height, width: r.width } } : b
      })
      expect(computeAutoLayout(applied, wires, { resizeBlocks: true }).resizes).toEqual([])
    })

    it('achieves alignment when the spacing limit allows it', () => {
      const { blocks, wires } = threePortSubsystem()
      const { moves, resizes } = computeAutoLayout(blocks, wires, {
        resizeBlocks: true,
        maxPortSpacing: 1000,
        resizePasses: 3,
      })
      const subH = resizes.find(r => r.id === 'sub')!.height
      const posIn = (id: string) => moves.find(m => m.id === id)!.position
      const subY = posIn('sub').y

      for (const [id, port] of [['cA', 0], ['cB', 1], ['cC', 2]] as Array<[string, number]>) {
        const srcPortY = subY + portOffsetY(port, 3, subH)
        const consumerH = getBlockHeight(blocks.find(b => b.id === id)!, 1, 1)
        const tgtPortY = posIn(id).y + portOffsetY(0, 1, consumerH)
        expect(Math.abs(srcPortY - tgtPortY)).toBeLessThanOrEqual(1)
      }
    })

    it('never shrinks a block below its natural port spacing', () => {
      // Two consumers stacked tightly would "want" a very short subsystem.
      const sub = block('sub', 'subsystem', {
        inputPorts: ['In1'],
        outputPorts: Array.from({ length: 8 }, (_, i) => `O${i}`),
        sheets: [],
      })
      const blocks: BlockData[] = [block('feed', 'source'), sub]
      const wires = [wire('w0', 'feed', 0, 'sub', 0)]
      for (let i = 0; i < 8; i++) {
        blocks.push(block(`c${i}`, 'scale'))
        wires.push(wire(`w${i + 1}`, 'sub', i, `c${i}`, 0))
      }
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })
      const sub2 = resizes.find(r => r.id === 'sub')
      // Natural height for 8 ports is 8*20 + 20 = 180; never go under it.
      if (sub2) expect(sub2.height).toBeGreaterThanOrEqual(180)
    })

    it('respects the maxBlockHeight ceiling', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, {
        resizeBlocks: true,
        maxBlockHeight: 300,
      })
      for (const r of resizes) expect(r.height).toBeLessThanOrEqual(300)
    })

    it('widens a block grown tall so it does not become a sliver', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true, maxPortSpacing: 1000, resizePasses: 3 })
      const sub = resizes.find(r => r.id === 'sub')!
      expect(sub.width).toBeGreaterThan(80)
      expect(sub.width).toBeLessThanOrEqual(200)
      // A modest resize keeps its width
      const modest = computeAutoLayout(blocks, wires, { resizeBlocks: true }).resizes.find(r => r.id === 'sub')!
      expect(modest.width).toBe(80)
    })

    it('snaps resized dimensions to the resize grid', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })
      for (const r of resizes) {
        expect(r.height % 10).toBe(0)
        expect(r.width % 10).toBe(0)
      }
    })

    it('leaves non-resizable blocks alone', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })
      expect(resizes.every(r => r.id === 'sub')).toBe(true)
    })

    it('converges rather than growing without bound', () => {
      const { blocks, wires } = threePortSubsystem()
      const few = computeAutoLayout(blocks, wires, { resizeBlocks: true, resizePasses: 2 })
      const many = computeAutoLayout(blocks, wires, { resizeBlocks: true, resizePasses: 12 })
      expect(many.resizes.find(r => r.id === 'sub')!.height)
        .toBe(few.resizes.find(r => r.id === 'sub')!.height)
    })

    it('is deterministic with resizing enabled', () => {
      const { blocks, wires } = threePortSubsystem()
      expect(computeAutoLayout(blocks, wires, { resizeBlocks: true }))
        .toEqual(computeAutoLayout(blocks, wires, { resizeBlocks: true }))
    })
  })

  describe('robustness', () => {
    it('returns no moves for an empty sheet', () => {
      expect(computeAutoLayout([], [])).toEqual({ moves: [], resizes: [], routes: [] })
    })

    it('leaves comment blocks out of the layout', () => {
      const blocks = [block('src', 'source'), block('note', 'comment')]
      const moves = layout(blocks, [])
      expect(moves.map(m => m.id)).toEqual(['src'])
    })

    it('handles a disconnected block without throwing', () => {
      const blocks = [block('src', 'source'), block('lonely', 'scale')]
      const moves = layout(blocks, [])
      expect(moves).toHaveLength(2)
      expect(moves.every(m => Number.isFinite(m.position.y))).toBe(true)
    })

    it('survives a pure cycle with no source', () => {
      const blocks = [block('a', 'scale'), block('b', 'scale'), block('c', 'scale')]
      const wires = [
        wire('w1', 'a', 0, 'b', 0),
        wire('w2', 'b', 0, 'c', 0),
        wire('w3', 'c', 0, 'a', 0),
      ]
      const moves = layout(blocks, wires)
      expect(moves).toHaveLength(3)
      expect(moves.every(m => Number.isFinite(m.position.x) && Number.isFinite(m.position.y))).toBe(true)
    })

    it('is deterministic across runs', () => {
      const blocks = [
        block('src', 'source'),
        block('a', 'scale', {}, 50),
        block('b', 'scale', {}, 10),
      ]
      const wires = [wire('w1', 'src', 0, 'a', 0), wire('w2', 'src', 0, 'b', 0)]
      expect(layout(blocks, wires)).toEqual(layout(blocks, wires))
    })
  })
})
