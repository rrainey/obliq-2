// examples/model-builder-api/multi-sheet.ts
import * as dotenv from 'dotenv';
import { createModelBuilderApiClient } from '../../../lib/modelBuilderApiClient';

// Load environment variables
dotenv.config();

const API_URL = process.env.MODEL_BUILDER_API_URL || 'http://localhost:3000/api/model-builder';
const API_TOKEN = process.env.MODEL_BUILDER_API_TOKEN || '';
const USER_ID = '00000000-0000-0000-0000-000000000000';

async function createMultiSheetModel() {
  console.log('Creating a Multi-Sheet Model with Sheet Labels...\n');

  const client = createModelBuilderApiClient(API_URL, API_TOKEN);

  try {
    // Create model
    console.log('1. Creating multi-sheet model...');
    const modelResp = await client.createModel('Multi-Sheet System', USER_ID);
    if (!client.isSuccess(modelResp)) throw new Error(modelResp.error);
    const modelId = modelResp.data.id;
    console.log(`   ✓ Model created: ${modelId}`);

    // Create sheets
    console.log('\n2. Creating multiple sheets...');
    
    // Input Processing sheet
    const sheet1Resp = await client.createSheet(modelId, 'Input Processing');
    if (!client.isSuccess(sheet1Resp)) throw new Error(sheet1Resp.error);
    const inputSheetId = sheet1Resp.data.id;
    console.log('   ✓ Created "Input Processing" sheet');

    // Signal Conditioning sheet
    const sheet2Resp = await client.createSheet(modelId, 'Signal Conditioning');
    if (!client.isSuccess(sheet2Resp)) throw new Error(sheet2Resp.error);
    const conditioningSheetId = sheet2Resp.data.id;
    console.log('   ✓ Created "Signal Conditioning" sheet');

    // Output Stage sheet
    const sheet3Resp = await client.createSheet(modelId, 'Output Stage');
    if (!client.isSuccess(sheet3Resp)) throw new Error(sheet3Resp.error);
    const outputSheetId = sheet3Resp.data.id;
    console.log('   ✓ Created "Output Stage" sheet');

    // Build Input Processing sheet
    console.log('\n3. Building Input Processing sheet...');
    
    // Two input sources
    const input1Resp = await client.addBlock(
      modelId, inputSheetId, 'input_port', 'SensorA',
      { x: 100, y: 150 },
      { signalName: 'sensor_a', dataType: 'double' }
    );
    if (!client.isSuccess(input1Resp)) throw new Error(input1Resp.error);
    const input1Id = input1Resp.data.id;

    const input2Resp = await client.addBlock(
      modelId, inputSheetId, 'input_port', 'SensorB',
      { x: 100, y: 250 },
      { signalName: 'sensor_b', dataType: 'double' }
    );
    if (!client.isSuccess(input2Resp)) throw new Error(input2Resp.error);
    const input2Id = input2Resp.data.id;

    // Sum the inputs
    const sumResp = await client.addBlock(
      modelId, inputSheetId, 'sum', 'InputSum',
      { x: 300, y: 200 },
      { numInputs: 2 }
    );
    if (!client.isSuccess(sumResp)) throw new Error(sumResp.error);
    const sumId = sumResp.data.id;

    // Sheet label sink to send to next sheet
    const sink1Resp = await client.addBlock(
      modelId, inputSheetId, 'sheet_label_sink', 'ToConditioning',
      { x: 500, y: 200 },
      { signalName: 'raw_sum' }
    );
    if (!client.isSuccess(sink1Resp)) throw new Error(sink1Resp.error);
    const sink1Id = sink1Resp.data.id;

    // Wire input sheet
    await client.addConnection(modelId, inputSheetId, input1Id, 'output', sumId, 'input0');
    await client.addConnection(modelId, inputSheetId, input2Id, 'output', sumId, 'input1');
    await client.addConnection(modelId, inputSheetId, sumId, 'output', sink1Id, 'input');
    console.log('   ✓ Input Processing wired');

    // Build Signal Conditioning sheet
    console.log('\n4. Building Signal Conditioning sheet...');
    
    // Sheet label source to receive from previous sheet
    const source1Resp = await client.addBlock(
      modelId, conditioningSheetId, 'sheet_label_source', 'FromInput',
      { x: 100, y: 200 },
      { signalName: 'raw_sum' }
    );
    if (!client.isSuccess(source1Resp)) throw new Error(source1Resp.error);
    const source1Id = source1Resp.data.id;

    // Low-pass filter
    const filterResp = await client.addBlock(
      modelId, conditioningSheetId, 'transfer_function', 'LowPassFilter',
      { x: 300, y: 200 },
      { numerator: [1], denominator: [0.1, 1] }  // 1/(0.1s + 1)
    );
    if (!client.isSuccess(filterResp)) throw new Error(filterResp.error);
    const filterId = filterResp.data.id;

    // Scale the filtered signal
    const scaleResp = await client.addBlock(
      modelId, conditioningSheetId, 'scale', 'Normalize',
      { x: 500, y: 200 },
      { factor: 0.1 }
    );
    if (!client.isSuccess(scaleResp)) throw new Error(scaleResp.error);
    const scaleId = scaleResp.data.id;

    // Sheet label sinks for multiple outputs
    const sink2Resp = await client.addBlock(
      modelId, conditioningSheetId, 'sheet_label_sink', 'ToOutput',
      { x: 700, y: 200 },
      { signalName: 'processed_signal' }
    );
    if (!client.isSuccess(sink2Resp)) throw new Error(sink2Resp.error);
    const sink2Id = sink2Resp.data.id;

    // Also send unfiltered signal
    const sink3Resp = await client.addBlock(
      modelId, conditioningSheetId, 'sheet_label_sink', 'ToOutputRaw',
      { x: 300, y: 350 },
      { signalName: 'raw_for_comparison' }
    );
    if (!client.isSuccess(sink3Resp)) throw new Error(sink3Resp.error);
    const sink3Id = sink3Resp.data.id;

    // Wire conditioning sheet
    await client.addConnection(modelId, conditioningSheetId, source1Id, 'output', filterId, 'input');
    await client.addConnection(modelId, conditioningSheetId, filterId, 'output', scaleId, 'input');
    await client.addConnection(modelId, conditioningSheetId, scaleId, 'output', sink2Id, 'input');
    await client.addConnection(modelId, conditioningSheetId, source1Id, 'output', sink3Id, 'input');
    console.log('   ✓ Signal Conditioning wired');

    // Build Output Stage sheet
    console.log('\n5. Building Output Stage sheet...');
    
    // Receive both signals
    const source2Resp = await client.addBlock(
      modelId, outputSheetId, 'sheet_label_source', 'ProcessedInput',
      { x: 100, y: 150 },
      { signalName: 'processed_signal' }
    );
    if (!client.isSuccess(source2Resp)) throw new Error(source2Resp.error);
    const source2Id = source2Resp.data.id;

    const source3Resp = await client.addBlock(
      modelId, outputSheetId, 'sheet_label_source', 'RawInput',
      { x: 100, y: 250 },
      { signalName: 'raw_for_comparison' }
    );
    if (!client.isSuccess(source3Resp)) throw new Error(source3Resp.error);
    const source3Id = source3Resp.data.id;

    // Display both signals
    const display1Resp = await client.addBlock(
      modelId, outputSheetId, 'signal_display', 'ProcessedDisplay',
      { x: 300, y: 150 }
    );
    if (!client.isSuccess(display1Resp)) throw new Error(display1Resp.error);
    const display1Id = display1Resp.data.id;

    const display2Resp = await client.addBlock(
      modelId, outputSheetId, 'signal_display', 'RawDisplay',
      { x: 300, y: 250 }
    );
    if (!client.isSuccess(display2Resp)) throw new Error(display2Resp.error);
    const display2Id = display2Resp.data.id;

    // Output port
    const outputResp = await client.addBlock(
      modelId, outputSheetId, 'output_port', 'SystemOutput',
      { x: 500, y: 150 },
      { signalName: 'final_output' }
    );
    if (!client.isSuccess(outputResp)) throw new Error(outputResp.error);
    const outputId = outputResp.data.id;

    // Wire output sheet
    await client.addConnection(modelId, outputSheetId, source2Id, 'output', display1Id, 'input');
    await client.addConnection(modelId, outputSheetId, source3Id, 'output', display2Id, 'input');
    await client.addConnection(modelId, outputSheetId, source2Id, 'output', outputId, 'input');
    console.log('   ✓ Output Stage wired');

    // Validate the complete model
    console.log('\n6. Validating multi-sheet model...');
    const validationResp = await client.validateModel(modelId);
    if (!client.isSuccess(validationResp)) throw new Error(validationResp.error);
    
    const validation = validationResp.data;
    console.log(`   ✓ Validation: ${validation.errors?.length || 0} errors, ${validation.warnings?.length || 0} warnings`);

    console.log('\n✅ Multi-Sheet Model created successfully!');
    console.log(`\nModel ID: ${modelId}`);
    console.log('\nThis model demonstrates:');
    console.log('  - 3 separate sheets for different processing stages');
    console.log('  - Sheet labels for cross-sheet signal connections');
    console.log('  - Signal flow: Input → Conditioning → Output');
    console.log('  - Multiple sheet label connections between sheets');

  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

// Run the example
createMultiSheetModel();