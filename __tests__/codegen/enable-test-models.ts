// __tests__/codegen/enable-test-models.ts

import { Sheet } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

/**
 * Test models for validating enable signal functionality
 */
export class EnableTestModels {
  /**
   * Create a simple model with one subsystem that has enable input
   */
  static createSimpleEnableModel(): Sheet[] {
    const mainSheet: Sheet = {
      id: 'main',
      name: 'Main',
      blocks: [
        {
          id: 'input1',
          name: 'EnableSignal',
          type: 'input_port',
          position: { x: 100, y: 100 },
          parameters: {
            portName: 'EnableSignal',
            dataType: 'bool'
          }
        },
        {
          id: 'input2',
          name: 'InputSignal',
          type: 'input_port',
          position: { x: 100, y: 200 },
          parameters: {
            portName: 'InputSignal',
            dataType: 'double'
          }
        },
        {
          id: 'subsystem1',
          name: 'ProcessingSubsystem',
          type: 'subsystem',
          position: { x: 300, y: 150 },
          parameters: {
            showEnableInput: true,
            inputPorts: ['In1'],
            outputPorts: ['Out1'],
            sheets: [
              {
                id: 'sub1',
                name: 'SubSheet1',
                blocks: [
                  {
                    id: 'sub_input1',
                    name: 'In1',
                    type: 'input_port',
                    position: { x: 100, y: 100 },
                    parameters: {
                      portName: 'In1',
                      dataType: 'double'
                    }
                  },
                  {
                    id: 'tf1',
                    name: 'TransferFunction1',
                    type: 'transfer_function',
                    position: { x: 300, y: 100 },
                    parameters: {
                      numerator: [1],
                      denominator: [1, 1]  // 1/(s+1)
                    }
                  },
                  {
                    id: 'sub_output1',
                    name: 'Out1',
                    type: 'output_port',
                    position: { x: 500, y: 100 },
                    parameters: {
                      portName: 'Out1'
                    }
                  }
                ],
                connections: [
                  {
                    id: 'sub_wire1',
                    sourceBlockId: 'sub_input1',
                    sourcePortIndex: 0,
                    targetBlockId: 'tf1',
                    targetPortIndex: 0
                  },
                  {
                    id: 'sub_wire2',
                    sourceBlockId: 'tf1',
                    sourcePortIndex: 0,
                    targetBlockId: 'sub_output1',
                    targetPortIndex: 0
                  }
                ],
                extents: { width: 600, height: 300 }
              } as Sheet
            ]
          }
        },
        {
          id: 'output1',
          name: 'ProcessedOutput',
          type: 'output_port',
          position: { x: 500, y: 150 },
          parameters: {
            portName: 'ProcessedOutput'
          }
        }
      ],
      connections: [
        {
          id: 'wire1',
          sourceBlockId: 'input1',
          sourcePortIndex: 0,
          targetBlockId: 'subsystem1',
          targetPortIndex: -1  // Enable port
        },
        {
          id: 'wire2',
          sourceBlockId: 'input2',
          sourcePortIndex: 0,
          targetBlockId: 'subsystem1',
          targetPortIndex: 0
        },
        {
          id: 'wire3',
          sourceBlockId: 'subsystem1',
          sourcePortIndex: 0,
          targetBlockId: 'output1',
          targetPortIndex: 0
        }
      ],
      extents: { width: 800, height: 400 }
    }

    return [mainSheet]
  }

