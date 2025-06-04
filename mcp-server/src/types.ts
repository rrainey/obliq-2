// mcp-server/src/types.ts

// Base types from the main application
export interface Position {
  x: number;
  y: number;
}

export interface BlockParameters {
  [key: string]: any;
}

export interface Block {
  id: string;
  type: string;
  name: string;
  position: Position;
  parameters?: BlockParameters;
}

export interface Wire {
  id: string;
  sourceBlockId: string;
  sourcePortIndex: number;
  targetBlockId: string;
  targetPortIndex: number;
}

export interface Sheet {
  id: string;
  name: string;
  blocks: Block[];
  connections: Wire[];
  extents: {
    width: number;
    height: number;
  };
}

export interface Model {
  id: string;
  user_id: string;
  name: string;
  latest_version: number;
  created_at: string;
  updated_at: string;
}

export interface ModelData {
  version: string;
  metadata: {
    created: string;
    description?: string;
  };
  sheets: Sheet[];
  globalSettings: {
    simulationTimeStep: number;
    simulationDuration: number;
  };
}

// MCP Tool Input/Output Types

// Model Management Tools
export interface CreateModelInput {
  name: string;
  description?: string;
}

export interface CreateModelOutput {
  success: boolean;
  modelId?: string;
  error?: string;
}

export interface GetModelInput {
  modelId: string;
  version?: number;
}

export interface GetModelOutput {
  success: boolean;
  model?: Model;
  data?: ModelData;
  error?: string;
}

export interface ListModelsInput {
  // No parameters needed for MVP
}

export interface ListModelsOutput {
  success: boolean;
  models?: Model[];
  error?: string;
}

export interface DeleteModelInput {
  modelId: string;
}

export interface DeleteModelOutput {
  success: boolean;
  error?: string;
}

// Model Construction Tools
export interface AddSheetInput {
  modelId: string;
  sheetName: string;
  width?: number;
  height?: number;
}

export interface AddSheetOutput {
  success: boolean;
  sheetId?: string;
  error?: string;
}

export interface AddBlockInput {
  modelId: string;
  sheetId: string;
  blockType: string;
  name?: string;
  position: Position;
  parameters?: BlockParameters;
}

export interface AddBlockOutput {
  success: boolean;
  blockId?: string;
  error?: string;
}

export interface UpdateBlockInput {
  modelId: string;
  sheetId: string;
  blockId: string;
  name?: string;
  position?: Position;
  parameters?: BlockParameters;
}

export interface UpdateBlockOutput {
  success: boolean;
  error?: string;
}

export interface DeleteBlockInput {
  modelId: string;
  sheetId: string;
  blockId: string;
}

export interface DeleteBlockOutput {
  success: boolean;
  error?: string;
}

export interface AddConnectionInput {
  modelId: string;
  sheetId: string;
  sourceBlockId: string;
  sourcePortIndex: number;
  targetBlockId: string;
  targetPortIndex: number;
}

export interface AddConnectionOutput {
  success: boolean;
  wireId?: string;
  error?: string;
}

export interface DeleteConnectionInput {
  modelId: string;
  sheetId: string;
  wireId: string;
}

export interface DeleteConnectionOutput {
  success: boolean;
  error?: string;
}

// Simulation Tools
export interface RunSimulationInput {
  modelId: string;
  version?: number;
  timeStep?: number;
  duration?: number;
}

export interface RunSimulationOutput {
  success: boolean;
  simulationDuration?: number;
  timePoints?: number;
  outputPorts?: Record<string, number | boolean | number[] | boolean[]>;
  signals?: Record<string, any>;
  error?: string;
}

export interface GetSimulationResultsInput {
  modelId: string;
  blockId?: string;
}

export interface GetSimulationResultsOutput {
  success: boolean;
  timePoints?: number[];
  signalData?: Record<string, (number | number[] | boolean | boolean[])[]>;
  error?: string;
}

// Validation Tools
export interface ValidateModelInput {
  modelId: string;
  version?: number;
}

export interface ValidateModelOutput {
  success: boolean;
  errors?: string[];
  warnings?: string[];
  blockCounts?: Record<string, number>;
  error?: string;
}

export interface ListSheetLabelsInput {
  modelId: string;
  sheetId?: string;
}

export interface ListSheetLabelsOutput {
  success: boolean;
  sinks?: Array<{
    blockId: string;
    blockName: string;
    signalName: string;
  }>;
  sources?: Array<{
    blockId: string;
    blockName: string;
    signalName: string;
  }>;
  error?: string;
}

export interface ValidateSheetLabelsInput {
  modelId: string;
}

export interface ValidateSheetLabelsOutput {
  success: boolean;
  errors?: string[];
  warnings?: string[];
  error?: string;
}

// Code Generation Tools
export interface GenerateCodeInput {
  modelId: string;
  version?: number;
}

export interface GenerateCodeOutput {
  success: boolean;
  filesGenerated?: string[];
  summary?: {
    headerFile: string;
    sourceFile: string;
    libraryConfig: string;
    blocksProcessed: number;
    wiresProcessed: number;
  };
  error?: string;
}

export interface GetGeneratedFilesInput {
  modelId: string;
  version?: number;
}

export interface GetGeneratedFilesOutput {
  success: boolean;
  files?: Array<{
    name: string;
    content: string;
  }>;
  error?: string;
}

// Generic MCP Tool Result
export interface MCPToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}