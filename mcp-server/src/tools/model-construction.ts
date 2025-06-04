// mcp-server/src/tools/model-construction.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { apiClient } from '../client.js';
import { 
  AddSheetInput,
  AddSheetOutput,
  AddBlockInput,
  AddBlockOutput,
  UpdateBlockInput,
  UpdateBlockOutput,
  DeleteBlockInput,
  DeleteBlockOutput,
  AddConnectionInput,
  AddConnectionOutput,
  DeleteConnectionInput,
  DeleteConnectionOutput
} from '../types.js';

// Helper to generate IDs
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const addSheetTool: Tool = {
  name: 'add_sheet',
  description: 'Add a new sheet to a model',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: { type: 'string' },
      sheetName: { type: 'string' },
      width: { type: 'number', default: 2000 },
      height: { type: 'number', default: 2000 }
    },
    required: ['modelId', 'sheetName']
  },
  handler: async (args: unknown): Promise<AddSheetOutput> => {
    const input = args as AddSheetInput;
    
    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      // The automation API doesn't support model modification
      // In a real implementation, this would need a new API endpoint
      // that can load a model, modify it, and save it back
      
      // For now, we'll provide a detailed explanation
      const sheetId = generateId();
      
      return {
        success: false,
        error: 'Sheet creation is not available through the automation API. ' +
               'The automation API is read-only for model structure. ' +
               'To modify models, use the web UI or implement a new API endpoint.',
        sheetId: sheetId // What the ID would be
      };
      
      // In a real implementation, this would:
      // 1. Fetch the current model data
      // 2. Add the new sheet to the sheets array
      // 3. Save the updated model back to the database
      // 4. Return the new sheet ID
      
    } catch (error) {
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
      modelId: { type: 'string' },
      sheetId: { type: 'string' },
      blockType: { 
        type: 'string',
        enum: ['sum', 'multiply', 'transfer_function', 'signal_display', 'signal_logger',
               'input_port', 'output_port', 'source', 'scale', 'lookup_1d', 'lookup_2d', 
               'subsystem', 'sheet_label_sink', 'sheet_label_source'],
        description: 'Type of block to add'
      },
      name: { type: 'string' },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        },
        required: ['x', 'y']
      },
      parameters: { 
        type: 'object',
        description: 'Block-specific parameters (e.g., gain for scale block)'
      }
    },
    required: ['modelId', 'sheetId', 'blockType', 'position']
  },
  handler: async (args: unknown): Promise<AddBlockOutput> => {
    const input = args as AddBlockInput;
    
    try {
      // Validate model ID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      // Validate block type
      const validBlockTypes = [
        'sum', 'multiply', 'transfer_function', 'signal_display', 'signal_logger',
        'input_port', 'output_port', 'source', 'scale', 'lookup_1d', 'lookup_2d', 
        'subsystem', 'sheet_label_sink', 'sheet_label_source'
      ];
      
      if (!validBlockTypes.includes(input.blockType)) {
        return {
          success: false,
          error: `Invalid block type: ${input.blockType}. Valid types are: ${validBlockTypes.join(', ')}`
        };
      }
      
      // Generate block ID and default name
      const blockId = generateId();
      const blockName = input.name || `${input.blockType}_${Date.now()}`;
      
      // The automation API doesn't support model modification
      return {
        success: false,
        error: 'Block creation is not available through the automation API. ' +
               'Use the web UI to modify models. ' +
               `Would have created: ${blockName} (${input.blockType}) at (${input.position.x}, ${input.position.y})`,
        blockId: blockId // What the ID would be
      };
      
      // In a real implementation, this would:
      // 1. Fetch the current model data
      // 2. Find the specified sheet
      // 3. Add the new block with proper defaults for the block type
      // 4. Update block name counters
      // 5. Save the updated model
      // 6. Return the new block ID
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const updateBlockTool: Tool = {
  name: 'update_block',
  description: 'Update block properties',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: { type: 'string' },
      sheetId: { type: 'string' },
      blockId: { type: 'string' },
      name: { type: 'string', description: 'New name for the block' },
      position: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        },
        description: 'New position for the block'
      },
      parameters: { 
        type: 'object',
        description: 'Updated block-specific parameters'
      }
    },
    required: ['modelId', 'sheetId', 'blockId']
  },
  handler: async (args: unknown): Promise<UpdateBlockOutput> => {
    const input = args as UpdateBlockInput;
    
    try {
      // Validate IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      if (!uuidRegex.test(input.blockId)) {
        return {
          success: false,
          error: 'Invalid block ID format. Must be a valid UUID.'
        };
      }
      
      // Check if at least one update field is provided
      if (!input.name && !input.position && !input.parameters) {
        return {
          success: false,
          error: 'No updates provided. Specify at least one of: name, position, or parameters.'
        };
      }
      
      // Build update description
      const updates: string[] = [];
      if (input.name) updates.push(`name to "${input.name}"`);
      if (input.position) updates.push(`position to (${input.position.x}, ${input.position.y})`);
      if (input.parameters) updates.push(`parameters: ${JSON.stringify(input.parameters)}`);
      
      // The automation API doesn't support model modification
      return {
        success: false,
        error: 'Block updates are not available through the automation API. ' +
               'Use the web UI to modify models. ' +
               `Would have updated block ${input.blockId}: ${updates.join(', ')}`
      };
      
      // In a real implementation, this would:
      // 1. Fetch the current model data
      // 2. Find the specified sheet and block
      // 3. Update only the provided fields
      // 4. Validate the new parameters match the block type
      // 5. Save the updated model
      
    } catch (error) {
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
      modelId: { type: 'string' },
      sheetId: { type: 'string' },
      blockId: { type: 'string' }
    },
    required: ['modelId', 'sheetId', 'blockId']
  },
  handler: async (args: unknown): Promise<DeleteBlockOutput> => {
    const input = args as DeleteBlockInput;
    
    try {
      // Validate IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(input.modelId)) {
        return {
          success: false,
          error: 'Invalid model ID format. Must be a valid UUID.'
        };
      }
      
      if (!uuidRegex.test(input.blockId)) {
        return {
          success: false,
          error: 'Invalid block ID format. Must be a valid UUID.'
        };
      }
      
      // The automation API doesn't support model modification
      return {
        success: false,
        error: 'Block deletion is not available through the automation API. ' +
               'Model modifications will be supported in the future Model Builder API. ' +
               `Would have deleted block ${input.blockId} from sheet ${input.sheetId}`
      };
      
      // In a real implementation with Model Builder API, this would:
      // 1. Fetch the current model data
      // 2. Find and remove the block from the specified sheet
      // 3. Remove all connections to/from this block
      // 4. Create a new version with the changes
      // 5. Return success status
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const addConnectionTool: Tool = {
  name: 'add_connection',
  description: 'Add a wire connection between blocks',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: { type: 'string' },
      sheetId: { type: 'string' },
      sourceBlockId: { type: 'string' },
      sourcePortIndex: { type: 'number', minimum: 0 },
      targetBlockId: { type: 'string' },
      targetPortIndex: { type: 'number', minimum: 0 }
    },
    required: ['modelId', 'sheetId', 'sourceBlockId', 'sourcePortIndex', 'targetBlockId', 'targetPortIndex']
  },
  handler: async (args: unknown): Promise<AddConnectionOutput> => {
    const input = args as AddConnectionInput;
    
    try {
      // Validate IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const idsToValidate = [input.modelId, input.sourceBlockId, input.targetBlockId];
      
      for (const id of idsToValidate) {
        if (!uuidRegex.test(id)) {
          return {
            success: false,
            error: `Invalid UUID format: ${id}`
          };
        }
      }
      
      // Validate port indices
      if (input.sourcePortIndex < 0 || input.targetPortIndex < 0) {
        return {
          success: false,
          error: 'Port indices must be non-negative integers'
        };
      }
      
      // Generate wire ID
      const wireId = generateId();
      
      // The automation API doesn't support model modification
      return {
        success: false,
        error: 'Connection creation is not available through the automation API. ' +
               'Model modifications will be supported in the future Model Builder API. ' +
               `Would have created wire ${wireId} from ${input.sourceBlockId}:${input.sourcePortIndex} ` +
               `to ${input.targetBlockId}:${input.targetPortIndex}`,
        wireId: wireId // What the ID would be
      };
      
      // In a real implementation with Model Builder API, this would:
      // 1. Fetch the current model data
      // 2. Validate source block exists and has output at sourcePortIndex
      // 3. Validate target block exists and has input at targetPortIndex
      // 4. Check no existing wire to that input (single connection rule)
      // 5. Validate type compatibility between ports
      // 6. Add the new wire to connections array
      // 7. Create a new version with the changes
      // 8. Return the new wire ID
      
    } catch (error) {
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
      modelId: { type: 'string' },
      sheetId: { type: 'string' },
      wireId: { type: 'string' }
    },
    required: ['modelId', 'sheetId', 'wireId']
  },
  handler: async (args: unknown): Promise<DeleteConnectionOutput> => {
    return { success: false, error: 'Not yet implemented' };
  }
};