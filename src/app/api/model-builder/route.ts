// app/api/model-builder/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';
import { authenticateApiRequest } from '@/lib/apiAuthMiddleware';
// Import all handlers from refactored modules
import {
  // Model handlers
  handleGetModel,
  handleGetModelMetadata,
  handleUpdateModelName,
  handleValidateModel,
  // Sheet handlers
  handleListSheets,
  handleExportSheet,
  handleCreateSheet,
  handleImportSheet,
  handleCloneSheet,
  handleRenameSheet,
  handleDeleteSheet,
  handleClearSheet,
  // Block handlers
  handleListBlocks,
  handleGetBlock,
  handleGetBlockPorts,
  handleAddBlock,
  handleUpdateBlockPosition,
  handleUpdateBlockName,
  handleUpdateBlockParameters,
  handleDeleteBlock,
  // Connection handlers
  handleListConnections,
  handleGetConnection,
  handleAddConnection,
  handleDeleteConnection,
  // Parameter handlers
  handleListParameters,
  handleSetParameter,
  handleDeleteParameter
} from './handlers';
import {
  handleListBlockParameters,
  handleGetBlockParameter,
  handleAddBlockParameter,
  handleUpdateBlockParameter,
  handleDeleteBlockParameter
} from './handlers/block-parameter';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 1000; // 1000 requests per minute (increased for testing)

// In-memory rate limit store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limiting helper
function checkRateLimit(token: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const limiter = rateLimitStore.get(token);
  
  if (!limiter || now > limiter.resetTime) {
    // New window or expired window
    rateLimitStore.set(token, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true };
  }
  
  if (limiter.count >= RATE_LIMIT_MAX_REQUESTS) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((limiter.resetTime - now) / 1000); // seconds
    return { allowed: false, retryAfter };
  }
  
  // Increment counter
  limiter.count++;
  return { allowed: true };
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, limiter] of rateLimitStore.entries()) {
    if (now > limiter.resetTime + RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(token);
    }
  }
}, 5 * 60 * 1000);

// Helper function to extract Bearer token from Authorization header
function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  // Also support raw token for backward compatibility during transition
  return authHeader;
}

// Request logging helper
function logRequest(
  method: string,
  action: string | null,
  params: Record<string, any>,
  startTime: number,
  response: { success: boolean; status: number; error?: string }
) {
  const duration = Date.now() - startTime;
  const timestamp = new Date().toISOString();
  
  console.log(JSON.stringify({
    timestamp,
    api: 'model-builder',
    method,
    action: action || 'none',
    params: {
      ...params,
      token: params.token ? '***' : undefined // Mask token
    },
    response: {
      success: response.success,
      status: response.status,
      ...(response.error && { error: response.error })
    },
    duration_ms: duration
  }));
}

// Helper function to create rate limit response
function rateLimitExceededResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { 
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter
    },
    { 
      status: 429,
      headers: {
        'Retry-After': String(retryAfter)
      }
    }
  );
}


// Helper function to create unauthorized response
function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { 
      success: false,
      error: 'Invalid or missing API token' 
    },
    { status: 401 }
  );
}

// Temporary helper functions until modelBuilderApiHelpers is available
function successResponse<T = any>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    data
  }, { status });
}

const ErrorResponses = {
  missingParameter: (param: string) => 
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: `Missing required parameter: ${param}`,
      code: 'MISSING_PARAMETER'
    }, { status: 400 }),
  
  modelNotFound: (modelId: string) => 
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Model not found',
      code: 'MODEL_NOT_FOUND',
      details: { modelId }
    }, { status: 404 }),
    
  sheetNotFound: (sheetId: string) => 
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Sheet not found',
      code: 'SHEET_NOT_FOUND',
      details: { sheetId }
    }, { status: 404 }),
    
  blockNotFound: (blockId: string) => 
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Block not found',
      code: 'BLOCK_NOT_FOUND',
      details: { blockId }
    }, { status: 404 }),
    
  connectionNotFound: (connectionId: string) => 
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Connection not found',
      code: 'CONNECTION_NOT_FOUND',
      details: { connectionId }
    }, { status: 404 }),
    
  serverError: () =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    }, { status: 500 })
};

function errorResponse(error: string, code?: string, status: number = 400): NextResponse {
  return NextResponse.json({
    success: false,
    timestamp: new Date().toISOString(),
    error,
    ...(code && { code })
  }, { status });
}

