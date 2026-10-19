import { viewIsPartial, overviewScale } from '@/components/SheetOverview'
import type { ReactFlowState } from 'reactflow'

// Two blocks spanning x 0..400, y 0..300 in flow coordinates.
const nodes = [
  { id: 'a', position: { x: 0, y: 0 }, positionAbsolute: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
  { id: 'b', position: { x: 300, y: 200 }, positionAbsolute: { x: 300, y: 200 }, width: 100, height: 100, data: {} },
]

const state = (transform: [number, number, number], width = 800, height = 600, list = nodes) =>
  ({
    nodeInternals: new Map(list.map(n => [n.id, n])),
    nodeOrigin: [0, 0],
    transform,
    width,
    height,
  }) as unknown as ReactFlowState

describe('viewIsPartial', () => {
  it('is false when the whole sheet is in view', () => {
    expect(viewIsPartial(state([0, 0, 1]))).toBe(false)
    expect(viewIsPartial(state([200, 150, 1]))).toBe(false) // panned, still all visible
  })

  it('is true when zoomed in past the sheet extents', () => {
    expect(viewIsPartial(state([0, 0, 3]))).toBe(true) // 800px viewport shows 267 flow px
  })

  it('is true when panned so a block is off screen', () => {
    expect(viewIsPartial(state([-50, 0, 1]))).toBe(true)
    expect(viewIsPartial(state([0, 400, 1]))).toBe(true) // bottom block below the view
  })

  it('tolerates sub-2px rounding at the edges', () => {
    expect(viewIsPartial(state([0, 0, 1], 401, 301))).toBe(false)
    expect(viewIsPartial(state([1, 1, 1], 401, 301))).toBe(false)
  })

  it('is false for an empty sheet or an unmeasured canvas', () => {
    expect(viewIsPartial(state([0, 0, 3], 800, 600, []))).toBe(false)
    expect(viewIsPartial(state([0, 0, 3], 0, 0))).toBe(false)
  })
})

describe('overviewScale', () => {
  it('is 1 when the content fits the 220x160 overview at full size', () => {
    // One 100x100 block and a 200x150 view: everything fits without shrinking.
    expect(overviewScale(state([0, 0, 1], 200, 150, [nodes[0]]))).toBe(1)
  })

  it('grows with the area the overview must show (sheet plus view)', () => {
    // View 800x600 at zoom 1 dominates the 400x300 sheet: max(800/220, 600/160) = 3.75
    expect(overviewScale(state([0, 0, 1]))).toBe(3.75)
    // A very tall sheet: a block 8000px down
    const tall = [...nodes, { id: 'c', position: { x: 0, y: 8000 }, positionAbsolute: { x: 0, y: 8000 }, width: 100, height: 100, data: {} }]
    expect(overviewScale(state([0, 0, 1], 800, 600, tall))).toBeCloseTo(8100 / 160, 0)
  })
})
