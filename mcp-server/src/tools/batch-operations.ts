// mcp-server/src/tools/batch-operations.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { config } from '../config.js';

export const batchExecuteTool: Tool = {
  name: 'batch_execute',
  description: 'Execute multiple operations in a single request, with optional transactional behavior',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Optional ID to track this operation in results'
            },
            action: {
              type: 'string',
              description: 'Action to perform (e.g., addBlock, updateBlock, addConnection)'
            }
          },
          required: ['action']
        },
        description: 'Array of operations to execute'
      },
      transactional: {
        type: 'boolean',
        description: 'If true, all operations must succeed or all will be rolled back',
        default: false
      }
    },
    required: ['operations']
  },
  handler: async (args: any) => {
    try {
      const { operations, transactional = false } = args;
      
      if (config.debug) {
        console.error('[batch_execute] Executing batch:', { 
          operationCount: operations.length, 
          transactional 
        });
      }

      // Use Model Builder API's batch operations endpoint
      const response = await modelBuilderClient.batchOperations(operations, transactional);
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Batch execution failed',
          errors: response.errors
        };
      }

      const results = (response.data as any)?.results || [];
      
      return {
        success: true,
        results: results,
        summary: {
          total: operations.length,
          succeeded: results.filter((r: any) => r.success).length,
          failed: results.filter((r: any) => !r.success).length
        }
      };
    } catch (error) {
      console.error('[batch_execute] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};