/**
 * Simulink TriggerPort → rising-edge enable (one-shot), not level.
 */

import { CCodeBuilder } from '../../src/lib/codegen/CCodeBuilder'

describe('trigger rising-edge enable codegen', () => {
  test('generateEnableEvaluation emits rising-edge for enableEdge rising', () => {
    const code = CCodeBuilder.generateEnableEvaluation(
      [
        {
          subsystemId: 'sub_trig',
          subsystemName: 'Timer_Initialization',
          hasEnableInput: true,
          parentSubsystemId: null,
          enableWireSourceExpr: 'model->signals.bStart',
          enableEdge: 'rising'
        }
      ],
      'test_model'
    )
    expect(code).toMatch(/Rising-edge trigger/)
    expect(code).toMatch(/_trig_prev/)
    expect(code).toMatch(
      /Timer_Initialization_enabled = \(_trig && !model->enable_states\.Timer_Initialization_trig_prev\)/
    )
  })

  test('level enable remains direct boolean assign', () => {
    const code = CCodeBuilder.generateEnableEvaluation(
      [
        {
          subsystemId: 'sub_en',
          subsystemName: 'Enabled_Sub',
          hasEnableInput: true,
          parentSubsystemId: null,
          enableWireSourceExpr: 'model->signals.en',
          enableEdge: 'level'
        }
      ],
      'test_model'
    )
    expect(code).toMatch(/Level enable/)
    expect(code).not.toMatch(/_trig_prev/)
    expect(code).toMatch(
      /Enabled_Sub_enabled = \(\(model->signals\.en\) \? 1 : 0\)/
    )
  })

  test('enable state struct includes trig_prev for rising', () => {
    const struct = CCodeBuilder.generateEnableStateStruct([
      {
        subsystemId: 'sub_trig',
        subsystemName: 'Timer_Initialization',
        hasEnableInput: true,
        enableEdge: 'rising'
      }
    ])
    expect(struct).toMatch(/Timer_Initialization_enabled/)
    expect(struct).toMatch(/Timer_Initialization_trig_prev/)
  })
})
