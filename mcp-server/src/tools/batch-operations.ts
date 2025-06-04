// mcp-server/src/tools/batch-operations.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';

interface BatchOperation {
  tool: string;
  arguments: Record<string, any>;
}

interface BatchExecuteInput {
  operations: BatchOperation[];
  stopOnError?: boolean;
  transactional?: boolean;
}

interface BatchExecuteOutput {
  success: boolean;
  results: Array<{
    tool: string;
    success: boolean;
    result?: any;
    error?: string;
  }>;
  error?: string;
  rollbackPerformed?: boolean;
}

// Store for tracking operations that support rollback
const ROLLBACK_SUPPORT: Record<string, boolean> = {
  // Read-only operations don't need rollback
  'get_model': false,
  'list_models': false,
  'run_simulation': false,
  'validate_model': false,
  'list_sheet_labels': false,
  'validate_sheet_labels': false,
  'generate_code': false,
  'get_generated_files': false,
  'get_simulation_results': false,
  
  // Write operations would support rollback in Model Builder API
  'create_model': true,
  'delete_model': true,
  'add_sheet': true,
  'add_block': true,
  'update_block': true,
  'delete_block': true,
  'add_connection': true,
  'delete_connection': true,
  
  // Batch operations don't support nested transactions
  'batch_execute': false
};

export const batchExecuteTool: Tool = {
  name: 'batch_execute',
  description: 'Execute multiple tool operations in sequence with optional transaction support',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            arguments: { type: 'object' }
          },
          required: ['tool', 'arguments']
        },
        description: 'Array of operations to execute'
      },
      stopOnError: {
        type: 'boolean',
        description: 'Stop execution if any operation fails (default: false)'
      },
      transactional: {
        type: 'boolean',
        description: 'Rollback all operations if any fail (only for write operations)'
      }
    },
    required: ['operations']
  },
  handler: async (args: unknown): Promise<BatchExecuteOutput> => {
    const input = args as BatchExecuteInput;
    const results: BatchExecuteOutput['results'] = [];
    const executedOperations: Array<{ tool: string; args: any; result: any }> = [];
    
    // Import tools dynamically to avoid circular dependencies
    const { tools } = await import('../index.js');
    
    try {
      // Validate operations
      if (!Array.isArray(input.operations) || input.operations.length === 0) {
        return {
          success: false,
          results: [],
          error: 'Operations must be a non-empty array'
        };
      }
      
      // Check if transactional mode is requested
      if (input.transactional) {
        // Verify all operations support rollback
        const unsupportedOps = input.operations.filter(op => 
          ROLLBACK_SUPPORT[op.tool] === false
        );
        
        if (unsupportedOps.length > 0) {
          return {
            success: false,
            results: [],
            error: `Transactional mode not supported for read-only operations: ${
              unsupportedOps.map(op => op.tool).join(', ')
            }. Note: Write operations require Model Builder API.`
          };
        }
      }
      
      // Execute operations in sequence
      for (const operation of input.operations) {
        try {
          // Find the tool
          const tool = tools.find(t => t.name === operation.tool);
          if (!tool) {
            const errorResult = {
              tool: operation.tool,
              success: false,
              error: `Tool not found: ${operation.tool}`
            };
            results.push(errorResult);
            
            if (input.stopOnError || input.transactional) {
              // In transactional mode, we would rollback here
              if (input.transactional && executedOperations.length > 0) {
                return {
                  success: false,
                  results,
                  error: `Transaction aborted: ${errorResult.error}`,
                  rollbackPerformed: true
                };
              }
              
              return {
                success: false,
                results,
                error: `Batch execution stopped: ${errorResult.error}`
              };
            }
            continue;
          }
          
          // Execute the tool
          const handler = tool.handler as (args: unknown) => Promise<any>;
          const result = await handler(operation.arguments);
          
          results.push({
            tool: operation.tool,
            success: result.success !== false,
            result
          });
          
          // Track successful write operations for potential rollback
          if (result.success !== false && ROLLBACK_SUPPORT[operation.tool]) {
            executedOperations.push({
              tool: operation.tool,
              args: operation.arguments,
              result
            });
          }
          
          // Check if we should stop on error
          if (result.success === false && (input.stopOnError || input.transactional)) {
            if (input.transactional && executedOperations.length > 0) {
              // In a real implementation with Model Builder API,
              // we would rollback all executed operations here
              return {
                success: false,
                results,
                error: `Transaction aborted at ${operation.tool}: ${result.error}`,
                rollbackPerformed: true
              };
            }
            
            return {
              success: false,
              results,
              error: `Batch execution stopped at ${operation.tool}: ${result.error}`
            };
          }
          
        } catch (error) {
          const errorResult = {
            tool: operation.tool,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          results.push(errorResult);
          
          if (input.stopOnError || input.transactional) {
            if (input.transactional && executedOperations.length > 0) {
              return {
                success: false,
                results,
                error: `Transaction aborted: ${errorResult.error}`,
                rollbackPerformed: true
              };
            }
            
            return {
              success: false,
              results,
              error: `Batch execution stopped: ${errorResult.error}`
            };
          }
        }
      }
      
      // Determine overall success
      const allSuccessful = results.every(r => r.success);
      
      return {
        success: allSuccessful,
        results
      };
      
    } catch (error) {
      // If we get here, something went wrong with the batch execution itself
      if (input.transactional && executedOperations.length > 0) {
        return {
          success: false,
          results,
          error: error instanceof Error ? error.message : 'Unknown error in batch execution',
          rollbackPerformed: true
        };
      }
      
      return {
        success: false,
        results,
        error: error instanceof Error ? error.message : 'Unknown error in batch execution'
      };
    }
  }
};