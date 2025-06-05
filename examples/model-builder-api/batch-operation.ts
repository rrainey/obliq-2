// examples/model-builder-api/batch-operations.ts
import * as dotenv from 'dotenv';
import { createModelBuilderApiClient } from '../../../lib/modelBuilderApiClient';

// Load environment variables
dotenv.config();

const API_URL = process.env.MODEL_BUILDER_API_URL || 'http://localhost:3000/api/model-builder';
const API_TOKEN = process.env.MODEL_BUILDER_API_TOKEN || '';
const USER_ID = '00000000-0000-0000-0000-000000000000';

async function demonstrateBatchOperations() {
  console.log('Demonstrating Batch Operations with Model Builder API...\n');

  const client = createModelBuilderApiClient(API_URL, API_TOKEN);

  try {
    // First create a model and sheet normally
    console.log('1. Setting up model and sheet...');
    const modelResp = await client.createModel('Batch Operations Demo', USER_ID);
    if (!client.isSuccess(modelResp)) throw new Error(modelResp.error);
    const modelId = modelResp.data.id;

    const sheetResp = await client.createSheet(modelId, 'Main');
    if (!client.isSuccess(sheetResp)) throw new Error(sheetResp.error);
    const sheetId = sheetResp.data.id;
    console.log('   ✓ Model and sheet created');

    // Now use batch operations to create multiple blocks at once
    console.log('\n2. Creating multiple blocks in a single batch...');
    
    const blockOperations = [
      {
        id: 'op1',
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'source',
        name: 'Input1',
        position: { x: 100, y: 100 },
        parameters: { value: '1.0', dataType: 'double' }
      },
      {
        id: 'op2',
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'source',
        name: 'Input2',
        position: { x: 100, y: 200 },
        parameters: { value: '2.0', dataType: 'double' }
      },
      {
        id: 'op3',
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'source',
        name: 'Input3',
        position: { x: 100, y: 300 },
        parameters: { value: '3.0', dataType: 'double' }
      },
      {
        id: 'op4',
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'sum',
        name: 'Sum1',
        position: { x: 300, y: 150 },
        parameters: { numInputs: 2 }
      },
      {
        id: 'op5',
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'sum',
        name: 'Sum2',
        position: { x: 500, y: 200 },
        parameters: { numInputs: 2 }
      },
      {
        id: 'op6',
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'signal_display',
        name: 'Output',
        position: { x: 700, y: 200 }
      }
    ];

    const batchResp = await client.batchOperations(blockOperations, false);
    if (!client.isSuccess(batchResp)) throw new Error(batchResp.error);
    
    console.log(`   ✓ Batch completed: ${batchResp.data.summary.succeeded} succeeded, ${batchResp.data.summary.failed} failed`);
    
    // Extract block IDs from results
    const blockIds: Record<string, string> = {};
    batchResp.data.results.forEach((result: any, index: number) => {
      if (result.success && result.data?.id) {
        const opId = blockOperations[index].id;
        blockIds[opId] = result.data.id;
      }
    });

    // Now create connections in another batch
    console.log('\n3. Creating connections in a batch...');
    
    const connectionOperations = [
      {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds.op1,
        sourcePort: 'output',
        targetBlockId: blockIds.op4,
        targetPort: 'input0'
      },
      {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds.op2,
        sourcePort: 'output',
        targetBlockId: blockIds.op4,
        targetPort: 'input1'
      },
      {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds.op4,
        sourcePort: 'output',
        targetBlockId: blockIds.op5,
        targetPort: 'input0'
      },
      {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds.op3,
        sourcePort: 'output',
        targetBlockId: blockIds.op5,
        targetPort: 'input1'
      },
      {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds.op5,
        sourcePort: 'output',
        targetBlockId: blockIds.op6,
        targetPort: 'input'
      }
    ];

    const connBatchResp = await client.batchOperations(connectionOperations, false);
    if (!client.isSuccess(connBatchResp)) throw new Error(connBatchResp.error);
    
    console.log(`   ✓ Connections batch: ${connBatchResp.data.summary.succeeded} succeeded`);

    // Demonstrate transactional batch (all or nothing)
    console.log('\n4. Testing transactional batch (with intentional error)...');
    
    const transactionalOps = [
      {
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'scale',
        name: 'Scale1',
        position: { x: 400, y: 300 }
      },
      {
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'invalid_type',  // This will fail
        name: 'BadBlock',
        position: { x: 500, y: 300 }
      },
      {
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: 'scale',
        name: 'Scale2',
        position: { x: 600, y: 300 }
      }
    ];

    const transResp = await client.batchOperations(transactionalOps, true);
    if (!client.isSuccess(transResp)) {
      console.log('   ✓ Transactional batch failed as expected (invalid block type)');
      console.log(`     Error: ${transResp.error}`);
    }

    // Update multiple blocks at once
    console.log('\n5. Batch updating block parameters...');
    
    const updateOps = [
      {
        action: 'updateBlockParameters',
        modelId,
        sheetId,
        blockId: blockIds.op1,
        parameters: { value: '10.0' }
      },
      {
        action: 'updateBlockParameters',
        modelId,
        sheetId,
        blockId: blockIds.op2,
        parameters: { value: '20.0' }
      },
      {
        action: 'updateBlockParameters',
        modelId,
        sheetId,
        blockId: blockIds.op3,
        parameters: { value: '30.0' }
      }
    ];

    const updateResp = await client.batchOperations(updateOps, false);
    if (!client.isSuccess(updateResp)) throw new Error(updateResp.error);
    
    console.log(`   ✓ Updates completed: ${updateResp.data.summary.succeeded} blocks updated`);

    // Validate the model
    console.log('\n6. Validating the batch-created model...');
    const validationResp = await client.validateModel(modelId);
    if (!client.isSuccess(validationResp)) throw new Error(validationResp.error);
    
    const validation = validationResp.data;
    console.log(`   ✓ Validation: ${validation.errors?.length || 0} errors`);

    console.log('\n✅ Batch Operations demonstration complete!');
    console.log(`\nModel ID: ${modelId}`);
    console.log('\nThis example demonstrated:');
    console.log('  - Creating multiple blocks in one request');
    console.log('  - Creating multiple connections in one request');
    console.log('  - Transactional batches (all-or-nothing)');
    console.log('  - Batch parameter updates');
    console.log('  - Efficiency gains from reducing API calls');

  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

// Run the example
demonstrateBatchOperations();