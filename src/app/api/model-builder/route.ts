// app/api/model-builder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';
import { authenticateRequest } from '@/lib/apiAuthMiddleware';
import { getStorage, type ModelData } from '@/lib/server/storage';
import { ActionHandler, HandlerContext, ModelBuilderActions } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import {
  checkRateLimit,
  extractBearerToken,
  logRequest,
  rateLimitExceededResponse,
  loadModel,
  storageErrorResponse
} from '@/lib/api-support/auth';
// Import all handlers from refactored modules
import {
  // Model handlers
  handleGetModel,
  handleGetModelMetadata,
  handleCreateModel,
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
  handleAddModelReference,
  handleSetModelReference,
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

// Action → handler tables, per HTTP method
const GET_HANDLERS: Record<string, ActionHandler> = {
  [ModelBuilderActions.GET_MODEL]: handleGetModel,
  [ModelBuilderActions.LIST_SHEETS]: handleListSheets,
  [ModelBuilderActions.EXPORT_SHEET]: handleExportSheet,
  [ModelBuilderActions.GET_MODEL_METADATA]: handleGetModelMetadata,
  [ModelBuilderActions.GET_BLOCK_PORTS]: handleGetBlockPorts,
  [ModelBuilderActions.GET_CONNECTION]: handleGetConnection,
  [ModelBuilderActions.LIST_CONNECTIONS]: handleListConnections,
  [ModelBuilderActions.GET_BLOCK]: handleGetBlock,
  [ModelBuilderActions.LIST_BLOCKS]: handleListBlocks,
  [ModelBuilderActions.LIST_PARAMETERS]: handleListParameters,
  // Block parameter operations (subsystem parameters)
  [ModelBuilderActions.LIST_BLOCK_PARAMETERS]: handleListBlockParameters,
  [ModelBuilderActions.GET_BLOCK_PARAMETER]: handleGetBlockParameter
};

const POST_HANDLERS: Record<string, ActionHandler> = {
  [ModelBuilderActions.CREATE_MODEL]: handleCreateModel,
  [ModelBuilderActions.CREATE_SHEET]: handleCreateSheet,
  [ModelBuilderActions.VALIDATE_MODEL]: handleValidateModel,
  [ModelBuilderActions.ADD_BLOCK]: handleAddBlock,
  [ModelBuilderActions.ADD_MODEL_REFERENCE]: handleAddModelReference,
  [ModelBuilderActions.ADD_CONNECTION]: handleAddConnection,
  [ModelBuilderActions.IMPORT_SHEET]: handleImportSheet,
  [ModelBuilderActions.CLONE_SHEET]: handleCloneSheet,
  // Creates or updates a model parameter
  [ModelBuilderActions.SET_PARAMETER]: handleSetParameter,
  // Add subsystem parameter
  [ModelBuilderActions.ADD_BLOCK_PARAMETER]: handleAddBlockParameter
};

const PUT_HANDLERS: Record<string, ActionHandler> = {
  [ModelBuilderActions.UPDATE_MODEL_NAME]: handleUpdateModelName,
  [ModelBuilderActions.UPDATE_BLOCK_PARAMETERS]: handleUpdateBlockParameters,
  [ModelBuilderActions.UPDATE_BLOCK_NAME]: handleUpdateBlockName,
  [ModelBuilderActions.SET_MODEL_REFERENCE]: handleSetModelReference,
  [ModelBuilderActions.UPDATE_BLOCK_POSITION]: handleUpdateBlockPosition,
  [ModelBuilderActions.RENAME_SHEET]: handleRenameSheet,
  // Update subsystem parameter
  [ModelBuilderActions.UPDATE_BLOCK_PARAMETER]: handleUpdateBlockParameter
};

const DELETE_HANDLERS: Record<string, ActionHandler> = {
  [ModelBuilderActions.DELETE_SHEET]: handleDeleteSheet,
  [ModelBuilderActions.CLEAR_SHEET]: handleClearSheet,
  [ModelBuilderActions.DELETE_CONNECTION]: handleDeleteConnection,
  [ModelBuilderActions.DELETE_BLOCK]: handleDeleteBlock,
  [ModelBuilderActions.DELETE_PARAMETER]: handleDeleteParameter,
  // Delete subsystem parameter
  [ModelBuilderActions.DELETE_BLOCK_PARAMETER]: handleDeleteBlockParameter
};

// Look up an action's handler (own keys only, so 'toString' etc. stay unknown)
function findHandler(table: Record<string, ActionHandler>, action: string | null | undefined): ActionHandler | undefined {
  return action && Object.prototype.hasOwnProperty.call(table, action) ? table[action] : undefined;
}

type AuthorizeResult =
  | { ok: true; userId: string; token: string | null }
  | { ok: false; response: NextResponse };

/**
 * Rate-limit and authenticate a request. Accepts either an API token
 * (Authorization: Bearer <token>) or the local browser session cookie.
 */
async function authorize(
  request: NextRequest,
  method: string,
  action: string | null,
  logParams: Record<string, any>,
  startTime: number
): Promise<AuthorizeResult> {
  const token = extractBearerToken(request);

  // Check rate limit (keyed by API token, or one shared bucket for the session)
  const rateLimit = checkRateLimit(token || 'session');
  if (!rateLimit.allowed) {
    logRequest(method, action, logParams, startTime, { success: false, status: 429, error: 'Rate limit exceeded' });
    return { ok: false, response: rateLimitExceededResponse(rateLimit.retryAfter!) };
  }

  const authResult = await authenticateRequest(request);

  if (!authResult.authenticated) {
    modelBuilderApiMetrics.record(
      method,
      action || 'unknown',
      Date.now() - startTime,
      false,
      401,
      authResult.error
    );

    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          error: authResult.error || 'Authentication failed',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      )
    };
  }

  return { ok: true, userId: authResult.userId!, token };
}