const ModelBuilderActions = {
  GET_MODEL: 'getModel',
  GET_MODEL_METADATA: 'getModelMetadata',
  CREATE_MODEL: 'createModel',
  UPDATE_MODEL_NAME: 'updateModelName',
  LIST_SHEETS: 'listSheets',
  CREATE_SHEET: 'createSheet',
  RENAME_SHEET: 'renameSheet',
  DELETE_SHEET: 'deleteSheet',
  CLONE_SHEET: 'cloneSheet',
  CLEAR_SHEET: 'clearSheet',
  IMPORT_SHEET: 'importSheet',
  EXPORT_SHEET: 'exportSheet',
  LIST_BLOCKS: 'listBlocks',
  GET_BLOCK: 'getBlock',
  ADD_BLOCK: 'addBlock',
  UPDATE_BLOCK_POSITION: 'updateBlockPosition',
  UPDATE_BLOCK_NAME: 'updateBlockName',
  UPDATE_BLOCK_PARAMETERS: 'updateBlockParameters',
  DELETE_BLOCK: 'deleteBlock',
  LIST_CONNECTIONS: 'listConnections',
  GET_CONNECTION: 'getConnection',
  ADD_CONNECTION: 'addConnection',
  DELETE_CONNECTION: 'deleteConnection',
  GET_BLOCK_PORTS: 'getBlockPorts',
  VALIDATE_MODEL: 'validateModel',
  BATCH_OPERATIONS: 'batchOperations',
  LIST_PARAMETERS: 'listParameters',
  SET_PARAMETER: 'setParameter',
  DELETE_PARAMETER: 'deleteParameter',
  // Block parameter operations (subsystem parameters)
  LIST_BLOCK_PARAMETERS: 'listBlockParameters',
  GET_BLOCK_PARAMETER: 'getBlockParameter',
  ADD_BLOCK_PARAMETER: 'addBlockParameter',
  UPDATE_BLOCK_PARAMETER: 'updateBlockParameter',
  DELETE_BLOCK_PARAMETER: 'deleteBlockParameter'
} as const;

