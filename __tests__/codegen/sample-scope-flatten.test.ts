/**
 * MDL sampleTimeSec → FlattenedBlock.sampleScope inheritance
 */

import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import type { Sheet } from '@/lib/simulationTypes'
import type { BlockData } from '@/components/BlockNode'

function B(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return { id, type, name, position: { x: 0, y: 0 }, parameters } as BlockData
}

function W(
  id: string,
  sourceBlockId: string,
  targetBlockId: string,
  sourcePortIndex = 0,
  targetPortIndex = 0
) {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex }
}

describe('sampleScope flatten inheritance', () => {
  test('subsystem sampleTimeSec inherits to children; child override wins', () => {
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          B('igm', 'subsystem', 'IGM', {
            sampleTimeSec: 1.6,
            inputPorts: [],
            outputPorts: [],
            sheets: [
              {
                id: 'igm_sheet',
                name: 'IGM',
                blocks: [
                  B('sum', 'sum', 'Add7', { inputs: '++' }),
                  B('fast', 'scale', 'ChiGain', {
                    gain: 1,
                    sampleTimeSec: 0.04
                  })
                ],
                connections: [],
                extents: { width: 400, height: 200 }
              }
            ]
          })
        ],
        connections: [],
        extents: { width: 600, height: 400 }
      }
    ]

    const flattener = new ModelFlattener()
    const { model } = flattener.flattenModel(sheets, 'sample_scope')
    const add7 = model.blocks.find(b => b.block.name === 'Add7')
    const chi = model.blocks.find(b => b.block.name === 'ChiGain')
    expect(add7?.sampleScope).toBe(1.6)
    expect(chi?.sampleScope).toBe(0.04)
  })

  test('no sampleTimeSec → null (every fundamental step)', () => {
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [B('g', 'scale', 'G', { gain: 2 })],
        connections: [],
        extents: { width: 400, height: 200 }
      }
    ]
    const { model } = new ModelFlattener().flattenModel(sheets, 'no_sample')
    expect(model.blocks[0]?.sampleScope).toBeNull()
  })
})

describe('withFlattenedSampleParams → unit_delay next_sample_time', () => {
  test('inherited sampleScope (no child sampleTimeSec) emits next_sample_time in header, init, and step', () => {
    // Parent subsystem carries SampleTime; Memory2 inherits via sampleScope only
    // (parameters.sampleTimeSec unset) — the Header/Init bug case.
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          B('igm', 'subsystem', 'SFrame', {
            sampleTimeSec: 1.6,
            inputPorts: [],
            outputPorts: [],
            sheets: [
              {
                id: 'sf',
                name: 'SFrame',
                blocks: [
                  B('u', 'source', 'U', {
                    signalType: 'constant',
                    value: 1,
                    dataType: 'double'
                  }),
                  B('mem', 'unit_delay', 'Memory2', { initialValue: 0 }),
                  B('y', 'output_port', 'y', {
                    portName: 'y',
                    dataType: 'double'
                  })
                ],
                connections: [W('w1', 'u', 'mem'), W('w2', 'mem', 'y')],
                extents: { width: 400, height: 200 }
              }
            ]
          })
        ],
        connections: [],
        extents: { width: 600, height: 400 }
      }
    ]

    const flattener = new ModelFlattener()
    const { model } = flattener.flattenModel(sheets, 'mem_sample')
    const mem = model.blocks.find(b => b.block.name === 'Memory2')
    expect(mem?.sampleScope).toBe(1.6)
    expect(mem?.block.parameters?.sampleTimeSec).toBeUndefined()

    const result = new CodeGenerator({ modelName: 'mem_sample' }).generate(sheets)
    // Discrete Memory updates share sample_tick with sibling algebra (not
    // next_sample_time — that desynced under late enable).
    expect(result.source).toMatch(/sample_tick % .*1\.6/)
    expect(result.source).toMatch(/Memory2_state/)
  })
})