/**
 * Build the standard handler context
 */
function buildContext(
  request: NextRequest,
  auth: { userId: string; token: string | null },
  startTime: number,
  searchParams: URLSearchParams,
  body?: any
): HandlerContext {
  return {
    request,
    storage: getStorage(),
    userId: auth.userId,
    token: auth.token || '',
    startTime,
    searchParams,
    body,
    modelId: searchParams.get('modelId') || undefined,
    sheetId: searchParams.get('sheetId') || undefined,
    blockId: searchParams.get('blockId') || undefined,
    connectionId: searchParams.get('connectionId') || undefined
  };
}

// Parse a JSON request body; returns undefined if the body is not valid JSON
async function parseJsonBody(request: NextRequest): Promise<any | undefined> {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return undefined;
  }
}

// GET handler for retrieving model data and introspection
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const modelId = searchParams.get('modelId');

  // Prepare logging params (logRequest masks the token)
  const logParams = {
    action,
    modelId,
    ...Object.fromEntries(searchParams.entries())
  };

  const auth = await authorize(request, 'GET', action, logParams, startTime);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const ctx = buildContext(request, auth, startTime, searchParams);

    // Default action is to get the model
    const handler = findHandler(GET_HANDLERS, action || ModelBuilderActions.GET_MODEL);
    if (handler) {
      return await handler(ctx);
    }

    const errorResp = errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    logRequest('GET', action, logParams, startTime, { success: false, status: 400, error: `Unknown action: ${action}` });
    return errorResp;

  } catch (error) {
    console.error('Model Builder API GET error:', error);
    const storageResp = storageErrorResponse(error);
    if (storageResp) return storageResp;
    const errorResp = ErrorResponses.serverError();
    logRequest('GET', action, logParams, startTime, { success: false, status: 500, error: 'Server error' });
    return errorResp;
  }
}

// POST handler for creating models, sheets, blocks, and connections
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const auth = await authorize(request, 'POST', 'unknown', {}, startTime);
  if (!auth.ok) {
    return auth.response;
  }

  // Parse request body
  const body = await parseJsonBody(request);
  if (body === undefined) {
    logRequest('POST', 'unknown', {}, startTime, { success: false, status: 400, error: 'Invalid JSON' });
    return errorResponse('Invalid JSON in request body', 'INVALID_JSON');
  }

  const { action } = body;

  try {
    // Handle batch operations
    if (action === ModelBuilderActions.BATCH_OPERATIONS) {
      return await handleBatchOperations(request, body);
    }

    const handler = findHandler(POST_HANDLERS, action);
    if (handler) {
      return await handler(buildContext(request, auth, startTime, searchParams, body));
    }

    const errorResp = errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    logRequest('POST', action || 'unknown', body, startTime, { success: false, status: 400, error: `Unknown action: ${action}` });
    return errorResp;

  } catch (error) {
    console.error('Model Builder API POST error:', error);
    const storageResp = storageErrorResponse(error);
    if (storageResp) return storageResp;
    const errorResp = ErrorResponses.serverError();
    logRequest('POST', action || 'unknown', body, startTime, { success: false, status: 500, error: 'Server error' });
    return errorResp;
  }
}

