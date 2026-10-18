/**
 * UH60 P2 — lookup_1d / lookup_2d codegen reads model-parameter tables.
 *
 * Fixture: uh60-obliq/fixtures/p2_lookup_param_tables.json
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { Lookup1DBlockModule } from '@/lib/blocks/Lookup1DBlockModule'
import { Lookup2DBlockModule } from '@/lib/blocks/Lookup2DBlockModule'
import { Sheet } from '@/lib/simulationTypes'

const FIXTURE = path.resolve(
  '/home/riley/src/uh60-obliq/fixtures/p2_lookup_param_tables.json'
)

describe('lookup param tables (UH60 P2)', () => {
  const modelJson = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const sheets = modelJson.sheets as Sheet[]

  test('Lookup1D generateComputation uses PARAM arrays + _SIZE', () => {
    const mod = new Lookup1DBlockModule()
    const block = {
      id: 'l1',
      type: 'lookup_1d',
      name: 'LDMR_Low',
      position: { x: 0, y: 0 },
      parameters: {
        inputValuesParam: 'LDMR_LO',
        outputValuesParam: 'LDMRLO',
        extrapolation: 'extrapolate'
      }
    }
    const code = mod.generateComputation(block as any, ['model->signals.X'])
    expect(code).toContain('LDMR_LO')
    expect(code).toContain('LDMRLO')
    expect(code).toContain('LDMR_LO_SIZE')
    expect(code).toContain('LDMRLO_SIZE')
    expect(code).not.toMatch(/const double LDMR_Low_inputs\[/)
  })

  test('Lookup2D generateComputation uses PARAM matrix + _ROWS/_COLS', () => {
    const mod = new Lookup2DBlockModule()
    const block = {
      id: 'l2',
      type: 'lookup_2d',
      name: 'CD_Low',
      position: { x: 0, y: 0 },
      parameters: {
        input1ValuesParam: 'AFTFMR_LO',
        input2ValuesParam: 'MACHMR_LO',
        outputTableParam: 'CDMRLO',
        extrapolation: 'extrapolate'
      }
    }
    const code = mod.generateComputation(block as any, [
      'model->signals.X',
      'model->signals.Y'
    ])
    expect(code).toContain('AFTFMR_LO')
    expect(code).toContain('MACHMR_LO')
    expect(code).toContain('CDMRLO')
    expect(code).toContain('CDMRLO_ROWS')
    expect(code).toContain('CDMRLO_COLS')
    expect(code).toContain('AFTFMR_LO[')
    expect(code).toContain('MACHMR_LO[')
  })

  test('full codegen emits header PARAM arrays and lookup references', () => {
    const generator = new CodeGenerator({ modelName: 'p2_lookup' })
    const result = generator.generate(sheets, modelJson.parameters || [])
    expect(result.header).toContain('#define LDMR_LO_SIZE 3')
    expect(result.header).toContain('const double LDMR_LO[LDMR_LO_SIZE]')
    expect(result.header).toContain('#define CDMRLO_ROWS 2')
    expect(result.header).toContain('#define CDMRLO_COLS 2')
    expect(result.header).toContain('const double CDMRLO[CDMRLO_ROWS][CDMRLO_COLS]')

    const src = result.source || ''
    expect(src).toMatch(/LDMR_LO/)
    expect(src).toMatch(/CDMRLO/)
    expect(src).toMatch(/CDMRLO_ROWS/)
  })

  test('inline lookup still works without *Param fields', () => {
    const mod = new Lookup1DBlockModule()
    const block = {
      id: 'l',
      type: 'lookup_1d',
      name: 'Inline',
      position: { x: 0, y: 0 },
      parameters: {
        inputValues: [0, 1],
        outputValues: [0, 10],
        extrapolation: 'clamp'
      }
    }
    const code = mod.generateComputation(block as any, ['u'])
    expect(code).toContain('const double Inline_inputs[2] = {0, 1}')
    expect(code).toContain('const double Inline_outputs[2] = {0, 10}')
  })
})
