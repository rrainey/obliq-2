/**
 * UH60 P4 — DCM/matrix path + Goto/From across for_iterator
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { OrientationConversionBlockModule } from '@/lib/blocks/OrientationConversionBlockModule'
import { TypePropagator } from '@/lib/codegen/TypePropagator'
import { Sheet } from '@/lib/simulationTypes'

const DCM_FIXTURE = path.resolve(
  '/home/riley/src/uh60-obliq/fixtures/p4_euler_dcm_matrix.json'
)
const GOTO_FIXTURE = path.resolve(
  '/home/riley/src/uh60-obliq/fixtures/p4_goto_across_iterator.json'
)

describe('UH60 P4 DCM + Goto across iterator', () => {
  test('euler_to_dcm accepts single double[3] vector port (aerolib)', () => {
    const mod = new OrientationConversionBlockModule()
    const block = {
      id: 'abdsh',
      type: 'orientation_conversion',
      name: 'ABDSH',
      position: { x: 0, y: 0 },
      parameters: { conversionType: 'euler_to_dcm' }
    }
    expect(mod.getInputPortCount(block as any)).toBe(1)
    expect(mod.getOutputType(block as any, ['double[3]'])).toBe('double[3][3]')
    const code = mod.generateComputation(
      block as any,
      ['model->signals.Mux'],
      ['double[3]']
    )
    expect(code).toContain('model->signals.Mux[0]')
    expect(code).toContain('model->signals.ABDSH[0][0]')
  })

  test('DCM fixture type-propagates double[3][3] through transpose and matrix_multiply', () => {
    const modelJson = JSON.parse(fs.readFileSync(DCM_FIXTURE, 'utf8'))
    const sheets = modelJson.sheets as Sheet[]
    const flat = new ModelFlattener().flattenModel(sheets, 'p4_dcm')
    const types = new TypePropagator(flat.model).propagate()

    const abdsh = flat.model.blocks.find(b => b.block.name === 'ABDSH')!
    const ashbd = flat.model.blocks.find(b => b.block.name === 'ASHBD')!
    const mm = flat.model.blocks.find(b => b.block.name === 'Hub_Shaft')!

    expect(types.get(abdsh.originalId)).toBe('double[3][3]')
    expect(types.get(ashbd.originalId)).toBe('double[3][3]')
    expect(types.get(mm.originalId)).toBe('double[3]')

    const gen = new CodeGenerator({ modelName: 'p4_dcm' })
    const result = gen.generate(sheets, [])
    expect(result.source).toMatch(/Orientation Conversion block: ABDSH/)
    expect(result.source).toMatch(/Transpose block: ASHBD/)
    expect(result.source.length).toBeGreaterThan(100)
  })

  test('Goto fixture: for_iterator promotes Beta import and Psi_R export', () => {
    const modelJson = JSON.parse(fs.readFileSync(GOTO_FIXTURE, 'utf8'))
    const sheets = modelJson.sheets as Sheet[]
    const flat = new ModelFlattener().flattenModel(sheets, 'p4_goto')
    expect(flat.model.segregatedSubsystems).toHaveLength(1)
    const sub = flat.model.segregatedSubsystems[0]!
    expect(sub.forIterator?.iterationLimit).toBe(3)
    expect(sub.inputPorts.map(p => p.name)).toEqual(
      expect.arrayContaining(['Beta'])
    )
    expect(sub.outputPorts.map(p => p.name)).toEqual(
      expect.arrayContaining(['Psi_R'])
    )

    const gen = new CodeGenerator({ modelName: 'p4_goto' })
    const result = gen.generate(sheets, [])
    expect(result.source).toMatch(/For Iterator:\s*3 pass/)
    expect(result.header || result.source).toMatch(/Psi_R|Beta/)
  })
})
