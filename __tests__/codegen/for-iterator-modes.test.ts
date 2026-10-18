/**
 * Core for-iterator subsystem mode coverage (codegen / flatten).
 *
 * Complements numeric native tests: accumulate off, zero-based index,
 * resetStates per-iter reset, multi-output accumulate.
 */

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

function sheet(
  id: string,
  name: string,
  blocks: BlockData[],
  connections: WireData[]
): Sheet {
  return { id, name, blocks, connections, extents: { width: 800, height: 400 } }
}

function block(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return { id, type, name, position: { x: 0, y: 0 }, parameters }
}

function wire(
  id: string,
  sourceBlockId: string,
  sourcePortIndex: number,
  targetBlockId: string,
  targetPortIndex: number
): WireData {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex }
}

/** Body: y = iteration_index (optionally second out = u). */
function iteratorModel(opts: {
  iterationLimit: number
  indexBase: 0 | 1
  resetStates: 'held' | 'reset'
  accumulateOutputs: boolean
  dualOutputs?: boolean
}): Sheet[] {
  const outPorts = opts.dualOutputs ? ['y', 'z'] : ['y']
  const bodyBlocks: BlockData[] = [
    block('in_u', 'input_port', 'u', { portName: 'u', dataType: 'double' }),
    block('idx', 'iteration_index', 'For_Iterator', { indexBase: opts.indexBase }),
    block('out_y', 'output_port', 'y', { portName: 'y', dataType: 'double' })
  ]
  const bodyWires: WireData[] = [
    wire('w_idx_y', 'idx', 0, 'out_y', 0)
  ]
  if (opts.dualOutputs) {
    bodyBlocks.push(
      block('out_z', 'output_port', 'z', { portName: 'z', dataType: 'double' })
    )
    bodyWires.push(wire('w_u_z', 'in_u', 0, 'out_z', 0))
  }

  const body = sheet('body', 'Loop', bodyBlocks, bodyWires)

  return [
    sheet(
      'main',
      'Main',
      [
        block('u', 'source', 'U', {
          signalType: 'constant',
          value: 1,
          dataType: 'double'
        }),
        block('seg', 'for_iterator_subsystem', 'Loop', {
          inputPorts: ['u'],
          outputPorts: outPorts,
          codeGenStrategy: 'segregated_atomic',
          iterationLimit: opts.iterationLimit,
          indexBase: opts.indexBase,
          resetStates: opts.resetStates,
          accumulateOutputs: opts.accumulateOutputs,
          sheets: [body]
        }),
        block('Y', 'output_port', 'Y', { portName: 'Y', dataType: 'double' }),
        ...(opts.dualOutputs
          ? [block('Z', 'output_port', 'Z', { portName: 'Z', dataType: 'double' })]
          : [])
      ],
      [
        wire('c1', 'u', 0, 'seg', 0),
        wire('c2', 'seg', 0, 'Y', 0),
        ...(opts.dualOutputs ? [wire('c3', 'seg', 1, 'Z', 0)] : [])
      ]
    )
  ]
}

describe('for_iterator_subsystem modes (core)', () => {
  test('accumulateOutputs=false: N-pass loop without __fi_acc_', () => {
    const sheets = iteratorModel({
      iterationLimit: 4,
      indexBase: 1,
      resetStates: 'held',
      accumulateOutputs: false
    })
    const flat = new ModelFlattener().flattenModel(sheets, 'fi_last')
    expect(flat.model.segregatedSubsystems?.[0]?.forIterator).toEqual({
      iterationLimit: 4,
      indexBase: 1,
      resetStates: 'held',
      accumulateOutputs: false
    })

    const src = new CodeGenerator({ modelName: 'fi_last' }).generate(sheets).source || ''
    expect(src).toMatch(/For Iterator:\s*4 pass/)
    expect(src).toMatch(/accumulate=false/)
    expect(src).toMatch(/for \(int __fi = 1; __fi < 5; \+\+__fi\)/)
    expect(src).not.toMatch(/__fi_acc_/)
    expect(src).toMatch(/Loop_compute_outputs\(/)
  })

  test('indexBase=0: zero-based loop bounds', () => {
    const sheets = iteratorModel({
      iterationLimit: 5,
      indexBase: 0,
      resetStates: 'held',
      accumulateOutputs: true
    })
    const flat = new ModelFlattener().flattenModel(sheets, 'fi_zb')
    expect(flat.model.segregatedSubsystems?.[0]?.forIterator?.indexBase).toBe(0)

    const src = new CodeGenerator({ modelName: 'fi_zb' }).generate(sheets).source || ''
    expect(src).toMatch(/for \(int __fi = 0; __fi < 5; \+\+__fi\)/)
    expect(src).toMatch(/iteration_index = __fi/)
    expect(src).toMatch(/__fi_acc_y/)
  })

  test('resetStates=reset: per-iteration _reset_states call; held omits it', () => {
    const resetSheets = iteratorModel({
      iterationLimit: 3,
      indexBase: 1,
      resetStates: 'reset',
      accumulateOutputs: false
    })
    const heldSheets = iteratorModel({
      iterationLimit: 3,
      indexBase: 1,
      resetStates: 'held',
      accumulateOutputs: false
    })

    const resetFlat = new ModelFlattener().flattenModel(resetSheets, 'fi_rst')
    expect(resetFlat.model.segregatedSubsystems?.[0]?.hasResetInput).toBe(true)
    expect(resetFlat.model.segregatedSubsystems?.[0]?.forIterator?.resetStates).toBe(
      'reset'
    )

    const resetSrc =
      new CodeGenerator({ modelName: 'fi_rst' }).generate(resetSheets).source || ''
    expect(resetSrc).toMatch(/resetStates=reset/)
    expect(resetSrc).toMatch(/for \(int __fi = 1; __fi < 4; \+\+__fi\)[\s\S]*_reset_states\(/)

    const heldSrc =
      new CodeGenerator({ modelName: 'fi_held' }).generate(heldSheets).source || ''
    expect(heldSrc).toMatch(/resetStates=held/)
    // No per-iter reset inside the for-loop body
    const loopBody = heldSrc.match(
      /for \(int __fi = 1; __fi < 4; \+\+__fi\) \{([\s\S]*?)\n    \}/
    )?.[1]
    expect(loopBody).toBeDefined()
    expect(loopBody).not.toMatch(/_reset_states\(/)
  })

  test('multi-output accumulate: both scalar ports get __fi_acc_', () => {
    const sheets = iteratorModel({
      iterationLimit: 3,
      indexBase: 1,
      resetStates: 'held',
      accumulateOutputs: true,
      dualOutputs: true
    })
    const src =
      new CodeGenerator({ modelName: 'fi_multi' }).generate(sheets).source || ''
    expect(src).toMatch(/double __fi_acc_y = 0\.0/)
    expect(src).toMatch(/double __fi_acc_z = 0\.0/)
    expect(src).toMatch(/__fi_acc_y \+= /)
    expect(src).toMatch(/__fi_acc_z \+= /)
    expect(src).toMatch(/outputs\.y = __fi_acc_y/)
    expect(src).toMatch(/outputs\.z = __fi_acc_z/)
  })
})
