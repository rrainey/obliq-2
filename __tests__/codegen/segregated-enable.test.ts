import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { SubsystemCodeGenerator } from '@/lib/codegen/SubsystemCodeGenerator'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

function createSheet(
  id: string,
  name: string,
  blocks: BlockData[],
  connections: WireData[]
): Sheet {
  return { id, name, blocks, connections, extents: { width: 1000, height: 800 } }
}

function createBlock(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return { id, type, name, position: { x: 0, y: 0 }, parameters }
}

function createConnection(
  id: string,
  sourceBlockId: string,
  sourcePortIndex: number,
  targetBlockId: string,
  targetPortIndex: number
): WireData {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex }
}

describe('Segregated nested enable scopes', () => {
  test('nested enables stay on the module; parent does not own them', () => {
    const actionSheet = createSheet(
      'act',
      'Act',
      [
        createBlock('ain', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('again', 'scale', 'InnerGain', { gain: 3 }),
        createBlock('aout', 'output_port', 'Out1', { portName: 'Out1' })
      ],
      [
        createConnection('aw1', 'ain', 0, 'again', 0),
        createConnection('aw2', 'again', 0, 'aout', 0)
      ]
    )

    const lvdcSheet = createSheet(
      'lvdc',
      'LVDC',
      [
        createBlock('lin', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('len', 'source', 'EnSrc', { value: 1 }),
        createBlock('action', 'subsystem', 'IGM_Phase', {
          showEnableInput: true,
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [actionSheet]
        }),
        createBlock('lout', 'output_port', 'Out1', { portName: 'Out1' })
      ],
      [
        createConnection('lw1', 'lin', 0, 'action', 0),
        createConnection('lw2', 'len', 0, 'action', -1),
        createConnection('lw3', 'action', 0, 'lout', 0)
      ]
    )

    const main = createSheet(
      'main',
      'Main',
      [
        createBlock('src', 'source', 'U', { value: 2 }),
        createBlock('lvdc', 'subsystem', 'LVDA_LVDC', {
          codeGenStrategy: 'segregated_atomic',
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [lvdcSheet]
        }),
        createBlock('mout', 'output_port', 'Y', { portName: 'Y' })
      ],
      [
        createConnection('m1', 'src', 0, 'lvdc', 0),
        createConnection('m2', 'lvdc', 0, 'mout', 0)
      ]
    )

    const result = new ModelFlattener().flattenModel([main])

    // Parent must not register the nested IGM_Phase enable
    const parentEnableNames = result.model.subsystemEnableInfo.map(e => e.subsystemName)
    expect(parentEnableNames.some(n => n.includes('IGM_Phase'))).toBe(false)

    expect(result.model.segregatedSubsystems).toHaveLength(1)
    const sub = result.model.segregatedSubsystems[0]
    expect(sub.subsystemEnableInfo?.some(e => e.hasEnableInput)).toBe(true)

    const gen = new SubsystemCodeGenerator(sub).generate()
    expect(gen.header).toContain('LVDA_LVDC_enable_states_t')
    expect(gen.header).toContain('enable_states')
    expect(gen.source).toContain('LVDA_LVDC_evaluate_enable_states')
    expect(gen.source).toContain('model->enable_states.')
    // InnerGain should be gated
    expect(gen.source).toMatch(/if \(model->enable_states\.\w+_enabled\)/)
  })
})
