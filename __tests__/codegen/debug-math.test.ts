/**
 * OBLIQ_DEBUG_MATH: safe divide/mod + RK4 isfinite instrumentation
 */

import { DivideBlockModule } from '@/lib/blocks/DivideBlockModule'
import { MultiplyBlockModule } from '@/lib/blocks/MultiplyBlockModule'
import { EvaluateBlockModule } from '@/lib/blocks/EvaluateBlockModule'
import { c99ExpressionToCode } from '@/lib/c99ExpressionCodeGen'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { StateIntegrator } from '@/lib/codegen/StateIntegrator'
import type { FlattenedModel } from '@/lib/codegen/ModelFlattener'
import type { BlockData } from '@/components/BlockNode'

function block(partial: Partial<BlockData> & { type: string; name: string }): BlockData {
  return {
    id: partial.id || partial.name,
    type: partial.type,
    name: partial.name,
    position: { x: 0, y: 0 },
    parameters: partial.parameters || {}
  } as BlockData
}

describe('OBLIQ_DEBUG_MATH codegen', () => {
  test('DivideBlockModule emits obliq_safe_div when debugMath', () => {
    const mod = new DivideBlockModule()
    const b = block({ type: 'divide', name: 'Divide5' })
    const off = mod.generateComputation(b, ['a', 'b'], ['double', 'double'], {
      debugMath: false
    })
    expect(off).toContain('a) / (b')
    expect(off).not.toContain('obliq_safe_div')

    const on = mod.generateComputation(b, ['a', 'b'], ['double', 'double'], {
      debugMath: true
    })
    expect(on).toContain('obliq_safe_div')
    expect(on).toContain('"Divide5"')
  })

  test('Multiply ops */ emits safe reciprocal when debugMath', () => {
    const mod = new MultiplyBlockModule()
    const b = block({
      type: 'multiply',
      name: 'Product',
      parameters: { ops: '*/', numInputs: 2 }
    })
    const on = mod.generateComputation(b, ['n', 'd'], ['double', 'double'], {
      debugMath: true
    })
    expect(on).toContain('obliq_safe_div')
    expect(on).toContain('"Product"')
  })

  test('evaluate expression / uses obliq_safe_div', () => {
    const ast = new C99ExpressionParser('in(0)/in(1)').parse()
    const { code } = c99ExpressionToCode(ast, ['x', 'y'], {
      debugMath: true,
      blockName: 'Math_Function'
    })
    expect(code).toContain('obliq_safe_div')
    expect(code).toContain('"Math_Function"')
  })

  test('evaluate mod floor-div path instruments inner /', () => {
    const ast = new C99ExpressionParser(
      'in(0)-in(1)*floor(in(0)/in(1))'
    ).parse()
    const { code } = c99ExpressionToCode(ast, ['_a', '_b'], {
      debugMath: true,
      blockName: 'T_to_GMST'
    })
    expect(code).toContain('obliq_safe_div')
    expect(code).toContain('"T_to_GMST"')
  })

  test('EvaluateBlockModule passes debugMath through', () => {
    const mod = new EvaluateBlockModule()
    const b = block({
      type: 'evaluate',
      name: 'Reciprocal',
      parameters: { numInputs: 1, expression: '1.0/in(0)' }
    })
    const on = mod.generateComputation(b, ['u'], ['double'], { debugMath: true })
    expect(on).toContain('obliq_safe_div')
    expect(on).toContain('"Reciprocal"')
  })

  test('CodeGenerator with debugMath emits preamble and helpers', () => {
    const sheets = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          block({
            id: 'src',
            type: 'source',
            name: 'One',
            parameters: { signalType: 'constant', value: 1, dataType: 'double' }
          }),
          block({
            id: 'zero',
            type: 'source',
            name: 'Zero',
            parameters: { signalType: 'constant', value: 0, dataType: 'double' }
          }),
          block({ id: 'div', type: 'divide', name: 'Boom', parameters: {} }),
          block({
            id: 'out',
            type: 'output_port',
            name: 'y',
            parameters: { portName: 'y', dataType: 'double' }
          })
        ],
        connections: [
          {
            id: 'w1',
            sourceBlockId: 'src',
            sourcePortIndex: 0,
            targetBlockId: 'div',
            targetPortIndex: 0
          },
          {
            id: 'w2',
            sourceBlockId: 'zero',
            sourcePortIndex: 0,
            targetBlockId: 'div',
            targetPortIndex: 1
          },
          {
            id: 'w3',
            sourceBlockId: 'div',
            sourcePortIndex: 0,
            targetBlockId: 'out',
            targetPortIndex: 0
          }
        ]
      }
    ]

    const gen = new CodeGenerator({
      modelName: 'debug_math_div0',
      debugMath: true
    })
    const result = gen.generate(sheets as any)
    expect(result.source).toContain('OBLIQ_DEBUG_MATH')
    expect(result.source).toContain('obliq_safe_div')
    expect(result.source).toContain('"Boom"')
  })

  test('RK4 assert_states_finite emitted when debugMath and stateful', () => {
    const emptyTypeMap = new Map<string, string>()
    const modelWithStates: FlattenedModel = {
      blocks: [
        {
          block: {
            id: 'int1',
            type: 'integrator',
            name: 'Integrator1',
            position: { x: 0, y: 0 },
            parameters: { initialValue: 0, dataType: 'double' }
          },
          originalId: 'int1',
          flattenedName: 'Integrator1',
          subsystemPath: [],
          enableScope: null,
          sampleScope: null,
          isSegregated: false
        } as any
      ],
      blockMap: new Map(),
      connections: [],
      subsystemEnableInfo: [],
      enableScopes: new Map(),
      metadata: {
        modelName: 'rk4_dbg',
        totalBlocks: 1,
        totalConnections: 0,
        subsystemCount: 0,
        maxNestingDepth: 1
      }
    }
    emptyTypeMap.set('int1', 'double')

    const off = new StateIntegrator(modelWithStates, emptyTypeMap, {
      debugMath: false
    })
    expect(off.generateRK4Integration()).not.toContain('assert_states_finite')

    const on = new StateIntegrator(modelWithStates, emptyTypeMap, {
      debugMath: true
    })
    const rk4 = on.generateRK4Integration()
    expect(rk4).toContain('rk4_dbg_assert_states_finite(&k1')
    expect(rk4).toContain('rk4_dbg_assert_states_finite(&k4')
    const fn = on.generateFiniteAssertFunction()
    expect(fn).toContain('OBLIQ_CHECK_FINITE')
    expect(fn).toContain('Integrator1_states')
  })
})
