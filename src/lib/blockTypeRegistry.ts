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
  INPUT_PORT: 'input_port',
  
  // Math blocks
  SUM: 'sum',
  MULTIPLY: 'multiply',
  SCALE: 'scale',
  
  // Dynamic blocks
  TRANSFER_FUNCTION: 'transfer_function',
  
  // Lookup blocks
  LOOKUP_1D: 'lookup_1d',
  LOOKUP_2D: 'lookup_2d',
  
  // Output blocks
  OUTPUT_PORT: 'output_port',
  SIGNAL_DISPLAY: 'signal_display',
  SIGNAL_LOGGER: 'signal_logger',
  
  // Sheet labels
  SHEET_LABEL_SINK: 'sheet_label_sink',
  SHEET_LABEL_SOURCE: 'sheet_label_source',
  
  // Subsystem
  SUBSYSTEM: 'subsystem'
} as const;

export type BlockType = typeof BlockTypes[keyof typeof BlockTypes];

export const blockTypeRegistry: Record<BlockType, BlockTypeDefinition> = {
  [BlockTypes.SOURCE]: {
    type: BlockTypes.SOURCE,
    displayName: 'Source',
    category: 'Sources',
    defaultParameters: {
      value: '0.0',
      dataType: 'double'
    },
    inputs: [],
    outputs: [{ name: 'output' }],
    description: 'Provides a constant or signal generator output'
  },
  
  [BlockTypes.INPUT_PORT]: {
    type: BlockTypes.INPUT_PORT,
    displayName: 'Input Port',
    category: 'Ports',
    defaultParameters: {
      signalName: 'input',
      dataType: 'double'
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
      numInputs: 2
    },
    inputs: [
      { name: 'input1' },
      { name: 'input2' }
    ],
    outputs: [{ name: 'output' }],
    description: 'Sums multiple input signals'
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
  
  [BlockTypes.SCALE]: {
    type: BlockTypes.SCALE,
    displayName: 'Scale',
    category: 'Math',
    defaultParameters: {
      factor: 1.0
    },
    inputs: [{ name: 'input' }],
    outputs: [{ name: 'output' }],
    description: 'Multiplies input by a scalar constant'
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
      signalName: 'output'
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
    defaultParameters: {},
    inputs: [{ name: 'input' }],
    outputs: [],
    description: 'Logs signal values for export'
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
  
  [BlockTypes.SUBSYSTEM]: {
    type: BlockTypes.SUBSYSTEM,
    displayName: 'Subsystem',
    category: 'Hierarchical',
    defaultParameters: {
      linkedSheetId: null
    },
    inputs: [], // Dynamic based on subsystem content
    outputs: [], // Dynamic based on subsystem content
    description: 'Encapsulates another sheet as a reusable block'
  }
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
    const numInputs = parameters.numInputs || 2;
    const inputs: PortDefinition[] = [];
    
    for (let i = 1; i <= numInputs; i++) {
      inputs.push({ name: `input${i}` });
    }
    
    return {
      inputs,
      outputs: baseDefinition.outputs
    };
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