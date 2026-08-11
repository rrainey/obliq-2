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
  {
    type: 'clock',
    displayName: 'Clock',
    category: 'Sources',
    description: 'Outputs the current simulation time in seconds as a double scalar value. No configuration required.',
    parameters: {},
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
    type: 'divide',
    displayName: 'Divide',
    category: 'Math',
    description: 'Element-wise division (num/den). Denominator may be a scalar broadcast onto a vector/matrix numerator. Scalar numerator over non-scalar denominator is not supported.',
    parameters: {},
    inputs: ['num', 'den'],
    outputs: ['out']
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
    type: 'sign',
    displayName: 'Sign',
    category: 'Math',
    description: 'Signum function: returns −1, 0, or +1 (element-wise for vectors/matrices)',
    parameters: {},
    inputs: ['in'],
    outputs: ['out']
  },
  {
    type: 'relay',
    displayName: 'Relay',
    category: 'Discontinuities',
    description: 'Hysteresis switch: turns ON when input ≥ onThreshold, OFF when input ≤ offThreshold. Holds state between thresholds.',
    parameters: {
      onThreshold: { type: 'number', description: 'Switch ON when u ≥ this', default: 0 },
      offThreshold: { type: 'number', description: 'Switch OFF when u ≤ this (must be ≤ onThreshold)', default: 0 },
      onOutput: { type: 'number', description: 'Output when ON', default: 1 },
      offOutput: { type: 'number', description: 'Output when OFF', default: 0 },
      initialOn: { type: 'boolean', description: 'Start with ON state', default: false }
    },
    inputs: ['in'],
    outputs: ['out']
  },
  {
    type: 'rate_limiter',
    displayName: 'Rate Limiter',
    category: 'Discontinuities',
    description: 'Limits rate of change of output using simulation dt. risingSlewLimit > 0, fallingSlewLimit < 0 (units/sec).',
    parameters: {
      risingSlewLimit: { type: 'number', description: 'Max positive dy/dt (must be > 0)', default: 1 },
      fallingSlewLimit: { type: 'number', description: 'Min negative dy/dt (must be < 0)', default: -1 },
      initialOutput: { type: 'number', description: 'Output at t=0', default: 0 }
    },
    inputs: ['in'],
    outputs: ['out']
  },
  {
    type: 'quantizer',
    displayName: 'Quantizer',
    category: 'Discontinuities',
    description: 'Rounds input to nearest multiple of quantum: y = quantum * floor(u/quantum + 0.5). Element-wise for vectors/matrices.',
    parameters: {
      quantum: { type: 'number', description: 'Quantization step size (> 0)', default: 1 }
    },
    inputs: ['in'],
    outputs: ['out']
  },
  {
    type: 'selector',
    displayName: 'Selector',
    category: 'Matrix',
    description: 'Select elements from a vector by 0-based indices. One index → scalar; multiple → vector in listed order.',
    parameters: {
      indices: { type: 'array', description: '0-based indices into the input vector', default: [0], items: { type: 'number' } }
    },
    inputs: ['in'],
    outputs: ['out']
  },
  {
    type: 'data_store_write',
    displayName: 'Data Store Write',
    category: 'Data',
    description: 'Write input to a model-scoped named data store (shared across sheets/subsystems). No output.',
    parameters: {
      storeName: { type: 'string', description: 'Valid C identifier for the store', default: 'store' },
      dataType: { type: 'string', description: 'Declared type (e.g. double, double[3])', default: 'double' },
      initialValue: { type: 'string', description: 'C99 initializer for store at t=0', default: '0' }
    },
    inputs: ['in'],
    outputs: []
  },
  {
    type: 'data_store_read',
    displayName: 'Data Store Read',
    category: 'Data',
    description: 'Read a model-scoped named data store. Match storeName with a Data Store Write.',
    parameters: {
      storeName: { type: 'string', description: 'Valid C identifier for the store', default: 'store' },
      dataType: { type: 'string', description: 'Output type (must match write)', default: 'double' }
    },
    inputs: [],
    outputs: ['out']
  },
  {
    type: 'edge_detect',
    displayName: 'Edge Detect',
    category: 'Discontinuities',
    description: 'Outputs a one-step pulse (1.0) on rising, falling, or either edge. Use with integrator reset for engine start timers.',
    parameters: {
      edge: { type: 'string', description: "'rising' | 'falling' | 'either'", default: 'rising' },
      threshold: { type: 'number', description: 'High when input ≥ threshold', default: 0.5 }
    },
    inputs: ['in'],
    outputs: ['pulse']
  },
  {
    type: 'atmosphere',
    displayName: 'Atmosphere',
    category: 'Aerospace',
    description: '1976 COESA atmosphere vs geometric altitude (m). Four outputs: temperature_K, pressure_Pa, density_kgpm3, speed_of_sound_mps. Build q̄ = ½ρV² in the model.',
    parameters: {
      model: { type: 'string', description: "'coesa1976' | 'table'", default: 'coesa1976' },
      extrapolation: { type: 'string', description: "'clamp' | 'extrapolate'", default: 'clamp' }
    },
    inputs: ['altitude_m'],
    outputs: ['temperature_K', 'pressure_Pa', 'density_kgpm3', 'speed_of_sound_mps']
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
        description: 'Initial state value at simulation start (ignored when showInitPort=true)',
        default: 0
      },
      showInitPort: {
        type: 'boolean',
        description: 'Show x(0) as a left-side data port (port 1). At t=0 and on reset, state is taken from this signal instead of initialValue. Unconnected x(0) initializes to 0.',
        default: false
      },
      showEnableInput: {
        type: 'boolean',
        description: 'Show enable control port on top (port -1). When false/0, integration is paused.',
        default: false
      },
      showResetInput: {
        type: 'boolean',
        description: 'Show reset control port on bottom (port -2). Rising edge reloads state from x(0) if shown, else initialValue.',
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
    inputs: ['Derivative', 'x(0) when showInitPort'],
    outputs: ['output'],
    dynamicPorts: 'Data ports: [0] Derivative, [1] x(0) when showInitPort. Control ports: enable (top, -1), reset (bottom, -2).'
  },
  {
    type: 'unit_delay',
    displayName: 'Unit Delay',
    category: 'Dynamic',
    description: 'Unit delay (z⁻¹ / Memory): output is the previous sample of the input. No direct feedthrough; breaks algebraic loops. Used for discrete guidance memory (e.g. IGM last-χ).',
    parameters: {
      initialValue: {
        type: 'number',
        description: 'Value of the delayed output at the first sample (t=0)',
        default: 0
      },
      sampleInterval: {
        type: 'number',
        description: 'Sample period in seconds. 0 = update every simulation step; >0 = hold and update on that period.',
        default: 0
      }
    },
    inputs: ['in'],
    outputs: ['out']
  },
  {
    type: 'discrete_transform',
    displayName: 'Discrete Transform',
    category: 'Dynamic',
    description: 'Discrete-time transfer function (z-transform) implemented using difference equations. Updates at specified sample intervals.',
    parameters: {
      numerator: {
        type: 'array',
        description: 'Numerator polynomial coefficients [highest power first]. Example: [1, 0.5] for z + 0.5',
        default: [1],
        items: { type: 'number' }
      },
      denominator: {
        type: 'array',
        description: 'Denominator polynomial coefficients [highest power first]. Example: [1, -0.8] for z - 0.8',
        default: [1, -0.5],
        items: { type: 'number' }
      },
      sampleInterval: {
        type: 'number',
        description: 'Sample period in seconds (Ts). The block updates its output only at multiples of this interval.',
        default: 0.01,
        minimum: 0.0001
      }
    },
    inputs: ['input'],
    outputs: ['output']
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
  {
    type: 'no_connection',
    displayName: 'No Connection',
    category: 'Sinks',
    description: 'Marks a signal as intentionally unused. When an output is connected to a No Connection block, no other connections can be made from that output. Use this to document signals that are not needed in the model.',
    parameters: {},
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
  {
    type: 'units_conversion',
    displayName: 'Units Conversion',
    category: 'Aerospace',
    description: 'Converts between SI and American/Imperial engineering units. Select a category first, then choose the specific conversion.',
    parameters: {
      category: {
        type: 'string',
        description: 'Unit category',
        default: 'angle',
        enum: [
          'angle',
          'temperature',
          'length',
          'velocity',
          'angular_velocity',
          'acceleration',
          'mass',
          'force',
          'pressure',
          'area',
          'volume',
          'energy',
          'power',
          'torque',
          'density',
          'flow_rate'
        ]
      },
      conversionType: {
        type: 'string',
        description: 'Specific conversion to perform. Available conversions depend on category:\n' +
          '  angle: deg_to_rad, rad_to_deg, rev_to_rad, rev_to_deg\n' +
          '  temperature: c_to_f, f_to_c, c_to_k, k_to_c, f_to_r, r_to_f\n' +
          '  length: m_to_ft, ft_to_m, m_to_in, in_to_m, km_to_mi, mi_to_km, km_to_nmi, nmi_to_km\n' +
          '  velocity: mps_to_fps, fps_to_mps, mps_to_kts, kts_to_mps, mps_to_mph, mph_to_mps, kmh_to_mph, mph_to_kmh\n' +
          '  angular_velocity: radps_to_degps, degps_to_radps, radps_to_rpm, rpm_to_radps\n' +
          '  acceleration: mps2_to_fps2, fps2_to_mps2, mps2_to_g, g_to_mps2\n' +
          '  mass: kg_to_lbm, lbm_to_kg, kg_to_slug, slug_to_kg\n' +
          '  force: n_to_lbf, lbf_to_n\n' +
          '  pressure: pa_to_psi, psi_to_pa, pa_to_atm, atm_to_pa, pa_to_inhg, inhg_to_pa, pa_to_mbar, mbar_to_pa\n' +
          '  area: m2_to_ft2, ft2_to_m2, m2_to_in2, in2_to_m2, km2_to_mi2, mi2_to_km2, ha_to_acre, acre_to_ha\n' +
          '  volume: m3_to_ft3, ft3_to_m3, l_to_gal, gal_to_l, m3_to_in3, in3_to_m3\n' +
          '  energy: j_to_btu, btu_to_j, j_to_ftlbf, ftlbf_to_j\n' +
          '  power: w_to_hp, hp_to_w, w_to_btuh, btuh_to_w\n' +
          '  torque: nm_to_lbft, lbft_to_nm, nm_to_lbin, lbin_to_nm\n' +
          '  density: kgm3_to_lbft3, lbft3_to_kgm3, kgm3_to_slugft3, slugft3_to_kgm3\n' +
          '  flow_rate: m3s_to_cfm, cfm_to_m3s, lpm_to_gpm, gpm_to_lpm',
        default: 'deg_to_rad',
        enum: [
          // Angle
          'deg_to_rad', 'rad_to_deg', 'rev_to_rad', 'rev_to_deg',
          // Temperature
          'c_to_f', 'f_to_c', 'c_to_k', 'k_to_c', 'f_to_r', 'r_to_f',
          // Length
          'm_to_ft', 'ft_to_m', 'm_to_in', 'in_to_m', 'km_to_mi', 'mi_to_km', 'km_to_nmi', 'nmi_to_km',
          // Velocity
          'mps_to_fps', 'fps_to_mps', 'mps_to_kts', 'kts_to_mps', 'mps_to_mph', 'mph_to_mps', 'kmh_to_mph', 'mph_to_kmh',
          // Angular velocity
          'radps_to_degps', 'degps_to_radps', 'radps_to_rpm', 'rpm_to_radps',
          // Acceleration
          'mps2_to_fps2', 'fps2_to_mps2', 'mps2_to_g', 'g_to_mps2',
          // Mass
          'kg_to_lbm', 'lbm_to_kg', 'kg_to_slug', 'slug_to_kg',
          // Force
          'n_to_lbf', 'lbf_to_n',
          // Pressure
          'pa_to_psi', 'psi_to_pa', 'pa_to_atm', 'atm_to_pa', 'pa_to_inhg', 'inhg_to_pa', 'pa_to_mbar', 'mbar_to_pa',
          // Area
          'm2_to_ft2', 'ft2_to_m2', 'm2_to_in2', 'in2_to_m2', 'km2_to_mi2', 'mi2_to_km2', 'ha_to_acre', 'acre_to_ha',
          // Volume
          'm3_to_ft3', 'ft3_to_m3', 'l_to_gal', 'gal_to_l', 'm3_to_in3', 'in3_to_m3',
          // Energy
          'j_to_btu', 'btu_to_j', 'j_to_ftlbf', 'ftlbf_to_j',
          // Power
          'w_to_hp', 'hp_to_w', 'w_to_btuh', 'btuh_to_w',
          // Torque
          'nm_to_lbft', 'lbft_to_nm', 'nm_to_lbin', 'lbin_to_nm',
          // Density
          'kgm3_to_lbft3', 'lbft3_to_kgm3', 'kgm3_to_slugft3', 'slugft3_to_kgm3',
          // Flow rate
          'm3s_to_cfm', 'cfm_to_m3s', 'lpm_to_gpm', 'gpm_to_lpm'
        ]
      }
    },
    inputs: ['input'],
    outputs: ['output']
  },
  {
    type: 'body2quaternion_rates',
    displayName: 'Body→Quat Rates',
    category: 'Aerospace',
    description: 'Converts body angular rates (P, Q, R in rad/sec) to quaternion rates given the current orientation quaternion. Implements the quaternion kinematic equation: q̇ = ½ * Ω(ω) * q. Input q must be a 4x1 quaternion column vector (scalar-first: [q0, q1, q2, q3] where q0 is scalar). P, Q, R are roll, pitch, yaw rates in rad/sec. Output q_dot is a 4x1 quaternion rate vector.',
    parameters: {},
    inputs: ['q', 'P', 'Q', 'R'],
    outputs: ['q_dot']
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
