// lib/__tests__/sheetLabels.test.ts
import { describe, it, expect } from '@jest/globals'
import { 
  collectAvailableSignalNames,
  findSheetLabelSinks,
  findSheetLabelSources,
  resolveSheetLabelConnections,
  validateSheetLabels,
  getSheetLabelSinkInfo
} from '@/lib/sheetLabelUtils'
import { BlockData } from '@/components/BlockNode'

describe('Sheet Label Utilities', () => {
  const createBlock = (
    id: string,
    type: string,
    name: string,
    parameters?: Record<string, any>
  ): BlockData => ({
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    parameters
  })

  describe('collectAvailableSignalNames', () => {
    it('should collect signal names from sheet label sinks', () => {
      const blocks: BlockData[] = [
        createBlock('1', 'sheet_label_sink', 'Sink1', { signalName: 'signal_a' }),
        createBlock('2', 'sheet_label_sink', 'Sink2', { signalName: 'signal_b' }),
        createBlock('3', 'sheet_label_sink', 'Sink3', {}), // No signal name
        createBlock('4', 'sum', 'Sum1', {})
      ]
      
      const names = collectAvailableSignalNames(blocks, [])
      expect(names).toEqual(['signal_a', 'signal_b'])
    })
  })

  describe('resolveSheetLabelConnections', () => {
    it('should match sources to sinks by signal name', () => {
      const blocks: BlockData[] = [
        createBlock('sink1', 'sheet_label_sink', 'Sink1', { signalName: 'test_signal' }),
        createBlock('source1', 'sheet_label_source', 'Source1', { signalName: 'test_signal' }),
        createBlock('source2', 'sheet_label_source', 'Source2', { signalName: 'unknown_signal' })
      ]
      
      const connections = resolveSheetLabelConnections(blocks)
      expect(connections).toHaveLength(1)
      expect(connections[0]).toEqual({
        sourceBlock: blocks[1],
        sinkBlock: blocks[0],
        signalName: 'test_signal'
      })
    })
  })

  describe('validateSheetLabels', () => {
    it('should detect duplicate sink signal names', () => {
      const blocks: BlockData[] = [
        createBlock('1', 'sheet_label_sink', 'Sink1', { signalName: 'duplicate' }),
        createBlock('2', 'sheet_label_sink', 'Sink2', { signalName: 'duplicate' })
      ]
      
      const issues = validateSheetLabels(blocks)
      expect(issues).toHaveLength(2)
      expect(issues[0].type).toBe('duplicate_sink')
      expect(issues[0].signalName).toBe('duplicate')
    })

    it('should detect unmatched sources', () => {
      const blocks: BlockData[] = [
        createBlock('1', 'sheet_label_source', 'Source1', { signalName: 'missing_sink' })
      ]
      
      const issues = validateSheetLabels(blocks)
      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('unmatched_source')
      expect(issues[0].signalName).toBe('missing_sink')
    })

    it('should detect empty signal names', () => {
      const blocks: BlockData[] = [
        createBlock('1', 'sheet_label_sink', 'Sink1', { signalName: '' }),
        createBlock('2', 'sheet_label_source', 'Source1', {})
      ]
      
      const issues = validateSheetLabels(blocks)
      expect(issues).toHaveLength(2)
      issues.forEach(issue => {
        expect(issue.type).toBe('empty_signal_name')
      })
    })
  })
})