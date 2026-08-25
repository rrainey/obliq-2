/**
 * AlgebraicEvaluator gates discrete sampleTimeSec blocks off-hit
 */

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

describe('sample-scope algebra gate', () => {
  test('blocks with sampleTimeSec 1.6 wrap in sample_tick hit check', () => {
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          B('u', 'source', 'U', {
            signalType: 'constant',
            value: 1,
            dataType: 'double'
          }),
          B('g', 'scale', 'GuidedGain', {
            gain: 2,
            sampleTimeSec: 1.6
          }),
          B('y', 'output_port', 'y', { portName: 'y', dataType: 'double' })
        ],
        connections: [
          W('w1', 'u', 'g'),
          W('w2', 'g', 'y')
        ],
        extents: { width: 500, height: 300 }
      }
    ]

    const gen = new CodeGenerator({ modelName: 'sample_gate' })
    const result = gen.generate(sheets)
    expect(result.source).toMatch(/sample_tick/)
    expect(result.source).toMatch(/llround\(\(1\.6\) \/ model->dt\)/)
    expect(result.source).toMatch(
      /if \(\(?model->sample_tick % \(unsigned long long\)llround/
    )
    expect(result.header).toMatch(/sample_tick/)
    expect(result.source).toMatch(/model->sample_tick\+\+/)
  })

  test('continuous blocks are not sample-gated', () => {
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          B('u', 'source', 'U', {
            signalType: 'constant',
            value: 1,
            dataType: 'double'
          }),
          B('g', 'scale', 'PlantGain', { gain: 2 }),
          B('y', 'output_port', 'y', { portName: 'y', dataType: 'double' })
        ],
        connections: [W('w1', 'u', 'g'), W('w2', 'g', 'y')],
        extents: { width: 500, height: 300 }
      }
    ]
    const result = new CodeGenerator({ modelName: 'no_sample_gate' }).generate(
      sheets
    )
    // tick still present for timing, but PlantGain assignment not behind hit
    const idx = result.source.indexOf('Scale block: PlantGain')
    expect(idx).toBeGreaterThan(-1)
    const window = result.source.slice(Math.max(0, idx - 80), idx + 200)
    expect(window).not.toMatch(/sample_tick %/)
  })
})
