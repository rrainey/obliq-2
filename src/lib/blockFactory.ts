// lib/blockFactory.ts
// Unified block creation factory used by both UI and Model Builder API

import { BlockType, BlockTypes, blockTypeRegistry, generateDynamicPorts } from './blockTypeRegistry';

/**
 * Position for a block on the canvas
 */
export interface BlockPosition {
  x: number;
  y: number;
}

/**
 * Sheet extents (dimensions)
 */
export interface SheetExtents {
  width: number;
  height: number;
}

/**
 * A sheet structure (used for subsystem embedded sheets)
 */
export interface SheetData {
  id: string;
  name: string;
  blocks: BlockData[];
  connections: ConnectionData[];
  extents: SheetExtents;
}

/**
 * Connection/wire data
 */
export interface ConnectionData {
  id: string;
  sourceBlockId: string;
  sourcePortIndex: number;
  targetBlockId: string;
  targetPortIndex: number;
}

/**
 * Block data structure
 */
export interface BlockData {
  id: string;
  type: string;
  name: string;
  position: BlockPosition;
  parameters: Record<string, any>;
  inputs?: string[];
  outputs?: string[];
}

/**
 * Options for creating a block
 */
export interface CreateBlockOptions {
  id?: string;
  name?: string;
  position?: BlockPosition;
  parameters?: Record<string, any>;
  existingBlockCount?: number;  // Used for auto-generating names
  existingBlocksOfType?: number; // Count of blocks of same type for naming
}

/**
 * Result of creating a subsystem block
 */
export interface SubsystemCreationResult {
  block: BlockData;
  embeddedSheet: SheetData;
  inputPort: BlockData;
  outputPort: BlockData;
}

/**
 * Get the rich default parameters for a block type.
 * These are the complete defaults used by the UI, which include all
 * configuration options for each block type.
 *
 * @param blockType - The type of block
 * @returns Default parameters for the block type
 */
export function getDefaultBlockParameters(blockType: string): Record<string, any> {
  switch (blockType) {
    case BlockTypes.SOURCE:
      return {
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
      };

    case BlockTypes.INPUT_PORT:
      return {
        portName: 'Input',
        dataType: 'double',
        defaultValue: 0
      };

    case BlockTypes.OUTPUT_PORT:
      return {
        portName: 'Output'
      };

    case BlockTypes.SCALE:
      return { gain: 1 };

    case BlockTypes.LIMIT:
      return { lowerLimit: -1, upperLimit: 1 };

    case BlockTypes.INTEGRATOR:
      return {
        initialValue: 0,
        showEnableInput: false,
        showResetInput: false,
        useLimits: false,
        lowerLimit: -Infinity,
        upperLimit: Infinity
      };

    case BlockTypes.TRANSFER_FUNCTION:
      return {
        numerator: [1],
        denominator: [1, 1]
      };

    case BlockTypes.LOOKUP_1D:
      return {
        inputValues: [0, 1, 2],
        outputValues: [0, 1, 4],
        extrapolation: 'clamp'
      };

    case BlockTypes.LOOKUP_2D:
      return {
        input1Values: [0, 1],
        input2Values: [0, 1],
        outputTable: [[0, 1], [2, 3]],
        extrapolation: 'clamp'
      };

    case BlockTypes.MUX:
      return {
        rows: 2,
        cols: 2,
        outputType: 'double[2][2]',
        baseType: 'double'
      };

    case BlockTypes.DEMUX:
      return {
        outputCount: 1,
        inputDimensions: [1]
      };

    case BlockTypes.SIGNAL_DISPLAY:
    case BlockTypes.SIGNAL_LOGGER:
      return { maxSamples: 1000 };

    case BlockTypes.SUBSYSTEM:
      return {
        sheetId: '',
        sheetName: 'Subsystem',
        inputPorts: ['Input1'],
        outputPorts: ['Output1']
      };

    case BlockTypes.SHEET_LABEL_SINK:
      return {
        signalName: ''  // Empty string, user must specify
      };

    case BlockTypes.SHEET_LABEL_SOURCE:
      return {
        signalName: ''  // Will be populated from available sinks
      };

    case BlockTypes.SUM:
      return {
        signs: '++',
        numInputs: 2,
        inputs: ['Input1', 'Input2']  // Legacy support
      };

    case BlockTypes.MULTIPLY:
      return {
        numInputs: 2
      };

    case BlockTypes.TRIG:
      return {
        function: 'sin',
        inputPortName: 'Input1',
        outputPortName: 'Output1'
      };

    case BlockTypes.CONDITION:
      return {
        condition: '> 0'
      };

    case BlockTypes.EVALUATE:
      return {
        numInputs: 2,
        expression: 'in(0) + in(1)'
      };

    case BlockTypes.ORIENTATION_CONVERSION:
      return {
        conversionType: 'euler_to_dcm'
      };

    case BlockTypes.IF:
    case BlockTypes.ABS:
    case BlockTypes.UMINUS:
    case BlockTypes.MATRIX_MULTIPLY:
    case BlockTypes.TRANSPOSE:
    case BlockTypes.CROSS:
    case BlockTypes.DOT:
    case BlockTypes.MAG:
      return {};

    default:
      // Fall back to registry defaults if available
      const definition = blockTypeRegistry[blockType as BlockType];
      return definition ? { ...definition.defaultParameters } : {};
  }
}

