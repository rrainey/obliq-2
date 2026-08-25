/**
 * RTW-parity IcNeedsLoading: showInitPort integrators defer x(0) until the
 * first enabled algebraic evaluation; becoming-enabled re-arms the flag.
 */
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

function createSheet(
  id: string,
  name: string,
  blocks: BlockData[],
  connections: WireData[]
): Sheet {
  return {
    id,
    name,
    blocks,
    connections,
    extents: { width: 1000, height: 800 }
  }
}

function createBlock(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return {
    id,
    type,
    name,
    position: { x: 100, y: 100 },
    parameters
  }
}

function createConnection(
  id: string,
  sourceBlockId: string,
  sourcePortIndex: number,
  targetBlockId: string,
  targetPortIndex: number
): WireData {
  return {
    id,
    sourceBlockId,
    sourcePortIndex,
    targetBlockId,
    targetPortIndex
  }
}

describe('IcNeedsLoading codegen (enable-edge deferred IC)', () => {
  test('enabled subsystem: init sets flag; compute gates on enable; becoming-enabled rearms', () => {
    const stageSheet = createSheet(
      'stage_sheet',
      'StageSheet',
      [
        createBlock('ic_src', 'source', 'IC', {
          sourceType: 'constant',
          value: 42
        }),
        createBlock('deriv_src', 'source', 'Deriv', {
          sourceType: 'constant',
          value: 0
        }),
        createBlock('int1', 'integrator', 'PlantX', {
          showInitPort: true,
          initialValue: 0
        })
      ],
      [
        createConnection('c_deriv', 'deriv_src', 0, 'int1', 0),
        createConnection('c_ic', 'ic_src', 0, 'int1', 1)
      ]
    )

    const sheets = [
      createSheet(
        'main',
        'Main',
        [
          createBlock('en_src', 'source', 'EnableSrc', {
            sourceType: 'constant',
            value: 0
          }),
          createBlock('stage', 'subsystem', 'Stage', {
            showEnableInput: true,
            sheets: [stageSheet]
          })
        ],
        [createConnection('c_en', 'en_src', 0, 'stage', -1)]
      )
    ]

    const result = new CodeGenerator({ modelName: 'ic_enable_test' }).generate(sheets)
    const src = result.source
    const hdr = result.header

    // State member
    expect(hdr).toMatch(/PlantX_ic_needs_loading/)

    // Deferred init: flag set, no eager copy of IC into state at reseed
    expect(src).toMatch(/ic_needs_loading = 1/)
    const reseedMatch = src.match(
      /void ic_enable_test_reseed_integrator_ics[\s\S]*?\n\}/
    )?.[0]
    expect(reseedMatch).toBeDefined()
    expect(reseedMatch!).toMatch(/IcNeedsLoading/)
    expect(reseedMatch!).not.toMatch(/model->signals\.\w*IC\w*/)

    // Algebraic eval gates load on enable
    expect(src).toMatch(
      /enable_states\.Stage_enabled && model->states\.\w*PlantX\w*_ic_needs_loading/
    )
    expect(src).toMatch(/model->signals\.\w*IC/)

    // Becoming-enabled rearms the flag
    expect(src).toMatch(/SUBSYS_BECOMING_ENABLED/)
    expect(src).toMatch(/_prev_enabled/)
    expect(src).toMatch(/model->states\.\w*PlantX\w*_ic_needs_loading = 1/)
  })

  test('always-enabled showInitPort still uses IcNeedsLoading (no enable gate)', () => {
    const sheets = [
      createSheet(
        'main',
        'Main',
        [
          createBlock('ic_src', 'source', 'IC', {
            sourceType: 'constant',
            value: 3.14
          }),
          createBlock('deriv_src', 'source', 'Deriv', {
            sourceType: 'constant',
            value: 1
          }),
          createBlock('int1', 'integrator', 'RootInt', {
            showInitPort: true,
            initialValue: 0
          })
        ],
        [
          createConnection('c_d', 'deriv_src', 0, 'int1', 0),
          createConnection('c_i', 'ic_src', 0, 'int1', 1)
        ]
      )
    ]

    const result = new CodeGenerator({ modelName: 'ic_root_test' }).generate(sheets)
    const src = result.source

    expect(result.header).toMatch(/RootInt_ic_needs_loading/)
    // Unconditional flag check (always-enabled scope)
    expect(src).toMatch(/if \(model->states\.RootInt_ic_needs_loading\)/)
    expect(src).toContain('model->signals.IC')
    expect(src).not.toMatch(/SUBSYS_BECOMING_ENABLED/)
  })
})
