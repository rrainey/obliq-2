// mcp-server/src/tools/code-generation.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { apiClient } from '../client.js';
import {
  GenerateCodeInput,
  GenerateCodeOutput,
  GetGeneratedFilesInput,
  GetGeneratedFilesOutput
} from '../types.js';

export const generateCodeTool: Tool = {
  name: 'generate_code',
  description: 'Generate C code from a model',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model to generate code from'
      },
      version: {
        type: 'number',
        description: 'Optional version number to use for code generation'
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<GenerateCodeOutput> => {
    const input = args as GenerateCodeInput;
    
    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      // Call the automation API to generate code
      const response = await apiClient.generateCode(input.modelId, input.version);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Code generation failed'
        };
      }
      
      // Extract code generation results
      const data = response.data;
      
      return {
        success: true,
        filesGenerated: data.filesGenerated || [],
        summary: data.summary || {
          headerFile: '',
          sourceFile: '',
          libraryConfig: '',
          blocksProcessed: 0,
          wiresProcessed: 0
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during code generation'
      };
    }
  }
};

export const getGeneratedFilesTool: Tool = {
  name: 'get_generated_files',
  description: 'Retrieve previously generated code files',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'UUID of the model'
      },
      version: {
        type: 'number',
        description: 'Optional version number'
      }
    },
    required: ['modelId']
  },
  handler: async (args: unknown): Promise<GetGeneratedFilesOutput> => {
    const input = args as GetGeneratedFilesInput;
    
    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      // The automation API doesn't store or return generated file contents
      // It generates files on-demand and returns a summary
      
      return {
        success: false,
        error: 'Generated file retrieval is not available through the automation API. ' +
               'The generate_code tool creates files on-demand but does not store them. ' +
               'To get the actual file contents, use the web UI download feature or ' +
               'implement a file storage system in the Model Builder API.'
      };
      
      // In a full implementation, this would require:
      // 1. A storage system for generated files (e.g., Supabase Storage)
      // 2. Tracking of generation history per model/version
      // 3. An API endpoint to retrieve stored files
      // 4. Cleanup policies for old generated files
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};