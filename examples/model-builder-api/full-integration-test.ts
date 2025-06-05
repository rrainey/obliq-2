// examples/model-builder-api/full-integration-test.ts
import * as dotenv from 'dotenv';
import { createModelBuilderApiClient } from '../../lib/modelBuilderApiClient';

// Load environment variables
dotenv.config();

const API_URL = process.env.MODEL_BUILDER_API_URL || 'http://localhost:3000/api/model-builder';
const API_TOKEN = process.env.MODEL_BUILDER_API_TOKEN || '';
const USER_ID = '00000000-0000-0000-0000-000000000000';

// Test result tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const testResults: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    testResults.push({
      name,
      passed: true,
      duration: Date.now() - startTime
    });
    console.log(`✅ ${name}`);
  } catch (error) {
    testResults.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    });
    console.log(`❌ ${name}: ${error}`);
  }
}

async function fullIntegrationTest() {
  console.log('🚀 Starting Model Builder API Full Integration Test\n');
  
  const client = createModelBuilderApiClient(API_URL, API_TOKEN);
  let modelId: string;
  let sheetIds: Record<string, string> = {};
  let blockIds: Record<string, string> = {};
  let connectionIds: string[] = [];

  // Test 1: Create Model
  await runTest('Create Model', async () => {
    const response = await client.createModel('Integration Test Model', USER_ID);
    if (!client.isSuccess(response)) throw new Error(response.error);
    modelId = response.data.id;
    if (!modelId) throw new Error('No model ID returned');
  });

  // Test 2: Get Model
  await runTest('Get Model', async () => {
    const response = await client.getModel(modelId);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.id !== modelId) throw new Error('Model ID mismatch');
  });

  // Test 3: Update Model Name
  await runTest('Update Model Name', async () => {
    const response = await client.updateModelName(modelId, 'Updated Test Model');
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 4: Create Multiple Sheets
  await runTest('Create Multiple Sheets', async () => {
    const sheet1 = await client.createSheet(modelId, 'Input Processing');
    if (!client.isSuccess(sheet1)) throw new Error(sheet1.error);
    sheetIds.input = sheet1.data.id;

    const sheet2 = await client.createSheet(modelId, 'Main Logic');
    if (!client.isSuccess(sheet2)) throw new Error(sheet2.error);
    sheetIds.main = sheet2.data.id;

    const sheet3 = await client.createSheet(modelId, 'Output Stage');
    if (!client.isSuccess(sheet3)) throw new Error(sheet3.error);
    sheetIds.output = sheet3.data.id;
  });

  // Test 5: List Sheets
  await runTest('List Sheets', async () => {
    const response = await client.listSheets(modelId);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.sheets.length !== 3) throw new Error('Expected 3 sheets');
  });

  // Test 6: Rename Sheet
  await runTest('Rename Sheet', async () => {
    const response = await client.renameSheet(modelId, sheetIds.main, 'Core Processing');
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 7: Add Various Block Types
  await runTest('Add All Block Types', async () => {
    // Source blocks
    const source = await client.addBlock(modelId, sheetIds.input, 'source', 'Input1', { x: 100, y: 100 }, { value: '5.0', dataType: 'double' });
    if (!client.isSuccess(source)) throw new Error(source.error);
    blockIds.source = source.data.id;

    // Input port
    const inputPort = await client.addBlock(modelId, sheetIds.input, 'input_port', 'ExtInput', { x: 100, y: 200 }, { signalName: 'external_in', dataType: 'double' });
    if (!client.isSuccess(inputPort)) throw new Error(inputPort.error);
    blockIds.inputPort = inputPort.data.id;

    // Math blocks
    const sum = await client.addBlock(modelId, sheetIds.main, 'sum', 'Adder', { x: 300, y: 150 }, { numInputs: 2 });
    if (!client.isSuccess(sum)) throw new Error(sum.error);
    blockIds.sum = sum.data.id;

    const mult = await client.addBlock(modelId, sheetIds.main, 'multiply', 'Multiplier', { x: 500, y: 150 }, { numInputs: 2 });
    if (!client.isSuccess(mult)) throw new Error(mult.error);
    blockIds.mult = mult.data.id;

    const scale = await client.addBlock(modelId, sheetIds.main, 'scale', 'Gain', { x: 700, y: 150 }, { factor: 2.5 });
    if (!client.isSuccess(scale)) throw new Error(scale.error);
    blockIds.scale = scale.data.id;

    // Transfer function
    const tf = await client.addBlock(modelId, sheetIds.main, 'transfer_function', 'Filter', { x: 900, y: 150 }, { numerator: [1], denominator: [0.1, 1] });
    if (!client.isSuccess(tf)) throw new Error(tf.error);
    blockIds.tf = tf.data.id;

    // Lookup tables
    const lookup1d = await client.addBlock(modelId, sheetIds.main, 'lookup_1d', 'Map1D', { x: 300, y: 300 }, { 
      inputValues: [0, 1, 2, 3], 
      outputValues: [0, 10, 40, 90],
      extrapolation: 'clamp'
    });
    if (!client.isSuccess(lookup1d)) throw new Error(lookup1d.error);
    blockIds.lookup1d = lookup1d.data.id;

    // Sheet labels
    const labelSink = await client.addBlock(modelId, sheetIds.main, 'sheet_label_sink', 'ToOutput', { x: 1100, y: 150 }, { signalName: 'processed' });
    if (!client.isSuccess(labelSink)) throw new Error(labelSink.error);
    blockIds.labelSink = labelSink.data.id;

    const labelSource = await client.addBlock(modelId, sheetIds.output, 'sheet_label_source', 'FromMain', { x: 100, y: 100 }, { signalName: 'processed' });
    if (!client.isSuccess(labelSource)) throw new Error(labelSource.error);
    blockIds.labelSource = labelSource.data.id;

    // Output blocks
    const display = await client.addBlock(modelId, sheetIds.output, 'signal_display', 'Monitor', { x: 300, y: 100 });
    if (!client.isSuccess(display)) throw new Error(display.error);
    blockIds.display = display.data.id;

    const outputPort = await client.addBlock(modelId, sheetIds.output, 'output_port', 'SystemOut', { x: 500, y: 100 }, { signalName: 'final_output' });
    if (!client.isSuccess(outputPort)) throw new Error(outputPort.error);
    blockIds.outputPort = outputPort.data.id;
  });

  // Test 8: List Blocks
  await runTest('List Blocks', async () => {
    const response = await client.listBlocks(modelId, sheetIds.main);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.blocks.length < 5) throw new Error('Expected at least 5 blocks on main sheet');
  });

  // Test 9: Get Block Details
  await runTest('Get Block Details', async () => {
    const response = await client.getBlock(modelId, sheetIds.main, blockIds.tf);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.type !== 'transfer_function') throw new Error('Wrong block type');
  });

  // Test 10: Update Block Position
  await runTest('Update Block Position', async () => {
    const response = await client.updateBlockPosition(modelId, sheetIds.main, blockIds.sum, { x: 350, y: 175 });
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 11: Update Block Name
  await runTest('Update Block Name', async () => {
    const response = await client.updateBlockName(modelId, sheetIds.main, blockIds.scale, 'MainGain');
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 12: Update Block Parameters
  await runTest('Update Block Parameters', async () => {
    const response = await client.updateBlockParameters(modelId, sheetIds.main, blockIds.scale, { factor: 3.5 });
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 13: Create Connections
  await runTest('Create Complex Connections', async () => {
    // Connect within main sheet
    const conn1 = await client.addConnection(modelId, sheetIds.main, blockIds.sum, 'output', blockIds.mult, 'input0');
    if (!client.isSuccess(conn1)) throw new Error(conn1.error);
    connectionIds.push(conn1.data.id);

    const conn2 = await client.addConnection(modelId, sheetIds.main, blockIds.mult, 'output', blockIds.scale, 'input');
    if (!client.isSuccess(conn2)) throw new Error(conn2.error);
    connectionIds.push(conn2.data.id);

    const conn3 = await client.addConnection(modelId, sheetIds.main, blockIds.scale, 'output', blockIds.tf, 'input');
    if (!client.isSuccess(conn3)) throw new Error(conn3.error);
    connectionIds.push(conn3.data.id);

    const conn4 = await client.addConnection(modelId, sheetIds.main, blockIds.tf, 'output', blockIds.labelSink, 'input');
    if (!client.isSuccess(conn4)) throw new Error(conn4.error);
    connectionIds.push(conn4.data.id);

    // Connect across sheets via sheet labels
    const conn5 = await client.addConnection(modelId, sheetIds.output, blockIds.labelSource, 'output', blockIds.display, 'input');
    if (!client.isSuccess(conn5)) throw new Error(conn5.error);
    connectionIds.push(conn5.data.id);

    const conn6 = await client.addConnection(modelId, sheetIds.output, blockIds.labelSource, 'output', blockIds.outputPort, 'input');
    if (!client.isSuccess(conn6)) throw new Error(conn6.error);
    connectionIds.push(conn6.data.id);
  });

  // Test 14: List Connections
  await runTest('List Connections', async () => {
    const response = await client.listConnections(modelId, sheetIds.main);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.connections.length < 4) throw new Error('Expected at least 4 connections on main sheet');
  });

  // Test 15: Get Connection Details
  await runTest('Get Connection Details', async () => {
    const response = await client.getConnection(modelId, sheetIds.main, connectionIds[0]);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 16: Get Block Ports
  await runTest('Get Block Ports', async () => {
    const response = await client.getBlockPorts(modelId, sheetIds.main, blockIds.sum);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.inputs.length < 2) throw new Error('Sum block should have at least 2 inputs');
  });

  // Test 17: Validate Model
  await runTest('Validate Complete Model', async () => {
    const response = await client.validateModel(modelId);
    if (!client.isSuccess(response)) throw new Error(response.error);
    // Note: There might be warnings about unconnected ports, which is OK for this test
  });

  // Test 18: Batch Operations
  await runTest('Batch Operations', async () => {
    const operations = [
      {
        action: 'addBlock',
        modelId,
        sheetId: sheetIds.input,
        blockType: 'source',
        name: 'BatchSource1',
        position: { x: 100, y: 400 }
      },
      {
        action: 'addBlock',
        modelId,
        sheetId: sheetIds.input,
        blockType: 'source',
        name: 'BatchSource2',
        position: { x: 100, y: 500 }
      },
      {
        action: 'updateBlockParameters',
        modelId,
        sheetId: sheetIds.main,
        blockId: blockIds.tf,
        parameters: { numerator: [1, 0.5], denominator: [1, 2, 1] }
      }
    ];

    const response = await client.batchOperations(operations, false);
    if (!client.isSuccess(response)) throw new Error(response.error);
    if (response.data.summary.failed > 0) throw new Error('Some batch operations failed');
  });

  // Test 19: Clone Sheet
  await runTest('Clone Sheet', async () => {
    const response = await client.cloneSheet(modelId, sheetIds.main, 'Main Clone');
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 20: Export/Import Sheet
  await runTest('Export and Import Sheet', async () => {
    // Export
    const exportResp = await client.exportSheet(modelId, sheetIds.main);
    if (!client.isSuccess(exportResp)) throw new Error(exportResp.error);
    const sheetData = exportResp.data;

    // Import to new sheet
    const importResp = await client.importSheet(modelId, sheetData, undefined, 'Imported Sheet');
    if (!client.isSuccess(importResp)) throw new Error(importResp.error);
  });

  // Test 21: Delete Connection
  await runTest('Delete Connection', async () => {
    const response = await client.deleteConnection(modelId, sheetIds.main, connectionIds[0]);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 22: Delete Block
  await runTest('Delete Block', async () => {
    const response = await client.deleteBlock(modelId, sheetIds.main, blockIds.lookup1d);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 23: Clear Sheet
  await runTest('Clear Sheet', async () => {
    const response = await client.clearSheet(modelId, sheetIds.input);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 24: Delete Sheet
  await runTest('Delete Sheet', async () => {
    const response = await client.deleteSheet(modelId, sheetIds.input);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 25: Get Model Metadata
  await runTest('Get Model Metadata', async () => {
    const response = await client.getModelMetadata(modelId);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Test 26: Error Handling - Invalid Block Type
  await runTest('Error Handling - Invalid Block Type', async () => {
    const response = await client.addBlock(modelId, sheetIds.main, 'invalid_type', 'BadBlock', { x: 0, y: 0 });
    if (client.isSuccess(response)) throw new Error('Should have failed with invalid block type');
  });

  // Test 27: Error Handling - Invalid Connection
  await runTest('Error Handling - Invalid Connection', async () => {
    // Try to connect output to output (should fail)
    const response = await client.addConnection(modelId, sheetIds.main, blockIds.sum, 'output', blockIds.mult, 'output');
    if (client.isSuccess(response)) throw new Error('Should have failed with invalid connection');
  });

  // Test 28: Transactional Batch (should rollback)
  await runTest('Transactional Batch Rollback', async () => {
    const operations = [
      {
        action: 'addBlock',
        modelId,
        sheetId: sheetIds.main,
        blockType: 'source',
        name: 'TxnSource',
        position: { x: 50, y: 50 }
      },
      {
        action: 'addBlock',
        modelId,
        sheetId: sheetIds.main,
        blockType: 'invalid_type', // This will fail
        name: 'TxnBad',
        position: { x: 150, y: 50 }
      }
    ];

    const response = await client.batchOperations(operations, true);
    if (client.isSuccess(response)) throw new Error('Transactional batch should have failed');
  });

  // Test 29: Metrics (if implemented)
  await runTest('Get API Metrics', async () => {
    const response = await client.getMetricsSummary();
    // This might fail if metrics aren't implemented, which is OK
    if (client.isSuccess(response)) {
      if (response.data.totalCalls < 20) throw new Error('Expected many API calls in metrics');
    }
  });

  // Test 30: Delete Model (cleanup)
  await runTest('Delete Model', async () => {
    const response = await client.deleteModel(modelId);
    if (!client.isSuccess(response)) throw new Error(response.error);
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const totalTime = testResults.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${testResults.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Total Time: ${totalTime}ms`);
  console.log(`Average Time: ${Math.round(totalTime / testResults.length)}ms per test`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + (failed === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed'));
}

// Run the integration test
fullIntegrationTest().catch(console.error);