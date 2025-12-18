// __tests__/integration/api/model-api.test.ts
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

// Conditionally run tests based on environment
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration('Model API Integration Tests', () => {
  let client: TestApiClient;
  let db: TestDatabase;

  beforeAll(async () => {
    client = createTestClient();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    const { deleted, errors } = await db.cleanup();
    if (errors.length > 0) {
      console.warn('Cleanup errors:', errors);
    }
    if (deleted.length > 0) {
      console.log(`Cleaned up ${deleted.length} test models`);
    }
  });

  describe('createModel', () => {
    it('should create a new model with default structure', async () => {
      const modelName = uniqueModelName('CreateTest');
      const result = await client.createModel(modelName);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBeDefined();
      expect(result.data.name).toBe(modelName);
      expect(result.data.latest_version).toBe(1);
      expect(result.data.mainSheet).toBeDefined();
      expect(result.data.mainSheet.id).toBe('main');

      // Track for cleanup
      db.trackModel(result.data.id);
    });

    it('should reject model creation without name', async () => {
      const result = await client.post({ action: 'createModel' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMETER');
    });
  });

  describe('getModel', () => {
    let testModelId: string;

    beforeAll(async () => {
      const result = await client.createModel(uniqueModelName('GetTest'));
      testModelId = result.data.id;
      db.trackModel(testModelId);
    });

    it('should retrieve an existing model', async () => {
      const result = await client.getModel(testModelId);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(testModelId);
      expect(result.data.data).toBeDefined();
      expect(result.data.data.sheets).toBeDefined();
      expect(result.data.data.sheets.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 404 for non-existent model', async () => {
      const result = await client.getModel('non-existent-model-id');

      expect(result.success).toBe(false);
      expect(result.code).toBe('MODEL_NOT_FOUND');
    });

    it('should reject request without modelId', async () => {
      const result = await client.get('getModel', {});

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMETER');
    });
  });

  describe('getModelMetadata', () => {
    let testModelId: string;

    beforeAll(async () => {
      const result = await client.createModel(uniqueModelName('MetadataTest'));
      testModelId = result.data.id;
      db.trackModel(testModelId);
    });

    it('should return model metadata without full data', async () => {
      const result = await client.getModelMetadata(testModelId);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(testModelId);
      expect(result.data.latestVersion).toBeDefined();
      expect(result.data.statistics).toBeDefined();
      expect(result.data.statistics.sheetCount).toBeGreaterThanOrEqual(1);
      // Should NOT include full model data
      expect(result.data.sheets).toBeUndefined();
    });
  });

  describe('updateModelName', () => {
    let testModelId: string;

    beforeAll(async () => {
      const result = await client.createModel(uniqueModelName('RenameTest'));
      testModelId = result.data.id;
      db.trackModel(testModelId);
    });

    it('should update the model name', async () => {
      const newName = uniqueModelName('RenamedModel');
      const result = await client.updateModelName(testModelId, newName);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe(newName);
      expect(result.data.previousName).toBeDefined();

      // Verify the change persisted
      const getResult = await client.getModel(testModelId);
      expect(getResult.data.name).toBe(newName);
    });

    it('should reject rename without new name', async () => {
      const result = await client.put({
        action: 'updateModelName',
        modelId: testModelId
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('MISSING_PARAMETER');
    });
  });

  describe('validateModel', () => {
    let testModelId: string;

    beforeAll(async () => {
      const result = await client.createModel(uniqueModelName('ValidateTest'));
      testModelId = result.data.id;
      db.trackModel(testModelId);
    });

    it('should validate an empty model (warnings expected)', async () => {
      const result = await client.validateModel(testModelId);

      expect(result.success).toBe(true);
      expect(result.data.modelId).toBe(testModelId);
      expect(result.data.valid).toBeDefined();
      expect(Array.isArray(result.data.errors)).toBe(true);
      expect(Array.isArray(result.data.warnings)).toBe(true);
      // Empty model should have warnings about empty sheets
      expect(result.data.warnings.length).toBeGreaterThan(0);
    });

    it('should validate a model with blocks', async () => {
      // Add a block first (use 'source' type, not 'constant')
      await client.addBlock(testModelId, 'main', 'source', {
        name: 'TestConstant',
        parameters: { signalType: 'constant', value: 42 }
      });

      const result = await client.validateModel(testModelId);

      expect(result.success).toBe(true);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalBlocks).toBeGreaterThanOrEqual(1);
    });
  });

  describe('deleteModel', () => {
    it('should delete an existing model', async () => {
      // Create a model to delete
      const createResult = await client.createModel(uniqueModelName('DeleteTest'));
      const modelId = createResult.data.id;

      // Delete it
      const deleteResult = await client.delete('', { modelId });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data.modelId).toBe(modelId);

      // Verify it's gone
      const getResult = await client.getModel(modelId);
      expect(getResult.success).toBe(false);
      expect(getResult.code).toBe('MODEL_NOT_FOUND');
    });

    it('should return 404 for non-existent model', async () => {
      const result = await client.delete('', { modelId: 'non-existent-id' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('MODEL_NOT_FOUND');
    });
  });
});

// Log skip message if tests are being skipped
if (!shouldRunIntegrationTests()) {
  console.log(INTEGRATION_SKIP_MESSAGE);
}
