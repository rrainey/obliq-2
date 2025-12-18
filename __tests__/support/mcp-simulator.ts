// __tests__/support/mcp-simulator.ts
// MCP tool call simulator for integration tests

import { TestApiClient, ApiResponse } from './api-client';

/**
 * Block specification for building models
 */
export interface BlockSpec {
  type: string;
  name?: string;
  position?: { x: number; y: number };
  parameters?: Record<string, any>;
  params?: Record<string, any>; // Alias for parameters
}

/**
 * Connection specification for building models
 */
export interface ConnectionSpec {
  sourceBlock: string; // Block name or ID
  targetBlock: string; // Block name or ID
  sourcePort?: string | number;
  targetPort?: string | number;
}

/**
 * MCP tool names as they appear in the MCP server
 */
export const McpTools = {
  // Model tools
  CREATE_MODEL: 'obliq_create_model',
  GET_MODEL: 'obliq_get_model',
  LIST_MODELS: 'obliq_list_models',
  DELETE_MODEL: 'obliq_delete_model',
  VALIDATE_MODEL: 'obliq_validate_model',

  // Sheet tools
  LIST_SHEETS: 'obliq_list_sheets',
  CREATE_SHEET: 'obliq_create_sheet',
  RENAME_SHEET: 'obliq_rename_sheet',
  CLONE_SHEET: 'obliq_clone_sheet',
  DELETE_SHEET: 'obliq_delete_sheet',
  EXPORT_SHEET: 'obliq_export_sheet',
  IMPORT_SHEET: 'obliq_import_sheet',

  // Block tools
  ADD_BLOCK: 'obliq_add_block',
  LIST_BLOCKS: 'obliq_list_blocks',
  GET_BLOCK: 'obliq_get_block',
  UPDATE_BLOCK: 'obliq_update_block',
  UPDATE_BLOCK_PARAMETERS: 'obliq_update_block_parameters',
  UPDATE_BLOCK_NAME: 'obliq_update_block_name',
  UPDATE_BLOCK_POSITION: 'obliq_update_block_position',
  DELETE_BLOCK: 'obliq_delete_block',

  // Connection tools
  CONNECT_BLOCKS: 'obliq_connect_blocks',
  ADD_CONNECTION: 'obliq_add_connection',
  LIST_CONNECTIONS: 'obliq_list_connections',
  DELETE_CONNECTION: 'obliq_delete_connection',

  // Parameter tools
  SET_PARAMETER: 'obliq_set_parameter',
  LIST_PARAMETERS: 'obliq_list_parameters',

  // Block types
  LIST_BLOCK_TYPES: 'obliq_list_block_types'
} as const;

/**
 * Mapping from MCP tool names to API actions
 */
const toolToActionMap: Record<string, { action: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE' }> = {
  // Model tools
  [McpTools.CREATE_MODEL]: { action: 'createModel', method: 'POST' },
  [McpTools.GET_MODEL]: { action: 'getModel', method: 'GET' },
  [McpTools.DELETE_MODEL]: { action: 'deleteModel', method: 'DELETE' },
  [McpTools.VALIDATE_MODEL]: { action: 'validateModel', method: 'POST' },

  // Sheet tools
  [McpTools.LIST_SHEETS]: { action: 'listSheets', method: 'GET' },
  [McpTools.CREATE_SHEET]: { action: 'createSheet', method: 'POST' },
  [McpTools.RENAME_SHEET]: { action: 'renameSheet', method: 'PUT' },
  [McpTools.CLONE_SHEET]: { action: 'cloneSheet', method: 'POST' },
  [McpTools.DELETE_SHEET]: { action: 'deleteSheet', method: 'DELETE' },
  [McpTools.EXPORT_SHEET]: { action: 'exportSheet', method: 'GET' },
  [McpTools.IMPORT_SHEET]: { action: 'importSheet', method: 'POST' },

  // Block tools
  [McpTools.ADD_BLOCK]: { action: 'addBlock', method: 'POST' },
  [McpTools.LIST_BLOCKS]: { action: 'listBlocks', method: 'GET' },
  [McpTools.GET_BLOCK]: { action: 'getBlock', method: 'GET' },
  [McpTools.UPDATE_BLOCK]: { action: 'updateBlockParameters', method: 'PUT' },
  [McpTools.UPDATE_BLOCK_PARAMETERS]: { action: 'updateBlockParameters', method: 'PUT' },
  [McpTools.UPDATE_BLOCK_NAME]: { action: 'updateBlockName', method: 'PUT' },
  [McpTools.UPDATE_BLOCK_POSITION]: { action: 'updateBlockPosition', method: 'PUT' },
  [McpTools.DELETE_BLOCK]: { action: 'deleteBlock', method: 'DELETE' },

  // Connection tools
  [McpTools.CONNECT_BLOCKS]: { action: 'addConnection', method: 'POST' },
  [McpTools.ADD_CONNECTION]: { action: 'addConnection', method: 'POST' },
  [McpTools.LIST_CONNECTIONS]: { action: 'listConnections', method: 'GET' },
  [McpTools.DELETE_CONNECTION]: { action: 'deleteConnection', method: 'DELETE' },

  // Parameter tools
  [McpTools.SET_PARAMETER]: { action: 'setParameter', method: 'POST' },
  [McpTools.LIST_PARAMETERS]: { action: 'listParameters', method: 'GET' }
};

/**
 * Simulates MCP tool calls as Claude would make them
 */
