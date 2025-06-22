// __tests__/multiSheetSimulation.test.ts - Fixed version

import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import { Sheet, SimulationConfig } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

describe('MultiSheetSimulationEngine with Nested Subsystems and Enable functionality', () => {

  const config: SimulationConfig = {
    timeStep: 0.01,
    duration: 1.0
  }

  it('set up and dump structure of a nested simulation with enable blocks', () => {
    // Create a simple model with nested subsystems
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'enable_source',
            type: 'source',
            name: 'EnableSignal',
            position: { x: 100, y: 100 },
            parameters: {
              dataType: 'bool',
              signalType: 'constant',
              value: true
            }
          },
          {
            id: 'subsystem1',
            type: 'subsystem',
            name: 'Subsystem1',
            position: { x: 300, y: 100 },
            parameters: {
              showEnableInput: true,
              inputPorts: ['Input1'],
              outputPorts: ['Output1'],
              sheets: [
                {
                  id: 'sub1_sheet',
                  name: 'Sub1 Sheet',
                  blocks: [
                    {
                      id: 'sub1_input',
                      type: 'input_port',
                      name: 'Input1',
                      position: { x: 100, y: 100 },
                      parameters: { portName: 'Input1' }
                    },
                    {
                      id: 'sub1_tf',
                      type: 'transfer_function',
                      name: 'TF1',
                      position: { x: 300, y: 100 },
                      parameters: {
                        numerator: [1],
                        denominator: [1, 1]
                      }
                    },
                    {
                      id: 'sub1_output',
                      type: 'output_port',
                      name: 'Output1',
                      position: { x: 500, y: 100 },
                      parameters: { portName: 'Output1' }
                    }
                  ],
                  connections: [
                    {
                      id: 'w1',
                      sourceBlockId: 'sub1_input',
                      sourcePortIndex: 0,
                      targetBlockId: 'sub1_tf',
                      targetPortIndex: 0
                    },
                    {
                      id: 'w2',
                      sourceBlockId: 'sub1_tf',
                      sourcePortIndex: 0,
                      targetBlockId: 'sub1_output',
                      targetPortIndex: 0
                    }
                  ],
                  extents: { width: 1000, height: 600 }
                }
              ]
            }
          }
        ],
        connections: [
          {
            id: 'enable_wire',
            sourceBlockId: 'enable_source',
            sourcePortIndex: 0,
            targetBlockId: 'subsystem1',
            targetPortIndex: -1  // Enable port
          }
        ],
        extents: { width: 1000, height: 600 }
      }
    ]

    const engine = new MultiSheetSimulationEngine(sheets, config)

    // Validate setup
    const validation = engine.validateEnableSetup()
    console.log('Validation:', validation)

    // Run a few steps with logging
    console.log('\n--- Simulation Steps ---')
    for (let i = 0; i < 5; i++) {
      const stepResult = engine.runSingleStepWithLogging()
      console.log(`\nStep ${i + 1}:`)
      console.log('Executed:', stepResult.executedBlocks)
      // Toggle enabled state after a few steps
      if (i > 2 && sheets[0].blocks[0].parameters) {
        sheets[0].blocks[0].parameters.value = !sheets[0].blocks[0].parameters.value 
      }
      console.log('Skipped:', stepResult.skippedBlocks)
      console.log('Enable changes:', stepResult.enableChanges)
    }

    // Get final state report
    const report = engine.getEnableStateReport()
    console.log('\n--- Final Enable State Report ---')
    console.log('Hierarchy:', Array.from(report.hierarchy.entries()))
    console.log('Signals:', Array.from(report.signals.entries()))
    console.log('Effective States:', Array.from(report.effectiveStates.entries()))

    expect(true).toBe(true)
  })

  it('should simulate a model with nested subsystems correctly', () => {
    // Create subsystem sheets first
    const subsystemSheet1: Sheet = {
      id: 'subsystem1_sheet1',
      name: 'Processing',
      blocks: [
        {
          id: 'input_port1',
          type: 'input_port',
          name: 'Input1',
          position: { x: 100, y: 100 },
          parameters: {
            portName: 'Input1',
            dataType: 'double',
            defaultValue: 0
          }
        },
        {
          id: 'scale1',
          type: 'scale',
          name: 'Scale1',
          position: { x: 300, y: 100 },
          parameters: {
            gain: 2
          }
        },
        {
          id: 'sheet_label_sink1',
          type: 'sheet_label_sink',
          name: 'SheetLabelSink1',
          position: { x: 500, y: 100 },
          parameters: {
            signalName: 'ProcessedSignal'
          }
        }
      ],
      connections: [
        {
          id: 'sub_wire1',
          sourceBlockId: 'input_port1',
          sourcePortIndex: 0,
          targetBlockId: 'scale1',
          targetPortIndex: 0
        },
        {
          id: 'sub_wire2',
          sourceBlockId: 'scale1',
          sourcePortIndex: 0,
          targetBlockId: 'sheet_label_sink1',
          targetPortIndex: 0
        }
      ],
      extents: { width: 1000, height: 800 }
    }

    const subsystemSheet2: Sheet = {
      id: 'subsystem1_sheet2',
      name: 'Output',
      blocks: [
        {
          id: 'sheet_label_source1',
          type: 'sheet_label_source',
          name: 'SheetLabelSource1',
          position: { x: 100, y: 100 },
          parameters: {
            signalName: 'ProcessedSignal'
          }
        },
        {
          id: 'scale2',
          type: 'scale',
          name: 'Scale2',
          position: { x: 300, y: 100 },
          parameters: {
            gain: 3
          }
        },
        {
          id: 'output_port1',
          type: 'output_port',
          name: 'Output1',
          position: { x: 500, y: 100 },
          parameters: {
            portName: 'Output1'
          }
        }
      ],
      connections: [
        {
          id: 'sub_wire3',
          sourceBlockId: 'sheet_label_source1',
          sourcePortIndex: 0,
          targetBlockId: 'scale2',
          targetPortIndex: 0
        },
        {
          id: 'sub_wire4',
          sourceBlockId: 'scale2',
          sourcePortIndex: 0,
          targetBlockId: 'output_port1',
          targetPortIndex: 0
        }
      ],
      extents: { width: 1000, height: 800 }
    }

    // Create root sheet with subsystem
    const rootSheet: Sheet = {
      id: 'root',
      name: 'Main',
      blocks: [
        {
          id: 'source1',
          type: 'source',
          name: 'Source1',
          position: { x: 100, y: 100 },
          parameters: {
            signalType: 'constant',
            value: 5,
            dataType: 'double'
          }
        },
        {
          id: 'subsystem1',
          type: 'subsystem',
          name: 'Subsystem1',
          position: { x: 300, y: 100 },
          parameters: {
            inputPorts: ['Input1'],
            outputPorts: ['Output1'],
            sheets: [subsystemSheet1, subsystemSheet2],
            // Add sheetId to point to the first sheet
            sheetId: 'subsystem1_sheet1',
            sheetName: 'Subsystem1'
          }
        },
        {
          id: 'logger1',
          type: 'signal_logger',
          name: 'Logger1',
          position: { x: 500, y: 100 },
          parameters: {
            maxSamples: 1000
          }
        }
      ],
      connections: [
        {
          id: 'wire1',
          sourceBlockId: 'source1',
          sourcePortIndex: 0,
          targetBlockId: 'subsystem1',
          targetPortIndex: 0
        },
        {
          id: 'wire2',
          sourceBlockId: 'subsystem1',
          sourcePortIndex: 0,
          targetBlockId: 'logger1',
          targetPortIndex: 0
        }
      ],
      extents: { width: 1000, height: 800 }
    }

    // Run simulation
    const engine = new MultiSheetSimulationEngine([rootSheet], config)
    const results = engine.run()

    // Verify results
    expect(results.size).toBe(3) // Root + 2 subsystem sheets

    // Check root sheet results
    const rootResults = results.get('root')
    expect(rootResults).toBeDefined()
    expect(rootResults!.finalTime).toBeCloseTo(1.0)

    // Get logger data from root sheet
    const loggerData = rootResults!.signalData.get('logger1')
    expect(loggerData).toBeDefined()
    expect(loggerData!.length).toBeGreaterThan(0)

    // For now, let's check what value we actually get
    const finalValue = loggerData![loggerData!.length - 1]
    console.log('Final logged value:', finalValue)

    // The subsystem implementation might need fixing
    // For now, let's test that we at least get the input value
    expect(finalValue).toBe(30) // 5 * 2 * 3 = 30
  })

  it('should properly scope sheet labels within subsystems', () => {
    // This test is passing, so the scoping is working correctly
    // Keep the existing test as is
    const rootBlocks: BlockData[] = [
      {
        id: 'source1',
        type: 'source',
        name: 'Source1',
        position: { x: 100, y: 100 },
        parameters: { signalType: 'constant', value: 10, dataType: 'double' }
      },
      {
        id: 'source2',
        type: 'source',
        name: 'Source2',
        position: { x: 100, y: 300 },
        parameters: { signalType: 'constant', value: 20, dataType: 'double' }
      },
      {
        id: 'subsystem1',
        type: 'subsystem',
        name: 'Subsystem1',
        position: { x: 300, y: 100 },
        parameters: {
          inputPorts: ['Input1'],
          outputPorts: ['Output1'],
          sheetId: 'sub1_sheet1', // Add sheetId
          sheets: [{
            id: 'sub1_sheet1',
            name: 'Sheet1',
            blocks: [
              {
                id: 'sub1_input',
                type: 'input_port',
                name: 'Input1',
                position: { x: 100, y: 100 },
                parameters: { portName: 'Input1', dataType: 'double', defaultValue: 0 }
              },
              {
                id: 'sub1_sink',
                type: 'sheet_label_sink',
                name: 'Sink1',
                position: { x: 300, y: 100 },
                parameters: { signalName: 'SharedLabel' }
              },
              {
                id: 'sub1_source',
                type: 'sheet_label_source',
                name: 'Source1',
                position: { x: 100, y: 200 },
                parameters: { signalName: 'SharedLabel' }
              },
              {
                id: 'sub1_output',
                type: 'output_port',
                name: 'Output1',
                position: { x: 300, y: 200 },
                parameters: { portName: 'Output1' }
              }
            ],
            connections: [
              {
                id: 'sub1_w1', sourceBlockId: 'sub1_input', sourcePortIndex: 0,
                targetBlockId: 'sub1_sink', targetPortIndex: 0
              },
              {
                id: 'sub1_w2', sourceBlockId: 'sub1_source', sourcePortIndex: 0,
                targetBlockId: 'sub1_output', targetPortIndex: 0
              }
            ],
            extents: { width: 1000, height: 800 }
          }]
        }
      },
      {
        id: 'subsystem2',
        type: 'subsystem',
        name: 'Subsystem2',
        position: { x: 300, y: 300 },
        parameters: {
          inputPorts: ['Input1'],
          outputPorts: ['Output1'],
          sheetId: 'sub2_sheet1', // Add sheetId
          sheets: [{
            id: 'sub2_sheet1',
            name: 'Sheet1',
            blocks: [
              {
                id: 'sub2_input',
                type: 'input_port',
                name: 'Input1',
                position: { x: 100, y: 100 },
                parameters: { portName: 'Input1', dataType: 'double', defaultValue: 0 }
              },
              {
                id: 'sub2_sink',
                type: 'sheet_label_sink',
                name: 'Sink1',
                position: { x: 300, y: 100 },
                parameters: { signalName: 'SharedLabel' }
              },
              {
                id: 'sub2_source',
                type: 'sheet_label_source',
                name: 'Source1',
                position: { x: 100, y: 200 },
                parameters: { signalName: 'SharedLabel' }
              },
              {
                id: 'sub2_output',
                type: 'output_port',
                name: 'Output1',
                position: { x: 300, y: 200 },
                parameters: { portName: 'Output1' }
              }
            ],
            connections: [
              {
                id: 'sub2_w1', sourceBlockId: 'sub2_input', sourcePortIndex: 0,
                targetBlockId: 'sub2_sink', targetPortIndex: 0
              },
              {
                id: 'sub2_w2', sourceBlockId: 'sub2_source', sourcePortIndex: 0,
                targetBlockId: 'sub2_output', targetPortIndex: 0
              }
            ],
            extents: { width: 1000, height: 800 }
          }]
        }
      },
      {
        id: 'logger1',
        type: 'signal_logger',
        name: 'Logger1',
        position: { x: 500, y: 100 },
        parameters: { maxSamples: 1000 }
      },
      {
        id: 'logger2',
        type: 'signal_logger',
        name: 'Logger2',
        position: { x: 500, y: 300 },
        parameters: { maxSamples: 1000 }
      }
    ]

    const rootConnections: WireData[] = [
      {
        id: 'w1', sourceBlockId: 'source1', sourcePortIndex: 0,
        targetBlockId: 'subsystem1', targetPortIndex: 0
      },
      {
        id: 'w2', sourceBlockId: 'source2', sourcePortIndex: 0,
        targetBlockId: 'subsystem2', targetPortIndex: 0
      },
      {
        id: 'w3', sourceBlockId: 'subsystem1', sourcePortIndex: 0,
        targetBlockId: 'logger1', targetPortIndex: 0
      },
      {
        id: 'w4', sourceBlockId: 'subsystem2', sourcePortIndex: 0,
        targetBlockId: 'logger2', targetPortIndex: 0
      }
    ]

    const rootSheet: Sheet = {
      id: 'root',
      name: 'Main',
      blocks: rootBlocks,
      connections: rootConnections,
      extents: { width: 1000, height: 800 }
    }

    // Run simulation
    const engine = new MultiSheetSimulationEngine([rootSheet], config)
    const results = engine.run()

    // Get results
    const rootResults = results.get('root')!
    const logger1Data = rootResults.signalData.get('logger1')!
    const logger2Data = rootResults.signalData.get('logger2')!

    // Verify that each subsystem maintained its own sheet label values
    expect(logger1Data[logger1Data.length - 1]).toBe(10) // Source1 value
    expect(logger2Data[logger2Data.length - 1]).toBe(20) // Source2 value
  })
})