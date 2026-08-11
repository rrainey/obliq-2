/**
 * Regression: 6-DoF / 9.1 open-loop ascent C codegen naming
 * - demux multi-out members name_0 not name_row0_col0
 * - evaluate scientific literals 1e-12 not 1e-12.0
 * - mux matrix [4][1] uses [i][j]
 * - uminus vectors use element-wise loops
 */

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { getSignalMemberName } from '@/lib/codegen/signalMemberName'
import { c99ExpressionToCode } from '@/lib/c99ExpressionCodeGen'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { MuxBlockModule } from '@/lib/blocks/MuxBlockModule'
import { UnaryMinusBlockModule } from '@/lib/blocks/UnaryMinusBlockModule'
import { buildSixDofOpenLoopAscent } from '../examples/saturn-ib/sixDofVarMassEom'

describe('6-DoF / 9.1 codegen naming fixes', () => {
  test('demux signal members use name_N', () => {
    expect(
      getSignalMemberName('demux_q_raw', 'demux', 0, {
        id: 'd',
        name: 'demux_q_raw',
        type: 'demux',
        position: { x: 0, y: 0 },
        parameters: { outputCount: 4, inputDimensions: [4, 1] },
      } as any)
    ).toBe('demux_q_raw_0')
    expect(
      getSignalMemberName('demux_omega', 'demux', 1, {
        id: 'd2',
        name: 'demux_omega',
        type: 'demux',
        position: { x: 0, y: 0 },
        parameters: { outputCount: 3, inputDimensions: [3] },
      } as any)
    ).toBe('demux_omega_1')
  })

  test('scientific float literals stay valid C', () => {
    const parser = new C99ExpressionParser('in(0) > 1e-12 ? in(0) : 1e-12')
    const ast = parser.parse()
    const { code } = c99ExpressionToCode(ast, ['_in0'])
    expect(code).not.toMatch(/1e-12\.0/)
    expect(code).toMatch(/1e-12/)
  })

  test('mux double[4][1] assigns with 2D indices', () => {
    const mod = new MuxBlockModule()
    const block = {
      id: 'm',
      name: 'q_hat',
      type: 'mux',
      position: { x: 0, y: 0 },
      parameters: {
        rows: 4,
        cols: 1,
        baseType: 'double',
        outputType: 'double[4][1]',
        outputShape: 'matrix',
      },
    } as any
    const code = mod.generateComputation(block, ['a', 'b', 'c', 'd'])
    expect(code).toContain('q_hat[0][0] = a')
    expect(code).toContain('q_hat[3][0] = d')
    expect(code).not.toMatch(/q_hat\[0\] = /)
  })

  test('uminus on double[3] uses element loop', () => {
    const mod = new UnaryMinusBlockModule()
    const block = {
      id: 'u',
      name: 'neg',
      type: 'uminus',
      position: { x: 0, y: 0 },
      parameters: {},
    } as any
    const code = mod.generateComputation(block, ['model->signals.v'], ['double[3]'])
    expect(code).toMatch(/for \(int i = 0/)
    expect(code).toContain('neg[i] = -model->signals.v[i]')
    expect(code).not.toMatch(/neg = -model->signals\.v;/)
  })

  test('9.1 open-loop ascent full codegen has no demux/scientific/uminus bugs', () => {
    const model = buildSixDofOpenLoopAscent()
    const gen = new CodeGenerator({
      modelName: 'saturn_9_1_open_loop_6dof_ascent',
      integrationAlgorithm: 'rk4',
    })
    const result = gen.generate(model.sheets as any, model.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    // demux members
    expect(result.header).toMatch(/demux_q_raw_0/)
    expect(result.source).toMatch(/demux_q_raw_0/)
    expect(result.source).not.toMatch(/demux_q_raw_row0_col0/)
    expect(result.source).not.toMatch(/demux_omega__0_/)
    // scientific literal
    expect(result.source).not.toMatch(/1e-12\.0/)
    // matrix mux
    expect(result.source).toMatch(/q_hat\[0\]\[0\]/)
    // vector uminus not scalar negation of array
    expect(result.source).not.toMatch(/=\s*-model->signals\.\w+_mu_r_vec;/)
    expect(result.source).not.toMatch(/=\s*-model->signals\.\w+_w_x_v;/)
    // post-integration mass limits use flattened state name
    expect(result.header).toMatch(/EOM_6DoF_VarMass_mass_states/)
    expect(result.source).toMatch(/EOM_6DoF_VarMass_mass_states/)
    expect(result.source).not.toMatch(/model->states\.mass_states/)
  })

  test('9.1 WASM wrapper does not return vector/matrix from wasm_get_output', () => {
    const model = buildSixDofOpenLoopAscent()
    const gen = new WasmCodeGenerator({
      modelName: 'saturn_9_1_open_loop_6dof_ascent',
      integrationAlgorithm: 'rk4',
    })
    const result = gen.generateWasm(model.sheets as any, model.parameters || [])
    // Must not return double[3] / double[4][1] signals as scalar double
    expect(result.wasmWrapper).not.toMatch(/return .*\.EOM_6DoF_VarMass_r_i;/)
    expect(result.wasmWrapper).not.toMatch(/return .*\.EOM_6DoF_VarMass_v_b;/)
    expect(result.wasmWrapper).not.toMatch(/return .*\.EOM_6DoF_VarMass_omega_b;/)
    expect(result.wasmWrapper).not.toMatch(/return .*\.EOM_6DoF_VarMass_q_hat;/)
    // Scalars are OK (mass, r_mag, thrust, altitude, …)
    expect(result.wasmWrapper).toMatch(/wasm_get_output/)
  })

  test('9.2 parameter macros do not clobber gain signal members', () => {
    const { buildSixDofClosedLoopPitchRateDamp } = require('../examples/saturn-ib/sixDofVarMassEom')
    const model = buildSixDofClosedLoopPitchRateDamp()
    const gen = new CodeGenerator({
      modelName: 'saturn_9_2_closed_loop_pitch_rate_damp',
      integrationAlgorithm: 'rk4',
    })
    const result = gen.generate(model.sheets as any, model.parameters || [])
    // No #define that expands signals.K_q / signals.Kq_gain
    expect(result.header).not.toMatch(/#define K_q\b/)
    expect(result.header).not.toMatch(/#define Kq_gain\b/)
    expect(result.source).toMatch(/signals\.Kq_gain/)
    expect(result.source).not.toMatch(/Error generating code for/)
  })
})
