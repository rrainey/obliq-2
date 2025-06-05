// examples/model-builder-api/control-system.ts
import * as dotenv from 'dotenv';
import { createModelBuilderApiClient } from '../../../lib/modelBuilderApiClient';

// Load environment variables
dotenv.config();

const API_URL = process.env.MODEL_BUILDER_API_URL || 'http://localhost:3000/api/model-builder';
const API_TOKEN = process.env.MODEL_BUILDER_API_TOKEN || '';
const USER_ID = '00000000-0000-0000-0000-000000000000';

async function createControlSystem() {
  console.log('Creating a PID Control System with Model Builder API...\n');

  const client = createModelBuilderApiClient(API_URL, API_TOKEN);

  try {
    // Create model
    console.log('1. Creating control system model...');
    const modelResponse = await client.createModel('PID Control System', USER_ID);
    if (!client.isSuccess(modelResponse)) {
      throw new Error(modelResponse.error);
    }
    const modelId = modelResponse.data.id;
    console.log(`   ✓ Model created: ${modelId}`);

    // Create sheet
    console.log('\n2. Creating control loop sheet...');
    const sheetResponse = await client.createSheet(modelId, 'Control Loop');
    if (!client.isSuccess(sheetResponse)) {
      throw new Error(sheetResponse.error);
    }
    const sheetId = sheetResponse.data.id;
    console.log(`   ✓ Sheet created: ${sheetId}`);

    // Add blocks for PID controller
    console.log('\n3. Adding control system blocks...');
    
    // Reference input (setpoint)
    const setpointResp = await client.addBlock(
      modelId, sheetId, 'source', 'Setpoint',
      { x: 100, y: 200 },
      { value: '10.0', dataType: 'double' }
    );
    if (!client.isSuccess(setpointResp)) throw new Error(setpointResp.error);
    const setpointId = setpointResp.data.id;
    console.log('   ✓ Added Setpoint source');

    // Sum block for error calculation (setpoint - feedback)
    const errorSumResp = await client.addBlock(
      modelId, sheetId, 'sum', 'ErrorSum',
      { x: 250, y: 200 },
      { numInputs: 2, signs: ['+', '-'] }
    );
    if (!client.isSuccess(errorSumResp)) throw new Error(errorSumResp.error);
    const errorSumId = errorSumResp.data.id;
    console.log('   ✓ Added Error Sum block');

    // P gain
    const pGainResp = await client.addBlock(
      modelId, sheetId, 'scale', 'P_Gain',
      { x: 400, y: 100 },
      { factor: 0.5 }
    );
    if (!client.isSuccess(pGainResp)) throw new Error(pGainResp.error);
    const pGainId = pGainResp.data.id;
    console.log('   ✓ Added Proportional gain');

    // I gain with integrator
    const iGainResp = await client.addBlock(
      modelId, sheetId, 'scale', 'I_Gain',
      { x: 400, y: 200 },
      { factor: 0.1 }
    );
    if (!client.isSuccess(iGainResp)) throw new Error(iGainResp.error);
    const iGainId = iGainResp.data.id;

    const integratorResp = await client.addBlock(
      modelId, sheetId, 'transfer_function', 'Integrator',
      { x: 550, y: 200 },
      { numerator: [1], denominator: [1, 0] }
    );
    if (!client.isSuccess(integratorResp)) throw new Error(integratorResp.error);
    const integratorId = integratorResp.data.id;
    console.log('   ✓ Added Integral path');

    // D gain with derivative
    const dGainResp = await client.addBlock(
      modelId, sheetId, 'scale', 'D_Gain',
      { x: 400, y: 300 },
      { factor: 0.05 }
    );
    if (!client.isSuccess(dGainResp)) throw new Error(dGainResp.error);
    const dGainId = dGainResp.data.id;

    // Derivative approximation (s / (0.1s + 1))
    const derivativeResp = await client.addBlock(
      modelId, sheetId, 'transfer_function', 'Derivative',
      { x: 550, y: 300 },
      { numerator: [1, 0], denominator: [0.1, 1] }
    );
    if (!client.isSuccess(derivativeResp)) throw new Error(derivativeResp.error);
    const derivativeId = derivativeResp.data.id;
    console.log('   ✓ Added Derivative path');

    // PID sum
    const pidSumResp = await client.addBlock(
      modelId, sheetId, 'sum', 'PID_Sum',
      { x: 700, y: 200 },
      { numInputs: 3, signs: ['+', '+', '+'] }
    );
    if (!client.isSuccess(pidSumResp)) throw new Error(pidSumResp.error);
    const pidSumId = pidSumResp.data.id;
    console.log('   ✓ Added PID sum');

    // Plant (system to control) - 2nd order system
    const plantResp = await client.addBlock(
      modelId, sheetId, 'transfer_function', 'Plant',
      { x: 850, y: 200 },
      { numerator: [1], denominator: [1, 2, 1] }
    );
    if (!client.isSuccess(plantResp)) throw new Error(plantResp.error);
    const plantId = plantResp.data.id;
    console.log('   ✓ Added Plant transfer function');

    // Output display
    const outputResp = await client.addBlock(
      modelId, sheetId, 'signal_display', 'SystemOutput',
      { x: 1000, y: 200 },
      { maxSamples: 2000 }
    );
    if (!client.isSuccess(outputResp)) throw new Error(outputResp.error);
    const outputId = outputResp.data.id;
    console.log('   ✓ Added Output display');

    // Step 4: Create connections
    console.log('\n4. Wiring the control loop...');
    
    // Setpoint to error sum
    await client.addConnection(modelId, sheetId, setpointId, 'output', errorSumId, 'input0');
    
    // Error to PID paths
    await client.addConnection(modelId, sheetId, errorSumId, 'output', pGainId, 'input');
    await client.addConnection(modelId, sheetId, errorSumId, 'output', iGainId, 'input');
    await client.addConnection(modelId, sheetId, errorSumId, 'output', dGainId, 'input');
    
    // I and D processing
    await client.addConnection(modelId, sheetId, iGainId, 'output', integratorId, 'input');
    await client.addConnection(modelId, sheetId, dGainId, 'output', derivativeId, 'input');
    
    // PID paths to sum
    await client.addConnection(modelId, sheetId, pGainId, 'output', pidSumId, 'input0');
    await client.addConnection(modelId, sheetId, integratorId, 'output', pidSumId, 'input1');
    await client.addConnection(modelId, sheetId, derivativeId, 'output', pidSumId, 'input2');
    
    // PID output to plant
    await client.addConnection(modelId, sheetId, pidSumId, 'output', plantId, 'input');
    
    // Plant to output display
    await client.addConnection(modelId, sheetId, plantId, 'output', outputId, 'input');
    
    // Feedback loop - plant output back to error sum
    await client.addConnection(modelId, sheetId, plantId, 'output', errorSumId, 'input1');
    
    console.log('   ✓ All connections created');

    // Validate
    console.log('\n5. Validating control system...');
    const validationResp = await client.validateModel(modelId);
    if (!client.isSuccess(validationResp)) {
      throw new Error(validationResp.error);
    }
    
    const validation = validationResp.data;
    console.log(`   ✓ Validation: ${validation.errors?.length || 0} errors, ${validation.warnings?.length || 0} warnings`);

    console.log('\n✅ PID Control System created successfully!');
    console.log(`\nModel ID: ${modelId}`);
    console.log('\nThis model implements a complete PID controller with:');
    console.log('  - Proportional gain: 0.5');
    console.log('  - Integral gain: 0.1');
    console.log('  - Derivative gain: 0.05');
    console.log('  - 2nd order plant: 1/(s² + 2s + 1)');
    console.log('  - Closed-loop feedback');

  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

// Run the example
createControlSystem();