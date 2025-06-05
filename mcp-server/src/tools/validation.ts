// mcp-server/src/tools/validation.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { config } from '../config.js';

export const validateModelTool: Tool = {
  name: 'validate_model',
  description: 'Validate a model for errors and warnings',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model to validate'
      },
      version: {
        type: 'number',
        description: 'Optional version number to validate'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, version } = args;
      
      if (config.debug) {
        console.error('[validate_model] Validating model:', { modelId, version });
      }

      // Model Builder API validates the latest version
      const response = await modelBuilderClient.validateModel(modelId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to validate model',
          errors: response.errors
        };
      }

      return {
        success: true,
        validation: response.data
      };
    } catch (error) {
      console.error('[validate_model] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const listSheetLabelsTool: Tool = {
  name: 'list_sheet_labels',
  description: 'List all sheet labels in a model',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId } = args;
      
      if (config.debug) {
        console.error('[list_sheet_labels] Listing sheet labels:', { modelId });
      }

      // Get the full model to extract sheet labels
      const modelResponse = await modelBuilderClient.getModel(modelId);
      
      if (!modelResponse.success) {
        return {
          success: false,
          error: modelResponse.error || 'Failed to get model',
          errors: modelResponse.errors
        };
      }

      const model = modelResponse.data as any;
      const sheetLabels = {
        sinks: [] as any[],
        sources: [] as any[]
      };

      // Extract sheet labels from all sheets
      if (model?.sheets) {
        for (const sheet of model.sheets) {
          if (sheet.blocks) {
            for (const block of sheet.blocks) {
              if (block.type === 'sheet_label_sink') {
                sheetLabels.sinks.push({
                  blockId: block.id,
                  blockName: block.name,
                  signalName: block.parameters?.signalName,
                  sheetId: sheet.id,
                  sheetName: sheet.name
                });
              } else if (block.type === 'sheet_label_source') {
                sheetLabels.sources.push({
                  blockId: block.id,
                  blockName: block.name,
                  signalName: block.parameters?.signalName,
                  sheetId: sheet.id,
                  sheetName: sheet.name
                });
              }
            }
          }
        }
      }

      return {
        success: true,
        sheetLabels
      };
    } catch (error) {
      console.error('[list_sheet_labels] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const validateSheetLabelsTool: Tool = {
  name: 'validate_sheet_labels',
  description: 'Validate sheet label connections and scoping',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId } = args;
      
      if (config.debug) {
        console.error('[validate_sheet_labels] Validating sheet labels:', { modelId });
      }

      // Use the general validation which includes sheet label validation
      const response = await modelBuilderClient.validateModel(modelId);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to validate model',
          errors: response.errors
        };
      }

      // Extract sheet label specific errors from validation results
      const validation = response.data as any;
      const sheetLabelErrors = validation?.errors?.filter((error: any) => 
        error.message?.includes('Sheet Label') || 
        error.message?.includes('sheet label')
      ) || [];
      
      const sheetLabelWarnings = validation?.warnings?.filter((warning: any) => 
        warning.message?.includes('Sheet Label') || 
        warning.message?.includes('sheet label')
      ) || [];

      return {
        success: true,
        errors: sheetLabelErrors,
        warnings: sheetLabelWarnings,
        allValidation: validation
      };
    } catch (error) {
      console.error('[validate_sheet_labels] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};