  /**
   * Create a model with nested subsystems and enable inheritance
   */
  static createNestedEnableModel(): Sheet[] {
    const mainSheet: Sheet = {
      id: 'main',
      name: 'Main',
      blocks: [
        {
          id: 'enable_parent',
          name: 'ParentEnable',
          type: 'input_port',
          position: { x: 100, y: 100 },
          parameters: {
            portName: 'ParentEnable',
            dataType: 'bool'
          }
        },
        {
          id: 'enable_child',
          name: 'ChildEnable',
          type: 'input_port',
          position: { x: 100, y: 200 },
          parameters: {
            portName: 'ChildEnable',
            dataType: 'bool'
          }
        },
        {
          id: 'test_input',
          name: 'TestInput',
          type: 'input_port',
          position: { x: 100, y: 300 },
          parameters: {
            portName: 'TestInput',
            dataType: 'double'
          }
        },
        {
          id: 'parent_subsystem',
          name: 'ParentSubsystem',
          type: 'subsystem',
          position: { x: 300, y: 200 },
          parameters: {
            showEnableInput: true,
            inputPorts: ['EnableChild', 'DataIn'],
            outputPorts: ['DataOut'],
            sheets: [
              {
                id: 'parent_sheet',
                name: 'ParentSheet',
                blocks: [
                  {
                    id: 'parent_enable_in',
                    name: 'EnableChild',
                    type: 'input_port',
                    position: { x: 100, y: 100 },
                    parameters: {
                      portName: 'EnableChild',
                      dataType: 'bool'
                    }
                  },
                  {
                    id: 'parent_data_in',
                    name: 'DataIn',
                    type: 'input_port',
                    position: { x: 100, y: 200 },
                    parameters: {
                      portName: 'DataIn',
                      dataType: 'double'
                    }
                  },
                  {
                    id: 'child_subsystem',
                    name: 'ChildSubsystem',
                    type: 'subsystem',
                    position: { x: 300, y: 150 },
                    parameters: {
                      showEnableInput: true,
                      inputPorts: ['In'],
                      outputPorts: ['Out'],
                      sheets: [
                        {
                          id: 'child_sheet',
                          name: 'ChildSheet',
                          blocks: [
                            {
                              id: 'child_input',
                              name: 'In',
                              type: 'input_port',
                              position: { x: 100, y: 100 },
                              parameters: {
                                portName: 'In',
                                dataType: 'double'
                              }
                            },
                            {
                              id: 'child_tf',
                              name: 'ChildTransferFunction',
                              type: 'transfer_function',
                              position: { x: 300, y: 100 },
                              parameters: {
                                numerator: [2],
                                denominator: [1, 2]  // 2/(s+2)
                              }
                            },
                            {
                              id: 'child_output',
                              name: 'Out',
                              type: 'output_port',
                              position: { x: 500, y: 100 },
                              parameters: {
                                portName: 'Out'
                              }
                            }
                          ],
                          connections: [
                            {
                              id: 'child_wire1',
                              sourceBlockId: 'child_input',
                              sourcePortIndex: 0,
                              targetBlockId: 'child_tf',
                              targetPortIndex: 0
                            },
                            {
                              id: 'child_wire2',
                              sourceBlockId: 'child_tf',
                              sourcePortIndex: 0,
                              targetBlockId: 'child_output',
                              targetPortIndex: 0
                            }
                          ],
                          extents: { width: 600, height: 300 }
                        } as Sheet
                      ]
                    }
                  },
                  {
                    id: 'parent_output',
                    name: 'DataOut',
                    type: 'output_port',
                    position: { x: 500, y: 150 },
                    parameters: {
                      portName: 'DataOut'
                    }
                  }
                ],
                connections: [
                  {
                    id: 'parent_wire1',
                    sourceBlockId: 'parent_enable_in',
                    sourcePortIndex: 0,
                    targetBlockId: 'child_subsystem',
                    targetPortIndex: -1  // Enable port
                  },
                  {
                    id: 'parent_wire2',
                    sourceBlockId: 'parent_data_in',
                    sourcePortIndex: 0,
                    targetBlockId: 'child_subsystem',
                    targetPortIndex: 0
                  },
                  {
                    id: 'parent_wire3',
                    sourceBlockId: 'child_subsystem',
                    sourcePortIndex: 0,
                    targetBlockId: 'parent_output',
                    targetPortIndex: 0
                  }
                ],
                extents: { width: 700, height: 400 }
              } as Sheet
            ]
          }
        },
        {
          id: 'main_output',
          name: 'FinalOutput',
          type: 'output_port',
          position: { x: 500, y: 200 },
          parameters: {
            portName: 'FinalOutput'
          }
        }
      ],
      connections: [
        {
          id: 'main_wire1',
          sourceBlockId: 'enable_parent',
          sourcePortIndex: 0,
          targetBlockId: 'parent_subsystem',
          targetPortIndex: -1  // Enable port
        },
        {
          id: 'main_wire2',
          sourceBlockId: 'enable_child',
          sourcePortIndex: 0,
          targetBlockId: 'parent_subsystem',
          targetPortIndex: 0  // First regular input
        },
        {
          id: 'main_wire3',
          sourceBlockId: 'test_input',
          sourcePortIndex: 0,
          targetBlockId: 'parent_subsystem',
          targetPortIndex: 1  // Second regular input
        },
        {
          id: 'main_wire4',
          sourceBlockId: 'parent_subsystem',
          sourcePortIndex: 0,
          targetBlockId: 'main_output',
          targetPortIndex: 0
        }
      ],
      extents: { width: 800, height: 500 }
    }

    return [mainSheet]
  }

