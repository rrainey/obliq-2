// Navigating in and out of a subsystem definition's sheet must not wipe the
// port lists of the references to it (they have no sheets of their own), and
// a port added inside the definition must reach its references. Models saved
// with cleared reference ports are repaired on load.

import { useModelStore } from '@/lib/modelStore'
import type { BlockData } from '@/components/BlockNode'

const st = () => useModelStore.getState()

const port = (id: string, type: 'input_port' | 'output_port', name: string): BlockData => ({
  id, type, name, position: { x: 0, y: 0 }, parameters: { portName: name, dataType: 'double' },
})

function setup() {
  const def: BlockData = {
    id: 'def', type: 'subsystem', name: 'Motor', position: { x: 0, y: 0 },
    parameters: {
      inputPorts: ['cmd'], outputPorts: ['thrust'], codeGenStrategy: 'segregated_atomic',
      sheets: [{
        id: 'motor', name: 'Motor', extents: { width: 400, height: 300 },
        blocks: [port('in', 'input_port', 'cmd'), port('out', 'output_port', 'thrust')],
        connections: [{ id: 'w', sourceBlockId: 'in', sourcePortIndex: 0, targetBlockId: 'out', targetPortIndex: 0 }],
      }],
    },
  }
  const ref = (id: string): BlockData => ({
    id, type: 'subsystem', name: id, position: { x: 0, y: 100 },
    parameters: {
      isReference: true, referencedSubsystemId: 'def', codeGenStrategy: 'segregated_atomic',
      inputPorts: ['cmd'], outputPorts: ['thrust'], sheets: [],
    },
  })
  const blocks = [def, ref('ref1'), ref('ref2')]
  useModelStore.setState({
    sheets: [{ id: 'main', name: 'Main', blocks, connections: [], extents: { width: 1000, height: 800 } }],
    activeSheetId: 'main',
    blocks,
    wires: [],
  })
}

const mainBlock = (id: string) => st().sheets[0]!.blocks.find(b => b.id === id)!

describe('subsystem reference ports', () => {
  test('visiting the definition sheet leaves the references’ ports intact', () => {
    setup()
    st().switchToSheet('motor')
    st().switchToSheet('main')
    for (const id of ['ref1', 'ref2']) {
      expect(mainBlock(id).parameters?.inputPorts).toEqual(['cmd'])
      expect(mainBlock(id).parameters?.outputPorts).toEqual(['thrust'])
    }
    // The active sheet's working copy agrees
    expect(st().blocks.find(b => b.id === 'ref1')!.parameters?.outputPorts).toEqual(['thrust'])
  })

  test('a port added inside the definition reaches its references', () => {
    setup()
    st().switchToSheet('motor')
    useModelStore.setState({ blocks: [...st().blocks, port('out2', 'output_port', 'omega')] })
    st().switchToSheet('main')
    expect(mainBlock('def').parameters?.outputPorts).toEqual(['thrust', 'omega'])
    for (const id of ['ref1', 'ref2']) expect(mainBlock(id).parameters?.outputPorts).toEqual(['thrust', 'omega'])
  })

  test('loading a model repairs references saved with empty ports', () => {
    setup()
    const damaged = st().sheets.map(sh => ({
      ...sh,
      blocks: sh.blocks.map(b => b.parameters?.isReference
        ? { ...b, parameters: { ...b.parameters, inputPorts: [], outputPorts: [] } }
        : b),
    }))
    st().initializeFromModel(
      { id: 'm', name: 'M', latest_version: 1 } as any,
      { version: 1, data: { version: '1.0', sheets: damaged } } as any,
    )
    for (const id of ['ref1', 'ref2']) {
      expect(mainBlock(id).parameters?.inputPorts).toEqual(['cmd'])
      expect(mainBlock(id).parameters?.outputPorts).toEqual(['thrust'])
    }
    expect(st().blocks.find(b => b.id === 'ref2')!.parameters?.outputPorts).toEqual(['thrust'])

    st().setSheets(damaged as any)
    expect(mainBlock('ref1').parameters?.outputPorts).toEqual(['thrust'])
  })
})
