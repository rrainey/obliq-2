// mcp-server/src/test-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import * as path from 'path';

// Test configuration
const MCP_SERVER_PATH = path.join(__dirname, '../dist/index.js');
const TEST_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

async function testMCPServer() {
  console.log('Starting MCP test client...\n');
  
  // Spawn the MCP server
  const serverProcess = spawn('node', [MCP_SERVER_PATH], {
    env: {
      ...process.env,
      MCP_DEBUG: 'true'
    }
  });
  
  // Create stdio transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
    env: {
      ...process.env,
      MCP_DEBUG: 'true'
    }
  });
  
  // Create client
  const client = new Client({
    name: 'mcp-test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    // Connect to server
    console.log('Connecting to MCP server...');
    await client.connect(transport);
    console.log('Connected successfully!\n');
    
    // List available tools
    console.log('Listing available tools...');
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools:`);
    
    for (const tool of tools.tools) {
      console.log(`  - ${tool.name}: ${tool.description}`);
    }
    console.log('');
    
    // Test a simple tool call
    console.log('Testing get_model tool...');
    try {
      const result = await client.callTool({
        name: 'get_model',
        arguments: {
          modelId: '123e4567-e89b-12d3-a456-426614174000',
          _auth: TEST_TOKEN
        }
      });
      
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.log('Expected error (model not found):', error);
    }
    
    console.log('\nMCP server test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up
    await client.close();
    serverProcess.kill();
  }
}

// Run the test
testMCPServer().catch(console.error);