// GET handler for retrieving model data and introspection
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const modelId = searchParams.get('modelId');

  // Extract token from Authorization header
  const token = extractBearerToken(request);

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Missing Authorization header. Use: Authorization: Bearer <token>',
        code: 'MISSING_AUTH_HEADER'
      },
      { status: 401 }
    );
  }

  // Prepare logging params (mask token for security)
  const logParams = {
    token: token.substring(0, 8) + '...',
    action,
    modelId,
    ...Object.fromEntries(searchParams.entries())
  };

  // Authenticate the request using the new middleware
  const authResult = await authenticateApiRequest(token);
  
  if (!authResult.authenticated) {
    modelBuilderApiMetrics.record(
      'GET',
      action || 'unknown',
      Date.now() - startTime,
      false,
      401,
      authResult.error
    );
    
    return NextResponse.json(
      { 
        success: false,
        timestamp: new Date().toISOString(),
        error: authResult.error || 'Authentication failed',
        code: 'UNAUTHORIZED'
      },
      { status: 401 }
    );
  }
  
  // Check rate limit
  const rateLimit = checkRateLimit(token);
  if (!rateLimit.allowed) {
    const response = rateLimitExceededResponse(rateLimit.retryAfter!);
    logRequest('GET', action, logParams, startTime, { success: false, status: 429, error: 'Rate limit exceeded' });
    return response;
  }
  
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Create Supabase client once for all GET handlers
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extract common parameters from searchParams for handler context
    const ctxModelId = searchParams.get('modelId') || undefined;
    const ctxSheetId = searchParams.get('sheetId') || undefined;
    const ctxBlockId = searchParams.get('blockId') || undefined;
    const ctxConnectionId = searchParams.get('connectionId') || undefined;

    // Build the standard handler context for GET requests
    const ctx = {
      request,
      supabase,
      userId: authResult.userId!,
      token: token!,
      startTime,
      searchParams,
      modelId: ctxModelId,
      sheetId: ctxSheetId,
      blockId: ctxBlockId,
      connectionId: ctxConnectionId
    };

    // Default action is to get the model
    if (!action || action === ModelBuilderActions.GET_MODEL) {
      return handleGetModel(ctx);
    }

    // Handle listSheets action
    if (action === ModelBuilderActions.LIST_SHEETS) {
      return handleListSheets(ctx);
    }

    // Handle exportSheet action
    if (action === ModelBuilderActions.EXPORT_SHEET) {
      return handleExportSheet(ctx);
    }

    // Handle getModelMetadata action
    if (action === ModelBuilderActions.GET_MODEL_METADATA) {
      return handleGetModelMetadata(ctx);
    }

    // Handle getBlockPorts action
    if (action === ModelBuilderActions.GET_BLOCK_PORTS) {
      return handleGetBlockPorts(ctx);
    }

    // Handle getConnection action
    if (action === ModelBuilderActions.GET_CONNECTION) {
      return handleGetConnection(ctx);
    }

    // Handle listConnections action
    if (action === ModelBuilderActions.LIST_CONNECTIONS) {
      return handleListConnections(ctx);
    }

    // Handle getBlock action
    if (action === ModelBuilderActions.GET_BLOCK) {
      return handleGetBlock(ctx);
    }

    // Handle listBlocks action
    if (action === ModelBuilderActions.LIST_BLOCKS) {
      return handleListBlocks(ctx);
    }

    // Handle listParameters action
    if (action === ModelBuilderActions.LIST_PARAMETERS) {
      return handleListParameters(ctx);
    }

    // Block parameter GET actions (subsystem parameters)
    if (action === ModelBuilderActions.LIST_BLOCK_PARAMETERS ||
        action === ModelBuilderActions.GET_BLOCK_PARAMETER) {
      if (action === ModelBuilderActions.LIST_BLOCK_PARAMETERS) {
        return handleListBlockParameters(ctx);
      } else {
        return handleGetBlockParameter(ctx);
      }
    }

    // Other GET actions will be implemented in subsequent tasks
    const errorResp = errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    logRequest('GET', action, logParams, startTime, { success: false, status: 400, error: `Unknown action: ${action}` });
    return errorResp;
    
  } catch (error) {
    console.error('Model Builder API GET error:', error);
    const errorResp = ErrorResponses.serverError();
    logRequest('GET', action, logParams, startTime, { success: false, status: 500, error: 'Server error' });
    return errorResp;
  }
}

