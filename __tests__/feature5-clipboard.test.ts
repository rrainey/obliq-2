/**
 * Feature 5: Block Cut/Copy and Paste Tests
 *
 * Tests the clipboard functionality including:
 * - Copy, cut, paste operations
 * - Parameter dependency detection
 * - ID remapping during paste
 * - Cross-tab clipboard via localStorage
 */

import { useModelStore } from '../src/lib/modelStore'
import { BlockData } from '../src/components/BlockNode'
import { WireData } from '../src/components/Wire'
import { ModelParameter } from '../src/lib/modelSchema'
import {
  ClipboardData,
  isValidClipboardData,
  serializeClipboard,
  deserializeClipboard,
  CLIPBOARD_STORAGE_KEY,
} from '../src/types/clipboard'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('Feature 5: Block Cut/Copy and Paste', () => {
  // Reset store before each test
  beforeEach(() => {
    localStorageMock.clear()
    useModelStore.setState({
      model: { id: 'test-model-1', name: 'Test Model' } as any,
      blocks: [],
      wires: [],
      parameters: [],
      selectedBlockId: null,
      selectedBlockIds: [],
      selectedWireId: null,
      selectedWireIds: [],
      clipboardData: null,
      activeSheetId: 'main',
      sheets: [{ id: 'main', name: 'Main', blocks: [], connections: [], extents: { width: 1000, height: 800 } }],
    })
  })

  describe('Clipboard Data Validation', () => {
    test('isValidClipboardData returns true for valid data', () => {
      const validData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [],
        wires: [],
        dependencies: { parameters: [] },
      }
      expect(isValidClipboardData(validData)).toBe(true)
    })

    test('isValidClipboardData returns false for invalid data', () => {
      expect(isValidClipboardData(null)).toBe(false)
      expect(isValidClipboardData({})).toBe(false)
      expect(isValidClipboardData({ version: '2.0' })).toBe(false)
    })

    test('serializeClipboard and deserializeClipboard are symmetric', () => {
      const data: ClipboardData = {
        version: '1.0',
        sourceModelId: 'model-1',
        timestamp: 1234567890,
        blocks: [{ id: 'b1', type: 'source', name: 'S1', position: { x: 0, y: 0 }, parameters: {} }],
        wires: [],
        dependencies: { parameters: [] },
      }

      const serialized = serializeClipboard(data)
      const deserialized = deserializeClipboard(serialized)

      expect(deserialized).toEqual(data)
    })
  })

  describe('Copy Selection', () => {
    const testBlocks: BlockData[] = [
      { id: 'block-1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: { value: 5 } },
      { id: 'block-2', type: 'scale', name: 'Scale1', position: { x: 100, y: 0 }, parameters: { gain: 2 } },
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
      })
    })

    test('copySelection returns null when nothing selected', () => {
      useModelStore.setState({ selectedBlockIds: [] })
      const { copySelection } = useModelStore.getState()

      const result = copySelection()

      expect(result).toBeNull()
    })

    test('copySelection copies selected blocks', () => {
      useModelStore.setState({ selectedBlockIds: ['block-1', 'block-2'] })
      const { copySelection } = useModelStore.getState()

      const result = copySelection()

      expect(result).not.toBeNull()
      expect(result!.blocks).toHaveLength(2)
      expect(result!.blocks.map(b => b.id)).toContain('block-1')
      expect(result!.blocks.map(b => b.id)).toContain('block-2')
    })

    test('copySelection includes wires between selected blocks', () => {
      useModelStore.setState({ selectedBlockIds: ['block-1', 'block-2'] })
      const { copySelection } = useModelStore.getState()

      const result = copySelection()

      expect(result!.wires).toHaveLength(1)
      expect(result!.wires[0].id).toBe('wire-1-2')
    })

    test('copySelection excludes wires to non-selected blocks', () => {
      useModelStore.setState({ selectedBlockIds: ['block-1'] })
      const { copySelection } = useModelStore.getState()

      const result = copySelection()

      expect(result!.wires).toHaveLength(0)
    })

    test('copySelection stores data in state', () => {
      useModelStore.setState({ selectedBlockIds: ['block-1'] })
      const { copySelection } = useModelStore.getState()

      copySelection()

      expect(useModelStore.getState().clipboardData).not.toBeNull()
    })

    test('copySelection stores data in localStorage', () => {
      useModelStore.setState({ selectedBlockIds: ['block-1'] })
      const { copySelection } = useModelStore.getState()

      copySelection()

      const stored = localStorage.getItem(CLIPBOARD_STORAGE_KEY)
      expect(stored).not.toBeNull()
      const parsed = deserializeClipboard(stored!)
      expect(parsed!.blocks[0].id).toBe('block-1')
    })
  })

  describe('Copy with Parameter Dependencies', () => {
    const testParams: ModelParameter[] = [
      { name: 'GAIN', signalType: 'double', value: 2.5 },
      { name: 'OFFSET', signalType: 'double', value: 1.0 },
    ]

    test('copySelection detects Source block parameter references', () => {
      useModelStore.setState({
        parameters: testParams,
        blocks: [
          {
            id: 'param-source',
            type: 'source',
            name: 'ParamSource',
            position: { x: 0, y: 0 },
            parameters: { useParameter: true, parameterName: 'GAIN', value: 2.5 },
          },
        ],
        selectedBlockIds: ['param-source'],
      })

      const { copySelection } = useModelStore.getState()
      const result = copySelection()

      expect(result!.dependencies.parameters).toHaveLength(1)
      expect(result!.dependencies.parameters[0].name).toBe('GAIN')
    })

    test('copySelection detects Evaluate block parameter references', () => {
      useModelStore.setState({
        parameters: testParams,
        blocks: [
          {
            id: 'eval-block',
            type: 'evaluate',
            name: 'Eval',
            position: { x: 0, y: 0 },
            parameters: { expression: 'in(0) * GAIN + OFFSET' },
          },
        ],
        selectedBlockIds: ['eval-block'],
      })

      const { copySelection } = useModelStore.getState()
      const result = copySelection()

      expect(result!.dependencies.parameters).toHaveLength(2)
      expect(result!.dependencies.parameters.map(p => p.name)).toContain('GAIN')
      expect(result!.dependencies.parameters.map(p => p.name)).toContain('OFFSET')
    })
  })

  describe('Cut Selection', () => {
    beforeEach(() => {
      useModelStore.setState({
        blocks: [
          { id: 'block-1', type: 'source', name: 'S1', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'block-2', type: 'scale', name: 'S2', position: { x: 100, y: 0 }, parameters: {} },
        ],
        wires: [
          { id: 'wire-1', sourceBlockId: 'block-1', sourcePortIndex: 0, targetBlockId: 'block-2', targetPortIndex: 0 },
        ],
        selectedBlockIds: ['block-1'],
      })
    })

    test('cutSelection copies blocks to clipboard', () => {
      const { cutSelection } = useModelStore.getState()

      const result = cutSelection()

      expect(result).not.toBeNull()
      expect(result!.blocks).toHaveLength(1)
    })

    test('cutSelection removes blocks from model', () => {
      const { cutSelection } = useModelStore.getState()

      cutSelection()

      const state = useModelStore.getState()
      expect(state.blocks).toHaveLength(1)
      expect(state.blocks[0].id).toBe('block-2')
    })

    test('cutSelection clears selection', () => {
      const { cutSelection } = useModelStore.getState()

      cutSelection()

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual([])
    })
  })

  describe('Paste from Clipboard', () => {
    beforeEach(() => {
      // Set up clipboard with a block
      const clipboardData: ClipboardData = {
        version: '1.0',
        sourceModelId: 'test-model-1',
        sourceSheetId: 'main',
        timestamp: Date.now(),
        blocks: [
          { id: 'orig-1', type: 'source', name: 'Source', position: { x: 100, y: 100 }, parameters: { value: 5 } },
          { id: 'orig-2', type: 'scale', name: 'Scale', position: { x: 200, y: 100 }, parameters: { gain: 2 } },
        ],
        wires: [
          { id: 'orig-wire', sourceBlockId: 'orig-1', sourcePortIndex: 0, targetBlockId: 'orig-2', targetPortIndex: 0 },
        ],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({
        clipboardData,
        blocks: [],
        wires: [],
      })
    })

    test('pasteFromClipboard adds blocks with new IDs', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      const result = pasteFromClipboard()

      expect(result.success).toBe(true)
      expect(result.pastedBlockIds).toHaveLength(2)
      expect(result.pastedBlockIds).not.toContain('orig-1')
      expect(result.pastedBlockIds).not.toContain('orig-2')
    })

    test('pasteFromClipboard adds wires with remapped IDs', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      const result = pasteFromClipboard()

      const state = useModelStore.getState()
      expect(state.wires).toHaveLength(1)
      expect(state.wires[0].id).not.toBe('orig-wire')
      // Wire should connect the new blocks
      expect(result.pastedBlockIds).toContain(state.wires[0].sourceBlockId)
      expect(result.pastedBlockIds).toContain(state.wires[0].targetBlockId)
    })

    test('pasteFromClipboard offsets positions on same sheet', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      pasteFromClipboard()

      const state = useModelStore.getState()
      const pastedBlock = state.blocks.find(b => b.name === 'Source')
      expect(pastedBlock!.position.x).toBe(120) // 100 + 20 default offset
      expect(pastedBlock!.position.y).toBe(120)
    })

    test('pasteFromClipboard selects pasted blocks', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      const result = pasteFromClipboard()

      const state = useModelStore.getState()
      expect(state.selectedBlockIds).toEqual(result.pastedBlockIds)
    })

    test('pasteFromClipboard returns error when clipboard empty', () => {
      useModelStore.setState({ clipboardData: null })
      const { pasteFromClipboard } = useModelStore.getState()

      const result = pasteFromClipboard()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Clipboard is empty')
    })
  })

  describe('Paste with Missing Dependencies', () => {
    beforeEach(() => {
      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [
          {
            id: 'param-block',
            type: 'source',
            name: 'ParamSource',
            position: { x: 0, y: 0 },
            parameters: { useParameter: true, parameterName: 'MISSING_PARAM', value: 42 },
          },
        ],
        wires: [],
        dependencies: {
          parameters: [{ name: 'MISSING_PARAM', signalType: 'double', value: 42 }],
        },
      }

      useModelStore.setState({
        clipboardData,
        parameters: [], // No parameters - MISSING_PARAM is missing
        blocks: [],
        wires: [],
      })
    })

    test('checkClipboardDependencies detects missing parameters', () => {
      const { checkClipboardDependencies } = useModelStore.getState()

      const result = checkClipboardDependencies()

      expect(result.allSatisfied).toBe(false)
      expect(result.missingParameters).toHaveLength(1)
      expect(result.missingParameters[0].name).toBe('MISSING_PARAM')
    })

    test('pasteFromClipboard fails without auto-import', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      const result = pasteFromClipboard()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing dependencies')
      expect(result.dependencyIssues).toBeDefined()
    })

    test('pasteFromClipboard succeeds with auto-import', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      const result = pasteFromClipboard({ importMissingParameters: true })

      expect(result.success).toBe(true)
      // Check parameter was imported
      const state = useModelStore.getState()
      expect(state.parameters.some(p => p.name === 'MISSING_PARAM')).toBe(true)
    })

    test('importMissingDependencies adds missing parameters', () => {
      const { importMissingDependencies, clipboardData } = useModelStore.getState()

      importMissingDependencies(clipboardData!)

      const state = useModelStore.getState()
      expect(state.parameters).toHaveLength(1)
      expect(state.parameters[0].name).toBe('MISSING_PARAM')
      expect(state.parameters[0].value).toBe(42)
    })
  })

  describe('Cross-Tab Clipboard', () => {
    test('getClipboardData loads from localStorage when state is null', () => {
      // Store data in localStorage
      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [{ id: 'stored-block', type: 'source', name: 'S', position: { x: 0, y: 0 }, parameters: {} }],
        wires: [],
        dependencies: { parameters: [] },
      }
      localStorage.setItem(CLIPBOARD_STORAGE_KEY, serializeClipboard(clipboardData))

      // Clear state
      useModelStore.setState({ clipboardData: null })

      const { getClipboardData } = useModelStore.getState()
      const result = getClipboardData()

      expect(result).not.toBeNull()
      expect(result!.blocks[0].id).toBe('stored-block')
    })

    test('getClipboardData returns state when available', () => {
      const stateClipboard: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [{ id: 'state-block', type: 'source', name: 'S', position: { x: 0, y: 0 }, parameters: {} }],
        wires: [],
        dependencies: { parameters: [] },
      }

      const storageClipboard: ClipboardData = {
        version: '1.0',
        timestamp: Date.now() - 1000,
        blocks: [{ id: 'storage-block', type: 'source', name: 'S', position: { x: 0, y: 0 }, parameters: {} }],
        wires: [],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({ clipboardData: stateClipboard })
      localStorage.setItem(CLIPBOARD_STORAGE_KEY, serializeClipboard(storageClipboard))

      const { getClipboardData } = useModelStore.getState()
      const result = getClipboardData()

      // Should return state, not localStorage
      expect(result!.blocks[0].id).toBe('state-block')
    })
  })

  describe('Duplicate Name Handling', () => {
    test('paste keeps original name if no conflict', () => {
      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [
          { id: 'b1', type: 'source', name: 'UniqueSource', position: { x: 0, y: 0 }, parameters: {} },
        ],
        wires: [],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({
        clipboardData,
        blocks: [
          { id: 'existing', type: 'scale', name: 'Scale1', position: { x: 100, y: 0 }, parameters: {} },
        ],
        wires: [],
        activeSheetId: 'other',
      })

      const { pasteFromClipboard } = useModelStore.getState()
      pasteFromClipboard()

      const state = useModelStore.getState()
      const pastedBlock = state.blocks.find(b => b.type === 'source')
      expect(pastedBlock!.name).toBe('UniqueSource')
    })

    test('paste generates new name when duplicate exists', () => {
      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [
          { id: 'b1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
        ],
        wires: [],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({
        clipboardData,
        blocks: [
          { id: 'existing', type: 'source', name: 'Source1', position: { x: 100, y: 0 }, parameters: {} },
        ],
        wires: [],
        activeSheetId: 'other',
      })

      const { pasteFromClipboard } = useModelStore.getState()
      pasteFromClipboard()

      const state = useModelStore.getState()
      const pastedBlock = state.blocks.find(b => b.id !== 'existing' && b.type === 'source')
      expect(pastedBlock!.name).toBe('Source1_2')
    })

    test('paste generates sequential names for multiple duplicates', () => {
      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [
          { id: 'b1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
          { id: 'b2', type: 'source', name: 'Source2', position: { x: 100, y: 0 }, parameters: {} },
        ],
        wires: [],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({
        clipboardData,
        blocks: [
          { id: 'e1', type: 'source', name: 'Source1', position: { x: 0, y: 100 }, parameters: {} },
          { id: 'e2', type: 'source', name: 'Source2', position: { x: 100, y: 100 }, parameters: {} },
        ],
        wires: [],
        activeSheetId: 'other',
      })

      const { pasteFromClipboard } = useModelStore.getState()
      pasteFromClipboard()

      const state = useModelStore.getState()
      const pastedBlocks = state.blocks.filter(b => b.id !== 'e1' && b.id !== 'e2')
      const names = pastedBlocks.map(b => b.name).sort()
      expect(names).toEqual(['Source1_2', 'Source2_2'])
    })

    test('paste suffixes original name even when other numbered names exist', () => {
      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [
          { id: 'b1', type: 'source', name: 'Source1', position: { x: 0, y: 0 }, parameters: {} },
        ],
        wires: [],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({
        clipboardData,
        blocks: [
          { id: 'e1', type: 'source', name: 'Source1', position: { x: 0, y: 100 }, parameters: {} },
          { id: 'e2', type: 'source', name: 'Source3', position: { x: 100, y: 100 }, parameters: {} },
        ],
        wires: [],
        activeSheetId: 'other',
      })

      const { pasteFromClipboard } = useModelStore.getState()
      pasteFromClipboard()

      const state = useModelStore.getState()
      const pastedBlock = state.blocks.find(b => b.id !== 'e1' && b.id !== 'e2')
      // Keep original stem; only suffix when that exact name is taken
      expect(pastedBlock!.name).toBe('Source1_2')
    })
  })

  describe('Nested subsystem ID remapping', () => {
    test('paste remaps nested ids so a second paste does not collide', () => {
      const nestedId = 'subsystem_1429'
      const makeSub = (rootId: string): BlockData => ({
        id: rootId,
        type: 'subsystem',
        name: 'S_IB',
        position: { x: 0, y: 0 },
        parameters: {
          sheets: [
            {
              id: 'inner_sheet',
              name: 'Inner',
              extents: { width: 400, height: 300 },
              blocks: [
                {
                  id: nestedId,
                  type: 'sum',
                  name: 'Add2',
                  position: { x: 10, y: 10 },
                  parameters: {},
                },
              ],
              connections: [],
            },
          ],
        },
      })

      const clipboardData: ClipboardData = {
        version: '1.0',
        timestamp: Date.now(),
        blocks: [makeSub('sub_root')],
        wires: [],
        dependencies: { parameters: [] },
      }

      // Target already has the nested id from a prior import
      useModelStore.setState({
        clipboardData,
        blocks: [makeSub('existing_sub')],
        wires: [],
        sheets: [
          {
            id: 'main',
            name: 'Main',
            blocks: [makeSub('existing_sub')],
            connections: [],
            extents: { width: 1000, height: 800 },
          },
        ],
        activeSheetId: 'main',
      })

      const { pasteFromClipboard } = useModelStore.getState()
      const result = pasteFromClipboard()
      expect(result.success).toBe(true)

      const state = useModelStore.getState()
      const pasted = state.blocks.find(b => b.id !== 'existing_sub')
      expect(pasted).toBeDefined()
      const inner = (pasted!.parameters?.sheets as any[])[0]
      expect(inner.blocks[0].id).not.toBe(nestedId)

      const allIds = new Set<string>()
      for (const b of state.blocks) {
        allIds.add(b.id)
        for (const sh of (b.parameters?.sheets as any[]) || []) {
          for (const ib of sh.blocks || []) allIds.add(ib.id)
        }
      }
      expect(allIds.size).toBe(4) // existing_sub + nested + pasted_sub + pasted_nested
    })
  })

  describe('Position Handling', () => {
    beforeEach(() => {
      const clipboardData: ClipboardData = {
        version: '1.0',
        sourceSheetId: 'other-sheet',
        timestamp: Date.now(),
        blocks: [
          { id: 'b1', type: 'source', name: 'S1', position: { x: 100, y: 50 }, parameters: {} },
          { id: 'b2', type: 'scale', name: 'S2', position: { x: 200, y: 50 }, parameters: {} },
        ],
        wires: [],
        dependencies: { parameters: [] },
      }

      useModelStore.setState({
        clipboardData,
        blocks: [],
        wires: [],
        activeSheetId: 'main',
      })
    })

    test('paste with position centers blocks at specified position', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      pasteFromClipboard({ position: { x: 300, y: 200 } })

      const state = useModelStore.getState()
      // Centroid of original blocks: (150, 50)
      // Offset needed: 300-150=150, 200-50=150
      const s1 = state.blocks.find(b => b.name === 'S1')
      const s2 = state.blocks.find(b => b.name === 'S2')

      expect(s1!.position.x).toBe(250) // 100 + 150
      expect(s1!.position.y).toBe(200) // 50 + 150
      expect(s2!.position.x).toBe(350) // 200 + 150
      expect(s2!.position.y).toBe(200) // 50 + 150
    })

    test('paste with custom offset uses specified offset', () => {
      const { pasteFromClipboard } = useModelStore.getState()

      pasteFromClipboard({ offset: { x: 50, y: 30 } })

      const state = useModelStore.getState()
      const s1 = state.blocks.find(b => b.name === 'S1')

      expect(s1!.position.x).toBe(150) // 100 + 50
      expect(s1!.position.y).toBe(80)  // 50 + 30
    })
  })
})
