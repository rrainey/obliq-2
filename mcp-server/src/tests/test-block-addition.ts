// mcp-server/src/tests/test-block-addition.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

const MCP_SERVER_PATH = path.join(__dirname, '../../dist/index.js');
const TEST_TOKEN = process.env.MCP_API_TOKEN || 'test-token';
const TEST_MODEL_ID = '550e8400-e29b-41d4-a716-446655440000';

async function testBlockAddition() {
  console.log('=== Testing Block Addition Flow ===\n');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
    env: {
      ...process.env,
      PATH: process.env.PATH || '',
      NODE_ENV: process.env.NODE_ENV || 'test'
    } as Record<string, string>
  });
  
  const client = new Client({
    name: 'test-block-addition',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('Connected to MCP server\n');
    
    // Test various block types
    const blockTypes = [
      { type: 'sum', name: 'Sum Block 1' },
      { type: 'multiply', name: 'Multiplier' },
      { type: 'transfer_function', name: 'TF Block' },
      { type: 'signal_display', name: 'Display 1' },
      { type: 'signal_logger', name: 'Logger 1' },
      { type: 'input_port', name: 'Input 1' },
      { type: 'output_port', name: 'Output 1' },
      { type: 'source', name: 'Source Signal' },
      { type: 'scale', name: 'Gain Block' },
      { type: 'lookup_1d', name: '1D Lookup' },
      { type: 'lookup_2d', name: '2D Lookup' },
      { type: 'subsystem', name: 'Subsystem 1' },
      { type: 'sheet_label_sink', name: 'Label Sink' },
      { type: 'sheet_label_source', name: 'Label Source' }
    ];
    
    console.log('Testing add_block with various block types:\n');
    
    for (const block of blockTypes) {
      console.log(`Testing ${block.type}...`);
      try {
        const result = await client.callTool({
          name: 'add_block',
          arguments: {
            modelId: TEST_MODEL_ID,
            sheetId: 'main',
            blockType: block.type,
            name: block.name,
            position: { x: 100, y: 100 },
            _auth: TEST_TOKEN
          }
        }) as any;
        
        const content = result.content?.[0];
        if (content?.type === 'text') {
          console.log(`  Result: ${content.text}`);
        }
      } catch (error) {
        console.log(`  Error: ${error}`);
      }
    }
    
    console.log('\n2. Testing add_block with invalid block type...');
    try {
      const invalidResult = await client.callTool({
        name: 'add_block',
        arguments: {
          modelId: TEST_MODEL_ID,
          sheetId: 'main',
          blockType: 'invalid_type',
          position: { x: 200, y: 200 },
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = invalidResult.content?.[0];
      console.log('Invalid type result:', content?.text);
    } catch (error) {
      console.log('Invalid type error:', error);
    }
    
    console.log('\n3. Testing add_block with parameters...');
    try {
      const paramResult = await client.callTool({
        name: 'add_block',
        arguments: {
          modelId: TEST_MODEL_ID,
          sheetId: 'main',
          blockType: 'scale',
          name: 'Gain_2',
          position: { x: 300, y: 300 },
          parameters: {
            gain: 2.5
          },
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = paramResult.content?.[0];
      console.log('Block with parameters result:', content?.text);
    } catch (error) {
      console.log('Parameters error:', error);
    }
    
    console.log('\n4. Testing add_block without required fields...');
    try {
      const missingResult = await client.callTool({
        name: 'add_block',
        arguments: {
          modelId: TEST_MODEL_ID,
          sheetId: 'main',
          // Missing blockType and position
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = missingResult.content?.[0];
      console.log('Missing fields result:', content?.text);
    } catch (error) {
      console.log('Missing fields error:', error);
    }
    
    console.log('\n=== Test completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
  }
}

// Run test
testBlockAddition().catch(console.error);