// lib/blockTypeRegistry.ts

export interface PortDefinition {
  name: string;
  type?: string; // Optional type hint for future use
}

export interface BlockTypeDefinition {
  type: string;
  displayName: string;
  category: string;
  defaultParameters: Record<string, any>;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  description: string;
}

export const BlockTypes = {
  // Source blocks
  SOURCE: 'source',
  CLOCK: 'clock',
  INPUT_PORT: 'input_port',
  
  // Math blocks
  SUM: 'sum',
  MULTIPLY: 'multiply',
  DIVIDE: 'divide',
  SCALE: 'scale',
  ABS: 'abs',
  SQUARE: 'square',
  UMINUS: 'uminus',
  SIGN: 'sign',
  EVALUATE: 'evaluate',
  
  // Dynamic blocks
  TRANSFER_FUNCTION: 'transfer_function',
  DISCRETE_TRANSFORM: 'discrete_transform',
  UNIT_DELAY: 'unit_delay',
  
  // Lookup blocks
  LOOKUP_1D: 'lookup_1d',
  LOOKUP_2D: 'lookup_2d',
  
  // Output blocks
  OUTPUT_PORT: 'output_port',
  SIGNAL_DISPLAY: 'signal_display',
  SIGNAL_LOGGER: 'signal_logger',
  NO_CONNECTION: 'no_connection',

  // Sheet labels
  SHEET_LABEL_SINK: 'sheet_label_sink',
  SHEET_LABEL_SOURCE: 'sheet_label_source',

  MATRIX_MULTIPLY: 'matrix_multiply',
  TRANSPOSE: 'transpose',
  MUX: 'mux',
  DEMUX: 'demux',
  
  // Subsystem
  SUBSYSTEM: 'subsystem',

  TRIG:  'trig',
  CROSS: 'cross',
  MAG:   'mag',
  DOT:   'dot', 

  // Control blocks
  IF: 'if',
  CONDITION: 'condition',

  // Limit / discontinuities
  LIMIT: 'limit',
  RELAY: 'relay',
  RATE_LIMITER: 'rate_limiter',
  QUANTIZER: 'quantizer',
  SELECTOR: 'selector',
  DATA_STORE_WRITE: 'data_store_write',
  DATA_STORE_READ: 'data_store_read',

  // Integrator block
  INTEGRATOR: 'integrator',

  // Unit delay (also registered under Dynamic)
  // UNIT_DELAY defined above with Dynamic blocks

  // Aerospace blocks
  ORIENTATION_CONVERSION: 'orientation_conversion',
  UNITS_CONVERSION: 'units_conversion',
  BODY2QUATERNION_RATES: 'body2quaternion_rates',
  ATMOSPHERE: 'atmosphere',

  // Discrete events
  EDGE_DETECT: 'edge_detect',

  // Annotation blocks
  COMMENT: 'comment',

} as const;

export type BlockType = typeof BlockTypes[keyof typeof BlockTypes];

