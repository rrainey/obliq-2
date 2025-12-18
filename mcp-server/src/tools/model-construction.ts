// mcp-server/src/tools/model-construction.ts
import { ToolWithHandler } from '../types.js';
import { modelBuilderClient } from '../modelBuilderClient.js';
import { config } from '../config.js';

export const addSheetTool: ToolWithHandler = {
  name: 'add_sheet',
  description: 'Add a new sheet to a model or to a subsystem block. If subsystemBlockId is provided, the sheet is added to that subsystem\'s internal sheets collection rather than the model\'s top-level sheets.',
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
      },
      subsystemBlockId: {
        type: 'string',
        description: 'ID of a subsystem block to add the sheet to (optional). If provided, the sheet will be added inside the subsystem rather than at the model\'s top level.'
      }
    },
    required: ['modelId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, name, subsystemBlockId } = args;

      if (config.debug) {
        console.error('[add_sheet] Adding sheet:', { modelId, name, subsystemBlockId });
      }

      const response = await modelBuilderClient.addSheet(modelId, name, subsystemBlockId);

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to add sheet',
          errors: response.errors
        };
      }

      const result: any = {
        success: true,
        sheetId: (response.data as any)?.sheet?.id,
        sheet: (response.data as any)?.sheet
      };

      // Include subsystem info if sheet was added to a subsystem
      if ((response.data as any)?.subsystemBlockId) {
        result.subsystemBlockId = (response.data as any).subsystemBlockId;
        result.subsystemName = (response.data as any).subsystemName;
        result.hint = `Sheet added to subsystem '${result.subsystemName}'. Use this sheetId to add blocks inside the subsystem.`;
      }

      return result;
    } catch (error) {
      console.error('[add_sheet] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const addBlockTool: ToolWithHandler = {
  name: 'add_block',
  description: `Add a block to a sheet. For subsystem blocks, a main sheet with default input/output ports is automatically created. The response will include the subsystemSheet info with the sheetId needed to add blocks inside the subsystem.

IMPORTANT: Use list_block_types tool first to discover available block types and their parameters. Each block type has specific configurable parameters with defaults and constraints.

Block-specific parameters for subsystem blocks:
- codeGenStrategy: Code generation strategy ('flatten' | 'segregated' | 'segregated_atomic'). Default: 'flatten'.
  - 'flatten': Subsystem blocks are inlined into parent during code generation
  - 'segregated': Subsystem generates separate init/step functions that are called from parent
  - 'segregated_atomic': Like segregated, but guarantees atomic execution
- inputPorts: Array of input port names (e.g., ['Input1', 'Input2']). Default: ['Input1']
- outputPorts: Array of output port names (e.g., ['Output1']). Default: ['Output1']`,
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
        description: 'Type of block to add (e.g., sum, multiply, transfer_function, subsystem)'
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
        description: 'Block-specific parameters. For subsystem blocks, see tool description for codeGenStrategy and port options.'
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

      const result: any = {
        success: true,
        blockId: (response.data as any)?.block?.id,
        block: (response.data as any)?.block
      };

      // Include subsystem sheet info for better guidance when creating subsystems
      if ((response.data as any)?.subsystemSheet) {
        result.subsystemSheet = (response.data as any).subsystemSheet;
        result.hint = `Subsystem created with main sheet '${result.subsystemSheet.name}' (ID: ${result.subsystemSheet.id}). To add blocks inside the subsystem, use this sheetId. The sheet has default Input1 and Output1 ports.`;
      }

      return result;
    } catch (error) {
      console.error('[add_block] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const updateBlockTool: ToolWithHandler = {
  name: 'update_block',
  description: `Update a block's properties including name, position, and parameters.

For subsystem blocks, you can update:
- codeGenStrategy: 'flatten' | 'segregated' | 'segregated_atomic'
- inputPorts: array of port name strings
- outputPorts: array of port name strings
- showEnableInput: boolean
- showPortNames: boolean
- parameters: array of subsystem-scoped parameters (ONLY for segregated/segregated_atomic strategies)

IMPORTANT: Subsystem parameters can only be set when codeGenStrategy is 'segregated' or 'segregated_atomic'.
If you attempt to set parameters on a 'flatten' strategy subsystem, you will receive an error explaining
that parameters are only available for segregated code generation strategies.

Example subsystem parameter update:
{
  "parameters": {
    "codeGenStrategy": "segregated",
    "parameters": [
      { "name": "Kp", "signalType": "double", "value": 1.5 },
      { "name": "Ki", "signalType": "double", "value": 0.1 }
    ]
  }
}`,
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
            description: 'Updated block parameters. For subsystems, can include codeGenStrategy, inputPorts, outputPorts, showEnableInput, showPortNames, and parameters (subsystem-scoped constants).'
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

export const listBlocksTool: ToolWithHandler = {
  name: 'list_blocks',
  description: `List all blocks on a sheet with their complete details including parameters.

Use this to inspect block configurations, including:
- Block type, name, and position
- All block parameters (including subsystem parameters for segregated subsystems)
- Input and output port names

For subsystem blocks, the parameters will include codeGenStrategy and any subsystem-scoped parameters.`,
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
      }
    },
    required: ['modelId', 'sheetId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId } = args;

      if (config.debug) {
        console.error('[list_blocks] Listing blocks:', { modelId, sheetId });
      }

      const response = await modelBuilderClient.listBlocks(modelId, sheetId);

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to list blocks',
          errors: response.errors
        };
      }

      return {
        success: true,
        modelId,
        sheetId,
        blockCount: (response.data as any)?.blockCount || 0,
        blocks: (response.data as any)?.blocks || []
      };
    } catch (error) {
      console.error('[list_blocks] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const deleteBlockTool: ToolWithHandler = {
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

export const addConnectionTool: ToolWithHandler = {
  name: 'add_connection',
  description: 'Add a wire connection between two blocks. Specify ports by index (preferred) or by name.',
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
      sourcePortIndex: {
        type: 'number',
        description: 'Index of the source output port (0-based, preferred)'
      },
      sourcePort: {
        type: 'string',
        description: 'Name of the source port (alternative to sourcePortIndex)'
      },
      targetBlockId: {
        type: 'string',
        description: 'ID of the target block'
      },
      targetPortIndex: {
        type: 'number',
        description: 'Index of the target input port (0-based, preferred)'
      },
      targetPort: {
        type: 'string',
        description: 'Name of the target port (alternative to targetPortIndex)'
      }
    },
    required: ['modelId', 'sheetId', 'sourceBlockId', 'targetBlockId']
  },
  handler: async (args: any) => {
    try {
      const { modelId, sheetId, sourceBlockId, sourcePortIndex, sourcePort, targetBlockId, targetPortIndex, targetPort } = args;

      // Validate that at least one port specifier is provided for each end
      if (sourcePortIndex === undefined && !sourcePort) {
        return {
          success: false,
          error: 'Either sourcePortIndex or sourcePort must be provided'
        };
      }
      if (targetPortIndex === undefined && !targetPort) {
        return {
          success: false,
          error: 'Either targetPortIndex or targetPort must be provided'
        };
      }

      if (config.debug) {
        console.error('[add_connection] Adding connection:', args);
      }

      const response = await modelBuilderClient.addConnection(
        modelId,
        sheetId,
        sourceBlockId,
        sourcePortIndex,
        sourcePort,
        targetBlockId,
        targetPortIndex,
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
        connectionId: (response.data as any)?.connection?.id,
        connection: (response.data as any)?.connection
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

export const deleteConnectionTool: ToolWithHandler = {
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

export const listParametersTool: ToolWithHandler = {
  name: 'list_parameters',
  description: 'List all model parameters. Model parameters are named constants that can be used in block expressions.',
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
        console.error('[list_parameters] Listing parameters:', { modelId });
      }

      const response = await modelBuilderClient.listParameters(modelId);

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to list parameters',
          errors: response.errors
        };
      }

      return {
        success: true,
        modelId,
        parameterCount: (response.data as any)?.parameterCount || 0,
        parameters: (response.data as any)?.parameters || []
      };
    } catch (error) {
      console.error('[list_parameters] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const setParameterTool: ToolWithHandler = {
  name: 'set_parameter',
  description: 'Create or update a model parameter. Parameters are named constants (e.g., Kp=1.5, gain=10) that can be referenced in block expressions. If the parameter exists, it will be updated; otherwise, a new parameter will be created.',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      name: {
        type: 'string',
        description: 'Parameter name (must be a valid C identifier: alphanumeric + underscore, cannot start with number)'
      },
      signalType: {
        type: 'string',
        description: 'Data type: float, double, long, bool, or array types like double[3] or double[3][3]'
      },
      value: {
        oneOf: [
          { type: 'number' },
          { type: 'array', items: { type: 'number' } },
          { type: 'array', items: { type: 'array', items: { type: 'number' } } }
        ],
        description: 'Parameter value (scalar, array, or matrix matching the signalType)'
      }
    },
    required: ['modelId', 'name', 'signalType', 'value']
  },
  handler: async (args: any) => {
    try {
      const { modelId, name, signalType, value } = args;

      if (config.debug) {
        console.error('[set_parameter] Setting parameter:', { modelId, name, signalType, value });
      }

      const response = await modelBuilderClient.setParameter(modelId, name, signalType, value);

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to set parameter',
          errors: response.errors
        };
      }

      const data = response.data as any;
      return {
        success: true,
        modelId,
        parameter: data?.parameter,
        created: data?.created,
        message: data?.created ? `Parameter '${name}' created` : `Parameter '${name}' updated`
      };
    } catch (error) {
      console.error('[set_parameter] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

export const deleteParameterTool: ToolWithHandler = {
  name: 'delete_parameter',
  description: 'Delete a model parameter',
  inputSchema: {
    type: 'object',
    properties: {
      modelId: {
        type: 'string',
        description: 'ID of the model'
      },
      name: {
        type: 'string',
        description: 'Name of the parameter to delete'
      }
    },
    required: ['modelId', 'name']
  },
  handler: async (args: any) => {
    try {
      const { modelId, name } = args;

      if (config.debug) {
        console.error('[delete_parameter] Deleting parameter:', { modelId, name });
      }

      const response = await modelBuilderClient.deleteParameter(modelId, name);

      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to delete parameter',
          errors: response.errors
        };
      }

      return {
        success: true,
        message: `Parameter '${name}' deleted successfully`
      };
    } catch (error) {
      console.error('[delete_parameter] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};