// __tests__/codegen/enable-test-models.ts

import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { createBlock } from '@/lib/blockFactory'

/**
 * Helper to create a block with specific id and position for test models
 */
function createTestBlock(
  type: string,
  id: string,
  name: string,
  position: { x: number; y: number },
  parameters?: Record<string, any>
): BlockData {
  const block = createBlock(type, {
    name,
    position,
    parameters
  }) as BlockData
  // Override the generated id with test-specific id for predictable references
  block.id = id
  return block
}

/**
 * Test models for validating enable signal functionality
 */
export class EnableTestModels {
  /**
   * Create a simple model with one subsystem that has enable input
   */
  static createSimpleEnableModel(): Sheet[] {
    // Create subsystem's internal sheet blocks
    const subsystemSheet: Sheet = {
      id: 'sub1',
      name: 'SubSheet1',
      blocks: [
        createTestBlock('input_port', 'sub_input1', 'In1', { x: 100, y: 100 }, {
          portName: 'In1',
          dataType: 'double'
        }),
        createTestBlock('transfer_function', 'tf1', 'TransferFunction1', { x: 300, y: 100 }, {
          numerator: [1],
          denominator: [1, 1]  // 1/(s+1)
        }),
        createTestBlock('output_port', 'sub_output1', 'Out1', { x: 500, y: 100 }, {
          portName: 'Out1'
        })
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
    }

    const mainSheet: Sheet = {
      id: 'main',
      name: 'Main',
      blocks: [
        createTestBlock('input_port', 'input1', 'EnableSignal', { x: 100, y: 100 }, {
          portName: 'EnableSignal',
          dataType: 'bool'
        }),
        createTestBlock('input_port', 'input2', 'InputSignal', { x: 100, y: 200 }, {
          portName: 'InputSignal',
          dataType: 'double'
        }),
        createTestBlock('subsystem', 'subsystem1', 'ProcessingSubsystem', { x: 300, y: 150 }, {
          showEnableInput: true,
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subsystemSheet]
        }),
        createTestBlock('output_port', 'output1', 'ProcessedOutput', { x: 500, y: 150 }, {
          portName: 'ProcessedOutput'
        })
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
    // Child subsystem's internal sheet
    const childSheet: Sheet = {
      id: 'child_sheet',
      name: 'ChildSheet',
      blocks: [
        createTestBlock('input_port', 'child_input', 'In', { x: 100, y: 100 }, {
          portName: 'In',
          dataType: 'double'
        }),
        createTestBlock('transfer_function', 'child_tf', 'ChildTransferFunction', { x: 300, y: 100 }, {
          numerator: [2],
          denominator: [1, 2]  // 2/(s+2)
        }),
        createTestBlock('output_port', 'child_output', 'Out', { x: 500, y: 100 }, {
          portName: 'Out'
        })
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
    }

    // Parent subsystem's internal sheet
    const parentSheet: Sheet = {
      id: 'parent_sheet',
      name: 'ParentSheet',
      blocks: [
        createTestBlock('input_port', 'parent_enable_in', 'EnableChild', { x: 100, y: 100 }, {
          portName: 'EnableChild',
          dataType: 'bool'
        }),
        createTestBlock('input_port', 'parent_data_in', 'DataIn', { x: 100, y: 200 }, {
          portName: 'DataIn',
          dataType: 'double'
        }),
        createTestBlock('subsystem', 'child_subsystem', 'ChildSubsystem', { x: 300, y: 150 }, {
          showEnableInput: true,
          inputPorts: ['In'],
          outputPorts: ['Out'],
          sheets: [childSheet]
        }),
        createTestBlock('output_port', 'parent_output', 'DataOut', { x: 500, y: 150 }, {
          portName: 'DataOut'
        })
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
    }

    const mainSheet: Sheet = {
      id: 'main',
      name: 'Main',
      blocks: [
        createTestBlock('input_port', 'enable_parent', 'ParentEnable', { x: 100, y: 100 }, {
          portName: 'ParentEnable',
          dataType: 'bool'
        }),
        createTestBlock('input_port', 'enable_child', 'ChildEnable', { x: 100, y: 200 }, {
          portName: 'ChildEnable',
          dataType: 'bool'
        }),
        createTestBlock('input_port', 'test_input', 'TestInput', { x: 100, y: 300 }, {
          portName: 'TestInput',
          dataType: 'double'
        }),
        createTestBlock('subsystem', 'parent_subsystem', 'ParentSubsystem', { x: 300, y: 200 }, {
          showEnableInput: true,
          inputPorts: ['EnableChild', 'DataIn'],
          outputPorts: ['DataOut'],
          sheets: [parentSheet]
        }),
        createTestBlock('output_port', 'main_output', 'FinalOutput', { x: 500, y: 200 }, {
          portName: 'FinalOutput'
        })
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
    // Processing subsystem's internal sheet
    const procSheet: Sheet = {
      id: 'proc_sheet',
      name: 'ProcessingSheet',
      blocks: [
        createTestBlock('input_port', 'proc_input', 'Input', { x: 100, y: 100 }, {
          portName: 'Input',
          dataType: 'double'
        }),
        createTestBlock('transfer_function', 'integrator', 'Integrator', { x: 300, y: 100 }, {
          numerator: [1],
          denominator: [1, 0]  // 1/s (pure integrator)
        }),
        createTestBlock('transfer_function', 'first_order', 'FirstOrder', { x: 300, y: 200 }, {
          numerator: [1],
          denominator: [1, 1]  // 1/(s+1)
        }),
        createTestBlock('output_port', 'proc_output', 'Output', { x: 500, y: 100 }, {
          portName: 'Output'
        }),
        createTestBlock('output_port', 'state_output_inner', 'State', { x: 500, y: 200 }, {
          portName: 'State'
        })
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
          targetBlockId: 'state_output_inner',
          targetPortIndex: 0
        }
      ],
      extents: { width: 600, height: 400 }
    }

    const mainSheet: Sheet = {
      id: 'main',
      name: 'Main',
      blocks: [
        createTestBlock('source', 'enable_signal', 'EnableControl', { x: 100, y: 100 }, {
          signalType: 'constant',
          value: 1,  // Will be toggled in test
          dataType: 'bool'
        }),
        createTestBlock('source', 'step_input', 'StepInput', { x: 100, y: 200 }, {
          signalType: 'constant',
          value: 1.0,
          dataType: 'double'
        }),
        createTestBlock('subsystem', 'processing_subsystem', 'ProcessingSystem', { x: 300, y: 150 }, {
          showEnableInput: true,
          inputPorts: ['Input'],
          outputPorts: ['Output', 'State'],
          sheets: [procSheet]
        }),
        createTestBlock('output_port', 'integrated_output', 'IntegratedOutput', { x: 500, y: 100 }, {
          portName: 'IntegratedOutput'
        }),
        createTestBlock('output_port', 'state_output', 'StateOutput', { x: 500, y: 200 }, {
          portName: 'StateOutput'
        })
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