// __tests__/integration/api/connection-api.test.ts
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

describeIntegration('Connection API Integration Tests', () => {
  let client: TestApiClient;
  let db: TestDatabase;
  let testModelId: string;
  const mainSheetId = 'main';

  // Pre-created blocks for connection tests
  let constantBlockId: string;
  let scaleBlockId: string;
  let sumBlockId: string;

  beforeAll(async () => {
    client = createTestClient();
    db = await createTestDatabase();

    // Create a test model
    const modelResult = await client.createModel(uniqueModelName('ConnectionTests'));
    if (!modelResult.success) {
      throw new Error(`Failed to create model: ${modelResult.error}`);
    }
    testModelId = modelResult.data.id;
    db.trackModel(testModelId);

    // Create blocks for testing connections
    // Note: 'constant' is not a block type - use 'source' with signalType: 'constant'
    const constantResult = await client.addBlock(testModelId, mainSheetId, 'source', {
      name: 'Source1',
      parameters: { signalType: 'constant', value: 10 }
    });
    if (!constantResult.success) {
      throw new Error(`Failed to add source block: ${constantResult.error} (code: ${constantResult.code})`);
    }
    constantBlockId = constantResult.data.block.id;

    const scaleResult = await client.addBlock(testModelId, mainSheetId, 'scale', {
      name: 'Target1',
      parameters: { gain: 2.0 }
    });
    if (!scaleResult.success) {
      throw new Error(`Failed to add scale block: ${scaleResult.error} (code: ${scaleResult.code})`);
    }
    scaleBlockId = scaleResult.data.block.id;

    const sumResult = await client.addBlock(testModelId, mainSheetId, 'sum', {
      name: 'MultiInput',
      parameters: { numInputs: 3 }
    });
    if (!sumResult.success) {
      throw new Error(`Failed to add sum block: ${sumResult.error} (code: ${sumResult.code})`);
    }
    sumBlockId = sumResult.data.block.id;
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('addConnection', () => {
    it('should create a connection using port indices', async () => {
      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        constantBlockId,
        scaleBlockId,
        { sourcePortIndex: 0, targetPortIndex: 0 }
      );

      expect(result.success).toBe(true);
      expect(result.data.connection).toBeDefined();
      expect(result.data.connection.id).toBeDefined();
      expect(result.data.connection.sourceBlockId).toBe(constantBlockId);
      expect(result.data.connection.targetBlockId).toBe(scaleBlockId);
      expect(result.data.connection.sourcePortIndex).toBe(0);
      expect(result.data.connection.targetPortIndex).toBe(0);
      expect(result.data.newVersion).toBeGreaterThan(1);
    });

    // Skip: Connection by port names is not currently supported by the API
    // The API only supports sourcePortIndex/targetPortIndex
    it.skip('should create a connection using port names', async () => {
      // Create new blocks for this test
      const src = await client.addBlock(testModelId, mainSheetId, 'source', { name: 'NameSrc' });
      const tgt = await client.addBlock(testModelId, mainSheetId, 'scale', { name: 'NameTgt' });

      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        src.data.block.id,
        tgt.data.block.id,
        { sourcePort: 'out', targetPort: 'in' }
      );

      expect(result.success).toBe(true);
      expect(result.data.connection.sourcePort).toBe('out');
      expect(result.data.connection.targetPort).toBe('in');
    });

    it('should connect to sum block at specific input port', async () => {
      // Create a source and connect to sum input port 1
      const srcResult = await client.addBlock(testModelId, mainSheetId, 'source', {
        name: 'SumInput1'
      });

      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        srcResult.data.block.id,
        sumBlockId,
        { sourcePortIndex: 0, targetPortIndex: 1 }
      );

      expect(result.success).toBe(true);
      expect(result.data.connection.targetPortIndex).toBe(1);
    });

    it('should reject duplicate connection to same input port', async () => {
      // Create new blocks
      const src1 = await client.addBlock(testModelId, mainSheetId, 'source', { name: 'DupSrc1' });
      const src2 = await client.addBlock(testModelId, mainSheetId, 'source', { name: 'DupSrc2' });
      const tgt = await client.addBlock(testModelId, mainSheetId, 'scale', { name: 'DupTgt' });

      // First connection should succeed
      const conn1 = await client.addConnection(
        testModelId,
        mainSheetId,
        src1.data.block.id,
        tgt.data.block.id,
        { sourcePortIndex: 0, targetPortIndex: 0 }
      );
      expect(conn1.success).toBe(true);

      // Second connection to same input should fail
      const conn2 = await client.addConnection(
        testModelId,
        mainSheetId,
        src2.data.block.id,
        tgt.data.block.id,
        { sourcePortIndex: 0, targetPortIndex: 0 }
      );
      expect(conn2.success).toBe(false);
      expect(conn2.code).toBe('PORT_ALREADY_CONNECTED');
    });

    it('should reject self-connection', async () => {
      const block = await client.addBlock(testModelId, mainSheetId, 'scale', { name: 'SelfConn' });

      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        block.data.block.id,
        block.data.block.id,
        { sourcePortIndex: 0, targetPortIndex: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('SELF_CONNECTION');
    });

    it('should reject invalid source port index', async () => {
      const src = await client.addBlock(testModelId, mainSheetId, 'source', { name: 'BadSrc' });
      const tgt = await client.addBlock(testModelId, mainSheetId, 'scale', { name: 'BadTgt' });

      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        src.data.block.id,
        tgt.data.block.id,
        { sourcePortIndex: 99, targetPortIndex: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_PORT');
    });

    it('should reject invalid target port index', async () => {
      const src = await client.addBlock(testModelId, mainSheetId, 'source', { name: 'BadSrc2' });
      const tgt = await client.addBlock(testModelId, mainSheetId, 'scale', { name: 'BadTgt2' });

      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        src.data.block.id,
        tgt.data.block.id,
        { sourcePortIndex: 0, targetPortIndex: 99 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('INVALID_PORT');
    });

    it('should reject connection to non-existent block', async () => {
      const src = await client.addBlock(testModelId, mainSheetId, 'source', { name: 'NoTgt' });

      const result = await client.addConnection(
        testModelId,
        mainSheetId,
        src.data.block.id,
        'non-existent-block',
        { sourcePortIndex: 0, targetPortIndex: 0 }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('BLOCK_NOT_FOUND');
    });
  });

  describe('listConnections', () => {
    let connTestModelId: string;

    beforeAll(async () => {
      // Create a fresh model with known connections
      const model = await client.createModel(uniqueModelName('ListConnTest'));
      if (!model.success) {
        throw new Error(`Failed to create model: ${model.error}`);
      }
      connTestModelId = model.data.id;
      db.trackModel(connTestModelId);

      // Add blocks
      const src1 = await client.addBlock(connTestModelId, 'main', 'source', { name: 'Src1' });
      if (!src1.success) {
        throw new Error(`Failed to add src1 block: ${src1.error} (code: ${src1.code})`);
      }
      const src2 = await client.addBlock(connTestModelId, 'main', 'source', { name: 'Src2' });
      if (!src2.success) {
        throw new Error(`Failed to add src2 block: ${src2.error} (code: ${src2.code})`);
      }
      const sum = await client.addBlock(connTestModelId, 'main', 'sum', {
        name: 'Sum',
        parameters: { numInputs: 2 }
      });
      if (!sum.success) {
        throw new Error(`Failed to add sum block: ${sum.error} (code: ${sum.code})`);
      }

      // Create connections
      await client.addConnection(connTestModelId, 'main', src1.data.block.id, sum.data.block.id, {
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
      await client.addConnection(connTestModelId, 'main', src2.data.block.id, sum.data.block.id, {
        sourcePortIndex: 0,
        targetPortIndex: 1
      });
    });

    it('should list all connections in a sheet', async () => {
      const result = await client.listConnections(connTestModelId, 'main');

      expect(result.success).toBe(true);
      expect(result.data.connectionCount).toBe(2);
      expect(Array.isArray(result.data.connections)).toBe(true);

      // Verify connection structure
      const conn = result.data.connections[0];
      expect(conn.id).toBeDefined();
      expect(conn.sourceBlockId).toBeDefined();
      expect(conn.targetBlockId).toBeDefined();
      expect(conn.sourcePortIndex).toBeDefined();
      expect(conn.targetPortIndex).toBeDefined();
      expect(conn.sourceBlockName).toBeDefined();
      expect(conn.targetBlockName).toBeDefined();
    });
  });

  describe('getConnection', () => {
    let testConnectionId: string;
    let getConnModelId: string;

    beforeAll(async () => {
      const model = await client.createModel(uniqueModelName('GetConnTest'));
      if (!model.success) {
        throw new Error(`Failed to create model: ${model.error}`);
      }
      getConnModelId = model.data.id;
      db.trackModel(getConnModelId);

      const src = await client.addBlock(getConnModelId, 'main', 'source', { name: 'GSrc' });
      if (!src.success) {
        throw new Error(`Failed to add src block: ${src.error} (code: ${src.code})`);
      }
      const tgt = await client.addBlock(getConnModelId, 'main', 'scale', { name: 'GTgt' });
      if (!tgt.success) {
        throw new Error(`Failed to add tgt block: ${tgt.error} (code: ${tgt.code})`);
      }

      const conn = await client.addConnection(getConnModelId, 'main', src.data.block.id, tgt.data.block.id, {
        sourcePortIndex: 0,
        targetPortIndex: 0
      });
      if (!conn.success) {
        throw new Error(`Failed to add connection: ${conn.error} (code: ${conn.code})`);
      }
      testConnectionId = conn.data.connection.id;
    });

    it('should get a specific connection by ID', async () => {
      const result = await client.getConnection(getConnModelId, 'main', testConnectionId);

      expect(result.success).toBe(true);
      expect(result.data.connection.id).toBe(testConnectionId);
      expect(result.data.connection.source).toBeDefined();
      expect(result.data.connection.target).toBeDefined();
      expect(result.data.connection.source.blockName).toBeDefined();
      expect(result.data.connection.target.blockName).toBeDefined();
    });

    it('should return 404 for non-existent connection', async () => {
      const result = await client.getConnection(getConnModelId, 'main', 'non-existent-conn');

      expect(result.success).toBe(false);
      expect(result.code).toBe('CONNECTION_NOT_FOUND');
    });
  });

  describe('deleteConnection', () => {
    it('should delete a connection', async () => {
      // Create a model with a connection to delete
      const model = await client.createModel(uniqueModelName('DelConnTest'));
      db.trackModel(model.data.id);

      const src = await client.addBlock(model.data.id, 'main', 'source', { name: 'DelSrc' });
      const tgt = await client.addBlock(model.data.id, 'main', 'scale', { name: 'DelTgt' });

      const conn = await client.addConnection(model.data.id, 'main', src.data.block.id, tgt.data.block.id, {
        sourcePortIndex: 0,
        targetPortIndex: 0
      });

      // Delete the connection
      const deleteResult = await client.deleteConnection(model.data.id, 'main', conn.data.connection.id);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data.deletedConnection.id).toBe(conn.data.connection.id);
      expect(deleteResult.data.remainingConnectionCount).toBe(0);

      // Verify it's gone
      const getResult = await client.getConnection(model.data.id, 'main', conn.data.connection.id);
      expect(getResult.success).toBe(false);
    });

    it('should return 404 for non-existent connection', async () => {
      const result = await client.deleteConnection(testModelId, mainSheetId, 'non-existent-conn');

      expect(result.success).toBe(false);
      expect(result.code).toBe('CONNECTION_NOT_FOUND');
    });
  });
});

if (!shouldRunIntegrationTests()) {
  console.log(INTEGRATION_SKIP_MESSAGE);
}
