// mcp-server/src/tools/model-construction.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { config } from '../config.js';

export const addSheetTool: Tool = {
  name: 'add_sheet',
  description: 'Add a new sheet to a model',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      name: {
        type: 'string',
        description: 'Name for the new sheet (optional)'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, name } = args;
      
      if (config.debug) {
        console.error('[add_sheet] Adding sheet:', { modelId, name });
      }

      const response = await modelBuilderClient.addSheet(modelId, name);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to add sheet',
          errors: response.errors
        };
      }

      return {
        success: true,
        sheetId: (response.data as any)?.id,
        sheet: response.data
      };
    } catch (error) {
      console.error('[add_sheet] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const addBlockTool: Tool = {
  name: 'add_block',
  description: 'Add a block to a sheet',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      sheetId: {
        type: 'string',
        description: 'ID of the sheet'
      },
      blockType: {
        type: 'string',
        description: 'Type of block to add (e.g., sum, multiply, transfer_function)'
      },
      name: {
        type: 'string',
        description: 'Name for the block (optional)'
      },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        },
        description: 'Position on the canvas'
      },
      parameters: {
        type: 'object',
        description: 'Block-specific parameters'
      }
    },
    required: ['modelId', 'sheetId', 'blockType']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId, blockType, name, position, parameters } = args;
      
      if (config.debug) {
        console.error('[add_block] Adding block:', { modelId, sheetId, blockType, name });
      }

      const response = await modelBuilderClient.addBlock(
        modelId, 
        sheetId, 
        blockType, 
        name, 
        position, 
        parameters
      );
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to add block',
          errors: response.errors
        };
      }

      return {
        success: true,
        blockId: (response.data as any)?.id,
        block: response.data
      };
    } catch (error) {
      console.error('[add_block] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const updateBlockTool: Tool = {
  name: 'update_block',
  description: 'Update a block\'s properties',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      sheetId: {
        type: 'string',
        description: 'ID of the sheet'
      },
      blockId: {
        type: 'string',
        description: 'ID of the block to update'
      },
      updates: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'New name for the block'
          },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            description: 'New position'
          },
          parameters: {
            type: 'object',
            description: 'Updated block parameters'
          }
        },
        description: 'Properties to update'
      }
    },
    required: ['modelId', 'sheetId', 'blockId', 'updates']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId, blockId, updates } = args;
      
      if (config.debug) {
        console.error('[update_block] Updating block:', { modelId, sheetId, blockId, updates });
      }

      const response = await modelBuilderClient.updateBlock(
        modelId,
        sheetId,
        blockId,
        updates
      );
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to update block',
          errors: response.errors
        };
      }

      return {
        success: true,
        message: 'Block updated successfully',
        data: response.data
      };
    } catch (error) {
      console.error('[update_block] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const deleteBlockTool: Tool = {
  name: 'delete_block',
  description: 'Delete a block from a sheet',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      sheetId: {
        type: 'string',
        description: 'ID of the sheet'
      },
      blockId: {
        type: 'string',
        description: 'ID of the block to delete'
      }
    },
    required: ['modelId', 'sheetId', 'blockId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId, blockId } = args;
      
      if (config.debug) {
        console.error('[delete_block] Deleting block:', { modelId, sheetId, blockId });
      }

      const response = await modelBuilderClient.deleteBlock(modelId, sheetId, blockId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to delete block',
          errors: response.errors
        };
      }

      return {
        success: true,
        message: 'Block deleted successfully'
      };
    } catch (error) {
      console.error('[delete_block] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const addConnectionTool: Tool = {
  name: 'add_connection',
  description: 'Add a wire connection between two blocks',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      sheetId: {
        type: 'string',
        description: 'ID of the sheet'
      },
      sourceBlockId: {
        type: 'string',
        description: 'ID of the source block'
      },
      sourcePort: {
        type: 'string',
        description: 'Name/index of the source port'
      },
      targetBlockId: {
        type: 'string',
        description: 'ID of the target block'
      },
      targetPort: {
        type: 'string',
        description: 'Name/index of the target port'
      }
    },
    required: ['modelId', 'sheetId', 'sourceBlockId', 'sourcePort', 'targetBlockId', 'targetPort']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId, sourceBlockId, sourcePort, targetBlockId, targetPort } = args;
      
      if (config.debug) {
        console.error('[add_connection] Adding connection:', args);
      }

      const response = await modelBuilderClient.addConnection(
        modelId,
        sheetId,
        sourceBlockId,
        sourcePort,
        targetBlockId,
        targetPort
      );
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to add connection',
          errors: response.errors
        };
      }

      return {
        success: true,
        connectionId: (response.data as any)?.id,
        connection: response.data
      };
    } catch (error) {
      console.error('[add_connection] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const deleteConnectionTool: Tool = {
  name: 'delete_connection',
  description: 'Delete a wire connection',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      sheetId: {
        type: 'string',
        description: 'ID of the sheet'
      },
      connectionId: {
        type: 'string',
        description: 'ID of the connection to delete'
      }
    },
    required: ['modelId', 'sheetId', 'connectionId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId, connectionId } = args;
      
      if (config.debug) {
        console.error('[delete_connection] Deleting connection:', { modelId, sheetId, connectionId });
      }

      const response = await modelBuilderClient.deleteConnection(modelId, sheetId, connectionId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to delete connection',
          errors: response.errors
        };
      }

      return {
        success: true,
        message: 'Connection deleted successfully'
      };
    } catch (error) {
      console.error('[delete_connection] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};