// POST handler for creating models, sheets, blocks, and connections
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const action = 'unknown';
  const body: any = {};

  // Extract token from Authorization header
  const token = extractBearerToken(request);

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Missing Authorization header. Use: Authorization: Bearer <token>',
        code: 'MISSING_AUTH_HEADER'
      },
      { status: 401 }
    );
  }

  // Check rate limit
  const rateLimit = checkRateLimit(token);
  if (!rateLimit.allowed) {
    const response = rateLimitExceededResponse(rateLimit.retryAfter!);
    logRequest('POST', action, { token: token }, startTime, { success: false, status: 429, error: 'Rate limit exceeded' });
    return response;
  }

  // Authenticate the request using the new middleware
  const authResult = await authenticateApiRequest(token);
  
  if (!authResult.authenticated) {
    modelBuilderApiMetrics.record(
      'GET',
      action || 'unknown',
      Date.now() - startTime,
      false,
      401,
      authResult.error
    );
    
    return NextResponse.json(
      { 
        success: false,
        timestamp: new Date().toISOString(),
        error: authResult.error || 'Authentication failed',
        code: 'UNAUTHORIZED'
      },
      { status: 401 }
    );
  }
  
  try {
    // Parse request body
    let body;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      const response = errorResponse('Invalid JSON in request body', 'INVALID_JSON');
      logRequest('POST', 'unknown', { token: token }, startTime, { success: false, status: 400, error: 'Invalid JSON' });
      return response;
    }

    
    
    const { action } = body;
    
    // Handle create model action
    if (action === 'createModel') {
      const { name } = body;

      // userId is always derived from the API token - never from request body
      const userIdToUse = authResult.userId;
      if (!userIdToUse) {
        return NextResponse.json({
          success: false,
          timestamp: new Date().toISOString(),
          error: 'Unable to determine user from API token',
          code: 'INVALID_TOKEN'
        }, { status: 401 });
      }

      // Validate required parameters
      if (!name) {
        return ErrorResponses.missingParameter('name');
      }
    
      // Initialize Supabase client with service role
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Create the model metadata
      const { data: newModel, error: modelError } = await supabase
        .from('models')
        .insert({
          user_id: userIdToUse,
          name: name,
          latest_version: 1
        })
        .select()
        .single();
        
      if (modelError) {
        console.error('Error creating model:', modelError);
        return errorResponse('Failed to create model', 'CREATE_FAILED', 500);
      }
      
      // Create the initial model data structure
      // Use version 2.1 to indicate hierarchical sheet structure (subsystems contain embedded sheets)
      const initialModelData = {
        version: "2.1",
        metadata: {
          created: new Date().toISOString(),
          description: `Model ${name}`
        },
        sheets: [
          {
            id: 'main',
            name: 'Main',
            blocks: [],
            connections: [],
            extents: {
              width: 2000,
              height: 2000
            }
          }
        ],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10.0
        }
      };
      
      // Create version 1 with the initial data
      const { error: versionError } = await supabase
        .from('model_versions')
        .insert({
          model_id: newModel.id,
          version: 1,
          data: initialModelData
        });
        
      if (versionError) {
        // Rollback: delete the model if version creation fails
        await supabase
          .from('models')
          .delete()
          .eq('id', newModel.id);
          
        console.error('Error creating model version:', versionError);
        return errorResponse('Failed to create model version', 'VERSION_CREATE_FAILED', 500);
      }
      
      // Return the created model with explicit main sheet info for MCP guidance
      return successResponse({
        id: newModel.id,
        name: newModel.name,
        user_id: newModel.user_id,
        latest_version: newModel.latest_version,
        created_at: newModel.created_at,
        updated_at: newModel.updated_at,
        initialData: initialModelData,
        // Explicit main sheet info for easier MCP usage
        mainSheet: {
          id: 'main',
          name: 'Main'
        }
      }, 201);
    }
    
    // Handle create sheet action
    if (action === ModelBuilderActions.CREATE_SHEET) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleCreateSheet(ctx);
    }
    
    // Handle batch operations
    if (action === ModelBuilderActions.BATCH_OPERATIONS) {
      const { operations, transactional = false } = body;
      
      // Validate operations array
      if (!operations || !Array.isArray(operations)) {
        return errorResponse('Invalid operations: must be an array', 'INVALID_OPERATIONS', 400);
      }
      
      if (operations.length === 0) {
        return errorResponse('Operations array cannot be empty', 'EMPTY_OPERATIONS', 400);
      }
      
      if (operations.length > 50) {
        return errorResponse('Too many operations: maximum 50 operations per batch', 'TOO_MANY_OPERATIONS', 400);
      }
      
      // Initialize Supabase client for version tracking
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // If transactional, capture initial version states
      const modelVersionSnapshots = new Map<string, number>();
      
      if (transactional) {
        // Extract unique model IDs from operations
        const modelIds = new Set<string>();
        operations.forEach((op: any) => {
          if (op.modelId) modelIds.add(op.modelId);
        });
        
        // Capture current version for each model
        for (const modelId of modelIds) {
          const { data: model } = await supabase
            .from('models')
            .select('latest_version')
            .eq('id', modelId)
            .eq('user_id', authResult.userId)
            .single();
            
          if (model) {
            modelVersionSnapshots.set(modelId, model.latest_version);
          }
        }
      }
      
      const results: any[] = [];
      const errors: any[] = [];
      let successCount = 0;
      let failureCount = 0;
      let rollbackRequired = false;
      
      // Process each operation sequentially
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const operationId = operation.id || `op_${i}`;
        
        try {
          // Validate operation structure
          if (!operation.action) {
            errors.push({
              operationId,
              error: 'Missing action in operation',
              code: 'MISSING_ACTION'
            });
            failureCount++;
            rollbackRequired = transactional;
            if (transactional) break; // Stop on first error in transactional mode
            continue;
          }
          
          // Create a new request object for each operation
          const operationUrl = new URL(request.url);
          
          // Handle different HTTP methods based on action
          let response: NextResponse;
          
          // Determine method based on action
          if (['getModel', 'listSheets', 'listBlocks', 'getBlock', 'listConnections', 'getConnection', 'getBlockPorts', 'listParameters'].includes(operation.action)) {
            // GET operations
            operationUrl.searchParams.set('action', operation.action);
            Object.keys(operation).forEach(key => {
              if (key !== 'action' && key !== 'id') {
                operationUrl.searchParams.set(key, operation[key]);
              }
            });

            const getRequest = new NextRequest(operationUrl.toString(), {
              method: 'GET',
              headers: request.headers
            });

            response = await GET(getRequest);
          } else if (['createModel', 'createSheet', 'addBlock', 'addConnection', 'validateModel', 'setParameter'].includes(operation.action)) {
            // POST operations
            const postRequest = new NextRequest(request.url, {
              method: 'POST',
              headers: request.headers,
              body: JSON.stringify(operation)
            });

            response = await POST(postRequest);
          } else if (['renameSheet', 'updateBlockPosition', 'updateBlockName', 'updateBlockParameters'].includes(operation.action)) {
            // PUT operations
            const putRequest = new NextRequest(request.url, {
              method: 'PUT',
              headers: request.headers,
              body: JSON.stringify(operation)
            });

            response = await PUT(putRequest);
          } else if (['deleteSheet', 'deleteBlock', 'deleteConnection', 'deleteParameter'].includes(operation.action)) {
            // DELETE operations
            operationUrl.searchParams.set('action', operation.action);
            Object.keys(operation).forEach(key => {
              if (key !== 'action' && key !== 'id') {
                operationUrl.searchParams.set(key, operation[key]);
              }
            });

            const deleteRequest = new NextRequest(operationUrl.toString(), {
              method: 'DELETE',
              headers: request.headers
            });

            response = await DELETE(deleteRequest);
          } else {
            errors.push({
              operationId,
              error: `Unknown action: ${operation.action}`,
              code: 'UNKNOWN_ACTION'
            });
            failureCount++;
            rollbackRequired = transactional;
            if (transactional) break;
            continue;
          }
          
          // Parse the response
          const responseData = await response.json();
          
          if (responseData.success) {
            results.push({
              operationId,
              success: true,
              data: responseData.data
            });
            successCount++;
          } else {
            errors.push({
              operationId,
              error: responseData.error || 'Operation failed',
              code: responseData.code || 'OPERATION_FAILED',
              details: responseData.details
            });
            failureCount++;
            rollbackRequired = transactional;
            if (transactional) break; // Stop on first error
          }
          
        } catch (error) {
          console.error(`Batch operation ${operationId} error:`, error);
          errors.push({
            operationId,
            error: error instanceof Error ? error.message : 'Unknown error',
            code: 'OPERATION_ERROR'
          });
          failureCount++;
          rollbackRequired = transactional;
          if (transactional) break;
        }
      }
      
      // Perform rollback if required
      if (rollbackRequired && modelVersionSnapshots.size > 0) {
        console.log('Performing batch operation rollback...');
        
        for (const [modelId, originalVersion] of modelVersionSnapshots) {
          try {
            // Get the version data we want to restore
            const { data: versionToRestore } = await supabase
              .from('model_versions')
              .select('data')
              .eq('model_id', modelId)
              .eq('version', originalVersion)
              .single();
              
            if (versionToRestore) {
              // Create a new version with the restored data
              const { data: latestModel } = await supabase
                .from('models')
                .select('latest_version')
                .eq('id', modelId)
                .single();
                
              if (latestModel && latestModel.latest_version > originalVersion) {
                const rollbackVersion = latestModel.latest_version + 1;
                
                await supabase
                  .from('model_versions')
                  .insert({
                    model_id: modelId,
                    version: rollbackVersion,
                    data: versionToRestore.data
                  });
                  
                await supabase
                  .from('models')
                  .update({
                    latest_version: rollbackVersion,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', modelId);
                  
                console.log(`Rolled back model ${modelId} from version ${latestModel.latest_version} to ${originalVersion} (new version: ${rollbackVersion})`);
              }
            }
          } catch (rollbackError) {
            console.error(`Failed to rollback model ${modelId}:`, rollbackError);
          }
        }
        
        return successResponse({
          batchId: `batch_${Date.now()}`,
          totalOperations: operations.length,
          successCount,
          failureCount,
          transactional: true,
          rolledBack: true,
          results: transactional ? [] : results, // Don't include partial results in transactional mode
          errors
        });
      }
      
      return successResponse({
        batchId: `batch_${Date.now()}`,
        totalOperations: operations.length,
        successCount,
        failureCount,
        transactional,
        rolledBack: false,
        results,
        errors
      });
    }
    
    // Handle validate model action
    if (action === ModelBuilderActions.VALIDATE_MODEL) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleValidateModel(ctx);
    }

    // Handle add block action
    if (action === ModelBuilderActions.ADD_BLOCK) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleAddBlock(ctx);
    }
    
    // Handle add connection action
    if (action === ModelBuilderActions.ADD_CONNECTION) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleAddConnection(ctx);
    }
    
    // Handle import sheet action
    if (action === ModelBuilderActions.IMPORT_SHEET) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleImportSheet(ctx);
    }

    // Handle clone sheet action
    if (action === ModelBuilderActions.CLONE_SHEET) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleCloneSheet(ctx);
    }

    // Handle setParameter action (creates or updates a model parameter)
    if (action === ModelBuilderActions.SET_PARAMETER) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleSetParameter(ctx);
    }

    // Block parameter POST action (add subsystem parameter)
    if (action === ModelBuilderActions.ADD_BLOCK_PARAMETER) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleAddBlockParameter(ctx);
    }

    // Other POST actions will be implemented in subsequent tasks
    const errorResp = errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    logRequest('POST', action || 'unknown', body, startTime, { success: false, status: 400, error: `Unknown action: ${action}` });
    return errorResp;
    
  } catch (error) {
    console.error('Model Builder API POST error:', error);
    const errorResp = ErrorResponses.serverError();
    logRequest('POST', action || 'unknown', body, startTime, { success: false, status: 500, error: 'Server error' });
    return errorResp;
  }
}

