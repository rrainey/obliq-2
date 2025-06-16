// __tests__/modelBuilderApi.integration.test.ts

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

// Set up environment variables
process.env.MODEL_BUILDER_API_TOKEN = 'test-token-123';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// Import after mocks
import { GET, POST, PUT, DELETE } from '@/app/api/model-builder/[token]/route';
import { BlockTypes } from '@/lib/blockTypeRegistry';

// Mock data storage for integration tests
const mockDatabase = {
  models: new Map(),
  modelVersions: new Map(),
  
  reset() {
    this.models.clear();
    this.modelVersions.clear();
  },
  
  createModel(modelData: any) {
    const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const model = {
      id,
      ...modelData,
      latest_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.models.set(id, model);
    
    // Create initial version
    const versionId = `version_${Date.now()}`;
    const version = {
      id: versionId,
      model_id: id,
      version: 1,
      data: {
        version: "1.0",
        metadata: { created: new Date().toISOString(), description: `Model ${modelData.name}` },
        sheets: [{
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 2000, height: 2000 }
        }],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      },
      created_at: new Date().toISOString()
    };
    this.modelVersions.set(`${id}_${version.version}`, version);
    
    return { model, version };
  },
  
  getLatestVersion(modelId: string) {
    const versions = Array.from(this.modelVersions.values())
      .filter(v => v.model_id === modelId);
    return versions.sort((a, b) => b.version - a.version)[0];
  },
  
  createNewVersion(modelId: string, data: any) {
    const model = this.models.get(modelId);
    if (!model) return null;
    
    const newVersion = model.latest_version + 1;
    model.latest_version = newVersion;
    model.updated_at = new Date().toISOString();
    
    const versionId = `version_${Date.now()}`;
    const version = {
      id: versionId,
      model_id: modelId,
      version: newVersion,
      data,
      created_at: new Date().toISOString()
    };
    this.modelVersions.set(`${modelId}_${newVersion}`, version);
    
    return version;
  }
};

// Enhanced Supabase mock that better mimics the real implementation
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn((table) => ({
      select: jest.fn((fields) => ({
        eq: jest.fn((field, value) => {
          if (field === 'id' && table === 'models') {
            return {
              single: jest.fn(async () => {
                const model = mockDatabase.models.get(value);
                if (!model) {
                  return { data: null, error: { message: 'Not found' } };
                }
                // For the GET endpoint, we need to return the model with its data
                const latestVersion = mockDatabase.getLatestVersion(value);
                return { 
                  data: {
                    ...model,
                    data: latestVersion ? latestVersion.data : null
                  }, 
                  error: null 
                };
              })
            };
          }
          if (field === 'model_id' && table === 'model_versions') {
            return {
              order: jest.fn((orderField, orderOpts) => ({
                limit: jest.fn((num) => ({
                  single: jest.fn(async () => {
                    const version = mockDatabase.getLatestVersion(value);
                    return { data: version || null, error: version ? null : { message: 'Not found' } };
                  })
                }))
              })),
              single: jest.fn(async () => {
                const version = mockDatabase.getLatestVersion(value);
                return { data: version || null, error: version ? null : { message: 'Not found' } };
              })
            };
          }
          return {
            single: jest.fn(async () => ({ data: null, error: { message: 'Not found' } }))
          };
        })
      })),
      insert: jest.fn((data) => {
        if (table === 'models') {
          return {
            select: jest.fn(() => ({
              single: jest.fn(async () => {
                // Don't use createModel here as it would create a version
                const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const model = {
                  id,
                  ...data,
                  latest_version: 1,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };
                mockDatabase.models.set(id, model);
                return { data: model, error: null };
              })
            }))
          };
        }
        if (table === 'model_versions') {
          return {
            then: (fn: any) => {
              // When inserting a new version, don't create another version
              const versionId = `version_${Date.now()}`;
              const version = { 
                id: versionId, 
                ...data, 
                created_at: new Date().toISOString() 
              };
              mockDatabase.modelVersions.set(`${data.model_id}_${data.version}`, version);
              return fn({ error: null });
            }
          };
        }
        return {
          select: jest.fn(() => ({
            single: jest.fn(async () => ({ data: null, error: { message: 'Insert failed' } }))
          })),
          then: (fn: any) => fn({ error: { message: 'Insert failed' } })
        };
      }),
      update: jest.fn((data) => ({
        eq: jest.fn((field, value) => {
          if (table === 'models') {
            return {
              then: (fn: any) => {
                const model = mockDatabase.models.get(value);
                if (model) {
                  Object.assign(model, data);
                  return fn({ error: null });
                }
                return fn({ error: { message: 'Update failed' } });
              }
            };
          }
          return {
            then: (fn: any) => fn({ error: { message: 'Update failed' } })
          };
        })
      })),
      delete: jest.fn(() => ({
        eq: jest.fn((field, value) => {
          if (table === 'models' && field === 'id') {
            return {
              then: (fn: any) => {
                const exists = mockDatabase.models.has(value);
                if (exists) {
                  mockDatabase.models.delete(value);
                  // Delete all versions
                  const toDelete = Array.from(mockDatabase.modelVersions.keys())
                    .filter(key => key.startsWith(`${value}_`));
                  toDelete.forEach(key => mockDatabase.modelVersions.delete(key));
                  return fn({ error: null });
                }
                return fn({ error: { message: 'Not found' } });
              }
            };
          }
          if (table === 'model_versions' && field === 'model_id') {
            return {
              then: (fn: any) => {
                const toDelete = Array.from(mockDatabase.modelVersions.keys())
                  .filter(key => key.startsWith(`${value}_`));
                toDelete.forEach(key => mockDatabase.modelVersions.delete(key));
                return fn({ error: null });
              }
            };
          }
          return {
            then: (fn: any) => fn({ error: { message: 'Delete failed' } })
          };
        })
      }))
    }))
  }))
}));

