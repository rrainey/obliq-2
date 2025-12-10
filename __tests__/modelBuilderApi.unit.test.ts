// __tests__/modelBuilderApi.unit.test.ts

/**
 * @jest-environment node
 */

// Helper to create mock request with Authorization header
const createMockRequest = (method: string, url: string, body?: any, token?: string) => {
  const urlObj = new URL(url);
  const headersMap = new Map<string, string>([['content-type', 'application/json']]);
  if (token) {
    headersMap.set('authorization', `Bearer ${token}`);
  }

  return {
    url,
    method,
    headers: {
      get: (key: string) => headersMap.get(key.toLowerCase()) || null
    },
    text: async () => body ? JSON.stringify(body) : '',
    json: async () => body || {},
    nextUrl: urlObj
  };
};

describe('Model Builder API Basic Tests', () => {
  beforeEach(() => {
    // Clear all mocks and modules before each test
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should validate authentication - reject invalid token', async () => {
    // Set environment variables
    process.env.MODEL_BUILDER_API_TOKEN = 'test-token-123';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    // Mock Supabase
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
            }))
          }))
        }))
      }))
    }));

    // Mock Next.js
    jest.doMock('next/server', () => ({
      NextRequest: jest.fn(),
      NextResponse: {
        json: jest.fn((data, init) => ({
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => data
        }))
      }
    }));

    // Import after mocks
    const { GET } = await import('@/app/api/model-builder/route');

    // Test invalid token
    const request = createMockRequest('GET', 'http://localhost:3000/api/model-builder?modelId=123', undefined, 'invalid-token');

    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
  });

  it('should handle missing parameters with user token', async () => {
    // Set environment variables
    process.env.MODEL_BUILDER_API_TOKEN = 'env-token-123';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    // Mock modules
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({}))
    }));

    jest.doMock('next/server', () => ({
      NextRequest: jest.fn(),
      NextResponse: {
        json: jest.fn((data, init) => ({
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => data
        }))
      }
    }));

    // Mock auth middleware to return a valid user token
    // This simulates a valid user API token that has an associated userId
    jest.doMock('../src/lib/apiAuthMiddleware', () => ({
      authenticateApiRequest: jest.fn(async (token: string) => {
        if (token === 'user-api-token-123') {
          // User token - userId is derived from the token
          return {
            authenticated: true,
            userId: 'test-user-id-456'
          };
        }
        return { authenticated: false, error: 'Invalid or missing API token' };
      })
    }));

    const { POST } = await import('@/app/api/model-builder/route');

    // Create request with user token but missing 'name' parameter
    const request = createMockRequest('POST', 'http://localhost:3000/api/model-builder', { action: 'createModel' }, 'user-api-token-123');

    const response = await POST(request as any);
    const data = await response.json();

    // Should get MISSING_PARAMETER for 'name' since userId comes from token
    expect(response.status).toBe(400);
    expect(data.code).toBe('MISSING_PARAMETER');
  });

  it('should reject tokens without userId', async () => {
    // Set environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    // Mock modules
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({}))
    }));

    jest.doMock('next/server', () => ({
      NextRequest: jest.fn(),
      NextResponse: {
        json: jest.fn((data, init) => ({
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => data
        }))
      }
    }));

    // Mock auth middleware to return authenticated but without userId
    // This simulates a malformed token response
    jest.doMock('../src/lib/apiAuthMiddleware', () => ({
      authenticateApiRequest: jest.fn(async (token: string) => {
        if (token === 'malformed-token') {
          return { authenticated: true }; // Missing userId
        }
        return { authenticated: false, error: 'Invalid or missing API token' };
      })
    }));

    const { POST } = await import('@/app/api/model-builder/route');

    // Create request with malformed token
    const request = createMockRequest('POST', 'http://localhost:3000/api/model-builder', { action: 'createModel', name: 'Test Model' }, 'malformed-token');

    const response = await POST(request as any);
    const data = await response.json();

    // Should get INVALID_TOKEN because we couldn't determine user from token
    expect(response.status).toBe(401);
    expect(data.code).toBe('INVALID_TOKEN');
  });

  it('should derive userId from user token for createModel', async () => {
    // Set environment variables
    process.env.MODEL_BUILDER_API_TOKEN = 'env-token-123';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    // Create a mock Supabase that tracks what userId is used
    let capturedUserId: string | null = null;

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({
        from: jest.fn((table: string) => ({
          insert: jest.fn((data: any) => {
            if (table === 'models') {
              capturedUserId = data.user_id;
            }
            return {
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'new-model-id', name: data.name, user_id: data.user_id, latest_version: 1 },
                  error: null
                })
              }))
            };
          }),
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: null, error: null })
            }))
          }))
        }))
      }))
    }));

    jest.doMock('next/server', () => ({
      NextRequest: jest.fn(),
      NextResponse: {
        json: jest.fn((data, init) => ({
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => data
        }))
      }
    }));

    // Mock auth middleware to return a user token with specific userId
    const expectedUserId = 'user-from-token-789';
    jest.doMock('../src/lib/apiAuthMiddleware', () => ({
      authenticateApiRequest: jest.fn(async (token: string) => {
        if (token === 'user-api-token-xyz') {
          return {
            authenticated: true,
            userId: expectedUserId
          };
        }
        return { authenticated: false, error: 'Invalid or missing API token' };
      })
    }));

    const { POST } = await import('@/app/api/model-builder/route');

    // Create model with user token - NO userId in body (should come from token)
    const request = createMockRequest('POST', 'http://localhost:3000/api/model-builder', {
      action: 'createModel',
      name: 'My New Model'
    }, 'user-api-token-xyz');

    const response = await POST(request as any);
    const data = await response.json();

    // Verify the userId from the token was used
    expect(capturedUserId).toBe(expectedUserId);
  });

  it('should validate batch operations', async () => {
    // Set environment variables
    process.env.MODEL_BUILDER_API_TOKEN = 'test-token-123';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    // Mock modules
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({}))
    }));

    jest.doMock('next/server', () => ({
      NextRequest: jest.fn(),
      NextResponse: {
        json: jest.fn((data, init) => ({
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => data
        }))
      }
    }));

    // Mock auth middleware - use user token for batch operations
    jest.doMock('../src/lib/apiAuthMiddleware', () => ({
      authenticateApiRequest: jest.fn(async (token: string) => {
        if (token === 'test-token-123') {
          return { authenticated: true, userId: 'test-user-id' };
        }
        return { authenticated: false, error: 'Invalid or missing API token' };
      })
    }));

    const { POST } = await import('@/app/api/model-builder/route');

    // Test invalid operations type
    const request1 = createMockRequest('POST', 'http://localhost:3000/api/model-builder', { action: 'batchOperations', operations: 'not-an-array' }, 'test-token-123');

    const response1 = await POST(request1 as any);
    const data1 = await response1.json();

    expect(response1.status).toBe(400);
    expect(data1.code).toBe('INVALID_OPERATIONS');

    // Test empty operations
    const request2 = createMockRequest('POST', 'http://localhost:3000/api/model-builder', { action: 'batchOperations', operations: [] }, 'test-token-123');

    const response2 = await POST(request2 as any);
    const data2 = await response2.json();

    expect(response2.status).toBe(400);
    expect(data2.code).toBe('EMPTY_OPERATIONS');

    // Test too many operations
    const operations = Array(51).fill({ action: 'getModel', modelId: '123' });
    const request3 = createMockRequest('POST', 'http://localhost:3000/api/model-builder', { action: 'batchOperations', operations }, 'test-token-123');

    const response3 = await POST(request3 as any);
    const data3 = await response3.json();

    expect(response3.status).toBe(400);
    expect(data3.code).toBe('TOO_MANY_OPERATIONS');
  });
});
