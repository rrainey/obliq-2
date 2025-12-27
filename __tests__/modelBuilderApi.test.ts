// __tests__/modelBuilderApi.test.ts

/**
 * @jest-environment node
 */

// Mock Next.js modules before imports
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init) => {
    const urlObj = new URL(url);
    return {
      url,
      method: init?.method || 'GET',
      headers: new Map(Object.entries(init?.headers || {})),
      text: async () => init?.body || '',
      json: async () => init?.body ? JSON.parse(init.body) : {},
      nextUrl: urlObj
    };
  }),
  NextResponse: {
    json: jest.fn((data, init) => ({
      status: init?.status || 200,
      headers: init?.headers || {},
      json: async () => data,
      ok: (init?.status || 200) >= 200 && (init?.status || 200) < 300
    }))
  }
}));

// Mock Supabase client with chainable eq() support
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => {
      // Create a chainable eq function
      const createChainableResult = (): any => ({
        eq: jest.fn(() => createChainableResult()),
        single: jest.fn(() => ({ data: null, error: null })),
        order: jest.fn(() => ({
          limit: jest.fn(() => ({
            single: jest.fn(() => ({ data: null, error: null }))
          }))
        }))
      });

      return {
        select: jest.fn(() => createChainableResult()),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => ({ data: null, error: { message: 'Mock error' } }))
          }))
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({ error: null }))
        })),
        delete: jest.fn(() => ({
          eq: jest.fn(() => ({ error: null }))
        }))
      };
    })
  }))
}));

// Mock API auth middleware to simplify authentication testing
// All API access requires user tokens - userId is always derived from the token
jest.mock('../src/lib/apiAuthMiddleware', () => ({
  authenticateApiRequest: jest.fn(async (token: string) => {
    if (token === 'test-token-123') {
      return { authenticated: true, userId: 'test-user-123' };
    }
    return { authenticated: false, error: 'Invalid or missing API token' };
  })
}));

// Set up environment variables
process.env.MODEL_BUILDER_API_TOKEN = 'test-token-123';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// Import after mocks are set up
import { GET, POST, PUT, DELETE } from '@/app/api/model-builder/route';

describe('Model Builder API', () => {
  const validToken = 'test-token-123';
  const invalidToken = 'invalid-token';
  const baseUrl = 'http://localhost:3000/api/model-builder';

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

  // Helper to create mock request with Authorization header
  const createMockRequest = (method: string, url: string, body?: any, token?: string) => {
    const urlObj = new URL(url);
    const headers = new Map<string, string>([['content-type', 'application/json']]);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }

    return {
      url,
      method,
      headers: {
        get: (key: string) => headers.get(key.toLowerCase()) || null
      },
      text: async () => body ? JSON.stringify(body) : '',
      json: async () => body || {},
      nextUrl: urlObj
    };
  };

  describe('Authentication', () => {
    it('should reject requests with invalid token', async () => {
      const request = createMockRequest('GET', `${baseUrl}?modelId=123`, undefined, invalidToken);
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or missing API token');
    });

    it('should accept requests with valid token', async () => {
      const request = createMockRequest('GET', `${baseUrl}?modelId=123`, undefined, validToken);
      const response = await GET(request as any);

      expect(response.status).not.toBe(401);
    });

    it('should reject requests with missing token', async () => {
      const request = createMockRequest('GET', `${baseUrl}?modelId=123`);
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.code).toBe('MISSING_AUTH_HEADER');
    });
  });

  describe('GET endpoints', () => {
    it('should handle getModel request', async () => {
      const request = createMockRequest('GET', `${baseUrl}?modelId=123`, undefined, validToken);
      const response = await GET(request as any);

      // Since mock returns null data, expect 404
      expect(response.status).toBe(404);
    });

    it('should handle missing modelId for getModel', async () => {
      const request = createMockRequest('GET', `${baseUrl}`, undefined, validToken);
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('MISSING_PARAMETER');
    });

    it('should handle listSheets action', async () => {
      const request = createMockRequest('GET', `${baseUrl}?action=listSheets&modelId=123`, undefined, validToken);
      const response = await GET(request as any);

      // Mock doesn't return data, so expect 404
      expect(response.status).toBe(404);
    });

    it('should handle unknown action', async () => {
      const request = createMockRequest('GET', `${baseUrl}?action=unknownAction`, undefined, validToken);
      const response = await GET(request as any);
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
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request as any);

      // Mock returns error, so expect 500
      expect(response.status).toBe(500);
    });

    it('should validate createModel parameters', async () => {
      const body = {
        action: 'createModel',
        // Missing required parameters
      };
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('MISSING_PARAMETER');
    });
  });

  describe('PUT endpoints', () => {
    it('should handle updateBlockPosition request', async () => {
      const body = {
        action: 'updateBlockPosition',
        modelId: '123',
        sheetId: 'main',
        blockId: 'block-1',
        position: { x: 100, y: 200 }
      };
      const request = createMockRequest('PUT', `${baseUrl}`, body, validToken);
      const response = await PUT(request as any);

      // Mock doesn't return data, so expect 404
      expect(response.status).toBe(404);
    });

    it('should validate position format', async () => {
      const body = {
        action: 'updateBlockPosition',
        modelId: '123',
        sheetId: 'main',
        blockId: 'block-1',
        position: { x: 'not-a-number', y: 200 }
      };
      const request = createMockRequest('PUT', `${baseUrl}`, body, validToken);
      const response = await PUT(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_POSITION');
    });
  });

  describe('DELETE endpoints', () => {
    it('should handle deleteModel request', async () => {
      const request = createMockRequest('DELETE', `${baseUrl}?modelId=123`, undefined, validToken);
      const response = await DELETE(request as any);

      // Mock doesn't return data - expect error but NOT 401 (auth should pass)
      expect(response.status).not.toBe(401);
      expect([404, 500]).toContain(response.status);
    });

    it('should handle deleteBlock with action', async () => {
      const request = createMockRequest('DELETE', `${baseUrl}?action=deleteBlock&modelId=123&sheetId=main&blockId=block-1`, undefined, validToken);
      const response = await DELETE(request as any);

      // Mock doesn't return data, so expect 404
      expect(response.status).toBe(404);
    });
  });

  describe('Batch operations', () => {
    it('should validate batch operations structure', async () => {
      const body = {
        action: 'batchOperations',
        operations: 'not-an-array' // Invalid
      };
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_OPERATIONS');
    });

    it('should reject empty operations array', async () => {
      const body = {
        action: 'batchOperations',
        operations: []
      };
      const request = createMockRequest('POST', `${baseUrl}`, body, validToken);
      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('EMPTY_OPERATIONS');
    });
  });
});