// PUT handler for updating models, sheets, blocks, and connections
export async function PUT(request: NextRequest) {
  const startTime = Date.now();
  const action = 'unknown';
  const body: any = {};

  // Extract token from Authorization header
  const token = extractBearerToken(request);

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Missing Authorization header. Use: Authorization: Bearer <token>',
        code: 'MISSING_AUTH_HEADER'
      },
      { status: 401 }
    );
  }

  // Check rate limit
  const rateLimit = checkRateLimit(token);
  if (!rateLimit.allowed) {
    const response = rateLimitExceededResponse(rateLimit.retryAfter!);
    logRequest('PUT', action, { token: token }, startTime, { success: false, status: 429, error: 'Rate limit exceeded' });
    return response;
  }

  // Authenticate the request using the new middleware
  const authResult = await authenticateApiRequest(token);
  
  if (!authResult.authenticated) {
    modelBuilderApiMetrics.record(
      'GET',
      action || 'unknown',
      Date.now() - startTime,
      false,
      401,
      authResult.error
    );
    
    return NextResponse.json(
      { 
        success: false,
        timestamp: new Date().toISOString(),
        error: authResult.error || 'Authentication failed',
        code: 'UNAUTHORIZED'
      },
      { status: 401 }
    );
  }
  
  try {
    // Parse request body
    let body;
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return errorResponse('Invalid JSON in request body', 'INVALID_JSON');
    }
    
    const { action } = body;
    
    // Handle update model name action
    if (action === ModelBuilderActions.UPDATE_MODEL_NAME) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleUpdateModelName(ctx);
    }
    
    // Handle update block parameters action - delegate to handler
    if (action === ModelBuilderActions.UPDATE_BLOCK_PARAMETERS) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleUpdateBlockParameters(ctx);
    }
    
    // Handle update block name action
    if (action === ModelBuilderActions.UPDATE_BLOCK_NAME) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleUpdateBlockName(ctx);
    }
    
    // Handle update block position action
    if (action === ModelBuilderActions.UPDATE_BLOCK_POSITION) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleUpdateBlockPosition(ctx);
    }
    
    // Handle rename sheet action
    if (action === ModelBuilderActions.RENAME_SHEET) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleRenameSheet(ctx);
    }

    // Block parameter PUT action (update subsystem parameter)
    if (action === ModelBuilderActions.UPDATE_BLOCK_PARAMETER) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        body
      };

      return handleUpdateBlockParameter(ctx);
    }

    // Other PUT actions will be implemented in subsequent tasks
    const errorResp = errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    logRequest('PUT', action || 'unknown', body, startTime, { success: false, status: 400, error: `Unknown action: ${action}` });
    return errorResp;
    
  } catch (error) {
    console.error('Model Builder API PUT error:', error);
    const errorResp = ErrorResponses.serverError();
    logRequest('PUT', action || 'unknown', body, startTime, { success: false, status: 500, error: 'Server error' });
    return errorResp;
  }
}

