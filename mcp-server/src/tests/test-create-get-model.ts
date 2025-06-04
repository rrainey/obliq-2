// mcp-server/src/tests/test-create-get-model.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

const MCP_SERVER_PATH = path.join(__dirname, '../../dist/index.js');
const TEST_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

async function testCreateAndGetModel() {
  console.log('=== Testing Create and Get Model Flow ===\n');
  
  // Create transport and client
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
    env: {
      ...process.env,
      // Ensure all env vars are strings
      PATH: process.env.PATH || '',
      NODE_ENV: process.env.NODE_ENV || 'test'
    } as Record<string, string>
  });
  
  const client = new Client({
    name: 'test-create-get-model',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('Connected to MCP server\n');
    
    // Test 1: Create Model (expected to fail with current API)
    console.log('1. Testing create_model...');
    try {
      const createResult = await client.callTool({
        name: 'create_model',
        arguments: {
          name: 'Test Model',
          description: 'Created via MCP test',
          _auth: TEST_TOKEN
        }
      }) as any;
      
      console.log('Create result:', createResult.content?.[0]);
    } catch (error) {
      console.log('Create error:', error);
    }
    
    console.log('\n2. Testing get_model with valid UUID format...');
    try {
      const getResult = await client.callTool({
        name: 'get_model',
        arguments: {
          modelId: '550e8400-e29b-41d4-a716-446655440000',
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = getResult.content?.[0];
      if (content?.type === 'text') {
        const result = JSON.parse(content.text);
        console.log('Get model result:', result);
      }
    } catch (error) {
      console.log('Get model error (expected if model doesn\'t exist):', error);
    }
    
    console.log('\n3. Testing get_model with invalid UUID...');
    try {
      const invalidResult = await client.callTool({
        name: 'get_model',
        arguments: {
          modelId: 'not-a-uuid',
          _auth: TEST_TOKEN
        }
      }) as any;
      
      console.log('Invalid UUID result:', invalidResult.content?.[0]);
    } catch (error) {
      console.log('Invalid UUID error:', error);
    }
    
    console.log('\n4. Testing get_model with version parameter...');
    try {
      const versionResult = await client.callTool({
        name: 'get_model',
        arguments: {
          modelId: '550e8400-e29b-41d4-a716-446655440000',
          version: 2,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = versionResult.content?.[0];
      if (content?.type === 'text') {
        console.log('Version result:', content.text);
      }
    } catch (error) {
      console.log('Version error:', error);
    }
    
    console.log('\n=== Test completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
  }
}

// Run test
testCreateAndGetModel().catch(console.error);