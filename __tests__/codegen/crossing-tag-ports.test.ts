import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import {
  collectSheetLabels,
  computeCrossingTags,
  promoteCrossingPortsOnSubsystem,
  resetCrossingTagSynthIds
} from '@/lib/codegen/crossingTagPorts'

function createSheet(
  id: string,
  name: string,
  blocks: BlockData[],
  connections: WireData[]
): Sheet {
  return { id, name, blocks, connections, extents: { width: 1000, height: 800 } }
}

function createBlock(
  id: string,
  type: string,
  name: string,
  parameters: Record<string, unknown> = {}
): BlockData {
  return { id, type, name, position: { x: 0, y: 0 }, parameters }
}

function createConnection(
  id: string,
  sourceBlockId: string,
  sourcePortIndex: number,
  targetBlockId: string,
  targetPortIndex: number
): WireData {
  return { id, sourceBlockId, sourcePortIndex, targetBlockId, targetPortIndex }
}

describe('crossingTagPorts helpers', () => {
  beforeEach(() => resetCrossingTagSynthIds())

  test('computeCrossingTags finds import and export by name', () => {
    const sheets = [
      createSheet(
        'root',
        'Root',
        [
          createBlock('og', 'sheet_label_sink', 'GotoXe', {
            signalName: 'Xe_m',
            tagVisibility: 'global'
          }),
          createBlock('of', 'sheet_label_source', 'FromTheta', {
            signalName: 'theta_deg'
          }),
          createBlock('sub', 'subsystem', 'LVDC', {
            inputPorts: [],
            outputPorts: [],
            sheets: [
              createSheet(
                'lvdc',
                'LVDC',
                [
                  createBlock('ig', 'sheet_label_sink', 'GotoTheta', {
                    signalName: 'theta_deg',
                    tagVisibility: 'global'
                  }),
                  createBlock('ifr', 'sheet_label_source', 'FromXe', {
                    signalName: 'Xe_m'
                  }),
                  createBlock('src', 'source', 'Src', { value: 1 }),
                  createBlock('out', 'output_port', 'Dummy', { portName: 'Dummy' })
                ],
                [
                  createConnection('w1', 'src', 0, 'ig', 0),
                  createConnection('w2', 'ifr', 0, 'out', 0)
                ]
              )
            ]
          })
        ],
        []
      )
    ]

    const labels = collectSheetLabels(sheets)
    const crossing = computeCrossingTags(labels, ['LVDC'])
    expect(crossing.exports).toEqual(['theta_deg'])
    expect(crossing.imports).toEqual(['Xe_m'])
  })

  test('promoteCrossingPortsOnSubsystem adds ports and bridges', () => {
    const sheets = [
      createSheet(
        'lvdc',
        'LVDC',
        [
          createBlock('in_theta', 'input_port', 'Theta_deg', {
            portName: 'Theta_deg',
            dataType: 'double[3]'
          }),
          createBlock('goto_theta', 'sheet_label_sink', 'Goto11', {
            signalName: 'theta_deg',
            tagVisibility: 'global'
          }),
          createBlock('from_xe', 'sheet_label_source', 'FromXe', {
            signalName: 'Xe_m'
          }),
          createBlock('sink', 'scale', 'UseXe', { gain: 1 })
        ],
        [
          createConnection('w1', 'in_theta', 0, 'goto_theta', 0),
          createConnection('w2', 'from_xe', 0, 'sink', 0)
        ]
      )
    ]

    const promoted = promoteCrossingPortsOnSubsystem(
      ['Theta_deg'],
      [],
      sheets,
      { exports: ['theta_deg'], imports: ['Xe_m'] },
      new Map([
        ['theta_deg', 'double[3]'],
        ['Xe_m', 'double[3]']
      ])
    )

    expect(promoted.inputPorts).toEqual(['Theta_deg', 'Xe_m'])
    expect(promoted.outputPorts).toEqual(['theta_deg'])
    expect(promoted.addedInputs).toEqual(['Xe_m'])
    expect(promoted.addedOutputs).toEqual(['theta_deg'])

    const root = promoted.sheets[0]
    expect(root.blocks.some(b => b.type === 'input_port' && b.parameters?.portName === 'Xe_m')).toBe(
      true
    )
    expect(
      root.blocks.some(b => b.type === 'output_port' && b.parameters?.portName === 'theta_deg')
    ).toBe(true)
    // Passthrough: Theta_deg input → theta_deg output
    const out = root.blocks.find(
      b => b.type === 'output_port' && b.parameters?.portName === 'theta_deg'
    )!
    const bridge = root.connections.find(
      c => c.sourceBlockId === 'in_theta' && c.targetBlockId === out.id
    )
    expect(bridge).toBeTruthy()
  })
})