/**
 * BATCH_OPERATIONS - Run up to 50 operations sequentially by re-dispatching
 * each one through the GET/POST/PUT/DELETE handlers with the caller's
 * credentials. In transactional mode, the first failure stops the batch and
 * every touched model is restored to its pre-batch content.
 */
async function handleBatchOperations(request: NextRequest, body: any): Promise<NextResponse> {
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

  const storage = getStorage();

  // If transactional, capture each model's current content. API mutations
  // write in place without creating versions, so the snapshot is held in
  // memory rather than referenced by version number.
  const modelSnapshots = new Map<string, { data: ModelData; hash: string }>();

  if (transactional) {
    // Extract unique model IDs from operations
    const modelIds = new Set<string>();
    operations.forEach((op: any) => {
      if (op.modelId) modelIds.add(op.modelId);
    });

    for (const modelId of modelIds) {
      try {
        const current = storage.models.readCurrent(modelId);
        modelSnapshots.set(modelId, { data: current.data, hash: current.hash });
      } catch {
        // Missing models are reported by the individual operations
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
  if (rollbackRequired && modelSnapshots.size > 0) {
    console.log('Performing batch operation rollback...');

    for (const [modelId, snapshot] of modelSnapshots) {
      try {
        // Restore the pre-batch content in place if the batch changed it
        const current = storage.models.readCurrent(modelId);
        if (current.hash !== snapshot.hash) {
          storage.models.writeInPlace(modelId, snapshot.data);
          console.log(`Rolled back model ${modelId} to its pre-batch content`);
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

// PUT handler for updating models, sheets, blocks, and connections
export async function PUT(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const auth = await authorize(request, 'PUT', 'unknown', {}, startTime);
  if (!auth.ok) {
    return auth.response;
  }

  // Parse request body
  const body = await parseJsonBody(request);
  if (body === undefined) {
    return errorResponse('Invalid JSON in request body', 'INVALID_JSON');
  }

  const { action } = body;

  try {
    const handler = findHandler(PUT_HANDLERS, action);
    if (handler) {
      return await handler(buildContext(request, auth, startTime, searchParams, body));
    }

    const errorResp = errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    logRequest('PUT', action || 'unknown', body, startTime, { success: false, status: 400, error: `Unknown action: ${action}` });
    return errorResp;

  } catch (error) {
    console.error('Model Builder API PUT error:', error);
    const storageResp = storageErrorResponse(error);
    if (storageResp) return storageResp;
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

  // Prepare logging params
  const logParams = {
    action,
    modelId,
    ...Object.fromEntries(searchParams.entries())
  };

  const auth = await authorize(request, 'DELETE', action, logParams, startTime);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    // For backward compatibility, if no action is specified but modelId is present,
    // assume it's a model deletion
    if (modelId && !action) {
      const storage = getStorage();

      // First, check if the model exists
      const authResult = loadModel(storage, modelId);
      if (!authResult.authorized) {
        return authResult.errorResponse!;
      }

      // Delete the model, its versions, and (for managed models) its files
      try {
        storage.models.delete(modelId);
      } catch (error) {
        console.error('Error deleting model:', error);
        return storageErrorResponse(error) ?? errorResponse('Failed to delete model', 'DELETE_FAILED', 500);
      }

      // Return success response
      return successResponse({
        message: 'Model deleted successfully',
        modelId: modelId
      });
    }

    const handler = findHandler(DELETE_HANDLERS, action);
    if (handler) {
      return await handler(buildContext(request, auth, startTime, searchParams));
    }

    // If no valid action or modelId
    return ErrorResponses.missingParameter('modelId or action');

  } catch (error) {
    console.error('Model Builder API DELETE error:', error);
    return storageErrorResponse(error) ?? ErrorResponses.serverError();
  }
}
