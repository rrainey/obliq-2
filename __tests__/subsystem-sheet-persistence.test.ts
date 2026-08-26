// Regression tests for subsystem sheet persistence.
//
// switchToSheet used to read `sheets` from the store *before* calling
// saveCurrentSheetData(), which replaces that array. Loading `blocks` from the
// stale tree silently reverted the sheet just left, so a subsystem's entire
// contents were discarded by the next save.

import { useModelStore } from '@/lib/modelStore'
import { createBlock } from '@/lib/blockFactory'
import type { BlockData } from '@/components/BlockNode'

const st = () => useModelStore.getState()

function setupModelWithSubsystem() {
  const sub = createBlock('subsystem', {
    position: { x: 100, y: 100 },
    existingBlockCount: 1,
  }) as BlockData
  const subMainId = (sub.parameters as any).sheets[0].id

  useModelStore.setState({
    sheets: [{
      id: 'main', name: 'Main',
      blocks: [sub], connections: [],
      extents: { width: 1000, height: 800 },
    }],
    activeSheetId: 'main',
    blocks: [sub],
    wires: [],
  })

  const nestedBlockNames = () => {
    const parent = st().sheets[0].blocks.find(b => b.id === sub.id) as any
    return parent.parameters.sheets[0].blocks.map((b: BlockData) => b.name)
  }

  return { sub, subMainId, nestedBlockNames }
}

function namedBlock(type: string, name: string): BlockData {
  const b = createBlock(type, {
    position: { x: 250, y: 150 },
    existingBlockCount: 1,
  }) as BlockData
  b.name = name
  return b
}

describe('subsystem sheet persistence', () => {
  test('edits made inside a subsystem survive navigating back out', () => {
    const { subMainId, nestedBlockNames } = setupModelWithSubsystem()

    st().switchToSheet(subMainId)
    useModelStore.setState({ blocks: [...st().blocks, namedBlock('scale', 'InnerGain')] })

    // Navigating out is expected to flush the edit into the parent tree.
    st().switchToSheet('main')
    expect(nestedBlockNames()).toContain('InnerGain')

    // And a later save must not resurrect a stale copy over it.
    st().saveCurrentSheetData()
    expect(nestedBlockNames()).toContain('InnerGain')
  })

  test('the parent sheet in memory carries the updated subsystem after navigating out', () => {
    const { sub, subMainId } = setupModelWithSubsystem()

    st().switchToSheet(subMainId)
    useModelStore.setState({ blocks: [...st().blocks, namedBlock('scale', 'InnerGain')] })
    st().switchToSheet('main')

    // This is what a later saveCurrentSheetData() writes back, so it has to be
    // current -- a stale value here is what caused the data loss.
    const live = st().blocks.find(b => b.id === sub.id) as any
    expect(live.parameters.sheets[0].blocks.map((b: BlockData) => b.name)).toContain('InnerGain')
  })

  test('wires added inside a subsystem are preserved too', () => {
    const { sub, subMainId } = setupModelWithSubsystem()

    st().switchToSheet(subMainId)
    const inner = st().blocks
    useModelStore.setState({
      wires: [{
        id: 'inner_w1',
        sourceBlockId: inner[0].id, sourcePortIndex: 0,
        targetBlockId: inner[1].id, targetPortIndex: 0,
      }],
    })
    st().switchToSheet('main')
    st().saveCurrentSheetData()

    const parent = st().sheets[0].blocks.find(b => b.id === sub.id) as any
    expect(parent.parameters.sheets[0].connections.map((c: any) => c.id)).toContain('inner_w1')
  })

  test('repeated navigation in and out does not erode subsystem contents', () => {
    const { subMainId, nestedBlockNames } = setupModelWithSubsystem()

    for (let i = 0; i < 3; i++) {
      st().switchToSheet(subMainId)
      useModelStore.setState({ blocks: [...st().blocks, namedBlock('scale', `Gain${i}`)] })
      st().switchToSheet('main')
      st().saveCurrentSheetData()
    }

    const names = nestedBlockNames()
    expect(names).toContain('Gain0')
    expect(names).toContain('Gain1')
    expect(names).toContain('Gain2')
  })

  test('a subsystem always retains at least one sheet', () => {
    // The schema requires it, and an empty subsystem cannot type its outputs.
    const { sub, subMainId, nestedBlockNames } = setupModelWithSubsystem()

    st().switchToSheet(subMainId)
    st().switchToSheet('main')
    st().saveCurrentSheetData()

    const parent = st().sheets[0].blocks.find(b => b.id === sub.id) as any
    expect(parent.parameters.sheets.length).toBeGreaterThanOrEqual(1)
    expect(nestedBlockNames().length).toBeGreaterThan(0)
  })
})
