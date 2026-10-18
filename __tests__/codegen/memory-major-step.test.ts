/**
 * UH60 P3 — Memory major-step hold codegen
 *
 * Fixture: uh60-obliq/fixtures/p3_memory_major_step.json
 * Integrator ramp + Memory(delayMode:memory) → post-RK4 latch
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { UnitDelayBlockModule } from '@/lib/blocks/UnitDelayBlockModule'
import { Sheet } from '@/lib/simulationTypes'

const FIXTURE = path.resolve(
  '/home/riley/src/uh60-obliq/fixtures/p3_memory_major_step.json'
)

describe('memory major-step hold (UH60 P3)', () => {
  const modelJson = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const sheets = modelJson.sheets as Sheet[]

  test('UnitDelay Memory mode comments distinguish latch', () => {
    const mod = new UnitDelayBlockModule()
    const block = {
      id: 'mem',
      type: 'unit_delay',
      name: 'Beta',
      position: { x: 0, y: 0 },
      parameters: {
        initialValue: 0,
        sampleInterval: 0,
        delayMode: 'memory'
      }
    }
    const out = mod.generateComputation(block as any, ['model->signals.Beta_dot'], [
      'double'
    ])
    expect(out).toMatch(/Memory major-step hold/)
    expect(out).toContain('model->states.Beta_state')

    const upd = mod.generateDeferredStateUpdate!(
      block as any,
      ['model->signals.Beta_dot'],
      ['double']
    )
    expect(upd).toMatch(/Memory latch/)
  })

  test('full codegen: algebra skips Memory latch; step calls update_memory_states after RK4', () => {
    const generator = new CodeGenerator({ modelName: 'p3_mem' })
    const result = generator.generate(sheets, modelJson.parameters || [])
    const src = result.source || ''

    expect(result.header).toContain('update_memory_states')
    expect(src).toContain('p3_mem_update_memory_states')
    expect(src).toMatch(/Memory major-step hold[\s\S]*update_memory_states/)

    // evaluate_algebraic should not latch Memory (only discrete unit_delay)
    const algStart = src.indexOf('p3_mem_evaluate_algebraic')
    const algEnd = src.indexOf('p3_mem_update_memory_states')
    expect(algStart).toBeGreaterThanOrEqual(0)
    expect(algEnd).toBeGreaterThan(algStart)
    const algebra = src.slice(algStart, algEnd)
    expect(algebra).not.toMatch(/Memory latch:\s*Beta/)
    expect(algebra).toMatch(/Memory major-step hold:\s*Beta\s*\(output phase\)/)

    // update_memory_states should latch Beta
    const memFn = src.slice(algEnd, src.indexOf('p3_mem_step'))
    expect(memFn).toMatch(/Memory latch:\s*Beta/)

    // step order: evaluate_algebraic → RK4 → update_memory_states
    const step = src.slice(src.indexOf('p3_mem_step'))
    const iAlg = step.indexOf('evaluate_algebraic')
    const iRk = step.search(/RK4|Euler integration/i)
    const iMem = step.indexOf('update_memory_states')
    expect(iAlg).toBeGreaterThanOrEqual(0)
    expect(iMem).toBeGreaterThan(iAlg)
    if (iRk >= 0) {
      expect(iMem).toBeGreaterThan(iRk)
    }
  })

  test('legacy unit_delay without delayMode still updates in algebra', () => {
    const mod = new UnitDelayBlockModule()
    const block = {
      id: 'ud',
      type: 'unit_delay',
      name: 'Delay1',
      position: { x: 0, y: 0 },
      parameters: { initialValue: 0, sampleInterval: 0 }
    }
    const out = mod.generateComputation(block as any, ['u'], ['double'])
    expect(out).toMatch(/Unit Delay/)
    expect(out).not.toMatch(/Memory major-step/)
  })
})
