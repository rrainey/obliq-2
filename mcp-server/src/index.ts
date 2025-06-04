// mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { config, getMaskedConfig } from './config.js';
import { authenticateRequest } from './auth.js';
import { 
  createModelTool, 
  getModelTool, 
  listModelsTool, 
  deleteModelTool 
} from './tools/model-management.js';
import {
  addSheetTool,
  addBlockTool,
  updateBlockTool,
  deleteBlockTool,
  addConnectionTool,
  deleteConnectionTool
} from './tools/model-construction.js';
import {
  runSimulationTool,
  getSimulationResultsTool
} from './tools/simulation.js';

// Collect all tools
const tools: Tool[] = [
  // Model management
  createModelTool,
  getModelTool,
  listModelsTool,
  deleteModelTool,
  // Model construction
  addSheetTool,
  addBlockTool,
  updateBlockTool,
  deleteBlockTool,
  addConnectionTool,
  deleteConnectionTool,
  // Simulation
  runSimulationTool,
  getSimulationResultsTool
];

// Initialize MCP server
const server = new Server(
  {
    name: 'obliq2-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Error handler
server.onerror = (error) => {
  console.error('[MCP Server Error]', error);
};

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;
  
  // Authenticate the request
  const authResult = authenticateRequest(toolName, args, request.params);
  
  if (!authResult.authenticated) {
    return {
      content: [
        {
          type: 'text',
          text: `Authentication failed: ${authResult.error || 'Invalid token'}`
        }
      ],
      isError: true
    };
  }
  
  // Find the tool
  const tool = tools.find(t => t.name === toolName);
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `Tool ${toolName} not found`
        }
      ],
      isError: true
    };
  }
  
  try {
    // Execute the tool
    const handler = tool.handler as (args: unknown) => Promise<any>;
    const result = await handler(args);
    
    // Format the response
    if (result.success === false && result.error) {
      return {
        content: [
          {
            type: 'text',
            text: result.error
          }
        ],
        isError: true
      };
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error(`[MCP Server] Error executing tool ${toolName}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  console.error('MCP Server starting...');
  
  // Log configuration (with masked sensitive values)
  if (config.debug) {
    console.error('Configuration:', getMaskedConfig());
  }
  
  // Validate configuration
  if (!config.automationToken) {
    console.error('ERROR: AUTOMATION_API_TOKEN environment variable not set');
    process.exit(1);
  }
  
  if (!config.apiToken) {
    console.error('WARNING: MCP_API_TOKEN not set - authentication disabled');
  }
  
  // Create stdio transport for MCP communication
  const transport = new StdioServerTransport();
  
  // Connect the server to the transport
  await server.connect(transport);
  
  console.error(`MCP Server running on port ${config.port}`);
  console.error(`API Base URL: ${config.apiBaseUrl}`);
  console.error(`Tools available: ${tools.length}`);
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.error('MCP Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('MCP Server shutting down...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});