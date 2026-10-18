/**
 * @jest-environment node
 */

// __tests__/modelBuilderApi.unit.test.ts

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';
import { getStorage, resetStorage } from '@/lib/server/storage';
import { SESSION_COOKIE, sessionCookieValue, LOCAL_USER_ID } from '@/lib/server/session';
import { ApiTokenService } from '@/lib/apiTokenService';
import { authenticateRequest } from '@/lib/apiAuthMiddleware';
import { GET, POST } from '@/app/api/model-builder/route';

const baseUrl = 'http://localhost:3000/api/model-builder';

// Helper to create a request with an Authorization header (or extra headers)
const createRequest = (method: string, url: string, body?: any, token?: string, extraHeaders: Record<string, string> = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extraHeaders };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
};

// Register a real API token in the current storage and return the raw token
const createApiToken = (): string => {
  const { token, tokenHash } = ApiTokenService.createToken();
  getStorage().tokens.create({ name: 'unit-test', tokenHash, expiresAt: null });
  return token;
};

describe('Model Builder API Basic Tests', () => {
  let home: string;

  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-model-builder-unit-'));
    process.env.OBLIQ_HOME = home;
    resetStorage();
  });

  afterEach(() => {
    resetStorage();
    delete process.env.OBLIQ_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('should validate authentication - reject invalid token', async () => {
    // Well-formed but unregistered token, and a malformed token
    const unknown = ApiTokenService.createToken().token;
    for (const token of [unknown, 'invalid-token']) {
      const request = createRequest('GET', `${baseUrl}?modelId=123`, undefined, token);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    }
  });

  it('should handle missing parameters with user token', async () => {
    const token = createApiToken();

    // Create request with user token but missing 'name' parameter
    const request = createRequest('POST', baseUrl, { action: 'createModel' }, token);

    const response = await POST(request);
    const data = await response.json();

    // Should get MISSING_PARAMETER for 'name'
    expect(response.status).toBe(400);
    expect(data.code).toBe('MISSING_PARAMETER');
  });

  // Previously 'should reject tokens without userId': there is now a single
  // local user, so every valid credential resolves to LOCAL_USER_ID.
  it('should resolve API tokens and the session cookie to the local user', async () => {
    const token = createApiToken();

    const viaToken = await authenticateRequest(createRequest('GET', baseUrl, undefined, token));
    expect(viaToken).toMatchObject({ authenticated: true, userId: LOCAL_USER_ID, authMethod: 'api_token' });

    const viaCookie = await authenticateRequest(
      createRequest('GET', baseUrl, undefined, undefined, { cookie: `${SESSION_COOKIE}=${sessionCookieValue()}` })
    );
    expect(viaCookie).toMatchObject({ authenticated: true, userId: LOCAL_USER_ID, authMethod: 'session' });

    const badCookie = await authenticateRequest(
      createRequest('GET', baseUrl, undefined, undefined, { cookie: `${SESSION_COOKIE}=nope` })
    );
    expect(badCookie.authenticated).toBe(false);
  });

  it('should accept the session cookie on the model-builder route', async () => {
    const request = createRequest('POST', baseUrl, { action: 'createModel', name: 'Cookie Model' }, undefined, {
      cookie: `${SESSION_COOKIE}=${sessionCookieValue()}`
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  // Previously asserted the token's userId reached the hosted DB insert; now
  // verify the model actually lands in local storage.
  it('should persist createModel to storage', async () => {
    const token = createApiToken();

    const request = createRequest('POST', baseUrl, {
      action: 'createModel',
      name: 'My New Model'
    }, token);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.data.latest_version).toBe(1);

    const record = getStorage().models.require(data.data.id);
    expect(record.name).toBe('My New Model');
    const current = getStorage().models.readCurrent(data.data.id);
    expect(current.data.sheets[0].id).toBe('main');

    // And the token's last-used timestamp was touched
    const tokens = getStorage().tokens.list();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].last_used_at).toBeTruthy();
  });

  it('should validate batch operations', async () => {
    const token = createApiToken();

    // Test invalid operations type
    const request1 = createRequest('POST', baseUrl, { action: 'batchOperations', operations: 'not-an-array' }, token);

    const response1 = await POST(request1);
    const data1 = await response1.json();

    expect(response1.status).toBe(400);
    expect(data1.code).toBe('INVALID_OPERATIONS');

    // Test empty operations
    const request2 = createRequest('POST', baseUrl, { action: 'batchOperations', operations: [] }, token);

    const response2 = await POST(request2);
    const data2 = await response2.json();

    expect(response2.status).toBe(400);
    expect(data2.code).toBe('EMPTY_OPERATIONS');

    // Test too many operations
    const operations = Array(51).fill({ action: 'getModel', modelId: '123' });
    const request3 = createRequest('POST', baseUrl, { action: 'batchOperations', operations }, token);

    const response3 = await POST(request3);
    const data3 = await response3.json();

    expect(response3.status).toBe(400);
    expect(data3.code).toBe('TOO_MANY_OPERATIONS');
  });
});
