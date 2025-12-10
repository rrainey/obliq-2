// mcp-server/src/tools/model-management.ts
import { ToolWithHandler } from '../types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { config } from '../config.js';

export const createModelTool: ToolWithHandler = {
  name: 'create_model',
  description: 'Create a new empty model. The owner will be determined by the API token used.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new model'
      }
    },
    required: ['name']
  },
  handler: async (args: any) => {
    try {
      const { name } = args;

      if (config.debug) {
        console.error('[create_model] Creating model:', { name });
      }

      // userId is derived from the API token - never passed explicitly
      const response = await modelBuilderClient.createModel(name);
      
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

export const getModelTool: ToolWithHandler = {
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

export const listModelsTool: ToolWithHandler = {
  name: 'list_models',
  description: 'List all models owned by the authenticated user (derived from API token)',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (_args: any) => {
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

export const deleteModelTool: ToolWithHandler = {
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