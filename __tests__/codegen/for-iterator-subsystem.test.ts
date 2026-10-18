/**
 * Core for_iterator_subsystem codegen (accumulate fixture).
 *
 * Body: y = u * i for i = 1..5, accumulate → Y = 15*u
 * Numeric proof: __tests__/codegen/for-iterator-native.test.ts
 * Mode matrix: __tests__/codegen/for-iterator-modes.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { SubsystemCodeGenerator } from '@/lib/codegen/SubsystemCodeGenerator'
import { Sheet } from '@/lib/simulationTypes'

const FIXTURE = path.join(__dirname, '../fixtures/for_iterator_accumulate.json')

describe('for_iterator_subsystem (core accumulate fixture)', () => {
  const modelJson = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const sheets = modelJson.sheets as Sheet[]

  test('flattener collects forIterator metadata on segregated module', () => {
    const result = new ModelFlattener().flattenModel(sheets, 'p1_fi')
    expect(result.model.segregatedSubsystems).toHaveLength(1)
    const sub = result.model.segregatedSubsystems[0]!
    expect(sub.forIterator).toEqual({
      iterationLimit: 5,
      indexBase: 1,
      resetStates: 'held',
      accumulateOutputs: true
    })
    expect(sub.sanitizedName).toMatch(/Segment_Loop/)
  })

  test('subsystem header declares iteration_index', () => {
    const result = new ModelFlattener().flattenModel(sheets, 'p1_fi')
    const sub = result.model.segregatedSubsystems[0]!
    const gen = new SubsystemCodeGenerator(sub).generate()
    expect(gen.header).toContain('iteration_index')
    expect(gen.source).toContain('compute_outputs')
  })

  test('parent codegen emits for-loop with accumulation', () => {
    const generator = new CodeGenerator({ modelName: 'p1_fi' })
    const result = generator.generate(sheets, modelJson.parameters || [])
    const src = result.source || ''
    expect(src.length).toBeGreaterThan(100)
    expect(src).toMatch(/For Iterator:\s*5 pass/)
    expect(src).toMatch(/for \(int __fi = 1; __fi < 6; \+\+__fi\)/)
    expect(src).toMatch(/iteration_index = __fi/)
    expect(src).toMatch(/__fi_acc_/)
    expect(src).toMatch(/_compute_outputs\(/)
  })
})