describe('Model Builder API Integration Tests', () => {
  const validToken = 'test-token-123';
  const baseUrl = 'http://localhost:3000/api/model-builder';
  
  // Helper to create mock request
  const createMockRequest = (method: string, url: string, body?: any) => {
    const urlObj = new URL(url);
    return {
      url,
      method,
      headers: new Map([['content-type', 'application/json']]),
      text: async () => body ? JSON.stringify(body) : '',
      json: async () => body || {},
      nextUrl: urlObj
    };
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

    it('should create a new model', async () => {
      const body = {
        action: 'createModel',
        name: 'Integration Test Model',
        userId: 'test-user-123'
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Integration Test Model');
      expect(data.data.id).toBeDefined();
      // The API creates the model and then creates version 1, so latest_version should be 1
      expect(data.data.latest_version).toBe(1);
      
      modelId = data.data.id;
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
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.block.type).toBe(BlockTypes.SOURCE);
      expect(data.data.block.name).toBe('TestSource');
      expect(data.data.block.parameters.value).toBe('5.0');
      expect(data.data.newVersion).toBe(2);
      
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
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.block.type).toBe(BlockTypes.SCALE);
      expect(data.data.block.parameters.factor).toBe(2.5);
      expect(data.data.newVersion).toBe(3);
      
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
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.block.type).toBe(BlockTypes.OUTPUT_PORT);
      expect(data.data.newVersion).toBe(4);
      
      blockIds.push(data.data.block.id);
    });

    it('should connect source to scale', async () => {
      const body = {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds[0], // Source
        sourcePort: 'output',
        targetBlockId: blockIds[1], // Scale
        targetPort: 'input'
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.connection.sourceBlockId).toBe(blockIds[0]);
      expect(data.data.connection.targetBlockId).toBe(blockIds[1]);
      expect(data.data.newVersion).toBe(5);
      
      connectionId = data.data.connection.id;
    });

    it('should connect scale to output', async () => {
      const body = {
        action: 'addConnection',
        modelId,
        sheetId,
        sourceBlockId: blockIds[1], // Scale
        sourcePort: 'output',
        targetBlockId: blockIds[2], // Output
        targetPort: 'input'
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      expect(data.data.newVersion).toBe(6);
    });

    it('should validate the completed model', async () => {
      const body = {
        action: 'validateModel',
        modelId
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.valid).toBe(true);
      expect(data.data.errors).toHaveLength(0);
      expect(data.data.summary.totalBlocks).toBe(3);
      expect(data.data.summary.totalConnections).toBe(2);
    });

    it('should retrieve the complete model', async () => {
      const request = createMockRequest('GET', `${baseUrl}/${validToken}?modelId=${modelId}`);
      const response = await GET(request as any, { params: { token: validToken } });
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
        name: 'Batch Test Model',
        userId: 'test-user'
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
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
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.successCount).toBe(3);
      expect(data.data.failureCount).toBe(0);
      expect(data.data.results).toHaveLength(3);
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
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.data.successCount).toBe(2);
      expect(data.data.failureCount).toBe(1);
      expect(data.data.errors).toHaveLength(1);
      expect(data.data.errors[0].operationId).toBe('op2');
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
        name: 'Sheet Label Test Model',
        userId: 'test-user'
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      modelId = data.data.id;
    });

    it('should create a second sheet', async () => {
      const body = {
        action: 'createSheet',
        modelId,
        name: 'Second Sheet'
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
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
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      sinkBlockId = data.data.block.id;
    });

    it('should add sheet label source on second sheet', async () => {
      // First need to ensure sheet2Id exists
      if (!sheet2Id) {
        const createSheetBody = {
          action: 'createSheet',
          modelId,
          name: 'Second Sheet'
        };
        
        const createSheetReq = createMockRequest('POST', `${baseUrl}/${validToken}`, createSheetBody);
        const createSheetRes = await POST(createSheetReq as any, { params: { token: validToken } });
        const createSheetData = await createSheetRes.json();
        expect(createSheetRes.status).toBe(201);
        sheet2Id = createSheetData.data.sheet.id;
      }
      
      const body = {
        action: 'addBlock',
        modelId,
        sheetId: sheet2Id,
        blockType: BlockTypes.SHEET_LABEL_SOURCE,
        name: 'CrossSheetReceiver',
        position: { x: 100, y: 100 },
        parameters: { signalName: 'shared_signal' }
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
      const data = await response.json();
      
      expect(response.status).toBe(201);
      sourceBlockId = data.data.block.id;
    });

    it('should validate sheet label connections', async () => {
      const body = {
        action: 'validateModel',
        modelId
      };
      
      const request = createMockRequest('POST', `${baseUrl}/${validToken}`, body);
      const response = await POST(request as any, { params: { token: validToken } });
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
        name: 'Duplicate Test Model',
        userId: 'test-user'
      };
      
      const createModelReq = createMockRequest('POST', `${baseUrl}/${validToken}`, createModelBody);
      const createModelRes = await POST(createModelReq as any, { params: { token: validToken } });
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
      
      const req1 = createMockRequest('POST', `${baseUrl}/${validToken}`, block1Body);
      const req2 = createMockRequest('POST', `${baseUrl}/${validToken}`, block2Body);
      
      const res1 = await POST(req1 as any, { params: { token: validToken } });
      const res2 = await POST(req2 as any, { params: { token: validToken } });
      
      const block1Id = (await res1.json()).data.block.id;
      const block2Id = (await res2.json()).data.block.id;
      
      // First connection should succeed
      const conn1Body = {
        action: 'addConnection',
        modelId,
        sheetId: 'main',
        sourceBlockId: block1Id,
        sourcePort: 'output',
        targetBlockId: block2Id,
        targetPort: 'input'
      };
      
      const connReq1 = createMockRequest('POST', `${baseUrl}/${validToken}`, conn1Body);
      const connRes1 = await POST(connReq1 as any, { params: { token: validToken } });
      
      expect(connRes1.status).toBe(201);
      
      // Try to connect to the same input port again (should fail)
      const conn2Body = {
        action: 'addConnection',
        modelId,
        sheetId: 'main',
        sourceBlockId: block1Id,
        sourcePort: 'output',
        targetBlockId: block2Id,
        targetPort: 'input'
      };
      
      const connReq2 = createMockRequest('POST', `${baseUrl}/${validToken}`, conn2Body);
      const connRes2 = await POST(connReq2 as any, { params: { token: validToken } });
      const connData2 = await connRes2.json();
      
      expect(connRes2.status).toBe(400);
      // The API actually checks for the same exact connection first
      expect(connData2.code).toBe('PORT_ALREADY_CONNECTED');
    });

    it('should prevent self-connections', async () => {
      // Create model
      const createModelBody = {
        action: 'createModel',
        name: 'Self Connection Test',
        userId: 'test-user'
      };
      
      const createModelReq = createMockRequest('POST', `${baseUrl}/${validToken}`, createModelBody);
      const createModelRes = await POST(createModelReq as any, { params: { token: validToken } });
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
      
      const blockReq = createMockRequest('POST', `${baseUrl}/${validToken}`, blockBody);
      const blockRes = await POST(blockReq as any, { params: { token: validToken } });
      const blockId = (await blockRes.json()).data.block.id;
      
      // Try to connect block to itself
      const connBody = {
        action: 'addConnection',
        modelId,
        sheetId: 'main',
        sourceBlockId: blockId,
        sourcePort: 'output',
        targetBlockId: blockId,
        targetPort: 'input'
      };
      
      const connReq = createMockRequest('POST', `${baseUrl}/${validToken}`, connBody);
      const connRes = await POST(connReq as any, { params: { token: validToken } });
      const connData = await connRes.json();
      
      expect(connRes.status).toBe(400);
      expect(connData.code).toBe('SELF_CONNECTION');
    });

    it('should handle parameter validation for different block types', async () => {
      // Create model
      const createModelBody = {
        action: 'createModel',
        name: 'Parameter Validation Test',
        userId: 'test-user'
      };
      
      const createModelReq = createMockRequest('POST', `${baseUrl}/${validToken}`, createModelBody);
      const createModelRes = await POST(createModelReq as any, { params: { token: validToken } });
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
      
      const tfReq = createMockRequest('POST', `${baseUrl}/${validToken}`, tfBody);
      const tfRes = await POST(tfReq as any, { params: { token: validToken } });
      const tfData = await tfRes.json();
      
      expect(tfRes.status).toBe(400);
      expect(tfData.code).toBe('VALIDATION_FAILED');
      expect(tfData.details.errors).toContain('numerator must be a non-empty array of numbers');
      expect(tfData.details.errors).toContain('denominator leading coefficient cannot be zero');
    });
  });
});