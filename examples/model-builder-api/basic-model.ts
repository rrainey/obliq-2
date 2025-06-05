// examples/model-builder-api/basic-model.ts
import * as dotenv from 'dotenv';
import { createModelBuilderApiClient } from '../../../lib/modelBuilderApiClient';

// Load environment variables
dotenv.config();

const API_URL = process.env.MODEL_BUILDER_API_URL || 'http://localhost:3000/api/model-builder';
const API_TOKEN = process.env.MODEL_BUILDER_API_TOKEN || '';
const USER_ID = '00000000-0000-0000-0000-000000000000'; // Default user ID

async function createBasicModel() {
  console.log('Creating a basic model with Model Builder API...\n');

  // Initialize the client
  const client = createModelBuilderApiClient(API_URL, API_TOKEN);

  try {
    // Step 1: Create a new model
    console.log('1. Creating new model...');
    const modelResponse = await client.createModel('Basic Example Model', USER_ID);
    
    if (!client.isSuccess(modelResponse)) {
      console.error('Failed to create model:', modelResponse.error);
      return;
    }
    
    const modelId = modelResponse.data.id;
    console.log(`   ✓ Model created with ID: ${modelId}`);

    // Step 2: Create a sheet
    console.log('\n2. Creating main sheet...');
    const sheetResponse = await client.createSheet(modelId, 'Main');
    
    if (!client.isSuccess(sheetResponse)) {
      console.error('Failed to create sheet:', sheetResponse.error);
      return;
    }
    
    const sheetId = sheetResponse.data.id;
    console.log(`   ✓ Sheet created with ID: ${sheetId}`);

    // Step 3: Add some blocks
    console.log('\n3. Adding blocks...');
    
    // Add a Source block
    const sourceResponse = await client.addBlock(
      modelId,
      sheetId,
      'source',
      'ConstantSource',
      { x: 100, y: 200 },
      { value: '5.0', dataType: 'double' }
    );
    
    if (!client.isSuccess(sourceResponse)) {
      console.error('Failed to add source block:', sourceResponse.error);
      return;
    }
    const sourceId = sourceResponse.data.id;
    console.log(`   ✓ Added Source block: ${sourceId}`);

    // Add a Scale block
    const scaleResponse = await client.addBlock(
      modelId,
      sheetId,
      'scale',
      'Gain',
      { x: 300, y: 200 },
      { factor: 2.5 }
    );
    
    if (!client.isSuccess(scaleResponse)) {
      console.error('Failed to add scale block:', scaleResponse.error);
      return;
    }
    const scaleId = scaleResponse.data.id;
    console.log(`   ✓ Added Scale block: ${scaleId}`);

    // Add a Signal Display
    const displayResponse = await client.addBlock(
      modelId,
      sheetId,
      'signal_display',
      'Output',
      { x: 500, y: 200 },
      { maxSamples: 1000 }
    );
    
    if (!client.isSuccess(displayResponse)) {
      console.error('Failed to add display block:', displayResponse.error);
      return;
    }
    const displayId = displayResponse.data.id;
    console.log(`   ✓ Added Signal Display block: ${displayId}`);

    // Step 4: Connect the blocks
    console.log('\n4. Creating connections...');
    
    // Connect Source to Scale
    const conn1Response = await client.addConnection(
      modelId,
      sheetId,
      sourceId,
      'output',
      scaleId,
      'input'
    );
    
    if (!client.isSuccess(conn1Response)) {
      console.error('Failed to create connection 1:', conn1Response.error);
      return;
    }
    console.log('   ✓ Connected Source → Scale');

    // Connect Scale to Display
    const conn2Response = await client.addConnection(
      modelId,
      sheetId,
      scaleId,
      'output',
      displayId,
      'input'
    );
    
    if (!client.isSuccess(conn2Response)) {
      console.error('Failed to create connection 2:', conn2Response.error);
      return;
    }
    console.log('   ✓ Connected Scale → Display');

    // Step 5: Validate the model
    console.log('\n5. Validating model...');
    const validationResponse = await client.validateModel(modelId);
    
    if (!client.isSuccess(validationResponse)) {
      console.error('Failed to validate model:', validationResponse.error);
      return;
    }
    
    const validation = validationResponse.data;
    console.log(`   ✓ Validation complete:`);
    console.log(`     - Errors: ${validation.errors?.length || 0}`);
    console.log(`     - Warnings: ${validation.warnings?.length || 0}`);
    
    if (validation.errors?.length > 0) {
      console.log('\n   Errors found:');
      validation.errors.forEach((err: any) => {
        console.log(`     - ${err.message}`);
      });
    }

    // Success!
    console.log('\n✅ Basic model created successfully!');
    console.log(`\nModel ID: ${modelId}`);
    console.log('You can now open this model in the web UI to view and simulate it.');

  } catch (error) {
    console.error('\n❌ Error creating model:', error);
  }
}

// Run the example
createBasicModel();