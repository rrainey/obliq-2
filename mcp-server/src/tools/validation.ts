// mcp-server/src/tools/validation.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { apiClient } from '../client.js';
import {
  ValidateModelInput,
  ValidateModelOutput,
  ListSheetLabelsInput,
  ListSheetLabelsOutput,
  ValidateSheetLabelsInput,
  ValidateSheetLabelsOutput
} from '../types.js';

export const validateModelTool: Tool = {
  name: 'validate_model',
  description: 'Validate a model structure and check for errors',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model to validate'
      },
      version: {
        type: 'number',
        description: 'Optional version number to validate'
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<ValidateModelOutput> => {
    const input = args as ValidateModelInput;
    
    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      // Call the automation API to validate the model
      const response = await apiClient.validateModel(input.modelId, input.version);
      
      if (!response.success) {
        // If validation failed, the errors are in the response
        return {
          success: false,
          errors: response.errors || [],
          error: response.error || 'Validation failed'
        };
      }
      
      // Extract validation results
      const validationData = response.data?.validation;
      
      if (!validationData) {
        return {
          success: false,
          error: 'No validation data returned from API'
        };
      }
      
      return {
        success: validationData.errors.length === 0,
        errors: validationData.errors || [],
        warnings: validationData.warnings || [],
        blockCounts: validationData.blockCounts || {}
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during validation'
      };
    }
  }
};

export const listSheetLabelsTool: Tool = {
  name: 'list_sheet_labels',
  description: 'List all sheet label sinks and sources in a model',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model'
      },
      sheetId: {
        type: 'string',
        description: 'Optional sheet ID to filter results'
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<ListSheetLabelsOutput> => {
    return { success: false, error: 'Not yet implemented' };
  }
};

export const validateSheetLabelsTool: Tool = {
  name: 'validate_sheet_labels',
  description: 'Validate sheet label consistency across all sheets',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model to validate'
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<ValidateSheetLabelsOutput> => {
    return { success: false, error: 'Not yet implemented' };
  }
};