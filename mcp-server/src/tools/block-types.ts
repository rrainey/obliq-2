// mcp-server/src/tools/block-types.ts
// Provides block type information and parameter schemas for MCP clients

import { ToolWithHandler } from '../types.js';

/**
 * Block parameter schema definition for MCP clients
 */
interface ParameterSchema {
  type: string;
  description: string;
  default?: any;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: {
    type: string;
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
  };
}

/**
 * Block type information for MCP clients
 */
interface BlockTypeInfo {
  type: string;
  displayName: string;
  category: string;
  description: string;
  parameters: Record<string, ParameterSchema>;
  inputs: string[];
  outputs: string[];
  dynamicPorts?: string;
}

/**
 * Complete block type definitions with parameter schemas
 * This is the authoritative source for MCP clients to understand block configuration
 */
const blockTypeSchemas: BlockTypeInfo[] = [
  // === Sources ===
  {
    type: 'source',
    displayName: 'Source',
    category: 'Sources',
    description: 'Configurable signal generator: constant, step, ramp, sine, chirp, or noise',
    parameters: {
      signalType: {
        type: 'string',
        description: 'Type of signal to generate',
        default: 'constant',
        enum: ['constant', 'step', 'ramp', 'sine', 'chirp', 'noise']
      },
      value: {
        type: 'number',
        description: 'Constant value (for signalType=constant)',
        default: 1
      },
      dataType: {
        type: 'string',
        description: 'Output data type',
        default: 'double',
        enum: ['double', 'float', 'int', 'long']
      },
      stepTime: {
        type: 'number',
        description: 'Time of step transition (for signalType=step)',
        default: 1.0
      },
      stepValue: {
        type: 'number',
        description: 'Value after step (for signalType=step)',
        default: 1.0
      },
      slope: {
        type: 'number',
        description: 'Slope rate (for signalType=ramp)',
        default: 1.0
      },
      startTime: {
        type: 'number',
        description: 'Start time for signal generation',
        default: 0
      },
      frequency: {
        type: 'number',
        description: 'Frequency in Hz (for signalType=sine)',
        default: 1.0
      },
      amplitude: {
        type: 'number',
        description: 'Signal amplitude (for sine, chirp)',
        default: 1.0
      },
      phase: {
        type: 'number',
        description: 'Phase offset in radians (for sine)',
        default: 0
      },
      offset: {
        type: 'number',
        description: 'DC offset added to signal',
        default: 0
      },
      f0: {
        type: 'number',
        description: 'Start frequency for chirp signal',
        default: 0.1
      },
      f1: {
        type: 'number',
        description: 'End frequency for chirp signal',
        default: 10
      },
      duration: {
        type: 'number',
        description: 'Chirp sweep duration in seconds',
        default: 10
      },
      mean: {
        type: 'number',
        description: 'Mean value for noise signal',
        default: 0
      }
    },
    inputs: [],
    outputs: ['output']
  },

  // === Ports ===
  {
    type: 'input_port',
    displayName: 'Input Port',
    category: 'Ports',
    description: 'External input to a model or subsystem. Defines an interface port.',
    parameters: {
      portName: {
        type: 'string',
        description: 'Name of the port (used in parent block interface)',
        default: 'Input'
      },
      dataType: {
        type: 'string',
        description: 'Data type of the port',
        default: 'double',
        enum: ['double', 'float', 'int', 'long', 'double[3]', 'double[3][3]']
      },
      defaultValue: {
        type: 'number',
        description: 'Default value when no input is connected',
        default: 0
      }
    },
    inputs: [],
    outputs: ['output']
  },
  {
    type: 'output_port',
    displayName: 'Output Port',
    category: 'Ports',
    description: 'External output from a model or subsystem. Defines an interface port.',
    parameters: {
      portName: {
        type: 'string',
        description: 'Name of the port (used in parent block interface)',
        default: 'Output'
      }
    },
    inputs: ['input'],
    outputs: []
  },

  // === Math ===
  {
    type: 'sum',
    displayName: 'Sum',
    category: 'Math',
    description: 'Sums multiple input signals with configurable signs (+ or -)',
    parameters: {
      signs: {
        type: 'string',
        description: 'String of + and - characters defining operation for each input (e.g., "++", "+-", "++-")',
        default: '++'
      },
      numInputs: {
        type: 'number',
        description: 'Number of inputs (auto-set from signs length if signs is provided)',
        default: 2,
        minimum: 2,
        maximum: 10
      }
    },
    inputs: ['input1', 'input2'],
    outputs: ['output'],
    dynamicPorts: 'Number of inputs determined by signs string length or numInputs parameter'
  },
  {
    type: 'multiply',
    displayName: 'Multiply',
    category: 'Math',
    description: 'Multiplies multiple input signals together',
    parameters: {
      numInputs: {
        type: 'number',
        description: 'Number of inputs to multiply',
        default: 2,
        minimum: 2,
        maximum: 10
      }
    },
    inputs: ['input1', 'input2'],
    outputs: ['output'],
    dynamicPorts: 'Number of inputs determined by numInputs parameter'
  },
  {
    type: 'scale',
    displayName: 'Scale',
    category: 'Math',
    description: 'Multiplies input by a scalar gain constant',
    parameters: {
      gain: {
        type: 'number',
        description: 'Gain factor to multiply input by',
        default: 1
      }
    },
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'abs',
    displayName: 'Absolute Value',
    category: 'Math',
    description: 'Computes absolute value of scalar input',
    parameters: {},
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'uminus',
    displayName: 'Unary Minus',
    category: 'Math',
    description: 'Negates input signal (element-wise for vectors/matrices)',
    parameters: {},
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'limit',
    displayName: 'Limit',
    category: 'Math',
    description: 'Clamps signal values to specified range',
    parameters: {
      lowerLimit: {
        type: 'number',
        description: 'Minimum allowed value',
        default: -1
      },
      upperLimit: {
        type: 'number',
        description: 'Maximum allowed value',
        default: 1
      }
    },
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'evaluate',
    displayName: 'Evaluate',
    category: 'Math',
    description: 'Evaluates custom C-style expression with multiple inputs. Use in(0), in(1), etc. to reference inputs.',
    parameters: {
      numInputs: {
        type: 'number',
        description: 'Number of input signals',
        default: 2,
        minimum: 1,
        maximum: 10
      },
      expression: {
        type: 'string',
        description: 'C-style expression using in(0), in(1), etc. Example: "in(0) * in(1) + sin(in(2))"',
        default: 'in(0) + in(1)'
      }
    },
    inputs: ['in0', 'in1'],
    outputs: ['output'],
    dynamicPorts: 'Number of inputs determined by numInputs parameter. Inputs named in0, in1, in2, etc.'
  },
  {
    type: 'trig',
    displayName: 'Trig',
    category: 'Math',
    description: 'Trigonometric function block',
    parameters: {
      function: {
        type: 'string',
        description: 'Trigonometric function to apply',
        default: 'sin',
        enum: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sincos', 'atan2']
      }
    },
    inputs: ['input1'],
    outputs: ['output'],
    dynamicPorts: 'sincos has 2 outputs (sin, cos). atan2 has 2 inputs (y, x).'
  },

  // === Dynamic ===
  {
    type: 'transfer_function',
    displayName: 'Transfer Function',
    category: 'Dynamic',
    description: 'Laplace-domain transfer function implemented using RK4 integration',
    parameters: {
      numerator: {
        type: 'array',
        description: 'Numerator polynomial coefficients [highest power first]. Example: [1] for constant gain, [1, 0] for s',
        default: [1],
        items: { type: 'number' }
      },
      denominator: {
        type: 'array',
        description: 'Denominator polynomial coefficients [highest power first]. Example: [1, 1] for (s+1), [1, 2, 1] for (s+1)²',
        default: [1, 1],
        items: { type: 'number' }
      }
    },
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'integrator',
    displayName: 'Integrator',
    category: 'Dynamic',
    description: 'Integrates input signal over time (equivalent to 1/s transfer function)',
    parameters: {
      initialValue: {
        type: 'number',
        description: 'Initial state value at simulation start',
        default: 0
      },
      showEnableInput: {
        type: 'boolean',
        description: 'Show enable input port (when false/0, integration is paused)',
        default: false
      },
      showResetInput: {
        type: 'boolean',
        description: 'Show reset input port (when true/nonzero, state resets to initial value)',
        default: false
      },
      useLimits: {
        type: 'boolean',
        description: 'Enable output saturation limits',
        default: false
      },
      lowerLimit: {
        type: 'number',
        description: 'Lower saturation limit (when useLimits=true)',
        default: -Infinity
      },
      upperLimit: {
        type: 'number',
        description: 'Upper saturation limit (when useLimits=true)',
        default: Infinity
      }
    },
    inputs: ['input'],
    outputs: ['output'],
    dynamicPorts: 'Additional ports appear based on showEnableInput and showResetInput'
  },

  // === Lookup ===
  {
    type: 'lookup_1d',
    displayName: '1-D Lookup',
    category: 'Lookup',
    description: '1-D lookup table with linear interpolation',
    parameters: {
      inputValues: {
        type: 'array',
        description: 'Breakpoints for input axis (must be sorted ascending)',
        default: [0, 1, 2],
        items: { type: 'number' }
      },
      outputValues: {
        type: 'array',
        description: 'Output values corresponding to each breakpoint',
        default: [0, 1, 4],
        items: { type: 'number' }
      },
      extrapolation: {
        type: 'string',
        description: 'Behavior outside table range',
        default: 'clamp',
        enum: ['clamp', 'extrapolate']
      }
    },
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'lookup_2d',
    displayName: '2-D Lookup',
    category: 'Lookup',
    description: '2-D lookup table with bilinear interpolation',
    parameters: {
      input1Values: {
        type: 'array',
        description: 'Breakpoints for first input axis (columns)',
        default: [0, 1, 2],
        items: { type: 'number' }
      },
      input2Values: {
        type: 'array',
        description: 'Breakpoints for second input axis (rows)',
        default: [0, 1, 2],
        items: { type: 'number' }
      },
      outputTable: {
        type: 'array',
        description: '2D array of output values [rows][cols]. Rows correspond to input2Values, columns to input1Values.',
        default: [[0, 0, 0], [0, 1, 2], [0, 2, 4]],
        items: { type: 'array' }
      },
      extrapolation: {
        type: 'string',
        description: 'Behavior outside table range',
        default: 'clamp',
        enum: ['clamp', 'extrapolate']
      }
    },
    inputs: ['input1', 'input2'],
    outputs: ['output']
  },

  // === Matrix ===
  {
    type: 'matrix_multiply',
    displayName: 'Matrix Multiply',
    category: 'Matrix',
    description: 'Matrix multiplication (A×B). Supports matrix×matrix, matrix×vector, vector×scalar combinations.',
    parameters: {},
    inputs: ['input1', 'input2'],
    outputs: ['output']
  },
  {
    type: 'transpose',
    displayName: 'Transpose',
    category: 'Matrix',
    description: 'Matrix transpose. Vectors [n] become [n][1] column matrices. Matrices [m][n] become [n][m].',
    parameters: {},
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'mux',
    displayName: 'Mux',
    category: 'Matrix',
    description: 'Multiplexer: combines scalar inputs into a vector or matrix. Use outputShape to select between vector (1D array) or matrix (2D array) output.',
    parameters: {
      outputShape: {
        type: 'string',
        description: 'Output shape: "vector" for 1D array, "matrix" for 2D array. For vector, only cols is used as the size.',
        default: 'matrix',
        enum: ['vector', 'matrix']
      },
      rows: {
        type: 'number',
        description: 'Number of rows in output matrix (ignored when outputShape is "vector")',
        default: 2,
        minimum: 1,
        maximum: 100
      },
      cols: {
        type: 'number',
        description: 'Number of columns in output matrix, or vector size when outputShape is "vector"',
        default: 2,
        minimum: 1,
        maximum: 100
      },
      baseType: {
        type: 'string',
        description: 'Element data type',
        default: 'double',
        enum: ['double', 'float', 'int', 'long']
      }
    },
    inputs: ['input1', 'input2', 'input3', 'input4'],
    outputs: ['output'],
    dynamicPorts: 'For matrix: inputs = rows × cols. For vector: inputs = cols (vector size). Inputs fill in order.'
  },
  {
    type: 'demux',
    displayName: 'Demux',
    category: 'Matrix',
    description: 'Demultiplexer: splits a matrix/vector into scalar outputs',
    parameters: {
      outputCount: {
        type: 'number',
        description: 'Number of outputs (set automatically from input dimensions during simulation)',
        default: 1,
        minimum: 1,
        maximum: 1000
      }
    },
    inputs: ['input'],
    outputs: ['output1'],
    dynamicPorts: 'Number of outputs determined by input matrix dimensions at runtime'
  },

  // === Vector ===
  {
    type: 'cross',
    displayName: 'Cross Product',
    category: 'Vector',
    description: 'Vector cross product (A × B). Inputs must be 3-element vectors.',
    parameters: {},
    inputs: ['A', 'B'],
    outputs: ['C']
  },
  {
    type: 'dot',
    displayName: 'Dot Product',
    category: 'Vector',
    description: 'Vector dot product (A · B). Inputs must be same-length vectors.',
    parameters: {},
    inputs: ['A', 'B'],
    outputs: ['C']
  },
  {
    type: 'mag',
    displayName: 'Magnitude',
    category: 'Vector',
    description: 'Vector magnitude (Euclidean norm)',
    parameters: {},
    inputs: ['input1'],
    outputs: ['output1']
  },

  // === Control ===
  {
    type: 'if',
    displayName: 'If',
    category: 'Control',
    description: 'Conditional selection: if control is true/nonzero, output=input2, else output=input1',
    parameters: {},
    inputs: ['input1', 'control', 'input2'],
    outputs: ['output']
  },
  {
    type: 'condition',
    displayName: 'Condition',
    category: 'Control',
    description: 'Compares input signal against a constant value. Outputs 1 (true) or 0 (false).',
    parameters: {
      condition: {
        type: 'string',
        description: 'Comparison expression: operator followed by value. Example: "> 0", "<= 10.5", "== 1"',
        default: '> 0'
      }
    },
    inputs: ['x1'],
    outputs: ['out']
  },

  // === Sinks ===
  {
    type: 'signal_display',
    displayName: 'Signal Display',
    category: 'Sinks',
    description: 'Displays signal values during simulation (visible in UI)',
    parameters: {
      maxSamples: {
        type: 'number',
        description: 'Maximum samples to store in circular buffer',
        default: 1000,
        minimum: 1,
        maximum: 10000
      }
    },
    inputs: ['input'],
    outputs: []
  },
  {
    type: 'signal_logger',
    displayName: 'Signal Logger',
    category: 'Sinks',
    description: 'Logs signal values for export/analysis',
    parameters: {
      maxSamples: {
        type: 'number',
        description: 'Maximum samples to store in circular buffer',
        default: 1000,
        minimum: 1,
        maximum: 10000
      }
    },
    inputs: ['input'],
    outputs: []
  },

  // === Sheet Labels ===
  {
    type: 'sheet_label_sink',
    displayName: 'Sheet Label Sink',
    category: 'Sheet Labels',
    description: 'Creates a named signal that can be referenced by sheet_label_source blocks on the same sheet',
    parameters: {
      signalName: {
        type: 'string',
        description: 'Unique name for this signal (must match corresponding source)',
        default: ''
      }
    },
    inputs: ['input'],
    outputs: []
  },
  {
    type: 'sheet_label_source',
    displayName: 'Sheet Label Source',
    category: 'Sheet Labels',
    description: 'Outputs the signal from a corresponding sheet_label_sink with the same signalName',
    parameters: {
      signalName: {
        type: 'string',
        description: 'Name of the signal to receive (must match a sheet_label_sink)',
        default: ''
      }
    },
    inputs: [],
    outputs: ['output']
  },

  // === Hierarchical ===
  {
    type: 'subsystem',
    displayName: 'Subsystem',
    category: 'Hierarchical',
    description: 'Encapsulates a sheet as a reusable block. Contains its own blocks and connections.',
    parameters: {
      codeGenStrategy: {
        type: 'string',
        description: 'How the subsystem is handled during C code generation. "flatten" inlines blocks into parent. "segregated" generates separate init/step functions. "segregated_atomic" guarantees atomic execution.',
        default: 'flatten',
        enum: ['flatten', 'segregated', 'segregated_atomic']
      },
      inputPorts: {
        type: 'array',
        description: 'Names of input ports visible on the subsystem block',
        default: ['Input1'],
        items: { type: 'string' }
      },
      outputPorts: {
        type: 'array',
        description: 'Names of output ports visible on the subsystem block',
        default: ['Output1'],
        items: { type: 'string' }
      },
      showEnableInput: {
        type: 'boolean',
        description: 'Show enable input port (when false/0, subsystem outputs hold previous values)',
        default: false
      },
      showPortNames: {
        type: 'boolean',
        description: 'Display port names next to each port on the subsystem block',
        default: false
      },
      parameters: {
        type: 'array',
        description: 'Subsystem-scoped parameters (only valid for segregated or segregated_atomic codeGenStrategy). Each parameter becomes a #define in generated code. Array of objects with name, signalType, and value.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Parameter name (C-style identifier)' },
            signalType: { type: 'string', enum: ['double', 'float', 'long', 'bool'] },
            value: { type: 'number', description: 'Parameter value' }
          }
        }
      }
    },
    inputs: [],
    outputs: [],
    dynamicPorts: 'Inputs/outputs match inputPorts/outputPorts arrays. A main sheet with default ports is auto-created.'
  },

  // === Aerospace ===
  {
    type: 'orientation_conversion',
    displayName: 'Orientation Conversion',
    category: 'Aerospace',
    description: 'Converts between Euler angles, DCM (Direction Cosine Matrix), and Quaternion representations using AIAA/ANSI aerospace convention',
    parameters: {
      conversionType: {
        type: 'string',
        description: 'Conversion direction',
        default: 'euler_to_dcm',
        enum: [
          'euler_to_dcm',
          'euler_to_quaternion',
          'dcm_to_euler',
          'dcm_to_quaternion',
          'quaternion_to_dcm',
          'quaternion_to_euler',
          'body_to_quaternion_rates'
        ]
      }
    },
    inputs: ['Phi_rad', 'Theta_rad', 'Psi_rad'],
    outputs: ['DCM'],
    dynamicPorts: 'Inputs and outputs change based on conversionType'
  },

  // === Annotation ===
  {
    type: 'comment',
    displayName: 'Comment',
    category: 'Annotation',
    description: 'Text annotation block with Markdown support including LaTeX math. No inputs or outputs - purely for documentation. The block name is never rendered on the canvas.',
    parameters: {
      text: {
        type: 'string',
        description: 'Markdown text content. Supports GFM (tables, task lists) and LaTeX math ($...$ for inline, $$...$$ for block)',
        default: '# Comment\n\nAdd your notes here...'
      },
      width: {
        type: 'number',
        description: 'Width of the comment block in pixels',
        default: 200,
        minimum: 100,
        maximum: 800
      },
      height: {
        type: 'number',
        description: 'Minimum height of the comment block in pixels. Ignored when autoHeight is true.',
        default: 100,
        minimum: 50,
        maximum: 600
      },
      autoHeight: {
        type: 'boolean',
        description: 'When true, the comment block automatically expands to fit all text content. Height parameter is ignored.',
        default: true
      },
      backgroundColor: {
        type: 'string',
        description: 'Background color. Use any CSS color value (e.g., "#fffde7"), or use the special value "canvas" for transparent background',
        default: '#fffde7'
      },
      borderColor: {
        type: 'string',
        description: 'Border color. Use any CSS color value (e.g., "#ffd54f"), or use the special value "none" for no border',
        default: '#ffd54f'
      }
    },
    inputs: [],
    outputs: []
  }
];

