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
import {
  validateModelTool,
  listSheetLabelsTool,
  validateSheetLabelsTool
} from './tools/validation.js';
import {
  generateCodeTool,
  getGeneratedFilesTool
} from './tools/code-generation.js';

import {
  batchExecuteTool
} from './tools/batch-operations.js';

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
  getSimulationResultsTool,
  // Validation
  validateModelTool,
  listSheetLabelsTool,
  validateSheetLabelsTool,
  // Code generation
  generateCodeTool,
  getGeneratedFilesTool,
  // Batch operations
  batchExecuteTool
];

// Export tools for batch operations
export { tools };

// Initialize MCP server
const server = new Server(
  {
    name: 'obliq2-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      // Note: MCP SDK doesn't have built-in batch support
      // Batch operations would need to be implemented as a special tool
    },
  }
);

// Error handler
server.onerror = (error) => {
  console.error('[MCP Server Error]', error);
};

// Request logging middleware
function logRequest(toolName: string, args: any, startTime: number, result: any, error?: any) {
  const duration = Date.now() - startTime;
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    tool: toolName,
    duration: `${duration}ms`,
    success: !error && result?.success !== false,
    ...(config.debug && { args }),
    ...(error && { error: error instanceof Error ? error.message : String(error) })
  };
  
  console.error(`[MCP Request] ${JSON.stringify(logEntry)}`);
}

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const startTime = Date.now();
  
  try {
    const response = {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
    
    if (config.debug) {
      console.error(`[MCP Request] list_tools completed in ${Date.now() - startTime}ms`);
    }
    
    return response;
  } catch (error) {
    console.error('[MCP Request] list_tools failed:', error);
    throw error;
  }
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;
  const startTime = Date.now();
  let result: any;
  let error: any;
  
  try {
    // Log incoming request
    if (config.debug) {
      console.error(`[MCP Request] Starting ${toolName}`, { args });
    }
    
    // Authenticate the request
    //const authResult = authenticateRequest(toolName, args, request.params);

    const authResult = { authenticated: true, error: null }; // Placeholder for actual auth logic

    
    if (!authResult.authenticated) {
      error = authResult.error || 'Invalid token';
      return {
        content: [
          {
            type: 'text',
            text: `Authentication failed: ${error}`
          }
        ],
        isError: true
      };
    }
    
    // Find the tool
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      error = `Tool not found: ${toolName}`;
      return {
        content: [
          {
            type: 'text',
            text: `${error}. Available tools: ${tools.map(t => t.name).join(', ')}`
          }
        ],
        isError: true
      };
    }
    
    // Validate tool arguments against schema
    if (tool.inputSchema && tool.inputSchema.required) {
      const required = tool.inputSchema.required as string[];
      const missing = required.filter(field => !(args && typeof args === 'object' && field in args));
      
      if (missing.length > 0) {
        error = `Missing required parameters: ${missing.join(', ')}`;
        return {
          content: [
            {
              type: 'text',
              text: `Missing required parameters for ${toolName}: ${missing.join(', ')}`
            }
          ],
          isError: true
        };
      }
    }
    
    // Execute the tool with timeout
    const TOOL_TIMEOUT = 30000; // 30 seconds
    const handler = tool.handler as (args: unknown) => Promise<any>;
    const toolPromise = handler(args);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Tool execution timeout')), TOOL_TIMEOUT)
    );
    
    result = await Promise.race([toolPromise, timeoutPromise]);
    
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
    
  } catch (err) {
    error = err;
    console.error(`[MCP Server] Error executing tool ${toolName}:`, err);
    
    // Determine error type and message
    let errorMessage = 'Unknown error occurred';
    let errorDetails = '';
    
    if (err instanceof Error) {
      errorMessage = err.message;
      if (err.stack && config.debug) {
        errorDetails = `\n\nStack trace:\n${err.stack}`;
      }
    } else if (typeof err === 'string') {
      errorMessage = err;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${toolName}: ${errorMessage}${errorDetails}`
        }
      ],
      isError: true
    };
  } finally {
    // Log request completion
    logRequest(toolName, args, startTime, result, error);
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