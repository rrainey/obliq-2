/**
 * @jest-environment node
 */

// __tests__/signalTypeIntegration.test.ts
// End-to-end Model Builder API workflows against the real local storage layer.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { getStorage, resetStorage } from '@/lib/server/storage';
import { ApiTokenService } from '@/lib/apiTokenService';
import { GET, POST } from '@/app/api/model-builder/route';
import { BlockTypes } from '@/lib/blockTypeRegistry';

describe('Model Builder API Integration Tests', () => {
  const baseUrl = 'http://localhost:3000/api/model-builder';
  let home: string;
  let validToken: string;

  // One fresh storage directory (and a real API token) for the whole suite;
  // the workflow tests below build on each other's state.
  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-signal-type-'));
    process.env.OBLIQ_HOME = home;
    resetStorage();
    const { token, tokenHash } = ApiTokenService.createToken();
    getStorage().tokens.create({ name: 'integration-test', tokenHash, expiresAt: null });
    validToken = token;
  });

  afterAll(() => {
    resetStorage();
    delete process.env.OBLIQ_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  // Helper to create a request with an Authorization header
  const createMockRequest = (method: string, url: string, body?: any, token?: string) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    return new NextRequest(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  };

  // Mock console methods to suppress expected error logs during tests
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  
  beforeAll(() => {
    console.error = jest.fn();
    console.log = jest.fn();
  });
  
  afterAll(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  describe('Complete Model Creation Workflow', () => {
    let modelId: string;
    let sheetId: string = 'main';
    let blockIds: string[] = [];
    let connectionId: string;
    let lastHash: string;

    // API mutations write model.json in place: no new version, but a new content hash
    const expectInPlaceWrite = (data: any) => {
      expect(data.data.newVersion).toBeNull();
      expect(data.data.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.data.hash).not.toBe(lastHash);
      expect(getStorage().models.readCurrent(modelId).hash).toBe(data.data.hash);
      lastHash = data.data.hash;
    };

    it('should create a new model', async () => {
      const body = {
        action: 'createModel',
        name: 'Integration Test Model'
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Integration Test Model');
      expect(data.data.id).toBeDefined();
      // The API creates the model and then creates version 1, so latest_version should be 1
      expect(data.data.latest_version).toBe(1);
      
      modelId = data.data.id;
      expect(getStorage().models.listVersions(modelId)).toHaveLength(1);
      lastHash = getStorage().models.readCurrent(modelId).hash;
    });

    it('should add a source block', async () => {
      const body = {
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: BlockTypes.SOURCE,
        name: 'TestSource',
        position: { x: 100, y: 100 },
        parameters: { value: '5.0', dataType: 'double' }
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.block.type).toBe(BlockTypes.SOURCE);
      expect(data.data.block.name).toBe('TestSource');
      expect(data.data.block.parameters.value).toBe('5.0');
      expectInPlaceWrite(data);
      
      blockIds.push(data.data.block.id);
    });

    it('should add a scale block', async () => {
      const body = {
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: BlockTypes.SCALE,
        name: 'TestScale',
        position: { x: 300, y: 100 },
        parameters: { factor: 2.5 }
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.block.type).toBe(BlockTypes.SCALE);
      expect(data.data.block.parameters.factor).toBe(2.5);
      expectInPlaceWrite(data);
      
      blockIds.push(data.data.block.id);
    });

    it('should add an output port block', async () => {
      const body = {
        action: 'addBlock',
        modelId,
        sheetId,
        blockType: BlockTypes.OUTPUT_PORT,
        name: 'TestOutput',
        position: { x: 500, y: 100 },
        parameters: { signalName: 'scaled_output' }
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.block.type).toBe(BlockTypes.OUTPUT_PORT);
      expectInPlaceWrite(data);
      
      blockIds.push(data.data.block.id);
    });

    it('should connect source to scale', async () => {
      const body = {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds[0], // Source
        sourcePortIndex: 0,
        targetBlockId: blockIds[1], // Scale
        targetPortIndex: 0
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.connection.sourceBlockId).toBe(blockIds[0]);
      expect(data.data.connection.targetBlockId).toBe(blockIds[1]);
      expectInPlaceWrite(data);
      
      connectionId = data.data.connection.id;
    });

    it('should connect scale to output', async () => {
      const body = {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds[1], // Scale
        sourcePortIndex: 0,
        targetBlockId: blockIds[2], // Output
        targetPortIndex: 0,
        checkpoint: true // Record a version snapshot for the finished model
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      // Only checkpointed writes record a version; createModel recorded version 1
      expect(data.data.newVersion).toBe(2);
      expect(getStorage().models.listVersions(modelId)).toHaveLength(2);
    });

    it('should validate the completed model', async () => {
      const body = {
        action: 'validateModel',
        modelId
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // Handler reports `isValid` (this test previously read a nonexistent `valid` field)
      expect(data.data.errors).toEqual([]);
      expect(data.data.isValid).toBe(true);
      expect(data.data.summary.totalBlocks).toBe(3);
      expect(data.data.summary.totalConnections).toBe(2);
    });

    it('should retrieve the complete model', async () => {
      const request = createMockRequest('GET', `${baseUrl}?modelId=${modelId}`, undefined, validToken);
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.id).toBe(modelId);
      expect(data.data.name).toBe('Integration Test Model');
      expect(data.data.data).toBeDefined();
      expect(data.data.data.sheets[0].blocks).toHaveLength(3);
      expect(data.data.data.sheets[0].connections).toHaveLength(2);
    });
  });

  describe('Batch Operations Workflow', () => {
    let modelId: string;

    beforeEach(async () => {
      // Create a base model for batch operations
      const body = {
        action: 'createModel',
        name: 'Batch Test Model'
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      modelId = data.data.id;
    });

    it('should execute multiple operations in a batch', async () => {
      const body = {
        action: 'batchOperations',
        operations: [
          {
            id: 'op1',
            action: 'addBlock',
            modelId,
            sheetId: 'main',
            blockType: BlockTypes.SUM,
            position: { x: 100, y: 100 }
          },
          {
            id: 'op2',
            action: 'addBlock',
            modelId,
            sheetId: 'main',
            blockType: BlockTypes.SOURCE,
            position: { x: 50, y: 50 },
            parameters: { value: '1.0' }
          },
          {
            id: 'op3',
            action: 'addBlock',
            modelId,
            sheetId: 'main',
            blockType: BlockTypes.SOURCE,
            position: { x: 50, y: 150 },
            parameters: { value: '2.0' }
          }
        ]
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.successCount).toBe(3);
      expect(data.data.failureCount).toBe(0);
      expect(data.data.results).toHaveLength(3);
      expect(getStorage().models.readCurrent(modelId).data.sheets[0].blocks).toHaveLength(3);
    });

    it('should handle mixed success/failure in non-transactional batch', async () => {
      const body = {
        action: 'batchOperations',
        transactional: false,
        operations: [
          {
            id: 'op1',
            action: 'addBlock',
            modelId,
            sheetId: 'main',
            blockType: BlockTypes.MULTIPLY,
            position: { x: 200, y: 100 }
          },
          {
            id: 'op2',
            action: 'addBlock',
            modelId: 'invalid-model-id', // This should fail
            sheetId: 'main',
            blockType: BlockTypes.SUM
          },
          {
            id: 'op3',
            action: 'addBlock',
            modelId,
            sheetId: 'main',
            blockType: BlockTypes.OUTPUT_PORT,
            position: { x: 400, y: 100 }
          }
        ]
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.successCount).toBe(2);
      expect(data.data.failureCount).toBe(1);
      expect(data.data.errors).toHaveLength(1);
      expect(data.data.errors[0].operationId).toBe('op2');
      // Non-transactional: the successful operations are kept
      const blocks = getStorage().models.readCurrent(modelId).data.sheets[0].blocks;
      expect(blocks.map((b: any) => b.type)).toEqual([BlockTypes.MULTIPLY, BlockTypes.OUTPUT_PORT]);
    });
  });

  describe('Sheet Label Workflow', () => {
    let modelId: string;
    let sheet1Id = 'main';
    let sheet2Id: string;
    let sinkBlockId: string;
    let sourceBlockId: string;

    beforeEach(async () => {
      const body = {
        action: 'createModel',
        name: 'Sheet Label Test Model'
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      modelId = data.data.id;
    });

    it('should create a second sheet', async () => {
      const body = {
        action: 'createSheet',
        modelId,
        name: 'Second Sheet'
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.sheet.name).toBe('Second Sheet');
      sheet2Id = data.data.sheet.id;
    });

    it('should add sheet label sink on first sheet', async () => {
      const body = {
        action: 'addBlock',
        modelId,
        sheetId: sheet1Id,
        blockType: BlockTypes.SHEET_LABEL_SINK,
        name: 'CrossSheetSignal',
        position: { x: 300, y: 100 },
        parameters: { signalName: 'shared_signal' }
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      sinkBlockId = data.data.block.id;
    });

    it('should add sheet label source on second sheet', async () => {
      // Each test gets a fresh model (beforeEach), so create the second sheet here
      const createSheetBody = {
        action: 'createSheet',
        modelId,
        name: 'Second Sheet'
      };

      const createSheetReq = createMockRequest('POST', `${baseUrl}`, createSheetBody, validToken);
      const createSheetRes = await POST(createSheetReq);
      const createSheetData = await createSheetRes.json();
      expect(createSheetRes.status).toBe(201);
      sheet2Id = createSheetData.data.sheet.id;

      const body = {
        action: 'addBlock',
        modelId,
        sheetId: sheet2Id,
        blockType: BlockTypes.SHEET_LABEL_SOURCE,
        name: 'CrossSheetReceiver',
        position: { x: 100, y: 100 },
        parameters: { signalName: 'shared_signal' }
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(201);
      sourceBlockId = data.data.block.id;
    });

    it('should validate sheet label connections', async () => {
      const body = {
        action: 'validateModel',
        modelId
      };
      
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      // Should have warning about unconnected sink, but no errors
      expect(data.data.errors).toHaveLength(0);
      expect(data.data.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should prevent duplicate connections', async () => {
      // Create model
      const createModelBody = {
        action: 'createModel',
        name: 'Duplicate Test Model'
      };
      
      const createModelReq = createMockRequest('POST', `${baseUrl}`, createModelBody, validToken);
      const createModelRes = await POST(createModelReq);
      const modelData = await createModelRes.json();
      const modelId = modelData.data.id;
      
      // Add two blocks
      const block1Body = {
        action: 'addBlock',
        modelId,
        sheetId: 'main',
        blockType: BlockTypes.SOURCE,
        position: { x: 100, y: 100 }
      };
      
      const block2Body = {
        action: 'addBlock',
        modelId,
        sheetId: 'main',
        blockType: BlockTypes.SCALE,
        position: { x: 300, y: 100 }
      };
      
      const req1 = createMockRequest('POST', `${baseUrl}`, block1Body, validToken);
      const req2 = createMockRequest('POST', `${baseUrl}`, block2Body, validToken);
      
      const res1 = await POST(req1);
      const res2 = await POST(req2);
      
      const block1Id = (await res1.json()).data.block.id;
      const block2Id = (await res2.json()).data.block.id;
      
      // First connection should succeed
      const conn1Body = {
        action: 'addConnection',
        modelId,
        sheetId: 'main',
        sourceBlockId: block1Id,
        sourcePortIndex: 0,
        targetBlockId: block2Id,
        targetPortIndex: 0
      };

      const connReq1 = createMockRequest('POST', `${baseUrl}`, conn1Body, validToken);
      const connRes1 = await POST(connReq1);

      expect(connRes1.status).toBe(201);

      // Try to connect to the same input port again (should fail)
      const conn2Body = {
        action: 'addConnection',
        modelId,
        sheetId: 'main',
        sourceBlockId: block1Id,
        sourcePortIndex: 0,
        targetBlockId: block2Id,
        targetPortIndex: 0
      };
      
      const connReq2 = createMockRequest('POST', `${baseUrl}`, conn2Body, validToken);
      const connRes2 = await POST(connReq2);
      const connData2 = await connRes2.json();
      
      expect(connRes2.status).toBe(400);
      // The API actually checks for the same exact connection first
      expect(connData2.code).toBe('PORT_ALREADY_CONNECTED');
    });

    it('should prevent self-connections', async () => {
      // Create model
      const createModelBody = {
        action: 'createModel',
        name: 'Self Connection Test'
      };
      
      const createModelReq = createMockRequest('POST', `${baseUrl}`, createModelBody, validToken);
      const createModelRes = await POST(createModelReq);
      const modelData = await createModelRes.json();
      const modelId = modelData.data.id;
      
      // Add a transfer function block (has both input and output)
      const blockBody = {
        action: 'addBlock',
        modelId,
        sheetId: 'main',
        blockType: BlockTypes.TRANSFER_FUNCTION,
        position: { x: 200, y: 200 }
      };
      
      const blockReq = createMockRequest('POST', `${baseUrl}`, blockBody, validToken);
      const blockRes = await POST(blockReq);
      const blockId = (await blockRes.json()).data.block.id;
      
      // Try to connect block to itself
      const connBody = {
        action: 'addConnection',
        modelId,
        sheetId: 'main',
        sourceBlockId: blockId,
        sourcePortIndex: 0,
        targetBlockId: blockId,
        targetPortIndex: 0
      };
      
      const connReq = createMockRequest('POST', `${baseUrl}`, connBody, validToken);
      const connRes = await POST(connReq);
      const connData = await connRes.json();
      
      expect(connRes.status).toBe(400);
      expect(connData.code).toBe('SELF_CONNECTION');
    });

    it('should handle parameter validation for different block types', async () => {
      // Create model
      const createModelBody = {
        action: 'createModel',
        name: 'Parameter Validation Test'
      };
      
      const createModelReq = createMockRequest('POST', `${baseUrl}`, createModelBody, validToken);
      const createModelRes = await POST(createModelReq);
      const modelData = await createModelRes.json();
      const modelId = modelData.data.id;
      
      // Test invalid transfer function parameters
      const tfBody = {
        action: 'addBlock',
        modelId,
        sheetId: 'main',
        blockType: BlockTypes.TRANSFER_FUNCTION,
        position: { x: 100, y: 100 },
        parameters: {
          numerator: [], // Empty array - should fail
          denominator: [0, 1] // Leading zero - should fail
        }
      };
      
      const tfReq = createMockRequest('POST', `${baseUrl}`, tfBody, validToken);
      const tfRes = await POST(tfReq);
      const tfData = await tfRes.json();
      
      expect(tfRes.status).toBe(400);
      expect(tfData.code).toBe('VALIDATION_FAILED');
      expect(tfData.details.errors).toContain('numerator must be a non-empty array of numbers');
      expect(tfData.details.errors).toContain('denominator leading coefficient cannot be zero');
    });
  });
});