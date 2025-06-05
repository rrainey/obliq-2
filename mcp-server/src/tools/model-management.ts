// mcp-server/src/tools/model-management.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { config } from '../config.js';

// Default user ID for MCP operations
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

export const createModelTool: Tool = {
  name: 'create_model',
  description: 'Create a new empty model',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new model'
      },
      userId: {
        type: 'string',
        description: 'User ID for model ownership (optional)'
      }
    },
    required: ['name']
  },
  handler: async (args: any) => {
    try {
      const { name, userId = DEFAULT_USER_ID } = args;
      
      if (config.debug) {
        console.error('[create_model] Creating model:', { name, userId });
      }

      const response = await modelBuilderClient.createModel(name, userId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to create model',
          errors: response.errors
        };
      }

      return {
        success: true,
        modelId: (response.data as any)?.id,
        model: response.data
      };
    } catch (error) {
      console.error('[create_model] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const getModelTool: Tool = {
  name: 'get_model',
  description: 'Get complete model data including all sheets, blocks, and connections',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model to retrieve'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId } = args;
      
      if (config.debug) {
        console.error('[get_model] Retrieving model:', modelId);
      }

      const response = await modelBuilderClient.getModel(modelId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to get model',
          errors: response.errors
        };
      }

      return {
        success: true,
        model: response.data
      };
    } catch (error) {
      console.error('[get_model] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const listModelsTool: Tool = {
  name: 'list_models',
  description: 'List all models (Note: Model Builder API may not support this directly)',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'User ID to filter models (optional)'
      }
    }
  },
  handler: async (args: any) => {
    try {
      // Note: The Model Builder API doesn't have a list models endpoint
      // This would need to be implemented in the main app first
      return {
        success: false,
        error: 'List models operation not yet supported by Model Builder API',
        note: 'This operation requires direct database access or a new API endpoint'
      };
    } catch (error) {
      console.error('[list_models] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const deleteModelTool: Tool = {
  name: 'delete_model',
  description: 'Delete a model and all its data',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model to delete'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId } = args;
      
      if (config.debug) {
        console.error('[delete_model] Deleting model:', modelId);
      }

      const response = await modelBuilderClient.deleteModel(modelId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to delete model',
          errors: response.errors
        };
      }

      return {
        success: true,
        message: 'Model deleted successfully'
      };
    } catch (error) {
      console.error('[delete_model] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};