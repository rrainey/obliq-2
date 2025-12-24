// __tests__/integration/mcp/workflows.test.ts
/**
 * @jest-environment node
 *
 * MCP Workflow Integration Tests
 *
 * These tests simulate real MCP tool workflows that an LLM client would perform.
 * They test the complete user journeys from model creation through to validation.
 */

import {
  TestApiClient,
  TestDatabase,
  McpToolSimulator,
  createTestDatabase,
  shouldRunIntegrationTests,
  INTEGRATION_SKIP_MESSAGE,
  createTestClient,
  uniqueModelName,
  wait
} from '../../support';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('MCP Workflow Integration Tests', () => {
  let client: TestApiClient;
  let db: TestDatabase;
  let mcp: McpToolSimulator;

  beforeAll(async () => {
    client = createTestClient();
    db = await createTestDatabase();
    mcp = new McpToolSimulator(client);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('Simple Model Creation Workflow', () => {
    it('should create a complete model with blocks and connections via MCP tools', async () => {
      // Step 1: Create a new model (like an LLM would)
      const createResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPSimple')
      });
      expect(createResult.success).toBe(true);
      const modelId = createResult.data.id;
      db.trackModel(modelId);

      // Step 2: Add a source block (constant value)
      const constResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'source',
        name: 'Input',
        parameters: { signalType: 'constant', value: 5 }
      });
      expect(constResult.success).toBe(true);
      const constBlockId = constResult.data.block.id;

      // Step 3: Add a scale block
      const scaleResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'scale',
        name: 'Gain',
        parameters: { gain: 2 }
      });
      expect(scaleResult.success).toBe(true);
      const scaleBlockId = scaleResult.data.block.id;

      // Step 4: Add a signal_display block
      const displayResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'signal_display',
        name: 'Output'
      });
      expect(displayResult.success).toBe(true);
      const displayBlockId = displayResult.data.block.id;

      // Step 5: Connect constant -> scale
      const conn1Result = await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: constBlockId,
        targetBlockId: scaleBlockId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
      expect(conn1Result.success).toBe(true);

      // Step 6: Connect scale -> display
      const conn2Result = await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: scaleBlockId,
        targetBlockId: displayBlockId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
      expect(conn2Result.success).toBe(true);

      // Step 7: Validate the model
      const validateResult = await mcp.callTool('obliq_validate_model', {
        modelId
      });
      expect(validateResult.success).toBe(true);
      expect(validateResult.data.isValid).toBe(true);

      // Verify final state
      const blocksResult = await client.listBlocks(modelId, 'main');
      expect(blocksResult.data.blockCount).toBe(3);

      const connectionsResult = await client.listConnections(modelId, 'main');
      expect(connectionsResult.data.connectionCount).toBe(2);
    });
  });

  describe('Subsystem Creation Workflow', () => {
    it('should create a model with a subsystem containing internal logic', async () => {
      // Create model
      const modelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPSubsystem')
      });
      const modelId = modelResult.data.id;
      db.trackModel(modelId);

      // Create a subsystem
      const subsystemResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'subsystem',
        name: 'MySubsystem'
      });
      const subsystemId = subsystemResult.data.block.id;

      // Get the subsystem's internal sheet
      const sheetsResult = await client.listSheets(modelId);
      const internalSheet = sheetsResult.data.sheets.find(
        (s: any) => s.id !== 'main'
      );
      expect(internalSheet).toBeDefined();
      const internalSheetId = internalSheet.id;

      // Add an input_port to the subsystem
      const inportResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: internalSheetId,
        blockType: 'input_port',
        name: 'In1'
      });
      const inportId = inportResult.data.block.id;

      // Add a scale inside the subsystem
      const innerScaleResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: internalSheetId,
        blockType: 'scale',
        name: 'InnerGain',
        parameters: { gain: 3 }
      });
      const innerScaleId = innerScaleResult.data.block.id;

      // Add an output_port
      const outportResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: internalSheetId,
        blockType: 'output_port',
        name: 'Out1'
      });
      const outportId = outportResult.data.block.id;

      // Connect inport -> scale -> outport
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: internalSheetId,
        sourceBlockId: inportId,
        targetBlockId: innerScaleId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: internalSheetId,
        sourceBlockId: innerScaleId,
        targetBlockId: outportId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Now on main sheet, connect to the subsystem
      const constResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'source',
        name: 'Source',
        parameters: { signalType: 'constant', value: 10 }
      });
      const constId = constResult.data.block.id;

      const displayResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'signal_display',
        name: 'Result'
      });
      const displayId = displayResult.data.block.id;

      // Connect constant -> subsystem
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: constId,
        targetBlockId: subsystemId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Connect subsystem -> display
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: subsystemId,
        targetBlockId: displayId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Validate
      const validateResult = await mcp.callTool('obliq_validate_model', {
        modelId
      });
      expect(validateResult.success).toBe(true);
      expect(validateResult.data.isValid).toBe(true);
    });
  });

  describe('BuildSimpleModel Helper', () => {
    it('should build a model using the high-level helper', async () => {
      const result = await mcp.buildSimpleModel(
        uniqueModelName('MCPHelper'),
        [
          { type: 'source', name: 'A', params: { signalType: 'constant', value: 1 } },
          { type: 'source', name: 'B', params: { signalType: 'constant', value: 2 } },
          { type: 'sum', name: 'Add', params: { numInputs: 2 } },
          { type: 'signal_display', name: 'Result' }
        ],
        [
          { sourceBlock: 'A', targetBlock: 'Add', sourcePort: 0, targetPort: 0 },
          { sourceBlock: 'B', targetBlock: 'Add', sourcePort: 0, targetPort: 1 },
          { sourceBlock: 'Add', targetBlock: 'Result', sourcePort: 0, targetPort: 0 }
        ]
      );

      db.trackModel(result.modelId);

      expect(result.modelId).toBeDefined();
      expect(Object.keys(result.blockIds)).toHaveLength(4);
      expect(result.connectionCount).toBe(3);

      // Validate
      const validateResult = await client.validateModel(result.modelId);
      expect(validateResult.success).toBe(true);
      expect(validateResult.data.isValid).toBe(true);
    });
  });

  describe('Sheet Management Workflow', () => {
    it('should create, clone, and manage multiple sheets', async () => {
      // Create model
      const modelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPSheets')
      });
      const modelId = modelResult.data.id;
      db.trackModel(modelId);

      // Create a sheet with some content
      const sheet1Result = await mcp.callTool('obliq_create_sheet', {
        modelId,
        name: 'Sheet1'
      });
      const sheet1Id = sheet1Result.data.sheet.id;

      // Add blocks to sheet1
      await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: sheet1Id,
        blockType: 'source',
        name: 'C1'
      });
      await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: sheet1Id,
        blockType: 'scale',
        name: 'S1'
      });

      // Clone the sheet
      const cloneResult = await mcp.callTool('obliq_clone_sheet', {
        modelId,
        sourceSheetId: sheet1Id,
        newName: 'Sheet1_Copy'
      });
      expect(cloneResult.success).toBe(true);
      expect(cloneResult.data.clonedSheet.blockCount).toBe(2);

      // Rename the clone
      const renameResult = await mcp.callTool('obliq_rename_sheet', {
        modelId,
        sheetId: cloneResult.data.clonedSheet.id,
        newName: 'Sheet2'
      });
      expect(renameResult.success).toBe(true);
      expect(renameResult.data.sheet.name).toBe('Sheet2');

      // List all sheets
      const listResult = await client.listSheets(modelId);
      expect(listResult.data.sheetCount).toBe(3); // main, Sheet1, Sheet2
    });
  });

  describe('Error Recovery Workflow', () => {
    it('should handle errors gracefully and allow recovery', async () => {
      // Create model
      const modelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPErrorRecovery')
      });
      const modelId = modelResult.data.id;
      db.trackModel(modelId);

      // Try to add a block with invalid type
      const invalidBlockResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'nonexistent_block_type',
        name: 'Bad'
      });
      expect(invalidBlockResult.success).toBe(false);
      expect(invalidBlockResult.code).toBe('INVALID_BLOCK_TYPE');

      // Model should still be usable
      const validBlockResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'source',
        name: 'Good',
        parameters: { signalType: 'constant', value: 1 }
      });
      expect(validBlockResult.success).toBe(true);

      // Try to connect to non-existent block
      const invalidConnResult = await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: validBlockResult.data.block.id,
        targetBlockId: 'nonexistent',
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
      expect(invalidConnResult.success).toBe(false);

      // Model should still validate (single unconnected block is valid)
      const validateResult = await mcp.callTool('obliq_validate_model', {
        modelId
      });
      expect(validateResult.success).toBe(true);
    });
  });

  describe('Model Update Workflow', () => {
    it('should support iterative model updates', async () => {
      // Create initial model
      const modelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPUpdate')
      });
      const modelId = modelResult.data.id;
      db.trackModel(modelId);

      // Add initial block
      const block1Result = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'source',
        name: 'Initial',
        parameters: { signalType: 'constant', value: 1 }
      });
      const block1Id = block1Result.data.block.id;

      // Update block parameters
      const updateResult = await mcp.callTool('obliq_update_block_parameters', {
        modelId,
        blockId: block1Id,
        parameters: { value: 100 }
      });
      expect(updateResult.success).toBe(true);
      expect(updateResult.data.block.parameters.value).toBe(100);

      // Rename block
      const renameResult = await mcp.callTool('obliq_update_block_name', {
        modelId,
        blockId: block1Id,
        name: 'UpdatedConstant'
      });
      expect(renameResult.success).toBe(true);
      expect(renameResult.data.block.name).toBe('UpdatedConstant');

      // Move block
      const moveResult = await mcp.callTool('obliq_update_block_position', {
        modelId,
        blockId: block1Id,
        position: { x: 200, y: 150 }
      });
      expect(moveResult.success).toBe(true);
      expect(moveResult.data.block.position.x).toBe(200);
      expect(moveResult.data.block.position.y).toBe(150);

      // Verify final state
      const getResult = await client.getBlock(modelId, 'main', block1Id);
      expect(getResult.data.block.name).toBe('UpdatedConstant');
      expect(getResult.data.block.parameters.value).toBe(100);
      expect(getResult.data.block.position.x).toBe(200);
    });
  });

  describe('Complex Signal Flow Workflow', () => {
    it('should build a feedback control system model', async () => {
      // Create model for a simple feedback loop
      const modelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPFeedback')
      });
      const modelId = modelResult.data.id;
      db.trackModel(modelId);

      // Add blocks for a simple control system
      // Reference input
      const refResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'source',
        name: 'Reference',
        parameters: { signalType: 'constant', value: 1.0 }
      });
      const refId = refResult.data.block.id;

      // Sum block (error = reference - feedback)
      const sumResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'sum',
        name: 'Error',
        parameters: { numInputs: 2, signs: '+-' }
      });
      const sumId = sumResult.data.block.id;

      // Controller (gain)
      const controllerResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'scale',
        name: 'Controller',
        parameters: { gain: 0.5 }
      });
      const controllerId = controllerResult.data.block.id;

      // Integrator (plant)
      const plantResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'integrator',
        name: 'Plant'
      });
      const plantId = plantResult.data.block.id;

      // Output display
      const displayResult = await mcp.callTool('obliq_add_block', {
        modelId,
        sheetId: 'main',
        blockType: 'signal_display',
        name: 'Output'
      });
      const displayId = displayResult.data.block.id;

      // Connect: Reference -> Sum(+)
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: refId,
        targetBlockId: sumId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Connect: Sum -> Controller
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: sumId,
        targetBlockId: controllerId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Connect: Controller -> Plant
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: controllerId,
        targetBlockId: plantId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Connect: Plant -> Display
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: plantId,
        targetBlockId: displayId,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Connect: Plant -> Sum(-) (feedback)
      await mcp.callTool('obliq_add_connection', {
        modelId,
        sheetId: 'main',
        sourceBlockId: plantId,
        targetBlockId: sumId,
        sourcePortIndex: 0,
        targetPortIndex: 1
      });

      // Validate
      const validateResult = await mcp.callTool('obliq_validate_model', {
        modelId
      });
      expect(validateResult.success).toBe(true);
      expect(validateResult.data.isValid).toBe(true);

      // Verify structure
      const blocksResult = await client.listBlocks(modelId, 'main');
      expect(blocksResult.data.blockCount).toBe(5);

      const connsResult = await client.listConnections(modelId, 'main');
      expect(connsResult.data.connectionCount).toBe(5);
    });
  });

  describe('Export/Import Workflow', () => {
    it('should export a sheet and import it into another model', async () => {
      // Create source model with a useful sheet
      const sourceModelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPSource')
      });
      const sourceModelId = sourceModelResult.data.id;
      db.trackModel(sourceModelId);

      // Create a sheet with reusable content
      const sheetResult = await mcp.callTool('obliq_create_sheet', {
        modelId: sourceModelId,
        name: 'ReusableLogic'
      });
      const sheetId = sheetResult.data.sheet.id;

      // Add blocks to the sheet
      const inResult = await mcp.callTool('obliq_add_block', {
        modelId: sourceModelId,
        sheetId,
        blockType: 'input_port',
        name: 'Input'
      });
      const scaleResult = await mcp.callTool('obliq_add_block', {
        modelId: sourceModelId,
        sheetId,
        blockType: 'scale',
        name: 'Process',
        parameters: { gain: 2.5 }
      });
      const outResult = await mcp.callTool('obliq_add_block', {
        modelId: sourceModelId,
        sheetId,
        blockType: 'output_port',
        name: 'Output'
      });

      // Connect them
      await mcp.callTool('obliq_add_connection', {
        modelId: sourceModelId,
        sheetId,
        sourceBlockId: inResult.data.block.id,
        targetBlockId: scaleResult.data.block.id,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
      await mcp.callTool('obliq_add_connection', {
        modelId: sourceModelId,
        sheetId,
        sourceBlockId: scaleResult.data.block.id,
        targetBlockId: outResult.data.block.id,
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Export the sheet
      const exportResult = await mcp.callTool('obliq_export_sheet', {
        modelId: sourceModelId,
        sheetId
      });
      expect(exportResult.success).toBe(true);
      const exportedSheet = exportResult.data.exportData.sheet;

      // Create target model
      const targetModelResult = await mcp.callTool('obliq_create_model', {
        name: uniqueModelName('MCPTarget')
      });
      const targetModelId = targetModelResult.data.id;
      db.trackModel(targetModelId);

      // Import the sheet
      const importResult = await mcp.callTool('obliq_import_sheet', {
        modelId: targetModelId,
        sheetData: exportedSheet,
        name: 'ImportedLogic'
      });
      expect(importResult.success).toBe(true);
      expect(importResult.data.importedSheet.name).toBe('ImportedLogic');
      expect(importResult.data.importedSheet.blockCount).toBe(3);

      // Verify the imported sheet works
      const blocksResult = await client.listBlocks(
        targetModelId,
        importResult.data.importedSheet.id
      );
      expect(blocksResult.data.blockCount).toBe(3);
    });
  });
});

if (!shouldRunIntegrationTests()) {
  console.log(INTEGRATION_SKIP_MESSAGE);
}
