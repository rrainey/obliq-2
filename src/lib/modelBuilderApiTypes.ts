// lib/modelBuilderApiTypes.ts

import { BlockType } from './blockTypeRegistry';
import { ModelBuilderErrorCode } from './modelBuilderApiErrorCodes';

// Base response types
export interface ModelBuilderSuccessResponse<T = any> {
  success: true;
  timestamp: string;
  data: T;
}

export interface ModelBuilderErrorResponse {
  success: false;
  timestamp: string;
  error: string;
  code?: ModelBuilderErrorCode;
  details?: any;
}

export type ModelBuilderResponse<T = any> = ModelBuilderSuccessResponse<T> | ModelBuilderErrorResponse;

// Common types
export interface Position {
  x: number;
  y: number;
}

export interface BlockSummary {
  id: string;
  type: BlockType;
  name: string;
  position: Position;
  parameters: Record<string, any>;
  ports: {
    inputs: string[];
    outputs: string[];
  };
}

export interface ConnectionSummary {
  id: string;
  sourceBlockId: string;
  sourcePort: string;
  targetBlockId: string;
  targetPort: string;
}

export interface SheetSummary {
  id: string;
  name: string;
  blockCount: number;
  connectionCount: number;
  extents: {
    width: number;
    height: number;
  };
}

// GET Request types
export interface GetModelRequest {
  modelId: string;
}

export interface ListSheetsRequest {
  action: 'listSheets';
  modelId: string;
}

export interface ListBlocksRequest {
  action: 'listBlocks';
  modelId: string;
  sheetId: string;
}

export interface GetBlockRequest {
  action: 'getBlock';
  modelId: string;
  sheetId: string;
  blockId: string;
}

export interface ListConnectionsRequest {
  action: 'listConnections';
  modelId: string;
  sheetId: string;
}

export interface GetConnectionRequest {
  action: 'getConnection';
  modelId: string;
  sheetId: string;
  connectionId: string;
}

export interface GetBlockPortsRequest {
  action: 'getBlockPorts';
  modelId: string;
  sheetId: string;
  blockId: string;
}

// POST Request types
export interface CreateModelRequest {
  action: 'createModel';
  name: string;
  userId: string;
}

export interface CreateSheetRequest {
  action: 'createSheet';
  modelId: string;
  name?: string;
}

export interface AddBlockRequest {
  action: 'addBlock';
  modelId: string;
  sheetId: string;
  blockType: BlockType;
  name?: string;
  position?: Position;
  parameters?: Record<string, any>;
}

export interface AddConnectionRequest {
  action: 'addConnection';
  modelId: string;
  sheetId: string;
  sourceBlockId: string;
  sourcePort: string;
  targetBlockId: string;
  targetPort: string;
}

export interface ValidateModelRequest {
  action: 'validateModel';
  modelId: string;
}

export interface BatchOperationsRequest {
  action: 'batchOperations';
  transactional?: boolean;
  operations: Array<{
    id?: string;
    action: string;
    [key: string]: any;
  }>;
}

// PUT Request types
export interface RenameSheetRequest {
  action: 'renameSheet';
  modelId: string;
  sheetId: string;
  newName: string;
}

export interface UpdateBlockPositionRequest {
  action: 'updateBlockPosition';
  modelId: string;
  sheetId: string;
  blockId: string;
  position: Position;
}

export interface UpdateBlockNameRequest {
  action: 'updateBlockName';
  modelId: string;
  sheetId: string;
  blockId: string;
  name: string;
}

export interface UpdateBlockParametersRequest {
  action: 'updateBlockParameters';
  modelId: string;
  sheetId: string;
  blockId: string;
  parameters: Record<string, any>;
}

// DELETE Request types
export interface DeleteModelRequest {
  modelId: string;
}

export interface DeleteSheetRequest {
  action: 'deleteSheet';
  modelId: string;
  sheetId: string;
}

export interface DeleteBlockRequest {
  action: 'deleteBlock';
  modelId: string;
  sheetId: string;
  blockId: string;
}

export interface DeleteConnectionRequest {
  action: 'deleteConnection';
  modelId: string;
  sheetId: string;
  connectionId: string;
}

// Response data types
export interface GetModelResponse {
  id: string;
  name: string;
  user_id: string;
  data: any;
  created_at: string;
  updated_at: string;
}

