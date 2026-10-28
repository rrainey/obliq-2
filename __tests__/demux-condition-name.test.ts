// The Demux's guard against relational outputs mistyped as vectors matches
// "condition" only as a whole name segment, so a vector from a subsystem
// named Conditions is still split element by element.
import { DemuxBlockModule } from '@/lib/blocks/DemuxBlockModule'

const demux = { id: 'd', type: 'demux', name: 'Split', position: { x: 0, y: 0 }, parameters: { outputCount: 4, inputDimensions: [4] } } as any
const gen = (expr: string) => new DemuxBlockModule().generateComputation(demux, [expr], ['double[4]'])

describe('Demux: relational-output name guard', () => {
  test('a vector from a subsystem named Conditions is indexed', () => {
    const code = gen('model->signals.Conditions_GnssEnv')
    for (let i = 0; i < 4; i++) expect(code).toContain(`model->signals.Split_${i} = model->signals.Conditions_GnssEnv[${i}];`)
    expect(gen('model->signals.Preconditions_Vector')).toContain('Preconditions_Vector[3]')
  })

  test('relational and condition outputs are still treated as scalars', () => {
    for (const expr of ['model->signals.Relational_Operator', 'model->signals.Compare_To_Zero', 'model->signals.Enable_condition', 'model->signals.Stage_condition_2']) {
      const code = gen(expr)
      expect(code).toContain('Demux scalar input')
      expect(code).not.toContain(`${expr}[`)
    }
  })
})