/**
 * Generate a unique block ID
 *
 * @param blockType - The type of block
 * @returns A unique ID string
 */
export function generateBlockId(blockType: string): string {
  return `${blockType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a default block name based on type and existing blocks
 *
 * @param blockType - The type of block
 * @param existingCount - Number to append (typically count of existing blocks + 1)
 * @returns A formatted block name
 */
export function generateBlockName(blockType: string, existingCount: number): string {
  // Convert snake_case to Title Case and append number
  const formatted = blockType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return `${formatted}${existingCount}`;
}

/**
 * Create an input port block for use inside a subsystem
 *
 * @param sheetId - The ID of the sheet containing this port
 * @param portName - The name of the port
 * @param position - Position on the canvas
 * @returns A configured input port block
 */
export function createInputPortBlock(
  sheetId: string,
  portName: string,
  position: BlockPosition = { x: 100, y: 200 }
): BlockData {
  return {
    id: `${sheetId}_${portName.toLowerCase().replace(/\s+/g, '_')}`,
    type: BlockTypes.INPUT_PORT,
    name: portName,
    position,
    inputs: [],
    outputs: ['output'],
    parameters: {
      portName,
      dataType: 'double',
      defaultValue: 0
    }
  };
}

/**
 * Create an output port block for use inside a subsystem
 *
 * @param sheetId - The ID of the sheet containing this port
 * @param portName - The name of the port
 * @param position - Position on the canvas
 * @returns A configured output port block
 */
export function createOutputPortBlock(
  sheetId: string,
  portName: string,
  position: BlockPosition = { x: 400, y: 200 }
): BlockData {
  return {
    id: `${sheetId}_${portName.toLowerCase().replace(/\s+/g, '_')}`,
    type: BlockTypes.OUTPUT_PORT,
    name: portName,
    position,
    inputs: ['input'],
    outputs: [],
    parameters: {
      portName
    }
  };
}

/**
 * Create an embedded sheet for a subsystem with default input/output ports
 *
 * @param subsystemBlockId - The ID of the parent subsystem block
 * @param subsystemName - The name of the subsystem (used for sheet naming)
 * @param inputPortNames - Names of input ports to create (default: ['Input1'])
 * @param outputPortNames - Names of output ports to create (default: ['Output1'])
 * @returns The sheet data with embedded port blocks
 */
export function createSubsystemSheet(
  subsystemBlockId: string,
  subsystemName: string,
  inputPortNames: string[] = ['Input1'],
  outputPortNames: string[] = ['Output1']
): { sheet: SheetData; inputPorts: BlockData[]; outputPorts: BlockData[] } {
  const sheetId = `${subsystemBlockId}_main`;

  // Create input port blocks, spaced vertically
  const inputPorts: BlockData[] = inputPortNames.map((portName, index) =>
    createInputPortBlock(sheetId, portName, { x: 100, y: 150 + index * 100 })
  );

  // Create output port blocks, spaced vertically
  const outputPorts: BlockData[] = outputPortNames.map((portName, index) =>
    createOutputPortBlock(sheetId, portName, { x: 400, y: 150 + index * 100 })
  );

  const sheet: SheetData = {
    id: sheetId,
    name: `${subsystemName} Main`,
    blocks: [...inputPorts, ...outputPorts],
    connections: [],
    extents: {
      width: 1000,
      height: 800
    }
  };

  return { sheet, inputPorts, outputPorts };
}

/**
 * Create a new block instance with all defaults properly configured.
 * This is the main factory function that should be used by both UI and API.
 *
 * For subsystem blocks, this automatically creates the embedded sheet with
 * default input/output ports.
 *
 * @param blockType - The type of block to create
 * @param options - Optional configuration (id, name, position, parameters, etc.)
 * @returns The fully configured block data
 */
export function createBlock(
  blockType: string,
  options: CreateBlockOptions = {}
): BlockData {
  // Validate block type
  if (!blockTypeRegistry[blockType as BlockType]) {
    throw new Error(`Unknown block type: ${blockType}`);
  }

  // Generate ID if not provided
  const id = options.id || generateBlockId(blockType);

  // Generate name if not provided
  const existingCount = options.existingBlocksOfType ?? options.existingBlockCount ?? 1;
  const name = options.name || generateBlockName(blockType, existingCount);

  // Use provided position or default
  const position = options.position || { x: 100, y: 100 };

  // Get default parameters and merge with any provided overrides
  const defaultParams = getDefaultBlockParameters(blockType);
  const parameters = options.parameters
    ? { ...defaultParams, ...options.parameters }
    : defaultParams;

  // Get port definitions
  const ports = generateDynamicPorts(blockType as BlockType, parameters);

  // Create the base block
  const block: BlockData = {
    id,
    type: blockType,
    name,
    position,
    parameters,
    inputs: ports.inputs.map(p => p.name),
    outputs: ports.outputs.map(p => p.name)
  };

  // Special handling for subsystem blocks - create embedded sheet if not already provided
  if (blockType === BlockTypes.SUBSYSTEM) {
    const inputPortNames = parameters.inputPorts || ['Input1'];
    const outputPortNames = parameters.outputPorts || ['Output1'];

    // Only create a default sheet if one wasn't provided in parameters
    if (!parameters.sheets || parameters.sheets.length === 0) {
      const { sheet } = createSubsystemSheet(id, name, inputPortNames, outputPortNames);

      // Update parameters with embedded sheet
      block.parameters = {
        ...block.parameters,
        sheets: [sheet],
        inputPorts: inputPortNames,
        outputPorts: outputPortNames
      };
    }

    // Set the block's inputs/outputs to match the ports
    block.inputs = inputPortNames;
    block.outputs = outputPortNames;
  }

  return block;
}

/**
 * Create a subsystem block with full details returned.
 * Use this when you need access to the created sheet and port blocks.
 *
 * @param options - Optional configuration for the subsystem
 * @returns The block, embedded sheet, and port blocks
 */
export function createSubsystemBlock(
  options: CreateBlockOptions = {}
): SubsystemCreationResult {
  // Generate ID if not provided
  const id = options.id || generateBlockId(BlockTypes.SUBSYSTEM);

  // Generate name if not provided
  const existingCount = options.existingBlocksOfType ?? options.existingBlockCount ?? 1;
  const name = options.name || generateBlockName(BlockTypes.SUBSYSTEM, existingCount);

  // Use provided position or default
  const position = options.position || { x: 100, y: 100 };

  // Get default parameters and merge with any provided overrides
  const defaultParams = getDefaultBlockParameters(BlockTypes.SUBSYSTEM);
  const parameters = options.parameters
    ? { ...defaultParams, ...options.parameters }
    : defaultParams;

  const inputPortNames = parameters.inputPorts || ['Input1'];
  const outputPortNames = parameters.outputPorts || ['Output1'];

  // Create the embedded sheet with ports
  const { sheet, inputPorts, outputPorts } = createSubsystemSheet(
    id,
    name,
    inputPortNames,
    outputPortNames
  );

  // Create the subsystem block
  const block: BlockData = {
    id,
    type: BlockTypes.SUBSYSTEM,
    name,
    position,
    parameters: {
      ...parameters,
      sheets: [sheet],
      inputPorts: inputPortNames,
      outputPorts: outputPortNames
    },
    inputs: inputPortNames,
    outputs: outputPortNames
  };

  return {
    block,
    embeddedSheet: sheet,
    inputPort: inputPorts[0],
    outputPort: outputPorts[0]
  };
}

/**
 * Synchronize a subsystem block's inputPorts and outputPorts arrays
 * based on the input_port and output_port blocks within its sheets.
 *
 * This should be called whenever:
 * - An input_port or output_port block is added to a subsystem's sheet
 * - An input_port or output_port block is renamed (portName changed)
 * - An input_port or output_port block is deleted from a subsystem's sheet
 *
 * @param subsystemBlock - The subsystem block to synchronize
 */
export function syncSubsystemPortsFromSheets(subsystemBlock: BlockData): void {
  if (subsystemBlock.type !== BlockTypes.SUBSYSTEM || !subsystemBlock.parameters?.sheets) {
    return;
  }

  const inputPorts: string[] = [];
  const outputPorts: string[] = [];

  // Scan all sheets within the subsystem for input_port and output_port blocks
  for (const sheet of subsystemBlock.parameters.sheets) {
    if (!sheet.blocks) continue;

    for (const block of sheet.blocks) {
      if (block.type === BlockTypes.INPUT_PORT) {
        // Use portName from parameters if available, otherwise use block name
        const portName = block.parameters?.portName || block.name;
        if (portName && !inputPorts.includes(portName)) {
          inputPorts.push(portName);
        }
      } else if (block.type === BlockTypes.OUTPUT_PORT) {
        // Use portName from parameters if available, otherwise use block name
        const portName = block.parameters?.portName || block.name;
        if (portName && !outputPorts.includes(portName)) {
          outputPorts.push(portName);
        }
      }
    }
  }

  // Update the subsystem's port arrays in parameters
  subsystemBlock.parameters.inputPorts = inputPorts;
  subsystemBlock.parameters.outputPorts = outputPorts;

  // CRITICAL: Also update the block's inputs/outputs arrays
  // These are what the connection validation checks when wiring to/from a subsystem
  subsystemBlock.inputs = inputPorts;
  subsystemBlock.outputs = outputPorts;
}
