// mcp-server/src/tools/model-management.ts
import { ToolWithHandler } from '../types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { apiClient } from '../client.js';
import { config } from '../config.js';

export const createModelTool: ToolWithHandler = {
  name: 'create_model',
  description: 'Create a new model with an initial "Main" sheet. The owner will be determined by the API token used. The response includes mainSheet info with the sheetId needed to add blocks.',
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

      const data = response.data as any;
      const result: any = {
        success: true,
        modelId: data?.id,
        model: {
          id: data?.id,
          name: data?.name,
          latest_version: data?.latest_version,
          created_at: data?.created_at
        }
      };

      // Include main sheet info for easier guidance
      if (data?.mainSheet) {
        result.mainSheet = data.mainSheet;
        result.hint = `Model created with main Sheet '${data.mainSheet.name}' (ID: ${data.mainSheet.id}). Start with this sheetId to add blocks to the Model. You mey add more Sheets and interconnect signals with Sheet Labels to accomodate a larger Model.`;
      }

      return result;
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
  description: 'List all Models owned by the authenticated user (derived from API token)',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  handler: async (_args: any) => {
    try {
      if (config.debug) {
        console.error('[list_models] Fetching models for authenticated user');
      }

      const response = await apiClient.listModels();

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to list models',
          errors: response.errors
        };
      }

      const data = response.data as any;
      return {
        success: true,
        models: data?.models || [],
        count: data?.count || 0
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
  description: 'Delete a Model and all its data',
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