  /**
   * Create a model to test state freezing behavior
   */
  static createStateFreezeTestModel(): Sheet[] {
    const mainSheet: Sheet = {
      id: 'main',
      name: 'Main',
      blocks: [
        {
          id: 'enable_signal',
          name: 'EnableControl',
          type: 'source',
          position: { x: 100, y: 100 },
          parameters: {
            sourceType: 'constant',
            value: '1',  // Will be toggled in test
            dataType: 'bool'
          }
        },
        {
          id: 'step_input',
          name: 'StepInput',
          type: 'source',
          position: { x: 100, y: 200 },
          parameters: {
            sourceType: 'constant',
            value: '1.0',
            dataType: 'double'
          }
        },
        {
          id: 'processing_subsystem',
          name: 'ProcessingSystem',
          type: 'subsystem',
          position: { x: 300, y: 150 },
          parameters: {
            showEnableInput: true,
            inputPorts: ['Input'],
            outputPorts: ['Output', 'State'],
            sheets: [
              {
                id: 'proc_sheet',
                name: 'ProcessingSheet',
                blocks: [
                  {
                    id: 'proc_input',
                    name: 'Input',
                    type: 'input_port',
                    position: { x: 100, y: 100 },
                    parameters: {
                      portName: 'Input',
                      dataType: 'double'
                    }
                  },
                  {
                    id: 'integrator',
                    name: 'Integrator',
                    type: 'transfer_function',
                    position: { x: 300, y: 100 },
                    parameters: {
                      numerator: [1],
                      denominator: [1, 0]  // 1/s (pure integrator)
                    }
                  },
                  {
                    id: 'first_order',
                    name: 'FirstOrder',
                    type: 'transfer_function',
                    position: { x: 300, y: 200 },
                    parameters: {
                      numerator: [1],
                      denominator: [1, 1]  // 1/(s+1)
                    }
                  },
                  {
                    id: 'proc_output',
                    name: 'Output',
                    type: 'output_port',
                    position: { x: 500, y: 100 },
                    parameters: {
                      portName: 'Output'
                    }
                  },
                  {
                    id: 'state_output',
                    name: 'State',
                    type: 'output_port',
                    position: { x: 500, y: 200 },
                    parameters: {
                      portName: 'State'
                    }
                  }
                ],
                connections: [
                  {
                    id: 'proc_wire1',
                    sourceBlockId: 'proc_input',
                    sourcePortIndex: 0,
                    targetBlockId: 'integrator',
                    targetPortIndex: 0
                  },
                  {
                    id: 'proc_wire2',
                    sourceBlockId: 'proc_input',
                    sourcePortIndex: 0,
                    targetBlockId: 'first_order',
                    targetPortIndex: 0
                  },
                  {
                    id: 'proc_wire3',
                    sourceBlockId: 'integrator',
                    sourcePortIndex: 0,
                    targetBlockId: 'proc_output',
                    targetPortIndex: 0
                  },
                  {
                    id: 'proc_wire4',
                    sourceBlockId: 'first_order',
                    sourcePortIndex: 0,
                    targetBlockId: 'state_output',
                    targetPortIndex: 0
                  }
                ],
                extents: { width: 600, height: 400 }
              } as Sheet
            ]
          }
        },
        {
          id: 'integrated_output',
          name: 'IntegratedOutput',
          type: 'output_port',
          position: { x: 500, y: 100 },
          parameters: {
            portName: 'IntegratedOutput'
          }
        },
        {
          id: 'state_output',
          name: 'StateOutput',
          type: 'output_port',
          position: { x: 500, y: 200 },
          parameters: {
            portName: 'StateOutput'
          }
        }
      ],
      connections: [
        {
          id: 'freeze_wire1',
          sourceBlockId: 'enable_signal',
          sourcePortIndex: 0,
          targetBlockId: 'processing_subsystem',
          targetPortIndex: -1  // Enable port
        },
        {
          id: 'freeze_wire2',
          sourceBlockId: 'step_input',
          sourcePortIndex: 0,
          targetBlockId: 'processing_subsystem',
          targetPortIndex: 0
        },
        {
          id: 'freeze_wire3',
          sourceBlockId: 'processing_subsystem',
          sourcePortIndex: 0,
          targetBlockId: 'integrated_output',
          targetPortIndex: 0
        },
        {
          id: 'freeze_wire4',
          sourceBlockId: 'processing_subsystem',
          sourcePortIndex: 1,
          targetBlockId: 'state_output',
          targetPortIndex: 0
        }
      ],
      extents: { width: 700, height: 400 }
    }

    return [mainSheet]
  }
}