// mcp-server/src/tests/test-simulation-execution.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

const MCP_SERVER_PATH = path.join(__dirname, '../../dist/index.js');
const TEST_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

// Use a real model ID if you have one, or this will fail (expected)
const TEST_MODEL_ID = '550e8400-e29b-41d4-a716-446655440000';

async function testSimulationExecution() {
  console.log('=== Testing Simulation Execution Flow ===\n');
  
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
    name: 'test-simulation-execution',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('Connected to MCP server\n');
    
    console.log('1. Testing simulation with default parameters...');
    try {
      const result = await client.callTool({
        name: 'run_simulation',
        arguments: {
          modelId: TEST_MODEL_ID,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        console.log('Simulation result:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.log('Default simulation error (expected if model doesn\'t exist):', error);
    }
    
    console.log('\n2. Testing simulation with custom parameters...');
    try {
      const result = await client.callTool({
        name: 'run_simulation',
        arguments: {
          modelId: TEST_MODEL_ID,
          timeStep: 0.001,
          duration: 5.0,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        console.log('Custom parameters result:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.log('Custom parameters error:', error);
    }
    
    console.log('\n3. Testing simulation with specific version...');
    try {
      const result = await client.callTool({
        name: 'run_simulation',
        arguments: {
          modelId: TEST_MODEL_ID,
          version: 2,
          duration: 2.0,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        console.log('Version-specific result:', JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.log('Version-specific error:', error);
    }
    
    console.log('\n4. Testing simulation with invalid parameters...');
    try {
      const result = await client.callTool({
        name: 'run_simulation',
        arguments: {
          modelId: TEST_MODEL_ID,
          timeStep: -0.1,  // Invalid negative timestep
          duration: 0,     // Invalid zero duration
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      console.log('Invalid parameters result:', content?.text);
    } catch (error) {
      console.log('Invalid parameters error:', error);
    }
    
    console.log('\n5. Testing simulation with extreme parameters...');
    try {
      const result = await client.callTool({
        name: 'run_simulation',
        arguments: {
          modelId: TEST_MODEL_ID,
          timeStep: 0.0001,  // Minimum allowed
          duration: 3600,    // Maximum allowed (1 hour)
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        console.log('Extreme parameters result:', content.text);
      }
    } catch (error) {
      console.log('Extreme parameters error:', error);
    }
    
    console.log('\n6. Testing get_simulation_results...');
    try {
      const result = await client.callTool({
        name: 'get_simulation_results',
        arguments: {
          modelId: TEST_MODEL_ID,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      console.log('Get results response:', content?.text);
    } catch (error) {
      console.log('Get results error:', error);
    }
    
    console.log('\n7. Testing get_simulation_results with block ID...');
    try {
      const result = await client.callTool({
        name: 'get_simulation_results',
        arguments: {
          modelId: TEST_MODEL_ID,
          blockId: '123e4567-e89b-12d3-a456-426614174001',
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      console.log('Get results with block ID response:', content?.text);
    } catch (error) {
      console.log('Get results with block ID error:', error);
    }
    
    console.log('\n=== Test completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
  }
}

// Run test
testSimulationExecution().catch(console.error);