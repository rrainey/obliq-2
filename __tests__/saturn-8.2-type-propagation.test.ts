/**
 * Saturn 8.2 vacuum quaternion kinematics — codegen type propagation
 * must treat integrator q as double[4][1] (from x(0)), not scalar double.
 */

import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { TypePropagator } from '@/lib/codegen/TypePropagator'
import { HeaderGenerator } from '@/lib/codegen/HeaderGenerator'
import { IntegratorBlockModule } from '@/lib/blocks/IntegratorBlockModule'
import * as fs from 'fs'
import * as path from 'path'

describe('Saturn 8.2 quaternion integrator typing', () => {
  const fixturePath = path.join(
    __dirname,
    '../docs/sample-models/saturn/saturn-8.2-6dof-vacuum-kinematics.json'
  )
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const modelData = fixture.data

  test('TypePropagator assigns double[4][1] to q integrator', () => {
    const flattener = new ModelFlattener()
    const { model: flat } = flattener.flattenModel(
      modelData.sheets as any,
      'saturn_8_2',
      modelData.parameters || []
    )
    const types = new TypePropagator(flat).propagate()

    const qBlock = flat.blocks.find((b) => b.block.name === 'q')
    expect(qBlock).toBeDefined()
    expect(types.get(qBlock!.originalId)).toBe('double[4][1]')

    const qdot = flat.blocks.find((b) => b.block.name === 'qdot')
    expect(qdot).toBeDefined()
    expect(types.get(qdot!.originalId)).toBe('double[4][1]')
  })

  test('header declares matrix state and signal for q', () => {
    const flattener = new ModelFlattener()
    const { model: flat } = flattener.flattenModel(
      modelData.sheets as any,
      'saturn_8_2',
      modelData.parameters || []
    )
    const types = new TypePropagator(flat).propagate()
    const header = new HeaderGenerator(flat, types).generate()

    expect(header).toMatch(/double\s+q_states\[4\]\[1\]/)
    expect(header).toMatch(/double\s+q\[4\]\[1\]/)
    expect(header).not.toMatch(/double\s+q_states\[1\]/)
  })

  test('integrator init from matrix x(0) uses element-wise assign', () => {
    const mod = new IntegratorBlockModule()
    const block = {
      id: 'integrator_5',
      name: 'q',
      type: 'integrator' as const,
      position: { x: 0, y: 0 },
      parameters: { showInitPort: true, initialValue: 0 },
    }
    const code = mod.generateInitialization(block, 'double[4][1]', 'model->signals.q0')
    expect(code).toContain('q_states[i][j]')
    expect(code).toContain('model->signals.q0[i][j]')
    expect(code).not.toMatch(/q_states\[0\] = model->signals\.q0;/)
  })
})
