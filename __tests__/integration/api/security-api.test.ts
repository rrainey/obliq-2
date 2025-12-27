// __tests__/integration/api/security-api.test.ts
/**
 * @jest-environment node
 *
 * Security-focused integration tests for the Model Builder API.
 * Tests IDOR prevention, invalid token handling, and authorization checks.
 */

import {
  TestApiClient,
  TestDatabase,
  createTestDatabase,
  shouldRunIntegrationTests,
  shouldRunSecurityTests,
  INTEGRATION_SKIP_MESSAGE,
  SECURITY_SKIP_MESSAGE,
  createTestClient,
  createSecondUserClient,
  createInvalidTokenClient,
  createMalformedTokenClient,
  uniqueModelName
} from '../../support';

// Conditionally run tests based on environment
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;
const describeSecurity = shouldRunSecurityTests() ? describe : describe.skip;

// ============================================
// Invalid Token Tests (require only TEST_API_TOKEN)
// ============================================
describeIntegration('API Security: Invalid Token Handling', () => {
  describe('Invalid Token Format', () => {
    let invalidClient: TestApiClient;
    let malformedClient: TestApiClient;

    beforeAll(() => {
      invalidClient = createInvalidTokenClient();
      malformedClient = createMalformedTokenClient();
    });

    it('should reject requests with invalid token', async () => {
      const result = await invalidClient.get('getModel', { modelId: 'any-id' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with malformed token', async () => {
      const result = await malformedClient.get('getModel', { modelId: 'any-id' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject createModel with invalid token', async () => {
      const result = await invalidClient.createModel('TestModel');

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject write operations with invalid token', async () => {
      const result = await invalidClient.post({
        action: 'addBlock',
        modelId: 'any-id',
        sheetId: 'main',
        blockType: 'gain'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should reject delete operations with invalid token', async () => {
      const result = await invalidClient.delete('deleteModel', { modelId: 'any-id' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });
});

// ============================================
// Cross-User Access Tests (IDOR Prevention)
// Requires both TEST_API_TOKEN and TEST_API_TOKEN_USER2
// ============================================
describeSecurity('API Security: Cross-User Access Prevention (IDOR)', () => {
  let user1Client: TestApiClient;
  let user2Client: TestApiClient;
  let db: TestDatabase;
  let user1ModelId: string;
  let user1SheetId: string;
  let user1BlockId: string;
  let user1ConnectionId: string;

  beforeAll(async () => {
    user1Client = createTestClient();
    user2Client = createSecondUserClient();
    db = await createTestDatabase();

    // User 1 creates a model with blocks and connections
    const createResult = await user1Client.createModel(uniqueModelName('SecurityTest'));
    expect(createResult.success).toBe(true);
    user1ModelId = createResult.data.id;
    user1SheetId = 'main';
    db.trackModel(user1ModelId);

    // Add blocks
    const block1Result = await user1Client.addBlock(user1ModelId, user1SheetId, 'source', {
      name: 'Source1',
      parameters: { signalType: 'constant', value: 1 }
    });
    expect(block1Result.success).toBe(true);
    const block1Id = block1Result.data.block.id;

    const block2Result = await user1Client.addBlock(user1ModelId, user1SheetId, 'gain', {
      name: 'Gain1'
    });
    expect(block2Result.success).toBe(true);
    user1BlockId = block2Result.data.block.id;

    // Add connection
    const connResult = await user1Client.addConnection(
      user1ModelId,
      user1SheetId,
      block1Id,
      user1BlockId,
      { sourcePortIndex: 0, targetPortIndex: 0 }
    );
    expect(connResult.success).toBe(true);
    user1ConnectionId = connResult.data.connection.id;
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

  // ============================================
  // Model-level IDOR tests
  // ============================================
  describe('Model Access', () => {
    it('should deny user2 access to user1 model (getModel)', async () => {
      const result = await user2Client.getModel(user1ModelId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 access to user1 model metadata', async () => {
      const result = await user2Client.getModelMetadata(user1ModelId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from renaming user1 model', async () => {
      const result = await user2Client.updateModelName(user1ModelId, 'Hacked');

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from validating user1 model', async () => {
      const result = await user2Client.validateModel(user1ModelId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from deleting user1 model', async () => {
      const result = await user2Client.delete('deleteModel', { modelId: user1ModelId });

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');

      // Verify model still exists for user1
      const verifyResult = await user1Client.getModel(user1ModelId);
      expect(verifyResult.success).toBe(true);
    });
  });

  // ============================================
  // Sheet-level IDOR tests
  // ============================================
  describe('Sheet Access', () => {
    it('should deny user2 from listing sheets in user1 model', async () => {
      const result = await user2Client.listSheets(user1ModelId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from creating sheet in user1 model', async () => {
      const result = await user2Client.createSheet(user1ModelId, 'HackedSheet');

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from renaming sheet in user1 model', async () => {
      const result = await user2Client.renameSheet(user1ModelId, user1SheetId, 'HackedSheet');

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from deleting sheet in user1 model', async () => {
      const result = await user2Client.deleteSheet(user1ModelId, user1SheetId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from clearing sheet in user1 model', async () => {
      const result = await user2Client.clearSheet(user1ModelId, user1SheetId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from exporting sheet from user1 model', async () => {
      const result = await user2Client.exportSheet(user1ModelId, user1SheetId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from cloning sheet in user1 model', async () => {
      const result = await user2Client.cloneSheet(user1ModelId, user1SheetId, 'ClonedSheet');

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  // ============================================
  // Block-level IDOR tests
  // ============================================
  describe('Block Access', () => {
    it('should deny user2 from listing blocks in user1 model', async () => {
      const result = await user2Client.listBlocks(user1ModelId, user1SheetId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from getting block in user1 model', async () => {
      const result = await user2Client.getBlock(user1ModelId, user1SheetId, user1BlockId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from adding block to user1 model', async () => {
      const result = await user2Client.addBlock(user1ModelId, user1SheetId, 'gain', {
        name: 'HackedBlock'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from updating block position in user1 model', async () => {
      const result = await user2Client.updateBlockPosition(
        user1ModelId,
        user1SheetId,
        user1BlockId,
        { x: 999, y: 999 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from updating block name in user1 model', async () => {
      const result = await user2Client.updateBlockName(
        user1ModelId,
        user1SheetId,
        user1BlockId,
        'HackedName'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from updating block parameters in user1 model', async () => {
      const result = await user2Client.updateBlockParameters(
        user1ModelId,
        user1SheetId,
        user1BlockId,
        { gain: 999 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from deleting block in user1 model', async () => {
      const result = await user2Client.deleteBlock(user1ModelId, user1SheetId, user1BlockId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from getting block ports in user1 model', async () => {
      const result = await user2Client.getBlockPorts(user1ModelId, user1SheetId, user1BlockId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  // ============================================
  // Connection-level IDOR tests
  // ============================================
  describe('Connection Access', () => {
    it('should deny user2 from listing connections in user1 model', async () => {
      const result = await user2Client.listConnections(user1ModelId, user1SheetId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from getting connection in user1 model', async () => {
      const result = await user2Client.getConnection(user1ModelId, user1SheetId, user1ConnectionId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from adding connection to user1 model', async () => {
      const result = await user2Client.addConnection(
        user1ModelId,
        user1SheetId,
        'fake-block-1',
        'fake-block-2',
        { sourcePortIndex: 0, targetPortIndex: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from deleting connection in user1 model', async () => {
      const result = await user2Client.deleteConnection(user1ModelId, user1SheetId, user1ConnectionId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  // ============================================
  // Model-level parameter IDOR tests
  // ============================================
  describe('Model Parameter Access', () => {
    it('should deny user2 from listing model parameters', async () => {
      const result = await user2Client.listModelParameters(user1ModelId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from setting model parameter', async () => {
      const result = await user2Client.setModelParameter(
        user1ModelId,
        'hackedParam',
        'float',
        '42'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('should deny user2 from deleting model parameter', async () => {
      const result = await user2Client.deleteModelParameter(user1ModelId, 'someParam');

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  // ============================================
  // Verify user isolation works correctly
  // ============================================
  describe('User Isolation', () => {
    let user2ModelId: string;

    beforeAll(async () => {
      // User 2 creates their own model
      const result = await user2Client.createModel(uniqueModelName('User2Model'));
      expect(result.success).toBe(true);
      user2ModelId = result.data.id;
    });

    afterAll(async () => {
      // Clean up user 2's model
      await user2Client.delete('deleteModel', { modelId: user2ModelId });
    });

    it('user2 can access their own model', async () => {
      const result = await user2Client.getModel(user2ModelId);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(user2ModelId);
    });

    it('user1 cannot access user2 model', async () => {
      const result = await user1Client.getModel(user2ModelId);

      expect(result.success).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });

    it('user2 can modify their own model', async () => {
      const result = await user2Client.addBlock(user2ModelId, 'main', 'gain', {
        name: 'MyGain'
      });

      expect(result.success).toBe(true);
    });
  });
});

// Log skip messages if tests are being skipped
if (!shouldRunIntegrationTests()) {
  console.log(INTEGRATION_SKIP_MESSAGE);
}
if (shouldRunIntegrationTests() && !shouldRunSecurityTests()) {
  console.log(SECURITY_SKIP_MESSAGE);
}
