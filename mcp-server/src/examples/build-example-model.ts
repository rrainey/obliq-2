// mcp-server/src/examples/build-example-model.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

const MCP_SERVER_PATH = path.join(__dirname, '../../dist/index.js');
const TEST_TOKEN = process.env.MCP_API_TOKEN || 'test-token';

// This script demonstrates how to build a complete model with multiple sheets
// and sheet labels, showcasing what will be possible with the Model Builder API

async function buildExampleModel() {
  console.log('=== Example Model Builder Script ===\n');
  console.log('This demonstrates building a multi-sheet control system model.\n');
  
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
    name: 'example-model-builder',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  try {
    await client.connect(transport);
    console.log('Connected to MCP server\n');
    
    // Define the model structure
    const modelPlan = {
      name: 'Temperature Control System',
      description: 'PID controller with plant model and signal conditioning',
      sheets: [
        {
          id: 'main',
          name: 'Main Control Loop',
          blocks: [
            { id: 'setpoint', type: 'source', name: 'Temperature_Setpoint', x: 100, y: 200, params: { dataType: 'double', value: 25.0 } },
            { id: 'sensor', type: 'input_port', name: 'Temp_Sensor', x: 100, y: 300, params: { dataType: 'double', portName: 'sensor_input' } },
            { id: 'error_sum', type: 'sum', name: 'Error_Calc', x: 300, y: 250 },
            { id: 'controller_label', type: 'sheet_label_sink', name: 'To_Controller', x: 500, y: 250, params: { signalName: 'error_signal' } },
            { id: 'actuator_label', type: 'sheet_label_source', name: 'From_Controller', x: 100, y: 400, params: { signalName: 'control_signal' } },
            { id: 'plant_label', type: 'sheet_label_sink', name: 'To_Plant', x: 300, y: 400, params: { signalName: 'actuator_command' } },
            { id: 'feedback_label', type: 'sheet_label_source', name: 'From_Plant', x: 100, y: 500, params: { signalName: 'plant_output' } },
            { id: 'output', type: 'output_port', name: 'System_Output', x: 300, y: 500, params: { portName: 'temperature_out' } },
            { id: 'display', type: 'signal_display', name: 'Temperature_Display', x: 500, y: 500 }
          ],
          connections: [
            { from: 'setpoint', fromPort: 0, to: 'error_sum', toPort: 0 },
            { from: 'sensor', fromPort: 0, to: 'error_sum', toPort: 1 },
            { from: 'error_sum', fromPort: 0, to: 'controller_label', toPort: 0 },
            { from: 'actuator_label', fromPort: 0, to: 'plant_label', toPort: 0 },
            { from: 'feedback_label', fromPort: 0, to: 'output', toPort: 0 },
            { from: 'feedback_label', fromPort: 0, to: 'display', toPort: 0 }
          ]
        },
        {
          id: 'controller',
          name: 'PID Controller',
          blocks: [
            { id: 'error_in', type: 'sheet_label_source', name: 'Error_In', x: 100, y: 200, params: { signalName: 'error_signal' } },
            { id: 'p_gain', type: 'scale', name: 'P_Gain', x: 300, y: 150, params: { gain: 2.5 } },
            { id: 'integrator', type: 'transfer_function', name: 'Integrator', x: 300, y: 250, params: { numerator: [1], denominator: [1, 0] } },
            { id: 'i_gain', type: 'scale', name: 'I_Gain', x: 500, y: 250, params: { gain: 0.5 } },
            { id: 'derivative', type: 'transfer_function', name: 'Derivative', x: 300, y: 350, params: { numerator: [1, 0], denominator: [0.1, 1] } },
            { id: 'd_gain', type: 'scale', name: 'D_Gain', x: 500, y: 350, params: { gain: 0.1 } },
            { id: 'pid_sum', type: 'sum', name: 'PID_Sum', x: 700, y: 250 },
            { id: 'control_out', type: 'sheet_label_sink', name: 'Control_Out', x: 900, y: 250, params: { signalName: 'control_signal' } }
          ],
          connections: [
            { from: 'error_in', fromPort: 0, to: 'p_gain', toPort: 0 },
            { from: 'error_in', fromPort: 0, to: 'integrator', toPort: 0 },
            { from: 'error_in', fromPort: 0, to: 'derivative', toPort: 0 },
            { from: 'p_gain', fromPort: 0, to: 'pid_sum', toPort: 0 },
            { from: 'integrator', fromPort: 0, to: 'i_gain', toPort: 0 },
            { from: 'i_gain', fromPort: 0, to: 'pid_sum', toPort: 1 },
            { from: 'derivative', fromPort: 0, to: 'd_gain', toPort: 0 },
            { from: 'd_gain', fromPort: 0, to: 'pid_sum', toPort: 2 },
            { from: 'pid_sum', fromPort: 0, to: 'control_out', toPort: 0 }
          ]
        },
        {
          id: 'plant',
          name: 'Plant Model',
          blocks: [
            { id: 'actuator_in', type: 'sheet_label_source', name: 'Actuator_In', x: 100, y: 200, params: { signalName: 'actuator_command' } },
            { id: 'actuator_dynamics', type: 'transfer_function', name: 'Actuator', x: 300, y: 200, params: { numerator: [1], denominator: [0.5, 1] } },
            { id: 'heater_gain', type: 'scale', name: 'Heater_Power', x: 500, y: 200, params: { gain: 100 } },
            { id: 'thermal_mass', type: 'transfer_function', name: 'Thermal_Mass', x: 700, y: 200, params: { numerator: [0.01], denominator: [10, 1] } },
            { id: 'ambient_temp', type: 'source', name: 'Ambient', x: 500, y: 350, params: { dataType: 'double', value: 20.0 } },
            { id: 'temp_sum', type: 'sum', name: 'Temp_Sum', x: 900, y: 250 },
            { id: 'noise', type: 'source', name: 'Sensor_Noise', x: 700, y: 350, params: { signalType: 'noise', amplitude: 0.1 } },
            { id: 'measured_temp', type: 'sum', name: 'Measured', x: 1100, y: 250 },
            { id: 'plant_out', type: 'sheet_label_sink', name: 'Plant_Out', x: 1300, y: 250, params: { signalName: 'plant_output' } }
          ],
          connections: [
            { from: 'actuator_in', fromPort: 0, to: 'actuator_dynamics', toPort: 0 },
            { from: 'actuator_dynamics', fromPort: 0, to: 'heater_gain', toPort: 0 },
            { from: 'heater_gain', fromPort: 0, to: 'thermal_mass', toPort: 0 },
            { from: 'thermal_mass', fromPort: 0, to: 'temp_sum', toPort: 0 },
            { from: 'ambient_temp', fromPort: 0, to: 'temp_sum', toPort: 1 },
            { from: 'temp_sum', fromPort: 0, to: 'measured_temp', toPort: 0 },
            { from: 'noise', fromPort: 0, to: 'measured_temp', toPort: 1 },
            { from: 'measured_temp', fromPort: 0, to: 'plant_out', toPort: 0 }
          ]
        }
      ]
    };
    
    console.log('Model Structure:');
    console.log(`- Name: ${modelPlan.name}`);
    console.log(`- Sheets: ${modelPlan.sheets.length}`);
    modelPlan.sheets.forEach(sheet => {
      console.log(`  - ${sheet.name}: ${sheet.blocks.length} blocks, ${sheet.connections.length} connections`);
    });
    
    console.log('\nSheet Label Connections:');
    console.log('- error_signal: Main → Controller');
    console.log('- control_signal: Controller → Main');
    console.log('- actuator_command: Main → Plant');
    console.log('- plant_output: Plant → Main');
    
    console.log('\nExecuting batch operation to build model...\n');
    
    // Build the operations list
    const operations: any[] = [];
    
    // First create the model (would work with Model Builder API)
    operations.push({
      tool: 'create_model',
      arguments: {
        name: modelPlan.name,
        description: modelPlan.description,
        _auth: TEST_TOKEN
      }
    });
    
    // Add sheets
    for (const sheet of modelPlan.sheets) {
      if (sheet.id !== 'main') {  // main sheet exists by default
        operations.push({
          tool: 'add_sheet',
          arguments: {
            modelId: 'MODEL_ID_PLACEHOLDER',
            sheetName: sheet.name,
            _auth: TEST_TOKEN
          }
        });
      }
      
      // Add blocks to sheet
      for (const block of sheet.blocks) {
        operations.push({
          tool: 'add_block',
          arguments: {
            modelId: 'MODEL_ID_PLACEHOLDER',
            sheetId: sheet.id,
            blockType: block.type,
            name: block.name,
            position: { x: block.x, y: block.y },
            parameters: block.params,
            _auth: TEST_TOKEN
          }
        });
      }
      
      // Add connections
      for (const conn of sheet.connections) {
        operations.push({
          tool: 'add_connection',
          arguments: {
            modelId: 'MODEL_ID_PLACEHOLDER',
            sheetId: sheet.id,
            sourceBlockId: conn.from,
            sourcePortIndex: conn.fromPort,
            targetBlockId: conn.to,
            targetPortIndex: conn.toPort,
            _auth: TEST_TOKEN
          }
        });
      }
    }
    
    // Execute batch operation
    try {
      const result = await client.callTool({
        name: 'batch_execute',
        arguments: {
          operations: operations.slice(0, 5), // Just show first 5 operations
          transactional: true,
          stopOnError: true,
          _auth: TEST_TOKEN
        }
      }) as any;
      
      const content = result.content?.[0];
      if (content?.type === 'text') {
        console.log('Batch execution result:', content.text);
      }
    } catch (error) {
      console.log('Batch execution error:', error);
    }
    
    console.log(`\nTotal operations that would be executed: ${operations.length}`);
    console.log('\nThis example demonstrates:');
    console.log('- Multi-sheet model structure');
    console.log('- Sheet label connections between sheets');
    console.log('- Complete PID control system');
    console.log('- Batch operations with transactions');
    console.log('\nWith the Model Builder API, this would create a fully functional model!');
    
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await client.close();
  }
}

// Run the example
buildExampleModel().catch(console.error);