export class McpToolSimulator {
  private client: TestApiClient;

  constructor(client: TestApiClient) {
    this.client = client;
  }

  /**
   * Call an MCP tool by name with arguments
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<ApiResponse> {
    const mapping = toolToActionMap[toolName];
    if (!mapping) {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }

    const { action, method } = mapping;

    switch (method) {
      case 'GET':
        return this.client.get(action, this.stringifyParams(args));
      case 'POST':
        return this.client.post({ action, ...args });
      case 'PUT':
        return this.client.put({ action, ...args });
      case 'DELETE':
        return this.client.delete(action, this.stringifyParams(args));
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private stringifyParams(params: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }
    return result;
  }

  // ============================================
  // High-level workflow helpers
  // ============================================

  /**
   * Create a model with the given name
   */
  async createModel(name: string): Promise<{ modelId: string; sheetId: string }> {
    const result = await this.callTool(McpTools.CREATE_MODEL, { name });
    if (!result.success) {
      throw new Error(`Failed to create model: ${result.error}`);
    }
    return {
      modelId: result.data.id,
      sheetId: result.data.mainSheet?.id || 'main'
    };
  }

  /**
   * Add multiple blocks to a sheet
   */
  async addBlocks(
    modelId: string,
    sheetId: string,
    blocks: BlockSpec[]
  ): Promise<Map<string, string>> {
    const blockIdMap = new Map<string, string>();

    for (const block of blocks) {
      // Support both 'params' and 'parameters' for convenience
      const blockParams = block.parameters || block.params;

      const result = await this.callTool(McpTools.ADD_BLOCK, {
        modelId,
        sheetId,
        blockType: block.type,
        name: block.name,
        position: block.position,
        parameters: blockParams
      });

      if (!result.success) {
        throw new Error(`Failed to add block ${block.name || block.type}: ${result.error}`);
      }

      const blockName = result.data.block.name;
      const blockId = result.data.block.id;
      blockIdMap.set(blockName, blockId);
    }

    return blockIdMap;
  }

  /**
   * Connect blocks using names or IDs
   */
  async connectBlocks(
    modelId: string,
    sheetId: string,
    connections: ConnectionSpec[],
    blockIdMap?: Map<string, string>
  ): Promise<string[]> {
    const connectionIds: string[] = [];

    for (const conn of connections) {
      // Resolve block names to IDs if needed
      let sourceBlockId = conn.sourceBlock;
      let targetBlockId = conn.targetBlock;

      if (blockIdMap) {
        sourceBlockId = blockIdMap.get(conn.sourceBlock) || conn.sourceBlock;
        targetBlockId = blockIdMap.get(conn.targetBlock) || conn.targetBlock;
      }

      const args: Record<string, any> = {
        modelId,
        sheetId,
        sourceBlockId,
        targetBlockId
      };

      // Handle port specification (by name or index)
      if (typeof conn.sourcePort === 'number') {
        args.sourcePortIndex = conn.sourcePort;
      } else if (conn.sourcePort) {
        args.sourcePort = conn.sourcePort;
      } else {
        args.sourcePortIndex = 0;
      }

      if (typeof conn.targetPort === 'number') {
        args.targetPortIndex = conn.targetPort;
      } else if (conn.targetPort) {
        args.targetPort = conn.targetPort;
      } else {
        args.targetPortIndex = 0;
      }

      const result = await this.callTool(McpTools.CONNECT_BLOCKS, args);

      if (!result.success) {
        throw new Error(
          `Failed to connect ${conn.sourceBlock} -> ${conn.targetBlock}: ${result.error}`
        );
      }

      connectionIds.push(result.data.connection.id);
    }

    return connectionIds;
  }

  /**
   * Build a complete simple model with blocks and connections
   */
  async buildSimpleModel(
    name: string,
    blocks: BlockSpec[],
    connections?: ConnectionSpec[]
  ): Promise<{
    modelId: string;
    sheetId: string;
    blockIds: Record<string, string>;
    connectionCount: number;
  }> {
    // Create model
    const { modelId, sheetId } = await this.createModel(name);

    // Add blocks
    const blockIdsMap = await this.addBlocks(modelId, sheetId, blocks);

    // Add connections
    let connectionIds: string[] = [];
    if (connections && connections.length > 0) {
      connectionIds = await this.connectBlocks(modelId, sheetId, connections, blockIdsMap);
    }

    // Convert Map to object for easier testing
    const blockIds: Record<string, string> = {};
    blockIdsMap.forEach((id, name) => {
      blockIds[name] = id;
    });

    return { modelId, sheetId, blockIds, connectionCount: connectionIds.length };
  }

  /**
   * Validate a model and return validation results
   */
  async validateModel(modelId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const result = await this.callTool(McpTools.VALIDATE_MODEL, { modelId });

    if (!result.success) {
      throw new Error(`Validation request failed: ${result.error}`);
    }

    return {
      valid: result.data.valid,
      errors: result.data.errors || [],
      warnings: result.data.warnings || []
    };
  }

  /**
   * Set a model parameter
   */
  async setParameter(
    modelId: string,
    name: string,
    signalType: string,
    value: any
  ): Promise<void> {
    const result = await this.callTool(McpTools.SET_PARAMETER, {
      modelId,
      name,
      signalType,
      value
    });

    if (!result.success) {
      throw new Error(`Failed to set parameter ${name}: ${result.error}`);
    }
  }
}
