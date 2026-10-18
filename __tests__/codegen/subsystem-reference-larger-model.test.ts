/**
 * Core subsystem-reference coverage in a larger parent model:
 * one Blade definition + two references (gains 1 / 2 / 5), shared module,
 * parent sum wiring.
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { Sheet } from '@/lib/simulationTypes'

const FIXTURE = path.join(
  __dirname,
  '../fixtures/subsystem_references_three_blades.json'
)

describe('subsystem references in larger model (core)', () => {
  const modelJson = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const sheets = modelJson.sheets as Sheet[]

  test('flattener: three shared instances, one module type, distinct gains', () => {
    const flat = new ModelFlattener().flattenModel(sheets, 'three_blades')
    expect(flat.model.segregatedSubsystems).toHaveLength(3)
    const mods = flat.model.segregatedSubsystems!
    expect(mods.every(m => m.sharedModule)).toBe(true)
    expect(new Set(mods.map(m => m.moduleTypeName))).toEqual(new Set(['Blade']))
    expect(mods.map(m => m.sanitizedName).sort()).toEqual([
      'Blade',
      'Blade_2',
      'Blade_3'
    ])

    const gains = Object.fromEntries(
      mods.map(m => [
        m.sanitizedName,
        m.instanceParameters?.find(p => p.name === 'gain')?.value
      ])
    )
    expect(gains).toEqual({ Blade: 1, Blade_2: 2, Blade_3: 5 })
  })

  test('codegen: single Blade.c/.h, three parent instances, PARAM_gain from params', () => {
    const result = new CodeGenerator({ modelName: 'three_blades' }).generate(
      sheets,
      []
    )

    expect(result.subsystemFiles).toHaveLength(1)
    expect(result.subsystemFiles[0]!.subsystemName).toBe('Blade')
    const subH = result.subsystemFiles[0]!.header
    const subC = result.subsystemFiles[0]!.source
    expect(subH).toMatch(/Blade_params_t/)
    expect(subH).toMatch(/params;/)
    expect(subC).toMatch(
      /Blade_init\(Blade_t\* model, const Blade_params_t\* params\)/
    )
    expect(subC).toMatch(/#define PARAM_gain \(model->params\.gain\)/)
    expect(subC).not.toMatch(/#define PARAM_gain 1\b/)

    expect(result.header).toMatch(/Blade_t Blade;/)
    expect(result.header).toMatch(/Blade_t Blade_2;/)
    expect(result.header).toMatch(/Blade_t Blade_3;/)
    expect((result.header.match(/#include "Blade\.h"/g) || []).length).toBe(1)

    const src = result.source || ''
    expect(src).toMatch(/\.gain = 1/)
    expect(src).toMatch(/\.gain = 2/)
    expect(src).toMatch(/\.gain = 5/)
    expect(src).toMatch(/Blade_init\(&model->Blade/)
    expect(src).toMatch(/Blade_init\(&model->Blade_2/)
    expect(src).toMatch(/Blade_init\(&model->Blade_3/)
    expect(src).toMatch(/Blade_compute_outputs\(&model->Blade\)/)
    expect(src).toMatch(/Blade_compute_outputs\(&model->Blade_2\)/)
    expect(src).toMatch(/Blade_compute_outputs\(&model->Blade_3\)/)
  })

  test('parent wiring: each instance gets U; outs feed SumBlades and probes', () => {
    const src =
      new CodeGenerator({ modelName: 'three_blades' }).generate(sheets, [])
        .source || ''

    expect(src).toMatch(/model->Blade\.inputs\.u = model->signals\.U/)
    expect(src).toMatch(/model->Blade_2\.inputs\.u = model->signals\.U/)
    expect(src).toMatch(/model->Blade_3\.inputs\.u = model->signals\.U/)

    expect(src).toMatch(/model->Blade\.outputs\.y/)
    expect(src).toMatch(/model->Blade_2\.outputs\.y/)
    expect(src).toMatch(/model->Blade_3\.outputs\.y/)

    expect(src).toMatch(/outputs\.Y/)
    expect(src).toMatch(/outputs\.y1/)
    expect(src).toMatch(/outputs\.y2/)
    expect(src).toMatch(/outputs\.y3/)
  })
})
