/**
 * Paste-as-reference: upgrades flatten→atomic, creates reference without sheets.
 */

import { useModelStore } from '@/lib/modelStore'
import { isSubsystemReference } from '@/lib/subsystemReference'
import { BlockData } from '@/components/BlockNode'

function bladeDefinition(): BlockData {
  return {
    id: 'blade_def',
    type: 'subsystem',
    name: 'Blade',
    position: { x: 100, y: 100 },
    parameters: {
      inputPorts: ['u'],
      outputPorts: ['y'],
      codeGenStrategy: 'flatten',
      parameters: [
        {
          name: 'gain',
          dataType: 'double',
          signalType: 'double',
          value: 1,
          defaultValue: '1'
        }
      ],
      sheets: [
        {
          id: 'body',
          name: 'Blade',
          blocks: [
            {
              id: 'in',
              type: 'input_port',
              name: 'u',
              position: { x: 0, y: 0 },
              parameters: { portName: 'u' }
            },
            {
              id: 'out',
              type: 'output_port',
              name: 'y',
              position: { x: 100, y: 0 },
              parameters: { portName: 'y' }
            }
          ],
          connections: [],
          extents: { width: 400, height: 300 }
        }
      ]
    }
  }
}

describe('subsystem reference paste', () => {
  beforeEach(() => {
    const store = useModelStore.getState()
    store.setSheets([
      {
        id: 'main',
        name: 'Main',
        blocks: [bladeDefinition()],
        connections: [],
        extents: { width: 800, height: 600 }
      }
    ])
    store.setActiveSheetId('main')
    store.setBlocks([bladeDefinition()])
    store.setWires([])
    store.setSelectedBlocks(['blade_def'])
    useModelStore.setState({
      model: { id: 'model-1', name: 't', user_id: 'u' } as any
    })
  })

  test('paste as reference upgrades source and creates ref without sheets', () => {
    const store = useModelStore.getState()
    useModelStore.setState({
      model: { id: 'model-1', name: 't', user_id: 'u' } as any
    })

    const clip = store.copySelection()
    expect(clip).toBeTruthy()
    expect(clip!.blocks[0]!.id).toBe('blade_def')

    const result = store.pasteFromClipboard({ subsystemPasteMode: 'reference' })
    expect(result.success).toBe(true)
    expect(result.pastedBlockIds).toHaveLength(1)

    const blocks = useModelStore.getState().blocks
    const def = blocks.find(b => b.id === 'blade_def')!
    const ref = blocks.find(b => b.id === result.pastedBlockIds[0])!

    expect(def.parameters?.codeGenStrategy).toBe('segregated_atomic')
    expect(isSubsystemReference(ref)).toBe(true)
    expect(ref.parameters?.referencedSubsystemId).toBe('blade_def')
    expect(ref.parameters?.sheets || []).toEqual([])
    expect((ref.parameters?.parameters as any[])[0].name).toBe('gain')
  })
})