describe('Segregated crossing-tag promotion (integration)', () => {
  test('outside From of export tag resolves to segregated output port', () => {
    const subSheet = createSheet(
      'sub',
      'Sub',
      [
        createBlock('src', 'source', 'InnerSrc', { value: 42 }),
        createBlock('goto', 'sheet_label_sink', 'GotoT', {
          signalName: 'T1_sec',
          tagVisibility: 'global'
        }),
        createBlock('out_existing', 'output_port', 'T1_sec', { portName: 'T1_sec' })
      ],
      [
        createConnection('sw1', 'src', 0, 'goto', 0),
        createConnection('sw2', 'src', 0, 'out_existing', 0)
      ]
    )

    const main = createSheet(
      'main',
      'Main',
      [
        createBlock('lvdc', 'subsystem', 'LVDC', {
          codeGenStrategy: 'segregated_atomic',
          inputPorts: [],
          outputPorts: ['T1_sec'],
          sheets: [subSheet]
        }),
        createBlock('from', 'sheet_label_source', 'FromT', { signalName: 'T1_sec' }),
        createBlock('consumer', 'scale', 'Gain', { gain: 1 }),
        createBlock('main_out', 'output_port', 'Out', { portName: 'Out' })
      ],
      [
        createConnection('m1', 'from', 0, 'consumer', 0),
        createConnection('m2', 'consumer', 0, 'main_out', 0)
      ]
    )

    const result = new ModelFlattener().flattenModel([main])
    expect(result.model.segregatedSubsystems).toHaveLength(1)
    const sub = result.model.segregatedSubsystems[0]
    expect(sub.outputPorts.some(p => p.name === 'T1_sec')).toBe(true)

    const lvdc = result.model.blocks.find(b => b.isSegregated)
    const gain = result.model.blocks.find(b => b.block.name === 'Gain')
    expect(lvdc).toBeTruthy()
    expect(gain).toBeTruthy()

    // From → should resolve to LVDC output port 0 (T1_sec), then to Gain
    const bridge = result.model.connections.find(
      c =>
        c.sourceBlockId === lvdc!.originalId &&
        c.sourcePortIndex === 0 &&
        c.targetBlockId === gain!.originalId
    )
    expect(bridge).toBeTruthy()
  })

  test('outside Goto import becomes segregated input wire', () => {
    const subSheet = createSheet(
      'sub',
      'Sub',
      [
        createBlock('from_xe', 'sheet_label_source', 'FromXe', { signalName: 'Xe_m' }),
        createBlock('out', 'output_port', 'Y', { portName: 'Y' })
      ],
      [createConnection('sw1', 'from_xe', 0, 'out', 0)]
    )

    const main = createSheet(
      'main',
      'Main',
      [
        createBlock('plant', 'source', 'PlantXe', { value: 7 }),
        createBlock('goto', 'sheet_label_sink', 'GotoXe', {
          signalName: 'Xe_m',
          tagVisibility: 'global'
        }),
        createBlock('lvdc', 'subsystem', 'LVDC', {
          codeGenStrategy: 'segregated_atomic',
          inputPorts: [],
          outputPorts: ['Y'],
          sheets: [subSheet]
        }),
        createBlock('main_out', 'output_port', 'Out', { portName: 'Out' })
      ],
      [
        createConnection('m1', 'plant', 0, 'goto', 0),
        createConnection('m2', 'lvdc', 0, 'main_out', 0)
      ]
    )

    const result = new ModelFlattener().flattenModel([main])
    const sub = result.model.segregatedSubsystems[0]
    expect(sub.inputPorts.some(p => p.name === 'Xe_m')).toBe(true)

    const lvdc = result.model.blocks.find(b => b.isSegregated)!
    const plant = result.model.blocks.find(b => b.block.name === 'PlantXe')!
    const xePort = sub.inputPorts.find(p => p.name === 'Xe_m')!

    const importWire = result.model.connections.find(
      c =>
        c.sourceBlockId === plant.originalId &&
        c.targetBlockId === lvdc.originalId &&
        c.targetPortIndex === xePort.index
    )
    expect(importWire).toBeTruthy()
  })

  test('theta_deg export is distinct from Theta_deg input (passthrough case)', () => {
    const subSheet = createSheet(
      'sub',
      'Sub',
      [
        createBlock('in_theta', 'input_port', 'Theta_deg', {
          portName: 'Theta_deg',
          dataType: 'double[3]'
        }),
        createBlock('goto', 'sheet_label_sink', 'Goto11', {
          signalName: 'theta_deg',
          tagVisibility: 'global'
        }),
        createBlock('out_psi', 'output_port', 'Psi_deg', { portName: 'Psi_deg' }),
        createBlock('const', 'source', 'Zero', { value: 0 })
      ],
      [
        createConnection('sw1', 'in_theta', 0, 'goto', 0),
        createConnection('sw2', 'const', 0, 'out_psi', 0)
      ]
    )

    const main = createSheet(
      'main',
      'Main',
      [
        createBlock('imu', 'source', 'Gimbal', { value: 1 }),
        createBlock('lvdc', 'subsystem', 'LVDC', {
          codeGenStrategy: 'segregated_atomic',
          inputPorts: ['Theta_deg'],
          outputPorts: ['Psi_deg'],
          sheets: [subSheet]
        }),
        createBlock('from', 'sheet_label_source', 'From1', { signalName: 'theta_deg' }),
        createBlock('use', 'scale', 'UseTheta', { gain: 1 }),
        createBlock('main_out', 'output_port', 'Out', { portName: 'Out' })
      ],
      [
        createConnection('m1', 'imu', 0, 'lvdc', 0),
        createConnection('m2', 'from', 0, 'use', 0),
        createConnection('m3', 'use', 0, 'main_out', 0)
      ]
    )

    const result = new ModelFlattener().flattenModel([main])
    const sub = result.model.segregatedSubsystems[0]

    expect(sub.inputPorts.map(p => p.name)).toContain('Theta_deg')
    expect(sub.outputPorts.map(p => p.name)).toContain('theta_deg')
    expect(sub.outputPorts.map(p => p.name)).toContain('Psi_deg')
    // Must not collapse names
    expect(sub.inputPorts.some(p => p.name === 'theta_deg')).toBe(false)

    const lvdc = result.model.blocks.find(b => b.isSegregated)!
    const use = result.model.blocks.find(b => b.block.name === 'UseTheta')!
    const thetaOut = sub.outputPorts.find(p => p.name === 'theta_deg')!

    const bridge = result.model.connections.find(
      c =>
        c.sourceBlockId === lvdc.originalId &&
        c.sourcePortIndex === thetaOut.index &&
        c.targetBlockId === use.originalId
    )
    expect(bridge).toBeTruthy()
  })
})
