import {
  validateModelTypeCompatibility,
  validateModelTypeCompatibilityMultiSheet
} from '@/lib/typeCompatibilityValidator'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

describe('demux scalar input soft warning (mdl2obliq Outports)', () => {
  const createBlock = (
    id: string,
    type: string,
    parameters?: Record<string, unknown>
  ): BlockData => ({
    id,
    type,
    name: `${type}_${id}`,
    position: { x: 0, y: 0 },
    parameters
  })

  const createWire = (
    id: string,
    sourceBlockId: string,
    targetBlockId: string
  ): WireData => ({
    id,
    sourceBlockId,
    sourcePortIndex: 0,
    targetBlockId,
    targetPortIndex: 0
  })

  test('scalar → demux with inputDimensions:[3] is a warning, not an error', () => {
    const blocks: BlockData[] = [
      createBlock('src', 'source', { dataType: 'double' }),
      createBlock('dmx', 'demux', { outputCount: 3, inputDimensions: [3] })
    ]
    const wires: WireData[] = [createWire('w1', 'src', 'dmx')]

    const result = validateModelTypeCompatibility(blocks, wires)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.some(w => w.message.includes('inputDimensions'))).toBe(
      true
    )
  })

  test('scalar → demux without inputDimensions remains an error', () => {
    const blocks: BlockData[] = [
      createBlock('src', 'source', { dataType: 'double' }),
      createBlock('dmx', 'demux', { outputCount: 3 })
    ]
    const wires: WireData[] = [createWire('w1', 'src', 'dmx')]

    const result = validateModelTypeCompatibility(blocks, wires)

    expect(result.isValid).toBe(false)
    expect(
      result.errors.some(e => e.message.includes('requires vector or matrix'))
    ).toBe(true)
  })

  test('multi-sheet path respects warning severity for Mux_expand demuxes', () => {
    const sheets = [
      {
        id: 'root',
        name: 'root',
        blocks: [
          createBlock('src', 'source', { dataType: 'double' }),
          createBlock('dmx', 'demux', {
            outputCount: 3,
            inputDimensions: [3]
          })
        ],
        connections: [createWire('w1', 'src', 'dmx')]
      }
    ]

    const result = validateModelTypeCompatibilityMultiSheet(sheets as never)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(
      result.warnings.some(
        w => w.blockId === 'dmx' && w.message.includes('inputDimensions')
      )
    ).toBe(true)
  })
})
