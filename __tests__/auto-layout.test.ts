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

    it('grows a subsystem until its ports can reach their consumers', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })

      const sub = resizes.find(r => r.id === 'sub')
      expect(sub).toBeDefined()
      // Three ports sit at height/4 intervals and consumers need 64 + 80 of
      // clearance, so the block has to reach at least 4 * 144 = 576px.
      expect(sub!.height).toBeGreaterThanOrEqual(576)
    })

    it('actually achieves alignment once resizing is allowed', () => {
      const { blocks, wires } = threePortSubsystem()
      const { moves, resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })
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

    it('widens a grown block so it does not become a sliver', () => {
      const { blocks, wires } = threePortSubsystem()
      const { resizes } = computeAutoLayout(blocks, wires, { resizeBlocks: true })
      const sub = resizes.find(r => r.id === 'sub')!
      expect(sub.width).toBeGreaterThan(80)
      expect(sub.width).toBeLessThanOrEqual(200)
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
      expect(computeAutoLayout([], [])).toEqual({ moves: [], resizes: [] })
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
