/**
 * Bool relational mapping, hierarchical sheet labels, mux expand, validation gate.
 */

import { mapBlock } from '../src/lib/mdl2obliq/mapper'
import { validateSheetLabels, collectBlocksRecursive } from '../src/lib/sheetLabelUtils'
import { expandMuxVectorInputs } from '../src/lib/mdl2obliq/expandMuxVectorInputs'
import { validateEmittedObliqModel } from '../src/lib/mdl2obliq/validateObliqModel'
import { BlockData } from '@/components/BlockNode'

describe('mdl2obliq RelationalOperator → bool', () => {
  test('maps to evaluate with outputType bool', () => {
    const mapped = mapBlock({
      blockType: 'RelationalOperator',
      name: 'T_L_prime',
      params: { Operator: '<' },
      system: undefined
    } as any)
    expect(mapped.type).toBe('evaluate')
    expect(mapped.parameters?.outputType).toBe('bool')
    expect(String(mapped.parameters?.expression)).not.toMatch(/1\.0:0\.0/)
    expect(String(mapped.parameters?.expression)).toContain('in(0)<in(1)')
  })

  test('Logic AND maps to bool', () => {
    const mapped = mapBlock({
      blockType: 'Logic',
      name: 'Logical_Operator2',
      params: { Operator: 'AND', Inputs: '2' },
      system: undefined
    } as any)
    expect(mapped.parameters?.outputType).toBe('bool')
  })
})

describe('hierarchical sheet labels', () => {
  test('root From finds nested global Goto sink', () => {
    const nestedSink: BlockData = {
      id: 'sink1',
      type: 'sheet_label_sink',
      name: 'Goto_T1',
      position: { x: 0, y: 0 },
      parameters: { signalName: 'T1_sec', tagVisibility: 'global' }
    }
    const nestedSheet = {
      id: 'inner',
      name: 'LVDC',
      blocks: [nestedSink],
      connections: []
    }
    const sub: BlockData = {
      id: 'iu',
      type: 'subsystem',
      name: 'IU',
      position: { x: 0, y: 0 },
      parameters: { sheets: [nestedSheet] }
    }
    const from: BlockData = {
      id: 'from1',
      type: 'sheet_label_source',
      name: 'From45',
      position: { x: 0, y: 0 },
      parameters: { signalName: 'T1_sec' }
    }
    const issues = validateSheetLabels([from, sub])
    expect(issues.filter(i => i.type === 'unmatched_source')).toEqual([])
    expect(collectBlocksRecursive([from, sub]).some(b => b.id === 'sink1')).toBe(
      true
    )
  })

  test('still errors when sink truly missing', () => {
    const from: BlockData = {
      id: 'from1',
      type: 'sheet_label_source',
      name: 'FromX',
      position: { x: 0, y: 0 },
      parameters: { signalName: 'no_such_tag' }
    }
    const issues = validateSheetLabels([from])
    expect(issues.some(i => i.type === 'unmatched_source')).toBe(true)
  })
})

describe('expandMuxVectorInputs', () => {
  test('demuxes double[3] into three scalar mux ports', () => {
    // Use an input_port with explicit vector type — more reliable than constant arrays
    const src: BlockData = {
      id: 'src',
      type: 'input_port',
      name: 'Xe_m',
      position: { x: 0, y: 0 },
      parameters: { portName: 'Xe_m', dataType: 'double[3]' }
    }
    const mux: BlockData = {
      id: 'mux',
      type: 'mux',
      name: 'Mux',
      position: { x: 100, y: 0 },
      parameters: { cols: 1, rows: 1, outputType: 'double[1]' }
    }
    const model = {
      sheets: [
        {
          id: 's0',
          name: 'Main',
          blocks: [src, mux],
          connections: [
            {
              id: 'w0',
              sourceBlockId: 'src',
              sourcePortIndex: 0,
              targetBlockId: 'mux',
              targetPortIndex: 0
            }
          ]
        }
      ]
    }
    const stats = expandMuxVectorInputs(model as any)
    expect(stats.expandedMuxes).toBe(1)
    expect(stats.insertedDemuxes).toBe(1)
    expect(mux.parameters?.cols).toBe(3)
    expect(mux.parameters?.outputType).toBe('double[3]')
    const toMux = model.sheets[0].connections.filter(c => c.targetBlockId === 'mux')
    expect(toMux).toHaveLength(3)
  })
})

describe('validateEmittedObliqModel gate', () => {
  test('passes a trivial valid sheet', () => {
    const model = {
      sheets: [
        {
          blocks: [
            {
              id: 'c',
              type: 'source',
              name: 'C',
              position: { x: 0, y: 0 },
              parameters: { signalType: 'constant', value: 1, dataType: 'double' }
            },
            {
              id: 'o',
              type: 'output_port',
              name: 'Out',
              position: { x: 100, y: 0 },
              parameters: { portName: 'Out', dataType: 'double' }
            }
          ] as BlockData[],
          connections: [
            {
              id: 'w',
              sourceBlockId: 'c',
              sourcePortIndex: 0,
              targetBlockId: 'o',
              targetPortIndex: 0
            }
          ]
        }
      ]
    }
    const v = validateEmittedObliqModel(model)
    expect(v.valid).toBe(true)
  })
})