export const blockTypeRegistry: Record<BlockType, BlockTypeDefinition> = {
  [BlockTypes.SOURCE]: {
    type: BlockTypes.SOURCE,
    displayName: 'Source',
    category: 'Sources',
    defaultParameters: {
      signalType: 'constant',
      value: 1,
      stepTime: 1.0,
      stepValue: 1.0,
      slope: 1.0,
      startTime: 0,
      frequency: 1.0,
      amplitude: 1.0,
      phase: 0,
      offset: 0,
      f0: 0.1,
      f1: 10,
      duration: 10,
      mean: 0,
      dataType: 'double'
    },
    inputs: [],
    outputs: [{ name: 'output' }],
    description: 'Provides a constant or signal generator output'
  },

  [BlockTypes.CLOCK]: {
    type: BlockTypes.CLOCK,
    displayName: 'Clock',
    category: 'Sources',
    defaultParameters: {},
    inputs: [],
    outputs: [{ name: 'output' }],
    description: 'Outputs the current simulation time in seconds as a double scalar'
  },

  [BlockTypes.INPUT_PORT]: {
    type: BlockTypes.INPUT_PORT,
    displayName: 'Input Port',
    category: 'Ports',
    defaultParameters: {
      portName: 'Input',
      dataType: 'double',
      defaultValue: 0
    },
    inputs: [],
    outputs: [{ name: 'output' }],
    description: 'External input to a model or subsystem'
  },
  
  [BlockTypes.SUM]: {
  type: BlockTypes.SUM,
  displayName: 'Sum',
  category: 'Math',
  defaultParameters: {
    numInputs: 2,
    signs: '++' 
  },
  inputs: [
    { name: 'input1' },
    { name: 'input2' }
  ],
  outputs: [{ name: 'output' }],
  description: 'Sums multiple input signals with configurable signs'
},
  
  [BlockTypes.MULTIPLY]: {
    type: BlockTypes.MULTIPLY,
    displayName: 'Multiply',
    category: 'Math',
    defaultParameters: {
      numInputs: 2
    },
    inputs: [
      { name: 'input1' },
      { name: 'input2' }
    ],
    outputs: [{ name: 'output' }],
    description: 'Multiplies multiple input signals'
  },

  [BlockTypes.DIVIDE]: {
    type: BlockTypes.DIVIDE,
    displayName: 'Divide',
    category: 'Math',
    defaultParameters: {},
    inputs: [
      { name: 'num' },
      { name: 'den' }
    ],
    outputs: [{ name: 'out' }],
    description: 'Element-wise division (num/den). Denominator may be scalar broadcast onto vector/matrix numerator.'
  },
  
  [BlockTypes.SCALE]: {
    type: BlockTypes.SCALE,
    displayName: 'Scale',
    category: 'Math',
    defaultParameters: {
      gain: 1
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Multiplies input by a scalar constant'
  },

  [BlockTypes.EVALUATE]: {
    type: BlockTypes.EVALUATE,
    displayName: 'Evaluate',
    category: 'Math',
    defaultParameters: {
      numInputs: 2,
      expression: 'in(0) + in(1)'
    },
    inputs: [
      { name: 'in0' },
      { name: 'in1' }
    ],
    outputs: [{ name: 'output' }],
    description: 'Evaluate custom C-style expression'
  },
  
  [BlockTypes.TRANSFER_FUNCTION]: {
    type: BlockTypes.TRANSFER_FUNCTION,
    displayName: 'Transfer Function',
    category: 'Dynamic',
    defaultParameters: {
      numerator: [1],
      denominator: [1, 1]
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Laplace transfer function with RK4 integration'
  },

  [BlockTypes.DISCRETE_TRANSFORM]: {
    type: BlockTypes.DISCRETE_TRANSFORM,
    displayName: 'Discrete Transform',
    category: 'Dynamic',
    defaultParameters: {
      numerator: [1],
      denominator: [1, -0.5],
      sampleInterval: 0.01
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Discrete-time transfer function (z-transform) with sample interval'
  },
  
  [BlockTypes.LOOKUP_1D]: {
    type: BlockTypes.LOOKUP_1D,
    displayName: '1-D Lookup',
    category: 'Lookup',
    defaultParameters: {
      inputValues: [0, 1, 2],
      outputValues: [0, 1, 4],
      extrapolation: 'clamp' // 'clamp' or 'extrapolate'
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: '1-D lookup table with linear interpolation'
  },
  
  [BlockTypes.LOOKUP_2D]: {
    type: BlockTypes.LOOKUP_2D,
    displayName: '2-D Lookup',
    category: 'Lookup',
    defaultParameters: {
      input1Values: [0, 1, 2],
      input2Values: [0, 1, 2],
      outputTable: [
        [0, 0, 0],
        [0, 1, 2],
        [0, 2, 4]
      ],
      extrapolation: 'clamp' // 'clamp' or 'extrapolate'
    },
    inputs: [
      { name: 'input1' },
      { name: 'input2' }
    ],
    outputs: [{ name: 'output' }],
    description: '2-D lookup table with bilinear interpolation'
  },
  
  [BlockTypes.OUTPUT_PORT]: {
    type: BlockTypes.OUTPUT_PORT,
    displayName: 'Output Port',
    category: 'Ports',
    defaultParameters: {
      portName: 'Output'
    },
    inputs: [{ name: 'input' }],
    outputs: [],
    description: 'External output from a model or subsystem'
  },
  
  [BlockTypes.SIGNAL_DISPLAY]: {
    type: BlockTypes.SIGNAL_DISPLAY,
    displayName: 'Signal Display',
    category: 'Sinks',
    defaultParameters: {
      maxSamples: 1000
    },
    inputs: [{ name: 'input' }],
    outputs: [],
    description: 'Displays signal values during simulation'
  },
  
  [BlockTypes.SIGNAL_LOGGER]: {
    type: BlockTypes.SIGNAL_LOGGER,
    displayName: 'Signal Logger',
    category: 'Sinks',
    defaultParameters: {
      maxSamples: 1000
    },
    inputs: [{ name: 'input' }],
    outputs: [],
    description: 'Logs signal values for export'
  },

  [BlockTypes.NO_CONNECTION]: {
    type: BlockTypes.NO_CONNECTION,
    displayName: 'No Connection',
    category: 'Sinks',
    defaultParameters: {},
    inputs: [{ name: 'input' }],
    outputs: [],
    description: 'Marks a signal as intentionally unused. When connected, prevents other connections from the same output.'
  },

  [BlockTypes.SHEET_LABEL_SINK]: {
    type: BlockTypes.SHEET_LABEL_SINK,
    displayName: 'Sheet Label Sink',
    category: 'Sheet Labels',
    defaultParameters: {
      signalName: ''
    },
    inputs: [{ name: 'input' }],
    outputs: [],
    description: 'Receives a signal and makes it available to sheet label sources'
  },
  
  [BlockTypes.SHEET_LABEL_SOURCE]: {
    type: BlockTypes.SHEET_LABEL_SOURCE,
    displayName: 'Sheet Label Source',
    category: 'Sheet Labels',
    defaultParameters: {
      signalName: ''
    },
    inputs: [],
    outputs: [{ name: 'output' }],
    description: 'Outputs a signal from a corresponding sheet label sink'
  },

  [BlockTypes.MATRIX_MULTIPLY]: {
    type: BlockTypes.MATRIX_MULTIPLY,
    displayName: 'Matrix Multiply',
    category: 'Matrix',
    defaultParameters: {},
    inputs: [
      { name: 'input1' },
      { name: 'input2' }
    ],
    outputs: [{ name: 'output' }],
    description: 'Performs matrix multiplication (A×B) or scalar multiplication'
  },

  [BlockTypes.TRANSPOSE]: {
    type: BlockTypes.TRANSPOSE,
    displayName: 'Transpose',
    category: 'Matrix',
    defaultParameters: {},
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Matrix transpose. Vectors [n] become [n][1] matrices. Matrices [m][n] become [n][m].'
  },

  [BlockTypes.MUX]: {
    type: BlockTypes.MUX,
    displayName: 'Mux',
    category: 'Matrix',
    defaultParameters: {
      outputShape: 'matrix',  // 'vector' | 'matrix'
      rows: 2,
      cols: 2,
      outputType: 'double[2][2]',
      baseType: 'double'
    },
    inputs: [
      { name: 'input1' },
      { name: 'input2' },
      { name: 'input3' },
      { name: 'input4' }
    ], // Dynamic based on rows*cols (for matrix) or cols (for vector where rows=1)
    outputs: [{ name: 'output' }],
    description: 'Multiplexer: combines scalar inputs into a vector or matrix. For vector output, specify outputShape="vector" with rows=1 and cols=size.'
  },

  [BlockTypes.DEMUX]: {
    type: BlockTypes.DEMUX,
    displayName: 'Demux',
    category: 'Matrix',
    defaultParameters: {
      outputCount: 1,
      inputDimensions: [1]
    },
    inputs: [{ name: 'input' }],
    outputs: [
      { name: 'output1' }
    ], // Dynamic based on input dimensions
    description: 'Demultiplexer: splits a matrix into scalar outputs'
  },
  
  [BlockTypes.SUBSYSTEM]: {
    type: BlockTypes.SUBSYSTEM,
    displayName: 'Subsystem',
    category: 'Hierarchical',
    defaultParameters: {
      sheetId: '',
      sheetName: 'Subsystem',
      inputPorts: ['Input1'],
      outputPorts: ['Output1'],
      showEnableInput: false,
      showPortNames: false,
      codeGenStrategy: 'flatten',  // 'flatten' | 'segregated' | 'segregated_atomic'
      parameters: []               // Subsystem-scoped parameters (only for segregated strategies)
    },
    inputs: [], // Dynamic based on subsystem content
    outputs: [], // Dynamic based on subsystem content
    description: 'Encapsulates another sheet as a reusable block'
  },

  [BlockTypes.TRIG]: {
    type: BlockTypes.TRIG,
    displayName: 'Trig',
    category: 'Math',
    defaultParameters: {
      function: 'sin',
      inputPortName: 'Input1',
      outputPortName: 'Output1'
    },
    inputs: [
      { name: 'input1' },
    ],
    outputs: [{ name: 'output' }],
    description: 'Configurable trigonometry function'
  },

  [BlockTypes.CROSS]: {
    type: BlockTypes.CROSS,
    displayName: 'Cross Product',
    category: 'Vector',
    defaultParameters: {
    },
    inputs: [
      { name: 'A' },
      { name: 'B' },
    ],
    outputs: [{ name: 'C' }],
    description: 'Vector Cross product'
  },

  [BlockTypes.DOT]: {
    type: BlockTypes.DOT,
    displayName: 'Dot Product',
    category: 'Vector',
    defaultParameters: {
    },
    inputs: [
      { name: 'A' },
      { name: 'B' },
    ],
    outputs: [{ name: 'C' }],
    description: 'Vector Dot product'
  },

  [BlockTypes.MAG]: {
    type: BlockTypes.MAG,
    displayName: 'Magnitude',
    category: 'Vector',
    defaultParameters: {
    },
    inputs: [
      { name: 'input1' },
    ],
    outputs: [{ name: 'output1' }],
    description: 'Vector Magnitude'
  },
  [BlockTypes.IF]: {
    type: BlockTypes.IF,
    displayName: 'If',
    category: 'Control',
    defaultParameters: {},
    inputs: [
      { name: 'input1' },
      { name: 'control' },
      { name: 'input2' }
    ],
    outputs: [{ name: 'output' }],
    description: 'Conditional selection: if control is true/nonzero, output = input2, else output = input1'
  },

  [BlockTypes.CONDITION]: {
    type: BlockTypes.CONDITION,
    displayName: 'Condition',
    category: 'Control',
    defaultParameters: {
      condition: '> 0'
    },
    inputs: [{ name: 'x1' }],
    outputs: [{ name: 'out' }],
    description: 'Compares input signal against a constant value'
  },

  [BlockTypes.ABS]: {
    type: BlockTypes.ABS,
    displayName: 'Absolute Value',
    category: 'Math',
    defaultParameters: {},
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Absolute value of scalar input'
  },

  [BlockTypes.SQUARE]: {
    type: BlockTypes.SQUARE,
    displayName: 'Square (x²)',
    category: 'Math',
    defaultParameters: {},
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Element-wise square: y = u² (scalar, vector, or matrix)'
  },

  [BlockTypes.UMINUS]: {
    type: BlockTypes.UMINUS,
    displayName: 'Unary Minus',
    category: 'Math',
    defaultParameters: {},
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Negates input (element-wise for vectors/matrices)'
  },

  [BlockTypes.SIGN]: {
    type: BlockTypes.SIGN,
    displayName: 'Sign',
    category: 'Math',
    defaultParameters: {},
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Signum function: −1, 0, or +1 (element-wise for vectors/matrices)'
  },

  [BlockTypes.LIMIT]: {
    type: BlockTypes.LIMIT,
    displayName: 'Limit',
    category: 'Math',
    defaultParameters: {
      lowerLimit: -1,
      upperLimit: 1
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Limits (clamps) signal values to specified range'
  },

  [BlockTypes.RELAY]: {
    type: BlockTypes.RELAY,
    displayName: 'Relay',
    category: 'Discontinuities',
    defaultParameters: {
      onThreshold: 0,
      offThreshold: 0,
      onOutput: 1,
      offOutput: 0,
      initialOn: false
    },
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Hysteresis switch: on when u ≥ onThreshold, off when u ≤ offThreshold'
  },

  [BlockTypes.RATE_LIMITER]: {
    type: BlockTypes.RATE_LIMITER,
    displayName: 'Rate Limiter',
    category: 'Discontinuities',
    defaultParameters: {
      risingSlewLimit: 1,
      fallingSlewLimit: -1,
      initialOutput: 0
    },
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Limits rate of change of the output (units/sec) using simulation dt'
  },

  [BlockTypes.QUANTIZER]: {
    type: BlockTypes.QUANTIZER,
    displayName: 'Quantizer',
    category: 'Discontinuities',
    defaultParameters: {
      quantum: 1
    },
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Rounds input to nearest multiple of quantum (element-wise)'
  },

  [BlockTypes.SELECTOR]: {
    type: BlockTypes.SELECTOR,
    displayName: 'Selector',
    category: 'Matrix',
    defaultParameters: {
      indices: [0]
    },
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Select vector elements by 0-based indices (scalar if one index)'
  },

  [BlockTypes.DATA_STORE_WRITE]: {
    type: BlockTypes.DATA_STORE_WRITE,
    displayName: 'Data Store Write',
    category: 'Data',
    defaultParameters: {
      storeName: 'store',
      dataType: 'double',
      initialValue: '0'
    },
    inputs: [{ name: 'in' }],
    outputs: [],
    description: 'Write signal to model-scoped named data store (shared across sheets/subsystems)'
  },

  [BlockTypes.DATA_STORE_READ]: {
    type: BlockTypes.DATA_STORE_READ,
    displayName: 'Data Store Read',
    category: 'Data',
    defaultParameters: {
      storeName: 'store',
      dataType: 'double'
    },
    inputs: [],
    outputs: [{ name: 'out' }],
    description: 'Read model-scoped named data store'
  },

  [BlockTypes.INTEGRATOR]: {
    type: BlockTypes.INTEGRATOR,
    displayName: 'Integrator',
    category: 'Dynamic',
    defaultParameters: {
      initialValue: 0,
      showInitPort: false,
      showEnableInput: false,
      showResetInput: false,
      useLimits: false,
      upperLimit: Infinity,
      lowerLimit: -Infinity
    },
    inputs: [{ name: 'Derivative' }],
    outputs: [{ name: 'output' }],
    description: 'Integrator block (equivalent to 1/s transfer function). Optional x(0) left-side data port for external IC; enable (top) and reset (bottom) control ports.'
  },

  [BlockTypes.UNIT_DELAY]: {
    type: BlockTypes.UNIT_DELAY,
    displayName: 'Unit Delay',
    category: 'Dynamic',
    defaultParameters: {
      initialValue: 0,
      sampleInterval: 0
    },
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'out' }],
    description: 'Unit delay (z⁻¹): output is the previous sample of the input. sampleInterval 0 = every step.'
  },

  [BlockTypes.ORIENTATION_CONVERSION]: {
    type: BlockTypes.ORIENTATION_CONVERSION,
    displayName: 'Orientation Conversion',
    category: 'Aerospace',
    defaultParameters: {
      conversionType: 'euler_to_dcm'
    },
    inputs: [
      { name: 'Phi_rad' },
      { name: 'Theta_rad' },
      { name: 'Psi_rad' }
    ],
    outputs: [{ name: 'DCM' }],
    description: 'Converts between Euler angles, DCM, and Quaternion representations (AIAA/ANSI aerospace convention)'
  },

  [BlockTypes.UNITS_CONVERSION]: {
    type: BlockTypes.UNITS_CONVERSION,
    displayName: 'Units Conversion',
    category: 'Aerospace',
    defaultParameters: {
      conversionType: 'deg_to_rad',
      category: 'angle'
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Converts between SI and American/Imperial engineering units'
  },

  [BlockTypes.EDGE_DETECT]: {
    type: BlockTypes.EDGE_DETECT,
    displayName: 'Edge Detect',
    category: 'Discontinuities',
    defaultParameters: {
      edge: 'rising',
      threshold: 0.5
    },
    inputs: [{ name: 'in' }],
    outputs: [{ name: 'pulse' }],
    description: 'One-step pulse on rising/falling/either edge (for engine start timers)'
  },

  [BlockTypes.ATMOSPHERE]: {
    type: BlockTypes.ATMOSPHERE,
    displayName: 'Atmosphere',
    category: 'Aerospace',
    defaultParameters: {
      model: 'coesa1976',
      extrapolation: 'clamp'
    },
    inputs: [{ name: 'altitude_m' }],
    outputs: [
      { name: 'temperature_K' },
      { name: 'pressure_Pa' },
      { name: 'density_kgpm3' },
      { name: 'speed_of_sound_mps' }
    ],
    description: '1976 COESA atmosphere: T, a, P, ρ vs geometric altitude (m) — Simulink port order'
  },

  [BlockTypes.BODY2QUATERNION_RATES]: {
    type: BlockTypes.BODY2QUATERNION_RATES,
    displayName: 'Body2Quat Rates',
    category: 'Aerospace',
    defaultParameters: {},
    inputs: [
      { name: 'q' },
      { name: 'P' },
      { name: 'Q' },
      { name: 'R' }
    ],
    outputs: [{ name: 'q_dot' }],
    description: 'Converts body angular rates (P, Q, R in rad/sec) to quaternion rates given current orientation quaternion'
  },

  [BlockTypes.COMMENT]: {
    type: BlockTypes.COMMENT,
    displayName: 'Comment',
    category: 'Annotation',
    defaultParameters: {
      text: '# Comment\n\nAdd your notes here...',
      width: 200,
      height: 100,
      autoHeight: true,           // When true, height auto-expands to fit text
      backgroundColor: '#fffde7',  // Use 'canvas' for transparent background
      borderColor: '#ffd54f'       // Use 'none' for no border
    },
    inputs: [],
    outputs: [],
    description: 'Text annotation block with Markdown support (including LaTeX math). Use backgroundColor: "canvas" for transparent, borderColor: "none" for no border.'
  },

};

/**
 * Get block type definition
 */
export function getBlockType(type: BlockType): BlockTypeDefinition | undefined {
  return blockTypeRegistry[type];
}

/**
 * Validate if a block type exists
 */
export function isValidBlockType(type: string): type is BlockType {
  return type in blockTypeRegistry;
}

/**
 * Get all block types in a category
 */
export function getBlockTypesByCategory(category: string): BlockTypeDefinition[] {
  return Object.values(blockTypeRegistry).filter(block => block.category === category);
}

/**
 * Get all categories
 */
export function getCategories(): string[] {
  const categories = new Set(Object.values(blockTypeRegistry).map(block => block.category));
  return Array.from(categories).sort();
}

/**
 * Generate dynamic ports for Sum and Multiply blocks based on numInputs
 */
export function generateDynamicPorts(type: BlockType, parameters: any): {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
} {
  const baseDefinition = blockTypeRegistry[type];
  
  if (type === BlockTypes.SUM || type === BlockTypes.MULTIPLY) {
  const numInputs = type === BlockTypes.SUM && parameters.signs 
    ? parameters.signs.length 
    : (parameters.numInputs || 2)
  const inputs: PortDefinition[] = []
  
  for (let i = 1; i <= numInputs; i++) {
    inputs.push({ name: `input${i}` })
  }
  
  return {
    inputs,
    outputs: baseDefinition.outputs
  }
}
  
  // Add Mux dynamic port generation
  if (type === BlockTypes.MUX) {
    const rows = parameters.rows || 2;
    const cols = parameters.cols || 2;
    const totalInputs = rows * cols;
    const inputs: PortDefinition[] = [];
    
    for (let i = 1; i <= totalInputs; i++) {
      inputs.push({ name: `input${i}` });
    }
    
    return {
      inputs,
      outputs: baseDefinition.outputs
    };
  }
  
  // Add Demux dynamic port generation
  if (type === BlockTypes.DEMUX) {
    const outputCount = parameters.outputCount || 4;
    const outputs: PortDefinition[] = [];
    
    for (let i = 1; i <= outputCount; i++) {
      outputs.push({ name: `output${i}` });
    }
    
    return {
      inputs: baseDefinition.inputs,
      outputs
    };
  }

  if (type === BlockTypes.EVALUATE) {
    const numInputs = parameters.numInputs || 2
    const inputs: PortDefinition[] = []
    
    for (let i = 0; i < numInputs; i++) {
      inputs.push({ name: `in${i}` })
    }
    
    return {
      inputs,
      outputs: baseDefinition.outputs
    }
  }
  
  // For other blocks, return the default ports
  return {
    inputs: baseDefinition.inputs,
    outputs: baseDefinition.outputs
  };
}

/**
 * Create a new block instance with default values
 */
export function createBlockInstance(
  type: BlockType,
  id: string,
  name: string,
  position: { x: number; y: number }
): any {
  const definition = blockTypeRegistry[type];
  if (!definition) {
    throw new Error(`Unknown block type: ${type}`);
  }
  
  const ports = generateDynamicPorts(type, definition.defaultParameters);
  
  return {
    id,
    type,
    name,
    position,
    parameters: { ...definition.defaultParameters },
    inputs: ports.inputs.map(p => p.name),
    outputs: ports.outputs.map(p => p.name)
  };
}