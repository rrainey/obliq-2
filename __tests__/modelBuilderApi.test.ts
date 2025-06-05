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

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null })),
          order: jest.fn(() => ({
            limit: jest.fn(() => ({
              single: jest.fn(() => ({ data: null, error: null }))
            }))
          }))
        }))
      })),
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
    }))
  }))
}));

// Set up environment variables
process.env.MODEL_BUILDER_API_TOKEN = 'test-token-123';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// Import after mocks are set up
import { GET, POST, PUT, DELETE } from '@/app/api/model-builder/[token]/route';

describe('Model Builder API', () => {
  const validToken = 'test-token-123';
  const invalidToken = 'invalid-token';
  const baseUrl = 'http://localhost:3000/api/model-builder';

  // Helper to create mock request
  const createMockRequest = (method: string, url: string, body?: any) => {
    const urlObj = new URL(url);
    const searchParams = urlObj.searchParams;
    
    return {
      url,
      method,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => body ? JSON.stringify(body) : '',
      json: async () => body || {},
      nextUrl: urlObj
    };
  };

  describe('Authentication', () => {
    it('should reject requests with invalid token', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${invalidToken}?modelId=123`);
      const response = await GET(request as any, { params: { token: invalidToken } });
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or missing API token');
    });

    it('should accept requests with valid token', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${validToken}?modelId=123`);
      const response = await GET(request as any, { params: { token: validToken } });
      
      expect(response.status).not.toBe(401);
    });
  });

  describe('GET endpoints', () => {
    it('should handle getModel request', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${validToken}?modelId=123`);
      const response = await GET(request as any, { params: { token: validToken } });
      
      // Since mock returns null data, expect 404
      expect(response.status).toBe(404);
    });

    it('should handle missing modelId for getModel', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${validToken}`);
      const response = await GET(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('MISSING_PARAMETER');
    });

    it('should handle listSheets action', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${validToken}?action=listSheets&modelId=123`);
      const response = await GET(request as any, { params: { token: validToken } });
      
      // Mock doesn't return data, so expect 404
      expect(response.status).toBe(404);
    });

    it('should handle unknown action', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${validToken}?action=unknownAction`);
      const response = await GET(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('UNKNOWN_ACTION');
    });
  });

  describe('POST endpoints', () => {
    it('should handle createModel request', async () => {
      const body = {
        action: 'createModel',
        name: 'Test Model',
        userId: 'user-123'
      };
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      
      // Mock returns error, so expect 500
      expect(response.status).toBe(500);
    });

    it('should validate createModel parameters', async () => {
      const body = {
        action: 'createModel',
        // Missing required parameters
      };
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
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
      const request = createMockRequest('PUT', `${baseUrl}/${validToken}`, body);
      const response = await PUT(request as any, { params: { token: validToken } });
      
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
      const request = createMockRequest('PUT', `${baseUrl}/${validToken}`, body);
      const response = await PUT(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_POSITION');
    });
  });

  describe('DELETE endpoints', () => {
    it('should handle deleteModel request', async () => {
      const request = createMockRequest('DELETE', `${baseUrl}/${validToken}?modelId=123`);
      const response = await DELETE(request as any, { params: { token: validToken } });
      
      // Mock doesn't return data, so expect 404
      expect(response.status).toBe(404);
    });

    it('should handle deleteBlock with action', async () => {
      const request = createMockRequest('DELETE', `${baseUrl}/${validToken}?action=deleteBlock&modelId=123&sheetId=main&blockId=block-1`);
      const response = await DELETE(request as any, { params: { token: validToken } });
      
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
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('INVALID_OPERATIONS');
    });

    it('should reject empty operations array', async () => {
      const body = {
        action: 'batchOperations',
        operations: []
      };
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.code).toBe('EMPTY_OPERATIONS');
    });
  });
});