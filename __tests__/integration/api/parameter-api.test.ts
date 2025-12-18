// __tests__/integration/api/parameter-api.test.ts
/**
 * @jest-environment node
 */

import {
  TestApiClient,
  TestDatabase,
  createTestDatabase,
  shouldRunIntegrationTests,
  INTEGRATION_SKIP_MESSAGE,
  createTestClient,
  uniqueModelName
} from '../../support';

const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('Parameter API Integration Tests', () => {
  let client: TestApiClient;
  let db: TestDatabase;
  let testModelId: string;
  let subsystemBlockId: string;

  beforeAll(async () => {
    client = createTestClient();
    db = await createTestDatabase();

    // Create a test model with a subsystem (subsystems have parameters)
    const result = await client.createModel(uniqueModelName('ParamTests'));
    testModelId = result.data.id;
    db.trackModel(testModelId);

    // Create a subsystem block which can have parameters
    const subsystem = await client.addBlock(testModelId, 'main', 'subsystem', {
      name: 'TestSubsystem'
    });
    subsystemBlockId = subsystem.data.block.id;
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('listParameters', () => {
    it('should list parameters for a subsystem', async () => {
      const result = await client.listParameters(testModelId, subsystemBlockId);

      expect(result.success).toBe(true);
      expect(result.data.blockId).toBe(subsystemBlockId);
      expect(Array.isArray(result.data.parameters)).toBe(true);
    });

    it('should reject listing parameters for non-existent block', async () => {
      const result = await client.listParameters(testModelId, 'nonexistent-block');

      expect(result.success).toBe(false);
      expect(result.code).toBe('BLOCK_NOT_FOUND');
    });
  });

  describe('addParameter', () => {
    it('should add a double parameter to a subsystem', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'gain',
        dataType: 'double',
        defaultValue: '1.5'  // C99 literal
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter).toBeDefined();
      expect(result.data.parameter.name).toBe('gain');
      expect(result.data.parameter.dataType).toBe('double');
      expect(result.data.parameter.defaultValue).toBe('1.5');
    });

    it('should add a float parameter', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'threshold',
        dataType: 'float',
        defaultValue: '0.5f'  // C99 float literal with suffix
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.dataType).toBe('float');
      expect(result.data.parameter.defaultValue).toBe('0.5f');
    });

    it('should add a bool parameter', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'enabled',
        dataType: 'bool',
        defaultValue: 'true'  // C99 boolean literal
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.dataType).toBe('bool');
      expect(result.data.parameter.defaultValue).toBe('true');
    });

    it('should add an array parameter', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'coefficients',
        dataType: 'double[3]',
        defaultValue: '{1, 2, 3}'  // C99 array initializer
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.dataType).toBe('double[3]');
      expect(result.data.parameter.defaultValue).toBe('{1, 2, 3}');
    });

    it('should add a matrix parameter', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'transform',
        dataType: 'double[3][3]',
        defaultValue: '{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}'  // C99 matrix initializer
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.dataType).toBe('double[3][3]');
      expect(result.data.parameter.defaultValue).toBe('{{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}');
    });

    it('should accept hex literals', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'hexValue',
        dataType: 'long',
        defaultValue: '0xFF'  // C99 hex literal
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.defaultValue).toBe('0xFF');
    });

    it('should accept binary literals', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'binaryValue',
        dataType: 'long',
        defaultValue: '0b1010'  // Binary literal (10 in decimal)
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.defaultValue).toBe('0b1010');
    });

    it('should accept negative values', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'negativeValue',
        dataType: 'double',
        defaultValue: '-3.14'  // C99 negative literal
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.defaultValue).toBe('-3.14');
    });

    it('should accept long suffix', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'longValue',
        dataType: 'long',
        defaultValue: '42L'  // C99 long literal
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.defaultValue).toBe('42L');
    });

    it('should accept float suffix', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'floatSuffixValue',
        dataType: 'float',
        defaultValue: '3.14f'  // C99 float literal with suffix
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.defaultValue).toBe('3.14f');
    });

    it('should reject duplicate parameter name', async () => {
      // First add a parameter
      await client.addParameter(testModelId, subsystemBlockId, {
        name: 'uniqueParam',
        dataType: 'double',
        defaultValue: '0'
      });

      // Try to add another with the same name
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'uniqueParam',
        dataType: 'double',
        defaultValue: '1'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('PARAMETER_EXISTS');
    });

    it('should reject parameter without name', async () => {
      const result = await client.post({
        action: 'addBlockParameter',
        modelId: testModelId,
        blockId: subsystemBlockId,
        dataType: 'double',
        defaultValue: '0'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMETER');
    });

    it('should reject invalid data type', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'invalidTypeParam',
        dataType: 'string',  // 'string' is not a valid C-language type
        defaultValue: '"test"'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DATA_TYPE');
    });

    it('should reject non-string defaultValue', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'badValue',
        dataType: 'double',
        defaultValue: 42  // Should be a string like "42"
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DEFAULT_VALUE');
    });

    it('should reject invalid C99 syntax', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'badSyntax',
        dataType: 'double',
        defaultValue: 'not_a_number'  // Invalid C99 literal
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DEFAULT_VALUE');
    });

    it('should reject number for bool type', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'badBool',
        dataType: 'bool',
        defaultValue: '1'  // Should be "true" or "false"
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DEFAULT_VALUE');
    });

    it('should reject wrong array size', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'wrongArraySize',
        dataType: 'double[3]',
        defaultValue: '{1, 2}'  // 2 elements instead of 3
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DEFAULT_VALUE');
    });

    it('should reject wrong matrix dimensions', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'wrongMatrix',
        dataType: 'double[2][2]',
        defaultValue: '{{1, 2, 3}, {4, 5, 6}}'  // 2x3 instead of 2x2
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DEFAULT_VALUE');
    });

    it('should reject non-integer value for long type', async () => {
      const result = await client.addParameter(testModelId, subsystemBlockId, {
        name: 'badLong',
        dataType: 'long',
        defaultValue: '3.14'  // float instead of integer
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_DEFAULT_VALUE');
    });
  });

  describe('getParameter', () => {
    let testParamName: string;

    beforeAll(async () => {
      testParamName = 'getTestParam';
      await client.addParameter(testModelId, subsystemBlockId, {
        name: testParamName,
        dataType: 'long',
        defaultValue: '42'  // C99 integer literal
      });
    });

    it('should get a parameter by name', async () => {
      const result = await client.getParameter(testModelId, subsystemBlockId, testParamName);

      expect(result.success).toBe(true);
      expect(result.data.parameter.name).toBe(testParamName);
      expect(result.data.parameter.defaultValue).toBe('42');
    });

    it('should reject getting non-existent parameter', async () => {
      const result = await client.getParameter(testModelId, subsystemBlockId, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.code).toBe('PARAMETER_NOT_FOUND');
    });
  });

  describe('updateParameter', () => {
    let updateParamName: string;

    beforeAll(async () => {
      updateParamName = 'updateTestParam';
      await client.addParameter(testModelId, subsystemBlockId, {
        name: updateParamName,
        dataType: 'double',
        defaultValue: '10'
      });
    });

    it('should update parameter default value', async () => {
      const result = await client.updateParameter(testModelId, subsystemBlockId, updateParamName, {
        defaultValue: '20'
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.defaultValue).toBe('20');

      // Verify persistence
      const getResult = await client.getParameter(testModelId, subsystemBlockId, updateParamName);
      expect(getResult.data.parameter.defaultValue).toBe('20');
    });

    it('should rename a parameter', async () => {
      const oldName = 'toRename';
      await client.addParameter(testModelId, subsystemBlockId, {
        name: oldName,
        dataType: 'float',
        defaultValue: '1.0f'
      });

      const newName = 'renamedParam';
      const result = await client.updateParameter(testModelId, subsystemBlockId, oldName, {
        name: newName
      });

      expect(result.success).toBe(true);
      expect(result.data.parameter.name).toBe(newName);

      // Old name should no longer exist
      const oldResult = await client.getParameter(testModelId, subsystemBlockId, oldName);
      expect(oldResult.success).toBe(false);

      // New name should exist
      const newResult = await client.getParameter(testModelId, subsystemBlockId, newName);
      expect(newResult.success).toBe(true);
    });
  });

  describe('deleteParameter', () => {
    it('should delete a parameter', async () => {
      const paramName = 'toDelete';
      await client.addParameter(testModelId, subsystemBlockId, {
        name: paramName,
        dataType: 'double',
        defaultValue: '0'
      });

      const result = await client.deleteParameter(testModelId, subsystemBlockId, paramName);

      expect(result.success).toBe(true);
      expect(result.data.deletedParameter.name).toBe(paramName);

      // Verify it's gone
      const getResult = await client.getParameter(testModelId, subsystemBlockId, paramName);
      expect(getResult.success).toBe(false);
    });

    it('should reject deleting non-existent parameter', async () => {
      const result = await client.deleteParameter(testModelId, subsystemBlockId, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.code).toBe('PARAMETER_NOT_FOUND');
    });
  });

  describe('Parameter in subsystem instances', () => {
    it('should create subsystem with parameters and verify they propagate', async () => {
      // Create a new subsystem with parameters
      const newSubsystem = await client.addBlock(testModelId, 'main', 'subsystem', {
        name: 'ParamSubsystem'
      });
      const newSubsystemId = newSubsystem.data.block.id;

      // Add parameters using C99 initializer syntax
      await client.addParameter(testModelId, newSubsystemId, {
        name: 'frequency',
        dataType: 'double',
        defaultValue: '100.0'
      });

      await client.addParameter(testModelId, newSubsystemId, {
        name: 'amplitude',
        dataType: 'double',
        defaultValue: '1.0'
      });

      // List and verify
      const listResult = await client.listParameters(testModelId, newSubsystemId);
      expect(listResult.success).toBe(true);
      expect(listResult.data.parameters.length).toBe(2);

      const paramNames = listResult.data.parameters.map((p: any) => p.name);
      expect(paramNames).toContain('frequency');
      expect(paramNames).toContain('amplitude');
    });
  });

  describe('Model integrity after parameter operations', () => {
    it('should preserve subsystem sheets and blocks after adding parameters', async () => {
      // Step 1: Create a new subsystem
      const subsystemResult = await client.addBlock(testModelId, 'main', 'subsystem', {
        name: 'IntegrityTestSubsystem'
      });
      expect(subsystemResult.success).toBe(true);
      const subsystemId = subsystemResult.data.block.id;
      const subsystemSheetId = subsystemResult.data.subsystemSheet?.id;
      expect(subsystemSheetId).toBeDefined();

      // Step 2: Get model and verify subsystem has its internal sheet
      let modelResult = await client.getModel(testModelId);
      expect(modelResult.success).toBe(true);

      let subsystemBlock = findBlockInModel(modelResult.data, subsystemId);
      expect(subsystemBlock).toBeDefined();
      expect(subsystemBlock.parameters.sheets).toBeDefined();
      expect(subsystemBlock.parameters.sheets.length).toBeGreaterThan(0);
      const initialSheetBlockCount = subsystemBlock.parameters.sheets[0].blocks?.length || 0;
      expect(initialSheetBlockCount).toBeGreaterThan(0); // Should have input/output ports

      // Step 3: Add a Source block inside the subsystem's sheet
      const sourceResult = await client.addBlock(testModelId, subsystemSheetId, 'source', {
        name: 'TestSource'
      });
      expect(sourceResult.success).toBe(true);
      const sourceBlockId = sourceResult.data.block.id;

      // Step 4: Verify the Source block was added to the subsystem's sheet
      modelResult = await client.getModel(testModelId);
      subsystemBlock = findBlockInModel(modelResult.data, subsystemId);
      const subsystemSheet = subsystemBlock.parameters.sheets[0];
      expect(subsystemSheet.blocks.length).toBe(initialSheetBlockCount + 1);
      const sourceInSheet = subsystemSheet.blocks.find((b: any) => b.id === sourceBlockId);
      expect(sourceInSheet).toBeDefined();
      expect(sourceInSheet.type).toBe('source');

      // Step 5: Add a parameter to the subsystem
      const paramResult = await client.addParameter(testModelId, subsystemId, {
        name: 'testGain',
        dataType: 'double',
        defaultValue: '2.5'
      });
      expect(paramResult.success).toBe(true);

      // Step 6: CRITICAL - Verify the subsystem's sheets and blocks are STILL intact
      modelResult = await client.getModel(testModelId);
      expect(modelResult.success).toBe(true);

      subsystemBlock = findBlockInModel(modelResult.data, subsystemId);
      expect(subsystemBlock).toBeDefined();

      // Verify sheets are preserved
      expect(subsystemBlock.parameters.sheets).toBeDefined();
      expect(subsystemBlock.parameters.sheets.length).toBeGreaterThan(0);

      // Verify the blocks inside the subsystem sheet are preserved
      const sheetAfterParam = subsystemBlock.parameters.sheets[0];
      expect(sheetAfterParam.blocks).toBeDefined();
      expect(sheetAfterParam.blocks.length).toBe(initialSheetBlockCount + 1);

      // Verify the Source block is still there
      const sourceStillThere = sheetAfterParam.blocks.find((b: any) => b.id === sourceBlockId);
      expect(sourceStillThere).toBeDefined();
      expect(sourceStillThere.type).toBe('source');
      expect(sourceStillThere.name).toBe('TestSource');

      // Verify the parameter was added
      expect(subsystemBlock.parameters.parameters).toBeDefined();
      expect(subsystemBlock.parameters.parameters.length).toBeGreaterThan(0);
      const addedParam = subsystemBlock.parameters.parameters.find((p: any) => p.name === 'testGain');
      expect(addedParam).toBeDefined();
      expect(addedParam.defaultValue).toBe('2.5');
    });
  });
});

// Helper function to find a block by ID in the model data
function findBlockInModel(modelData: any, blockId: string): any {
  // Model data from getModel has sheets nested under data.sheets
  const sheets = modelData.data?.sheets || modelData.sheets || [];

  function searchSheets(sheetsToSearch: any[]): any {
    for (const sheet of sheetsToSearch) {
      const blocks = sheet.blocks || [];
      for (const block of blocks) {
        if (block.id === blockId) {
          return block;
        }
        // Search nested subsystem sheets
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          const found = searchSheets(block.parameters.sheets);
          if (found) return found;
        }
      }
    }
    return null;
  }

  return searchSheets(sheets);
}

if (!shouldRunIntegrationTests()) {
  console.log(INTEGRATION_SKIP_MESSAGE);
}