// DELETE handler for removing models, sheets, blocks, and connections
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const modelId = searchParams.get('modelId');

  // Extract token from Authorization header
  const token = extractBearerToken(request);

  if (!token) {
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'Missing Authorization header. Use: Authorization: Bearer <token>',
        code: 'MISSING_AUTH_HEADER'
      },
      { status: 401 }
    );
  }

  // Prepare logging params
  const logParams = {
    token: token,
    action,
    modelId,
    ...Object.fromEntries(searchParams.entries())
  };

  // Check rate limit
  const rateLimit = checkRateLimit(token);
  if (!rateLimit.allowed) {
    const response = rateLimitExceededResponse(rateLimit.retryAfter!);
    logRequest('DELETE', action, logParams, startTime, { success: false, status: 429, error: 'Rate limit exceeded' });
    return response;
  }

  // Authenticate the request using the new middleware
  const authResult = await authenticateApiRequest(token);
  
  if (!authResult.authenticated) {
    modelBuilderApiMetrics.record(
      'GET',
      action || 'unknown',
      Date.now() - startTime,
      false,
      401,
      authResult.error
    );
    
    return NextResponse.json(
      { 
        success: false,
        timestamp: new Date().toISOString(),
        error: authResult.error || 'Authentication failed',
        code: 'UNAUTHORIZED'
      },
      { status: 401 }
    );
  }
  
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    const action = searchParams.get('action');
    
    // For backward compatibility, if no action is specified but modelId is present,
    // assume it's a model deletion
    if (modelId && !action) {
      // Initialize Supabase client with service role
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // First, check if the model exists
      const { data: model, error: fetchError } = await supabase
        .from('models')
        .select('id')
        .eq('id', modelId)
        .eq('user_id', authResult.userId)
        .single();
        
      if (fetchError || !model) {
        return ErrorResponses.modelNotFound(modelId);
      }

      // Delete all model versions first (due to foreign key constraint)
      const { error: versionsError } = await supabase
        .from('model_versions')
        .delete()
        .eq('model_id', modelId);
        
      if (versionsError) {
        console.error('Error deleting model versions:', versionsError);
        return errorResponse('Failed to delete model versions', 'DELETE_VERSIONS_FAILED', 500);
      }
      
      // Now delete the model itself
      const { error: deleteError } = await supabase
        .from('models')
        .delete()
        .eq('id', modelId);
        
      if (deleteError) {
        console.error('Error deleting model:', deleteError);
        return errorResponse('Failed to delete model', 'DELETE_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        message: 'Model deleted successfully',
        modelId: modelId
      });
    }
    
    // Handle delete sheet action
    if (action === ModelBuilderActions.DELETE_SHEET) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        searchParams
      };

      return handleDeleteSheet(ctx);
    }
    
    // Handle clear sheet action
    if (action === ModelBuilderActions.CLEAR_SHEET) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        searchParams
      };

      return handleClearSheet(ctx);
    }
    
    // Handle delete connection action
    if (action === ModelBuilderActions.DELETE_CONNECTION) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        searchParams
      };

      return handleDeleteConnection(ctx);
    }
    
    // Handle delete block action
    if (action === ModelBuilderActions.DELETE_BLOCK) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        searchParams
      };

      return handleDeleteBlock(ctx);
    }

    // Handle deleteParameter action
    if (action === ModelBuilderActions.DELETE_PARAMETER) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        searchParams
      };

      return handleDeleteParameter(ctx);
    }

    // Block parameter DELETE action (delete subsystem parameter)
    if (action === ModelBuilderActions.DELETE_BLOCK_PARAMETER) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const ctx = {
        request,
        supabase,
        userId: authResult.userId!,
        token: token!,
        startTime,
        searchParams
      };

      return handleDeleteBlockParameter(ctx);
    }

    // If no valid action or modelId
    return ErrorResponses.missingParameter('modelId or action');
    
  } catch (error) {
    console.error('Model Builder API DELETE error:', error);
    return ErrorResponses.serverError();
  }
}