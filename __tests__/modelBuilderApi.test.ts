/**
 * @jest-environment node
 */

// __tests__/modelBuilderApi.test.ts

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { getStorage, resetStorage } from '@/lib/server/storage';
import { ApiTokenService } from '@/lib/apiTokenService';
import { GET, POST, PUT, DELETE } from '@/app/api/model-builder/route';

describe('Model Builder API', () => {
  const invalidToken = 'invalid-token';
  const baseUrl = 'http://localhost:3000/api/model-builder';

  let home: string;
  let validToken: string;

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

  // Fresh storage (and a real API token) for every test
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-model-builder-'));
    process.env.OBLIQ_HOME = home;
    resetStorage();
    const { token, tokenHash } = ApiTokenService.createToken();
    getStorage().tokens.create({ name: 'test', tokenHash, expiresAt: null });
    validToken = token;
  });

  afterEach(() => {
    resetStorage();
    delete process.env.OBLIQ_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  // Helper to create a request with an Authorization header
  const createRequest = (method: string, url: string, body?: any, token?: string) => {
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

  // Create a model through the API and return its id
  const createModel = async (name = 'Test Model'): Promise<string> => {
    const response = await POST(createRequest('POST', baseUrl, { action: 'createModel', name }, validToken));
    expect(response.status).toBe(201);
    return (await response.json()).data.id;
  };

  // Add a block through the API and return its id
  const addBlock = async (modelId: string, blockType: string, position = { x: 100, y: 100 }): Promise<string> => {
    const response = await POST(createRequest('POST', baseUrl, {
      action: 'addBlock', modelId, sheetId: 'main', blockType, position
    }, validToken));
    expect(response.status).toBe(201);
    return (await response.json()).data.block.id;
  };

  describe('Authentication', () => {
    it('should reject requests with invalid token', async () => {
      const request = createRequest('GET', `${baseUrl}?modelId=123`, undefined, invalidToken);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should accept requests with valid token', async () => {
      const modelId = await createModel();
      const request = createRequest('GET', `${baseUrl}?modelId=${modelId}`, undefined, validToken);
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should reject requests with missing token', async () => {
      const request = createRequest('GET', `${baseUrl}?modelId=123`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.code).toBe('UNAUTHORIZED');
    });

    it('should reject an expired token', async () => {
      const { token, tokenHash } = ApiTokenService.createToken();
      getStorage().tokens.create({ name: 'expired', tokenHash, expiresAt: '2000-01-01T00:00:00.000Z' });
      const response = await GET(createRequest('GET', `${baseUrl}?modelId=123`, undefined, token));

      expect(response.status).toBe(401);
    });
  });

  describe('GET endpoints', () => {
    it('should return 404 for a nonexistent model', async () => {
      const request = createRequest('GET', `${baseUrl}?modelId=123`, undefined, validToken);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.code).toBe('MODEL_NOT_FOUND');
    });

    it('should handle getModel request', async () => {
      const modelId = await createModel('Get Me');
      const request = createRequest('GET', `${baseUrl}?modelId=${modelId}`, undefined, validToken);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.id).toBe(modelId);
      expect(data.data.name).toBe('Get Me');
      expect(data.data.latest_version).toBe(1);
      expect(data.data.data.sheets).toHaveLength(1);
      expect(data.data.data.sheets[0].id).toBe('main');
    });

    it('should handle missing modelId for getModel', async () => {
      const request = createRequest('GET', `${baseUrl}`, undefined, validToken);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('MISSING_PARAMETER');
    });

    it('should handle listSheets action', async () => {
      const modelId = await createModel();
      const request = createRequest('GET', `${baseUrl}?action=listSheets&modelId=${modelId}`, undefined, validToken);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(JSON.stringify(data.data)).toContain('"main"');
    });

    it('should return 404 from listSheets for a nonexistent model', async () => {
      const request = createRequest('GET', `${baseUrl}?action=listSheets&modelId=123`, undefined, validToken);
      const response = await GET(request);

      expect(response.status).toBe(404);
    });

    it('should handle unknown action', async () => {
      const request = createRequest('GET', `${baseUrl}?action=unknownAction`, undefined, validToken);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('UNKNOWN_ACTION');
    });
  });

  describe('POST endpoints', () => {
    it('should handle createModel request', async () => {
      const body = {
        action: 'createModel',
        name: 'Test Model'
      };
      const request = createRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Model');
      expect(data.data.latest_version).toBe(1);
      expect(data.data.mainSheet).toEqual({ id: 'main', name: 'Main' });

      // The model is really in storage
      const record = getStorage().models.require(data.data.id);
      expect(record.name).toBe('Test Model');
      expect(getStorage().models.listVersions(data.data.id)).toHaveLength(1);
    });

    it('should validate createModel parameters', async () => {
      const body = {
        action: 'createModel',
        // Missing required parameters
      };
      const request = createRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('MISSING_PARAMETER');
    });

    it('should reject invalid JSON', async () => {
      const request = new NextRequest(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${validToken}` },
        body: '{not json'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_JSON');
    });
  });

  describe('PUT endpoints', () => {
    it('should handle updateBlockPosition request', async () => {
      const modelId = await createModel();
      const blockId = await addBlock(modelId, 'source');

      const body = {
        action: 'updateBlockPosition',
        modelId,
        sheetId: 'main',
        blockId,
        position: { x: 100, y: 200 }
      };
      const request = createRequest('PUT', `${baseUrl}`, body, validToken);
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.position).toEqual({ x: 100, y: 200 });
      // Mutations write in place: no new version, but a content hash
      expect(data.data.newVersion).toBeNull();
      expect(data.data.hash).toMatch(/^[0-9a-f]{64}$/);

      const current = getStorage().models.readCurrent(modelId);
      expect(current.hash).toBe(data.data.hash);
      expect(current.data.sheets[0].blocks[0].position).toEqual({ x: 100, y: 200 });
    });

    it('should return 404 when updating a block in a nonexistent model', async () => {
      const body = {
        action: 'updateBlockPosition',
        modelId: '123',
        sheetId: 'main',
        blockId: 'block-1',
        position: { x: 100, y: 200 }
      };
      const request = createRequest('PUT', `${baseUrl}`, body, validToken);
      const response = await PUT(request);

      expect(response.status).toBe(404);
    });

    it('should record a version when checkpoint is requested', async () => {
      const modelId = await createModel();
      const blockId = await addBlock(modelId, 'source');

      const request = createRequest('PUT', `${baseUrl}`, {
        action: 'updateBlockPosition',
        modelId,
        sheetId: 'main',
        blockId,
        position: { x: 10, y: 20 },
        checkpoint: true
      }, validToken);
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.newVersion).toBe(2);
      expect(getStorage().models.listVersions(modelId)).toHaveLength(2);
    });

    it('should validate position format', async () => {
      const body = {
        action: 'updateBlockPosition',
        modelId: '123',
        sheetId: 'main',
        blockId: 'block-1',
        position: { x: 'not-a-number', y: 200 }
      };
      const request = createRequest('PUT', `${baseUrl}`, body, validToken);
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_POSITION');
    });
  });

  describe('DELETE endpoints', () => {
    it('should handle deleteModel request', async () => {
      const modelId = await createModel();
      const request = createRequest('DELETE', `${baseUrl}?modelId=${modelId}`, undefined, validToken);
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.modelId).toBe(modelId);
      expect(getStorage().models.get(modelId)).toBeNull();

      // Deleting again is a 404
      const again = await DELETE(createRequest('DELETE', `${baseUrl}?modelId=${modelId}`, undefined, validToken));
      expect(again.status).toBe(404);
    });

    it('should handle deleteBlock with action', async () => {
      const modelId = await createModel();
      const blockId = await addBlock(modelId, 'source');

      const request = createRequest('DELETE', `${baseUrl}?action=deleteBlock&modelId=${modelId}&sheetId=main&blockId=${blockId}`, undefined, validToken);
      const response = await DELETE(request);

      expect(response.status).toBe(200);
      expect(getStorage().models.readCurrent(modelId).data.sheets[0].blocks).toHaveLength(0);
    });

    it('should return 404 when deleting a block from a nonexistent model', async () => {
      const request = createRequest('DELETE', `${baseUrl}?action=deleteBlock&modelId=123&sheetId=main&blockId=block-1`, undefined, validToken);
      const response = await DELETE(request);

      expect(response.status).toBe(404);
    });
  });

  describe('Batch operations', () => {
    it('should validate batch operations structure', async () => {
      const body = {
        action: 'batchOperations',
        operations: 'not-an-array' // Invalid
      };
      const request = createRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_OPERATIONS');
    });

    it('should reject empty operations array', async () => {
      const body = {
        action: 'batchOperations',
        operations: []
      };
      const request = createRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('EMPTY_OPERATIONS');
    });

    it('should roll back a failed transactional batch', async () => {
      const modelId = await createModel();
      const before = getStorage().models.readCurrent(modelId).hash;

      const body = {
        action: 'batchOperations',
        transactional: true,
        operations: [
          { id: 'op1', action: 'addBlock', modelId, sheetId: 'main', blockType: 'source', position: { x: 0, y: 0 } },
          { id: 'op2', action: 'addBlock', modelId, sheetId: 'no-such-sheet', blockType: 'source' }
        ]
      };
      const response = await POST(createRequest('POST', `${baseUrl}`, body, validToken));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.rolledBack).toBe(true);
      expect(data.data.errors[0].operationId).toBe('op2');
      const after = getStorage().models.readCurrent(modelId);
      expect(after.hash).toBe(before);
      expect(after.data.sheets[0].blocks).toHaveLength(0);
    });
  });
});