/**
 * Get all unique categories
 */
function getCategories(): string[] {
  const categories = new Set(blockTypeSchemas.map(b => b.category));
  return Array.from(categories).sort();
}

export const listBlockTypesTool: ToolWithHandler = {
  name: 'list_block_types',
  description: `List all available block types with their configurable parameters, default values, and descriptions.

Use this tool to discover:
- What block types are available
- What parameters each block type accepts
- Default values and allowed options for each parameter
- Input/output port names

You can filter by category to see related blocks together.`,
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category (optional). Available categories: Sources, Ports, Math, Dynamic, Lookup, Matrix, Vector, Control, Sinks, Sheet Labels, Hierarchical, Aerospace, Annotation'
      },
      blockType: {
        type: 'string',
        description: 'Get detailed info for a specific block type (optional)'
      }
    }
  },
  handler: async (args: any) => {
    try {
      const { category, blockType } = args;

      // If specific block type requested, return detailed info
      if (blockType) {
        const block = blockTypeSchemas.find(b => b.type === blockType);
        if (!block) {
          return {
            success: false,
            error: `Unknown block type: ${blockType}`,
            availableTypes: blockTypeSchemas.map(b => b.type)
          };
        }
        return {
          success: true,
          blockType: block
        };
      }

      // Filter by category if provided
      let filteredBlocks = blockTypeSchemas;
      if (category) {
        filteredBlocks = blockTypeSchemas.filter(
          b => b.category.toLowerCase() === category.toLowerCase()
        );
        if (filteredBlocks.length === 0) {
          return {
            success: false,
            error: `Unknown category: ${category}`,
            availableCategories: getCategories()
          };
        }
      }

      // Return block types organized by category
      const byCategory: Record<string, BlockTypeInfo[]> = {};
      for (const block of filteredBlocks) {
        if (!byCategory[block.category]) {
          byCategory[block.category] = [];
        }
        byCategory[block.category].push(block);
      }

      return {
        success: true,
        categories: getCategories(),
        blockTypes: byCategory,
        totalCount: filteredBlocks.length
      };
    } catch (error) {
      console.error('[list_block_types] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

/**
 * Lightweight version that returns just block type names and descriptions
 */
export const listBlockTypesSummaryTool: ToolWithHandler = {
  name: 'list_block_types_summary',
  description: 'Get a quick summary of all available block types (names and descriptions only, no parameter details)',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category (optional)'
      }
    }
  },
  handler: async (args: any) => {
    try {
      const { category } = args;

      let filteredBlocks = blockTypeSchemas;
      if (category) {
        filteredBlocks = blockTypeSchemas.filter(
          b => b.category.toLowerCase() === category.toLowerCase()
        );
      }

      const summary = filteredBlocks.map(b => ({
        type: b.type,
        displayName: b.displayName,
        category: b.category,
        description: b.description
      }));

      return {
        success: true,
        categories: getCategories(),
        blockTypes: summary,
        totalCount: summary.length,
        hint: 'Use list_block_types with blockType parameter for detailed parameter info'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};
