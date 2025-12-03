/**
 * Feature 4: Grouped Block Selection Tests
 *
 * Tests the multi-selection functionality including:
 * - Store state management for multiple block selection
 * - Automatic wire selection between selected blocks
 * - Selection operations (add, remove, toggle, clear)
 */

import { useModelStore } from '../src/lib/modelStore'
import { BlockData } from '../src/components/BlockNode'
import { WireData } from '../src/components/Wire'

describe('Feature 4: Grouped Block Selection', () => {
  // Reset store before each test
  beforeEach(() => {
    useModelStore.setState({
      blocks: [],
      wires: [],
      selectedBlockId: null,
      selectedBlockIds: [],
      selectedWireId: null,
      selectedWireIds: [],
    })
  })

  describe('Store State Management', () => {
    test('initial state has empty selection arrays', () => {
      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual([])
      expect(state.selectedWireIds).toEqual([])
    })

    test('setSelectedBlockId updates both single and multi-selection state', () => {
      const { setSelectedBlockId } = useModelStore.getState()

      setSelectedBlockId('block-1')

      const state = useModelStore.getState()
      expect(state.selectedBlockId).toBe('block-1')
      expect(state.selectedBlockIds).toEqual(['block-1'])
    })

    test('setSelectedBlockId with null clears selection', () => {
      const { setSelectedBlockId } = useModelStore.getState()

      setSelectedBlockId('block-1')
      setSelectedBlockId(null)

      const state = useModelStore.getState()
      expect(state.selectedBlockId).toBeNull()
      expect(state.selectedBlockIds).toEqual([])
    })
  })

  describe('Multi-Selection Operations', () => {
    const testBlocks: BlockData[] = [
      { id: 'block-1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'block-2', type: 'scale', name: 'Scale1', position: { x: 100, y: 0 }, parameters: {} },
      { id: 'block-3', type: 'signal_display', name: 'Display1', position: { x: 200, y: 0 }, parameters: {} },
    ]

    const testWires: WireData[] = [
      { id: 'wire-1', sourceBlockId: 'block-1', sourcePortIndex: 0, targetBlockId: 'block-2', targetPortIndex: 0 },
      { id: 'wire-2', sourceBlockId: 'block-2', sourcePortIndex: 0, targetBlockId: 'block-3', targetPortIndex: 0 },
    ]

    beforeEach(() => {
      useModelStore.setState({
        blocks: testBlocks,
        wires: testWires,
        selectedBlockIds: [],
        selectedWireIds: [],
      })
    })

    test('setSelectedBlocks selects multiple blocks', () => {
      const { setSelectedBlocks } = useModelStore.getState()

      setSelectedBlocks(['block-1', 'block-2'])

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual(['block-1', 'block-2'])
    })

    test('setSelectedBlocks with single block sets selectedBlockId for backward compatibility', () => {
      const { setSelectedBlocks } = useModelStore.getState()

      setSelectedBlocks(['block-1'])

      const state = useModelStore.getState()
      expect(state.selectedBlockId).toBe('block-1')
      expect(state.selectedBlockIds).toEqual(['block-1'])
    })

    test('setSelectedBlocks with multiple blocks clears selectedBlockId', () => {
      const { setSelectedBlocks, setSelectedBlockId } = useModelStore.getState()

      // First select single block
      setSelectedBlockId('block-1')
      expect(useModelStore.getState().selectedBlockId).toBe('block-1')

      // Then select multiple blocks
      setSelectedBlocks(['block-1', 'block-2'])

      const state = useModelStore.getState()
      expect(state.selectedBlockId).toBeNull()
      expect(state.selectedBlockIds).toEqual(['block-1', 'block-2'])
    })

    test('addToSelection adds blocks to existing selection', () => {
      const { setSelectedBlocks, addToSelection } = useModelStore.getState()

      setSelectedBlocks(['block-1'])
      addToSelection(['block-2', 'block-3'])

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual(['block-1', 'block-2', 'block-3'])
    })

    test('addToSelection does not create duplicates', () => {
      const { setSelectedBlocks, addToSelection } = useModelStore.getState()

      setSelectedBlocks(['block-1', 'block-2'])
      addToSelection(['block-2', 'block-3'])

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual(['block-1', 'block-2', 'block-3'])
    })

    test('removeFromSelection removes blocks from selection', () => {
      const { setSelectedBlocks, removeFromSelection } = useModelStore.getState()

      setSelectedBlocks(['block-1', 'block-2', 'block-3'])
      removeFromSelection(['block-2'])

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual(['block-1', 'block-3'])
    })

    test('toggleBlockSelection adds unselected block', () => {
      const { setSelectedBlocks, toggleBlockSelection } = useModelStore.getState()

      setSelectedBlocks(['block-1'])
      toggleBlockSelection('block-2')

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toContain('block-1')
      expect(state.selectedBlockIds).toContain('block-2')
    })

    test('toggleBlockSelection removes selected block', () => {
      const { setSelectedBlocks, toggleBlockSelection } = useModelStore.getState()

      setSelectedBlocks(['block-1', 'block-2'])
      toggleBlockSelection('block-2')

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual(['block-1'])
    })

    test('clearSelection clears all selection state', () => {
      const { setSelectedBlocks, clearSelection } = useModelStore.getState()

      setSelectedBlocks(['block-1', 'block-2'])
      clearSelection()

      const state = useModelStore.getState()
      expect(state.selectedBlockId).toBeNull()
      expect(state.selectedBlockIds).toEqual([])
      expect(state.selectedWireId).toBeNull()
      expect(state.selectedWireIds).toEqual([])
    })
  })

  describe('Automatic Wire Selection', () => {
    const testBlocks: BlockData[] = [
      { id: 'block-1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'block-2', type: 'scale', name: 'Scale1', position: { x: 100, y: 0 }, parameters: {} },
      { id: 'block-3', type: 'signal_display', name: 'Display1', position: { x: 200, y: 0 }, parameters: {} },
      { id: 'block-4', type: 'source', name: 'Source2', position: { x: 0, y: 100 }, parameters: {} },
    ]

    const testWires: WireData[] = [
      { id: 'wire-1-2', sourceBlockId: 'block-1', sourcePortIndex: 0, targetBlockId: 'block-2', targetPortIndex: 0 },
      { id: 'wire-2-3', sourceBlockId: 'block-2', sourcePortIndex: 0, targetBlockId: 'block-3', targetPortIndex: 0 },
      { id: 'wire-4-3', sourceBlockId: 'block-4', sourcePortIndex: 0, targetBlockId: 'block-3', targetPortIndex: 1 },
    ]

    beforeEach(() => {
      useModelStore.setState({
        blocks: testBlocks,
        wires: testWires,
        selectedBlockIds: [],
        selectedWireIds: [],
      })
    })

    test('selecting connected blocks auto-selects the wire between them', () => {
      const { setSelectedBlocks } = useModelStore.getState()

      // Select block-1 and block-2 which are connected by wire-1-2
      setSelectedBlocks(['block-1', 'block-2'])

      const state = useModelStore.getState()
      expect(state.selectedWireIds).toEqual(['wire-1-2'])
    })

    test('selecting all blocks in a chain selects all wires', () => {
      const { setSelectedBlocks } = useModelStore.getState()

      // Select all three blocks in the chain
      setSelectedBlocks(['block-1', 'block-2', 'block-3'])

      const state = useModelStore.getState()
      expect(state.selectedWireIds).toContain('wire-1-2')
      expect(state.selectedWireIds).toContain('wire-2-3')
      expect(state.selectedWireIds).not.toContain('wire-4-3') // block-4 not selected
    })

    test('wire is not selected if only source block is selected', () => {
      const { setSelectedBlocks } = useModelStore.getState()

      setSelectedBlocks(['block-1'])

      const state = useModelStore.getState()
      expect(state.selectedWireIds).toEqual([])
    })

    test('wire is not selected if only target block is selected', () => {
      const { setSelectedBlocks } = useModelStore.getState()

      setSelectedBlocks(['block-2'])

      const state = useModelStore.getState()
      expect(state.selectedWireIds).toEqual([])
    })

    test('addToSelection updates wire selection', () => {
      const { setSelectedBlocks, addToSelection } = useModelStore.getState()

      // First select just block-1
      setSelectedBlocks(['block-1'])
      expect(useModelStore.getState().selectedWireIds).toEqual([])

      // Add block-2 to complete the connection
      addToSelection(['block-2'])

      const state = useModelStore.getState()
      expect(state.selectedWireIds).toEqual(['wire-1-2'])
    })

    test('removeFromSelection updates wire selection', () => {
      const { setSelectedBlocks, removeFromSelection } = useModelStore.getState()

      // Select connected blocks
      setSelectedBlocks(['block-1', 'block-2'])
      expect(useModelStore.getState().selectedWireIds).toEqual(['wire-1-2'])

      // Remove one block breaks the connection
      removeFromSelection(['block-2'])

      const state = useModelStore.getState()
      expect(state.selectedWireIds).toEqual([])
    })
  })

  describe('Helper Functions', () => {
    const testBlocks: BlockData[] = [
      { id: 'block-1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'block-2', type: 'scale', name: 'Scale1', position: { x: 100, y: 0 }, parameters: {} },
      { id: 'block-3', type: 'signal_display', name: 'Display1', position: { x: 200, y: 0 }, parameters: {} },
    ]

    const testWires: WireData[] = [
      { id: 'wire-1-2', sourceBlockId: 'block-1', sourcePortIndex: 0, targetBlockId: 'block-2', targetPortIndex: 0 },
      { id: 'wire-2-3', sourceBlockId: 'block-2', sourcePortIndex: 0, targetBlockId: 'block-3', targetPortIndex: 0 },
    ]

    beforeEach(() => {
      useModelStore.setState({
        blocks: testBlocks,
        wires: testWires,
        selectedBlockIds: ['block-1', 'block-2'],
        selectedWireIds: ['wire-1-2'],
      })
    })

    test('getSelectedBlocks returns selected block objects', () => {
      const { getSelectedBlocks } = useModelStore.getState()

      const selectedBlocks = getSelectedBlocks()

      expect(selectedBlocks).toHaveLength(2)
      expect(selectedBlocks.map(b => b.id)).toEqual(['block-1', 'block-2'])
    })

    test('getSelectedWires returns selected wire objects', () => {
      const { getSelectedWires } = useModelStore.getState()

      const selectedWires = getSelectedWires()

      expect(selectedWires).toHaveLength(1)
      expect(selectedWires[0].id).toBe('wire-1-2')
    })

    test('getConnectionsBetweenBlocks returns wires connecting specified blocks', () => {
      const { getConnectionsBetweenBlocks } = useModelStore.getState()

      const connections = getConnectionsBetweenBlocks(['block-1', 'block-2', 'block-3'])

      expect(connections).toHaveLength(2)
      expect(connections.map(w => w.id)).toContain('wire-1-2')
      expect(connections.map(w => w.id)).toContain('wire-2-3')
    })

    test('getConnectionsBetweenBlocks returns empty for disconnected blocks', () => {
      const { getConnectionsBetweenBlocks } = useModelStore.getState()

      // block-1 and block-3 are not directly connected
      const connections = getConnectionsBetweenBlocks(['block-1', 'block-3'])

      expect(connections).toHaveLength(0)
    })
  })

  describe('Batch Block Updates', () => {
    const testBlocks: BlockData[] = [
      { id: 'block-1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'block-2', type: 'scale', name: 'Scale1', position: { x: 100, y: 0 }, parameters: {} },
      { id: 'block-3', type: 'signal_display', name: 'Display1', position: { x: 200, y: 0 }, parameters: {} },
    ]

    beforeEach(() => {
      useModelStore.setState({
        blocks: testBlocks,
        wires: [],
        isDirty: false,
      })
    })

    test('updateBlocks updates multiple block positions in a single operation', () => {
      const { updateBlocks } = useModelStore.getState()

      updateBlocks([
        { id: 'block-1', updates: { position: { x: 50, y: 50 } } },
        { id: 'block-2', updates: { position: { x: 150, y: 50 } } },
      ])

      const state = useModelStore.getState()
      const block1 = state.blocks.find(b => b.id === 'block-1')
      const block2 = state.blocks.find(b => b.id === 'block-2')
      const block3 = state.blocks.find(b => b.id === 'block-3')

      expect(block1?.position).toEqual({ x: 50, y: 50 })
      expect(block2?.position).toEqual({ x: 150, y: 50 })
      // block-3 should remain unchanged
      expect(block3?.position).toEqual({ x: 200, y: 0 })
    })

    test('updateBlocks marks store as dirty', () => {
      const { updateBlocks } = useModelStore.getState()

      expect(useModelStore.getState().isDirty).toBe(false)

      updateBlocks([
        { id: 'block-1', updates: { position: { x: 50, y: 50 } } },
      ])

      expect(useModelStore.getState().isDirty).toBe(true)
    })

    test('updateBlocks handles empty updates array', () => {
      const { updateBlocks } = useModelStore.getState()
      const originalBlocks = useModelStore.getState().blocks

      updateBlocks([])

      const state = useModelStore.getState()
      expect(state.blocks).toEqual(originalBlocks)
    })

    test('updateBlocks ignores updates for non-existent blocks', () => {
      const { updateBlocks } = useModelStore.getState()

      updateBlocks([
        { id: 'non-existent', updates: { position: { x: 999, y: 999 } } },
        { id: 'block-1', updates: { position: { x: 50, y: 50 } } },
      ])

      const state = useModelStore.getState()
      const block1 = state.blocks.find(b => b.id === 'block-1')

      expect(block1?.position).toEqual({ x: 50, y: 50 })
      expect(state.blocks).toHaveLength(3) // No new block added
    })
  })
})
