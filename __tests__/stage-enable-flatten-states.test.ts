import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import * as fs from 'fs'
import * as path from 'path'

test('8.5 flattened subsystem integrator uses consistent state names', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../docs/sample-models/saturn/saturn-8.5-stage-enable-freeze.json'),
      'utf8'
    )
  )
  const gen = new CodeGenerator({ modelName: 'saturn_8_5_stage_enable_freeze' })
  const result = gen.generate(fixture.data.sheets, fixture.data.parameters || [])

  // Header declares prefixed state
  expect(result.header).toContain('S_IB_Stage_propellant_used_states[1]')

  // Init and derivatives must use the same name
  expect(result.source).toContain('model->states.S_IB_Stage_propellant_used_states')
  expect(result.source).toContain('state_derivatives->S_IB_Stage_propellant_used_states')

  // Must not use unprefixed local name
  expect(result.source).not.toMatch(/model->states\.propellant_used_states/)
  expect(result.source).not.toMatch(/state_derivatives->propellant_used_states/)
})
