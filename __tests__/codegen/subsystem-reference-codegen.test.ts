/**
 * Subsystem references — shared C module + per-instance params (2 instances).
 *
 * Larger 3-blade + parent-sum coverage:
 *   subsystem-reference-larger-model.test.ts
 *   subsystem-reference-native.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { Sheet } from '@/lib/simulationTypes'

/** Minimal def+one-ref slice derived from three_blades (gains 1 and 2). */
const FIXTURE = path.join(
  __dirname,
  '../fixtures/subsystem_references_three_blades.json'
)

describe('subsystem reference codegen', () => {
  const modelJson = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  // Use only Blade + Blade_2 from the larger fixture for the two-instance contract
  const main = JSON.parse(JSON.stringify(modelJson.sheets[0]))
  main.blocks = main.blocks.filter(
    (b: { id: string }) =>
      !['blade_ref_3', 'sum', 'out_y', 'out_y3'].includes(b.id)
  )
  main.connections = main.connections.filter(
    (c: { sourceBlockId: string; targetBlockId: string }) =>
      !['blade_ref_3', 'sum', 'out_y', 'out_y3'].includes(c.sourceBlockId) &&
      !['blade_ref_3', 'sum', 'out_y', 'out_y3'].includes(c.targetBlockId)
  )
  const sheets = [main] as Sheet[]

  test('flattener marks shared module and instance params', () => {
    const flat = new ModelFlattener().flattenModel(sheets, 'p5_blade')
    expect(flat.model.segregatedSubsystems).toHaveLength(2)
    const mods = flat.model.segregatedSubsystems!
    expect(mods.every(m => m.sharedModule)).toBe(true)
    expect(new Set(mods.map(m => m.moduleTypeName))).toEqual(new Set(['Blade']))
    expect(mods.map(m => m.sanitizedName).sort()).toEqual(['Blade', 'Blade_2'])
    const ref = mods.find(m => m.sanitizedName === 'Blade_2')!
    expect(ref.instanceParameters?.find(p => p.name === 'gain')?.value).toBe(2)
    const def = mods.find(m => m.sanitizedName === 'Blade')!
    expect(def.instanceParameters?.find(p => p.name === 'gain')?.value).toBe(1)
  })

  test('codegen emits one Blade.c and two parent instances with different init params', () => {
    const gen = new CodeGenerator({ modelName: 'p5_blade' })
    const result = gen.generate(sheets, [])
    expect(result.subsystemFiles).toHaveLength(1)
    expect(result.subsystemFiles[0]!.subsystemName).toBe('Blade')
    expect(result.subsystemFiles[0]!.header).toMatch(/Blade_params_t/)
    expect(result.subsystemFiles[0]!.header).toMatch(/params;/)
    expect(result.subsystemFiles[0]!.source).toMatch(
      /Blade_init\(Blade_t\* model, const Blade_params_t\* params\)/
    )

    expect(result.header).toMatch(/Blade_t Blade;/)
    expect(result.header).toMatch(/Blade_t Blade_2;/)
    // Single include
    expect((result.header.match(/#include "Blade\.h"/g) || []).length).toBe(1)

    expect(result.source).toMatch(/\.gain = 1/)
    expect(result.source).toMatch(/\.gain = 2/)
    expect(result.source).toMatch(/Blade_init\(&model->Blade/)
    expect(result.source).toMatch(/Blade_init\(&model->Blade_2/)
    expect(result.source).toMatch(/Blade_compute_outputs\(&model->Blade\)/)
    expect(result.source).toMatch(/Blade_compute_outputs\(&model->Blade_2\)/)
  })

  test('references saved with empty port lists take their ports from the definition', () => {
    // Model files saved before the editor kept reference ports in sync can
    // hold empty lists; the reference's outputs must still resolve in the C
    const damaged = JSON.parse(JSON.stringify(modelJson.sheets)) as Sheet[]
    for (const b of damaged[0]!.blocks) {
      if (b.parameters?.isReference) {
        b.parameters.inputPorts = []
        b.parameters.outputPorts = []
      }
    }
    const flat = new ModelFlattener().flattenModel(damaged, 'p5_blade')
    for (const m of flat.model.segregatedSubsystems!) {
      expect(m.outputPorts.map(p => p.name)).toEqual(['y'])
    }
    const result = new CodeGenerator({ modelName: 'p5_blade' }).generate(damaged, [])
    expect(result.source).toMatch(/model->\w*Blade_2\.outputs\.y/)
    expect(result.source).toMatch(/model->\w*Blade_3\.outputs\.y/)
    expect(result.source).not.toMatch(/model->signals\.\w*Blade_[23];/)
  })
})
