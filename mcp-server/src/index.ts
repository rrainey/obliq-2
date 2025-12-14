// mcp-server/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { config, getMaskedConfig } from './config.js';
import { ToolWithHandler } from './types.js';
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
  deleteConnectionTool,
  listParametersTool,
  setParameterTool,
  deleteParameterTool
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
import {
  listBlockTypesTool,
  listBlockTypesSummaryTool
} from './tools/block-types.js';

// Determine transport mode from command line or environment
const useHttpMode = process.argv.includes('--http') || process.env.MCP_HTTP_MODE === 'true';

// Collect all tools
const tools: ToolWithHandler[] = [
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
  // Model parameters
  listParametersTool,
  setParameterTool,
  deleteParameterTool,
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
  batchExecuteTool,
  // Block type information
  listBlockTypesTool,
  listBlockTypesSummaryTool
];

// Export tools for batch operations
export { tools };

// Request logging
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

// Create MCP server
const server = new McpServer({
  name: 'obliq2-mcp-server',
  version: '2.0.0',
}, {
  capabilities: {
    tools: {}
  }
});

// Build a map for quick tool lookup
const toolMap = new Map<string, ToolWithHandler>();
for (const tool of tools) {
  toolMap.set(tool.name, tool);
}

// Register tools using the low-level Server API to preserve raw JSON Schema
// The high-level McpServer.tool() method expects Zod schemas, but our tools use raw JSON Schema
server.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool): Tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Tool['inputSchema']
    }))
  };
});

server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap.get(name);

  if (!tool) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      isError: true
    };
  }

  const startTime = Date.now();
  let result: any;
  let error: any;

  try {
    if (config.debug) {
      console.error(`[MCP Request] Starting ${name}`, { args });
    }

    // Execute with timeout
    const TOOL_TIMEOUT = 30000;
    const toolPromise = tool.handler(args);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tool execution timeout')), TOOL_TIMEOUT)
    );

    result = await Promise.race([toolPromise, timeoutPromise]);

    // Format response
    if (result.success === false && result.error) {
      return {
        content: [{ type: 'text' as const, text: result.error }],
        isError: true
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };

  } catch (err) {
    error = err;
    console.error(`[MCP Server] Error executing tool ${name}:`, err);

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
      content: [{ type: 'text' as const, text: `Error executing tool ${name}: ${errorMessage}${errorDetails}` }],
      isError: true
    };
  } finally {
    logRequest(name, args, startTime, result, error);
  }
});

// ============================================
// STDIO MODE (for Claude Desktop)
// ============================================
async function runStdioMode() {
  console.error('MCP Server starting in STDIO mode (for Claude Desktop)...');

  if (config.debug) {
    console.error('Configuration:', getMaskedConfig());
  }

  if (!config.apiToken) {
    console.error('WARNING: MCP_API_TOKEN not set - API calls will fail');
    console.error('Please set a user-specific API token. Generate one at: /settings/tokens');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('MCP Server connected via stdio');
  console.error(`API Base URL: ${config.apiBaseUrl}`);
  console.error(`Tools available: ${tools.length}`);
}

// ============================================
// HTTP MODE (for programmatic access)
// ============================================
async function runHttpMode() {
  console.error('MCP Server starting in HTTP mode...');

  if (config.debug) {
    console.error('Configuration:', getMaskedConfig());
  }

  if (!config.apiToken) {
    console.error('WARNING: MCP_API_TOKEN not set - API calls will fail');
    console.error('Please set a user-specific API token. Generate one at: /settings/tokens');
  }

  // Create Express app for HTTP transport
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Store active transports for session management
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      server: 'obliq2-mcp-server',
      tools: tools.length,
      activeSessions: transports.size
    });
  });

  // List available tools (for debugging)
  app.get('/tools', (_req: Request, res: Response) => {
    res.json({
      tools: tools.map(t => ({
        name: t.name,
        description: t.description
      }))
    });
  });

  // MCP endpoint - handles all MCP protocol messages
  app.all('/mcp', async (req: Request, res: Response) => {
    let sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      sessionId = randomUUID();
      console.error(`[MCP Server] New session: ${sessionId}`);
    }

    let transport = transports.get(sessionId);

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId!,
        onsessioninitialized: (id) => {
          console.error(`[MCP Server] Session initialized: ${id}`);
        }
      });

      transports.set(sessionId, transport);
      await server.connect(transport);

      transport.onclose = () => {
        console.error(`[MCP Server] Session closed: ${sessionId}`);
        transports.delete(sessionId!);
      };
    }

    await transport.handleRequest(req, res);
  });

  // Session cleanup endpoint
  app.delete('/mcp/session/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const transport = transports.get(sessionId);

    if (transport) {
      transport.close();
      transports.delete(sessionId);
      res.json({ success: true, message: 'Session closed' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // Start HTTP server
  app.listen(config.port, () => {
    console.error(`MCP Server running on http://localhost:${config.port}`);
    console.error(`MCP endpoint: http://localhost:${config.port}/mcp`);
    console.error(`Health check: http://localhost:${config.port}/health`);
    console.error(`Tools list: http://localhost:${config.port}/tools`);
    console.error(`API Base URL: ${config.apiBaseUrl}`);
    console.error(`Tools available: ${tools.length}`);
  });
}

// ============================================
// MAIN ENTRY POINT
// ============================================
async function main() {
  if (useHttpMode) {
    await runHttpMode();
  } else {
    await runStdioMode();
  }
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
