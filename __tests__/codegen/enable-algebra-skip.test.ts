/**
 * Disabled enabled-subsystems must skip algebraic evaluation (hold signals).
 */

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { AlgebraicEvaluator } from '@/lib/codegen/AlgebraicEvaluator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { TypePropagator } from '@/lib/codegen/TypePropagator'
import type { Sheet } from '@/lib/simulationTypes'
import type { BlockData } from '@/components/BlockNode'

function B(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {},
  position = { x: 0, y: 0 }
): BlockData {
  return { id, type, name, position, parameters } as BlockData
}

function W(
  id: string,
  sourceBlockId: string,
  targetBlockId: string,
  sourcePortIndex = 0,
  targetPortIndex = 0
) {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex }
}

describe('enable-gated algebraic evaluation', () => {
  const sheets: Sheet[] = [
    {
      id: 'main',
      name: 'Main',
      blocks: [
        B('en', 'source', 'Enable', {
          signalType: 'constant',
          value: 0,
          dataType: 'bool'
        }),
        B('u', 'source', 'U', {
          signalType: 'constant',
          value: 1,
          dataType: 'double'
        }),
        B('sub', 'subsystem', 'S_IB_Stage', {
          showEnableInput: true,
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [
            {
              id: 'sub_sheet',
              name: 'S_IB_Stage',
              blocks: [
                B('in1', 'input_port', 'In1', {
                  portName: 'In1',
                  dataType: 'double',
                  defaultValue: 0
                }),
                B('gain', 'scale', 'GravityDivideProxy', { gain: 2 }),
                B('out1', 'output_port', 'Out1', {
                  portName: 'Out1',
                  dataType: 'double'
                })
              ],
              connections: [
                W('sw1', 'in1', 'gain'),
                W('sw2', 'gain', 'out1')
              ],
              extents: { width: 400, height: 200 }
            }
          ]
        }),
        B('y', 'output_port', 'y', { portName: 'y', dataType: 'double' })
      ],
      connections: [
        W('w_en', 'en', 'sub', 0, -1),
        W('w_u', 'u', 'sub', 0, 0),
        W('w_y', 'sub', 'y', 0, 0)
      ],
      extents: { width: 600, height: 400 }
    }
  ]

  test('algebra wraps enabled-subsystem blocks in enable_states check', () => {
    const gen = new CodeGenerator({ modelName: 'enable_alg_skip' })
    const result = gen.generate(sheets)
    // Flattened scale inside S_IB_Stage should be gated
    expect(result.source).toMatch(
      /if \(model->enable_states\.S_IB_Stage_enabled\)/
    )
    expect(result.source).toContain('GravityDivideProxy')
    // Init starts disabled
    expect(result.source).toMatch(
      /model->enable_states\.S_IB_Stage_enabled = 0/
    )
    // Init resolves enables after first algebra
    expect(result.source).toMatch(
      /evaluate_algebraic\(model\);\s*\n\s*\/\* Resolve subsystem enables/
    )
  })

  test('AlgebraicEvaluator wrapWithEnableGate via flatten', () => {
    const flattener = new ModelFlattener()
    const { model } = flattener.flattenModel(sheets, 'enable_alg_skip')
    const typeMap = new TypePropagator(model).propagate()
    const ev = new AlgebraicEvaluator(model, typeMap)
    const code = ev.generate()
    expect(code).toContain('if (model->enable_states.S_IB_Stage_enabled)')
    expect(code).toMatch(/S_IB_Stage_enabled[\s\S]*GravityDivideProxy|GravityDivideProxy[\s\S]*S_IB_Stage_enabled/)
  })

  test('integrator state→signal publish is not enable-gated', () => {
    const integSheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          B('en', 'source', 'Enable', {
            signalType: 'constant',
            value: 0,
            dataType: 'bool'
          }),
          B('sub', 'subsystem', 'S_IB_Stage', {
            showEnableInput: true,
            inputPorts: [],
            outputPorts: ['Xe'],
            sheets: [
              {
                id: 'sub_sheet',
                name: 'S_IB_Stage',
                blocks: [
                  B('xe', 'integrator', 'xe_ye_ze', {
                    initialValue: [1, 2, 3],
                    dataType: 'double[3]'
                  }),
                  B('out', 'output_port', 'Xe', {
                    portName: 'Xe',
                    dataType: 'double[3]'
                  })
                ],
                connections: [W('w', 'xe', 'out')],
                extents: { width: 400, height: 200 }
              }
            ]
          })
        ],
        connections: [W('w_en', 'en', 'sub', 0, -1)],
        extents: { width: 600, height: 400 }
      }
    ]
    const gen = new CodeGenerator({ modelName: 'enable_integ_pub' })
    const result = gen.generate(integSheets)
    // Scale-style blocks stay gated; integrator publish must not be
    expect(result.source).toMatch(
      /xe_ye_ze_states\[i\]/
    )
    const integAssign = result.source.match(
      /Integrator block:[\s\S]*?xe_ye_ze[\s\S]*?states\[i\]/
    )
    expect(integAssign?.[0] ?? '').not.toMatch(
      /if \(model->enable_states\.S_IB_Stage_enabled\)/
    )
  })

  test('nested enable-wire sources are not algebra-gated (SwitchCase case lag)', () => {
    // Parent enabled-subsystem contains a case selector that drives a nested
    // action subsystem. The selector must update while the parent is disabled
    // so end-of-step enable resolve can arm the action on the same flip.
    const nestedSheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          B('parent_en', 'source', 'ParentEn', {
            signalType: 'constant',
            value: 0,
            dataType: 'bool'
          }),
          B('mode', 'source', 'Mode', {
            signalType: 'constant',
            value: 0,
            dataType: 'double'
          }),
          B('igm', 'subsystem', 'IGM', {
            showEnableInput: true,
            inputPorts: ['Mode'],
            outputPorts: [],
            sheets: [
              {
                id: 'igm_sheet',
                name: 'IGM',
                blocks: [
                  B('mode_in', 'input_port', 'Mode', {
                    portName: 'Mode',
                    dataType: 'double',
                    defaultValue: 0
                  }),
                  B('case0', 'evaluate', 'Switch_Case_case_0', {
                    numInputs: 1,
                    expression: 'in(0)==(0)',
                    outputType: 'bool'
                  }),
                  B('phase0', 'subsystem', 'First_Phase', {
                    showEnableInput: true,
                    inputPorts: [],
                    outputPorts: ['Y'],
                    sheets: [
                      {
                        id: 'phase_sheet',
                        name: 'First_Phase',
                        blocks: [
                          B('c', 'source', 'Const', {
                            signalType: 'constant',
                            value: 42,
                            dataType: 'double'
                          }),
                          B('y', 'output_port', 'Y', {
                            portName: 'Y',
                            dataType: 'double'
                          })
                        ],
                        connections: [W('w_cy', 'c', 'y')],
                        extents: { width: 300, height: 150 }
                      }
                    ]
                  })
                ],
                connections: [
                  W('w_mode_case', 'mode_in', 'case0'),
                  W('w_case_phase', 'case0', 'phase0', 0, -1)
                ],
                extents: { width: 500, height: 300 }
              }
            ]
          })
        ],
        connections: [
          W('w_pen', 'parent_en', 'igm', 0, -1),
          W('w_mode', 'mode', 'igm', 0, 0)
        ],
        extents: { width: 700, height: 400 }
      }
    ]

    const gen = new CodeGenerator({ modelName: 'enable_case_ungate' })
    const result = gen.generate(nestedSheets)

    // Case selector must not be wrapped in IGM enable gate
    const caseBlock = result.source.match(
      /Switch_Case_case_0[\s\S]{0,400}?in\(0\)==\(0\)[\s\S]{0,200}?Switch_Case_case_0 =/
    )
    expect(caseBlock?.[0] ?? result.source).toMatch(/Switch_Case_case_0/)
    // Find the algebraic assignment region for case_0 and ensure no IGM gate
    const caseAssignIdx = result.source.indexOf(
      'Evaluate block: IGM_Switch_Case_case_0'
    )
    expect(caseAssignIdx).toBeGreaterThan(-1)
    const window = result.source.slice(
      Math.max(0, caseAssignIdx - 120),
      caseAssignIdx + 350
    )
    expect(window).not.toMatch(/if \(model->enable_states\.IGM_enabled\)/)

    // Nested action body still gated by First_Phase enable
    expect(result.source).toMatch(
      /if \(model->enable_states\.IGM_First_Phase_enabled\)/
    )
  })
})