export interface CreateModelResponse {
  id: string;
  name: string;
  user_id: string;
  latest_version: number;
  created_at: string;
  updated_at: string;
  initialData: any;
}

export interface ListSheetsResponse {
  modelId: string;
  sheetCount: number;
  sheets: SheetSummary[];
}

export interface CreateSheetResponse {
  modelId: string;
  newVersion: number;
  sheet: SheetSummary;
}

export interface ListBlocksResponse {
  modelId: string;
  sheetId: string;
  blockCount: number;
  blocks: BlockSummary[];
}

export interface GetBlockResponse {
  modelId: string;
  sheetId: string;
  block: BlockSummary & {
    metadata?: {
      created?: string;
      modified?: string;
      description?: string;
    };
  };
}

export interface AddBlockResponse {
  modelId: string;
  sheetId: string;
  newVersion: number;
  block: BlockSummary;
}

export interface ListConnectionsResponse {
  modelId: string;
  sheetId: string;
  connectionCount: number;
  connections: Array<ConnectionSummary & {
    sourceBlockName: string;
    targetBlockName: string;
  }>;
}

export interface GetConnectionResponse {
  modelId: string;
  sheetId: string;
  connection: {
    id: string;
    source: {
      blockId: string;
      blockName: string;
      blockType: string;
      port: string;
    };
    target: {
      blockId: string;
      blockName: string;
      blockType: string;
      port: string;
    };
  };
}

export interface AddConnectionResponse {
  modelId: string;
  sheetId: string;
  newVersion: number;
  connection: ConnectionSummary;
}

export interface GetBlockPortsResponse {
  modelId: string;
  sheetId: string;
  blockId: string;
  blockType: string;
  blockName: string;
  ports: {
    inputs: Array<{
      name: string;
      type: 'input';
      connected: boolean;
      connectedTo: {
        blockId: string;
        blockName: string;
        port: string;
        connectionId: string;
      } | null;
    }>;
    outputs: Array<{
      name: string;
      type: 'output';
      connected: boolean;
      connectionCount: number;
      connectedTo: Array<{
        blockId: string;
        blockName: string;
        port: string;
        connectionId: string;
      }>;
    }>;
    summary: {
      totalInputs: number;
      connectedInputs: number;
      totalOutputs: number;
      totalOutgoingConnections: number;
    };
  };
}

export interface ValidateModelResponse {
  modelId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    sheetCount: number;
    totalBlocks: number;
    totalConnections: number;
    errorCount: number;
    warningCount: number;
  };
}

export interface BatchOperationsResponse {
  batchId: string;
  totalOperations: number;
  successCount: number;
  failureCount: number;
  transactional?: boolean;
  rolledBack?: boolean;
  results: Array<{
    operationId: string;
    success: boolean;
    data?: any;
  }>;
  errors: Array<{
    operationId: string;
    error: string;
    code: string;
    details?: any;
  }>;
}

export interface UpdateBlockPositionResponse {
  modelId: string;
  sheetId: string;
  blockId: string;
  newVersion: number;
  position: Position;
}

export interface UpdateBlockNameResponse {
  modelId: string;
  sheetId: string;
  blockId: string;
  newVersion: number;
  name: string;
  previousName?: string;
}

export interface UpdateBlockParametersResponse {
  modelId: string;
  sheetId: string;
  blockId: string;
  blockType: string;
  newVersion: number;
  oldParameters: Record<string, any>;
  newParameters: Record<string, any>;
  ports: {
    inputs: string[];
    outputs: string[];
  };
}

export interface RenameSheetResponse {
  modelId: string;
  newVersion: number;
  sheet: {
    id: string;
    name: string;
    blockCount: number;
    connectionCount: number;
  };
}

export interface DeleteModelResponse {
  message: string;
  modelId: string;
}

export interface DeleteSheetResponse {
  modelId: string;
  newVersion: number;
  deletedSheet: {
    id: string;
    name: string;
    blockCount: number;
    connectionCount: number;
  };
  remainingSheets: number;
}

export interface DeleteBlockResponse {
  modelId: string;
  sheetId: string;
  newVersion: number;
  deletedBlock: {
    id: string;
    type: string;
    name: string;
  };
  removedConnectionCount: number;
  remainingBlockCount: number;
}

export interface DeleteConnectionResponse {
  modelId: string;
  sheetId: string;
  newVersion: number;
  deletedConnection: ConnectionSummary;
  remainingConnectionCount: number;
}