// __tests__/modelBuilderApi.basic.test.ts

/**
 * @jest-environment node
 */

describe('Model Builder API Basic Tests', () => {
  beforeEach(() => {
    // Clear all mocks and modules before each test
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should validate authentication', async () => {
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
      NextRequest: jest.fn().mockImplementation((url, init) => {
        const urlObj = new URL(url);
        return {
          url,
          method: init?.method || 'GET',
          headers: new Map(Object.entries(init?.headers || {})),
          nextUrl: urlObj
        };
      }),
      NextResponse: {
        json: jest.fn((data, init) => ({
          status: init?.status || 200,
          headers: init?.headers || {},
          json: async () => data
        }))
      }
    }));
    
    // Import after mocks
    const { GET } = await import('@/app/api/model-builder/[token]/route');
    
    // Test invalid token
    const request = {
      url: 'http://localhost:3000/api/model-builder/invalid-token?modelId=123',
      method: 'GET',
      headers: new Map([['content-type', 'application/json']]),
      nextUrl: new URL('http://localhost:3000/api/model-builder/invalid-token?modelId=123')
    };
    
    const response = await GET(request as any, { params: { token: 'invalid-token' } });
    const data = await response.json();
    
    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid or missing API token');
  });

  it('should handle missing parameters', async () => {
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
    
    const { POST } = await import('@/app/api/model-builder/[token]/route');
    
    const request = {
      url: 'http://localhost:3000/api/model-builder/test-token-123',
      method: 'POST',
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify({ action: 'createModel' }),
      json: async () => ({ action: 'createModel' }),
      nextUrl: new URL('http://localhost:3000/api/model-builder/test-token-123')
    };
    
    const response = await POST(request as any, { params: { token: 'test-token-123' } });
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.code).toBe('MISSING_PARAMETER');
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
    
    const { POST } = await import('@/app/api/model-builder/[token]/route');
    
    // Test invalid operations type
    const request1 = {
      url: 'http://localhost:3000/api/model-builder/test-token-123',
      method: 'POST',
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify({ action: 'batchOperations', operations: 'not-an-array' }),
      json: async () => ({ action: 'batchOperations', operations: 'not-an-array' }),
      nextUrl: new URL('http://localhost:3000/api/model-builder/test-token-123')
    };
    
    const response1 = await POST(request1 as any, { params: { token: 'test-token-123' } });
    const data1 = await response1.json();
    
    expect(response1.status).toBe(400);
    expect(data1.code).toBe('INVALID_OPERATIONS');
    
    // Test empty operations
    const request2 = {
      url: 'http://localhost:3000/api/model-builder/test-token-123',
      method: 'POST',
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify({ action: 'batchOperations', operations: [] }),
      json: async () => ({ action: 'batchOperations', operations: [] }),
      nextUrl: new URL('http://localhost:3000/api/model-builder/test-token-123')
    };
    
    const response2 = await POST(request2 as any, { params: { token: 'test-token-123' } });
    const data2 = await response2.json();
    
    expect(response2.status).toBe(400);
    expect(data2.code).toBe('EMPTY_OPERATIONS');
    
    // Test too many operations
    const operations = Array(51).fill({ action: 'getModel', modelId: '123' });
    const request3 = {
      url: 'http://localhost:3000/api/model-builder/test-token-123',
      method: 'POST',
      headers: new Map([['content-type', 'application/json']]),
      text: async () => JSON.stringify({ action: 'batchOperations', operations }),
      json: async () => ({ action: 'batchOperations', operations }),
      nextUrl: new URL('http://localhost:3000/api/model-builder/test-token-123')
    };
    
    const response3 = await POST(request3 as any, { params: { token: 'test-token-123' } });
    const data3 = await response3.json();
    
    expect(response3.status).toBe(400);
    expect(data3.code).toBe('TOO_MANY_OPERATIONS');
  });
});