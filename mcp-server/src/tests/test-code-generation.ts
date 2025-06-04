// mcp-server/src/tests/test-code-generation.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

const MCP_SERVER_PATH = path.join(__dirname, '../../dist/index.js');
const TEST_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

// Test model ID - use a real one if available
const TEST_MODEL_ID = '550e8400-e29b-41d4-a716-446655440000';

async function testCodeGeneration() {
  console.log('=== Testing Code Generation Flow ===\n');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
    env: {
      ...process.env,
      PATH: process.env.PATH || '',
      NODE_ENV: process.env.NODE_ENV || 'test',
      AUTOMATION_API_TOKEN: process.env.AUTOMATION_API_TOKEN || '',
      MCP_API_BASE_URL: process.env.MCP_API_BASE_URL || 'http://localhost:3000'
    } as Record<string, string>
  });
  
  const client = new Client({
    name: 'test-code-generation',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('Connected to MCP server\n');
    
    console.log('1. Testing generate_code with default (latest) version...');
    try {
      const result = await client.callTool({
        name: 'generate_code',
        arguments: {
          modelId: TEST_MODEL_ID,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        console.log('Code generation result:');
        console.log('  Success:', data.success);
        console.log('  Files generated:', data.filesGenerated || []);
        console.log('  Summary:', data.summary || {});
      }
    } catch (error) {
      console.log('Code generation error (expected if model doesn\'t exist):', error);
    }
    
    console.log('\n2. Testing generate_code with specific version...');
    try {
      const result = await client.callTool({
        name: 'generate_code',
        arguments: {
          modelId: TEST_MODEL_ID,
          version: 3,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        console.log('Version-specific generation:');
        console.log('  Files:', data.filesGenerated);
        console.log('  Blocks processed:', data.summary?.blocksProcessed);
        console.log('  Wires processed:', data.summary?.wiresProcessed);
      }
    } catch (error) {
      console.log('Version-specific error:', error);
    }
    
    console.log('\n3. Testing generate_code with invalid model ID...');
    try {
      const result = await client.callTool({
        name: 'generate_code',
        arguments: {
          modelId: 'invalid-uuid-format',
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      console.log('Invalid model ID result:', content?.text);
    } catch (error) {
      console.log('Invalid model ID error:', error);
    }
    
    console.log('\n4. Testing get_generated_files...');
    try {
      const result = await client.callTool({
        name: 'get_generated_files',
        arguments: {
          modelId: TEST_MODEL_ID,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      console.log('Get generated files result:', content?.text);
    } catch (error) {
      console.log('Get generated files error:', error);
    }
    
    console.log('\n5. Testing get_generated_files with version...');
    try {
      const result = await client.callTool({
        name: 'get_generated_files',
        arguments: {
          modelId: TEST_MODEL_ID,
          version: 2,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      console.log('Get versioned files result:', content?.text);
    } catch (error) {
      console.log('Get versioned files error:', error);
    }
    
    console.log('\n6. Expected generated files for a typical model:');
    console.log('  - ModelName.h (header file with structs and function prototypes)');
    console.log('  - ModelName.c (implementation with init, step, and derivatives functions)');
    console.log('  - library.properties (PlatformIO library metadata)');
    console.log('\nThe automation API generates these files on-demand but doesn\'t store them.');
    
    console.log('\n=== Test completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
  }
}

// Run test
testCodeGeneration().catch(console.error);