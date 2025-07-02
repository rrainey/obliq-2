// app/api/model-builder/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  BlockTypes, 
  isValidBlockType, 
  createBlockInstance,
  generateDynamicPorts 
} from '@/lib/blockTypeRegistry';
import { validateBlockParameters } from '@/lib/blockParameterValidator';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';
import { authenticateApiRequest } from '@/lib/apiAuthMiddleware';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

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
  BATCH_OPERATIONS: 'batchOperations'
} as const;

// GET handler for retrieving model data and introspection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const modelId = searchParams.get('modelId');
  
  // Await the params
  const { token } = await params;
  
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
    // Initialize Supabase client with service role for full access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const modelId = searchParams.get('modelId');
    
    // Default action is to get the model
    if (!action || action === ModelBuilderActions.GET_MODEL) {
      // Validate modelId parameter
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      
      // Fetch the model
      const { data: model, error } = await supabase
        .from('models')
        .select('*')
        .eq('id', modelId)
        .single();
        
      if (error || !model) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // If using a user token (not environment token), verify ownership
      if (authResult.userId && !authResult.isEnvironmentToken) {
        if (model.user_id !== authResult.userId) {
          modelBuilderApiMetrics.record(
            'GET',
            action || 'getModel',
            Date.now() - startTime,
            false,
            403,
            'Access denied'
          );
          
          return NextResponse.json(
            {
              success: false,
              timestamp: new Date().toISOString(),
              error: 'Access denied: You can only access your own models',
              code: 'FORBIDDEN'
            },
            { status: 403 }
          );
        }
      }
      
      // Return the complete model data
      const response = successResponse({
        id: model.id,
        name: model.name,
        user_id: model.user_id,
        data: model.data,
        created_at: model.created_at,
        updated_at: model.updated_at
      });
      
      modelBuilderApiMetrics.record(
        'GET',
        action || 'getModel',
        Date.now() - startTime,
        true,
        200
      );
      
      logRequest('GET', action || 'getModel', logParams, startTime, { success: true, status: 200 });
      return response;
    }
    
    // Handle listSheets action
    if (action === ModelBuilderActions.LIST_SHEETS) {
      // Validate modelId parameter
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model to access sheets
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract sheets from the model data
      const sheets = versionData.data?.sheets || [];
      
      // Transform sheets to include summary information
      const sheetSummaries = sheets.map((sheet: any) => ({
        id: sheet.id,
        name: sheet.name,
        blockCount: sheet.blocks?.length || 0,
        connectionCount: sheet.connections?.length || 0,
        extents: sheet.extents || { width: 2000, height: 2000 }
      }));
      
      return successResponse({
        modelId,
        sheetCount: sheetSummaries.length,
        sheets: sheetSummaries
      });
    }
    
    // Handle exportSheet action
    if (action === ModelBuilderActions.EXPORT_SHEET) {
      const sheetId = searchParams.get('sheetId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Find the specific sheet
      const sheets = versionData.data?.sheets || [];
      const sheet = sheets.find((s: any) => s.id === sheetId);
      
      if (!sheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Create standalone sheet JSON with metadata
      const exportData = {
        exportMetadata: {
          exportedAt: new Date().toISOString(),
          sourceModelId: modelId,
          exportVersion: '1.0',
          sheetFormat: 'obliq-2'
        },
        sheet: {
          id: sheet.id,
          name: sheet.name,
          blocks: sheet.blocks || [],
          connections: sheet.connections || [],
          extents: sheet.extents || { width: 2000, height: 2000 }
        }
      };
      
      // Return the exported sheet
      const response = successResponse({
        modelId,
        sheetId,
        sheetName: sheet.name,
        statistics: {
          blockCount: sheet.blocks?.length || 0,
          connectionCount: sheet.connections?.length || 0
        },
        exportData
      });
      
      logRequest('GET', action, logParams, startTime, { success: true, status: 200 });
      return response;
    }
    
    // Handle getModelMetadata action
    if (action === ModelBuilderActions.GET_MODEL_METADATA) {
      // Validate modelId parameter
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Fetch just the model metadata (not the full data)
      const { data: model, error } = await supabase
        .from('models')
        .select('id, name, user_id, latest_version, created_at, updated_at')
        .eq('id', modelId)
        .single();
        
      if (error || !model) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Get version count
      const { count: versionCount } = await supabase
        .from('model_versions')
        .select('*', { count: 'exact', head: true })
        .eq('model_id', modelId);
      
      // Get basic statistics from latest version (without loading full data)
      const { data: latestVersion } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .eq('version', model.latest_version)
        .single();
      
      let statistics = {
        sheetCount: 0,
        totalBlocks: 0,
        totalConnections: 0
      };
      
      if (latestVersion?.data?.sheets) {
        const sheets = latestVersion.data.sheets;
        statistics = {
          sheetCount: sheets.length,
          totalBlocks: sheets.reduce((sum: number, sheet: any) => 
            sum + (sheet.blocks?.length || 0), 0),
          totalConnections: sheets.reduce((sum: number, sheet: any) => 
            sum + (sheet.connections?.length || 0), 0)
        };
      }
      
      // Return metadata
      const response = successResponse({
        id: model.id,
        name: model.name,
        userId: model.user_id,
        latestVersion: model.latest_version,
        versionCount: versionCount || 0,
        createdAt: model.created_at,
        updatedAt: model.updated_at,
        statistics
      });
      
      logRequest('GET', action, logParams, startTime, { success: true, status: 200 });
      return response;
    }
    
    // Handle getBlockPorts action
    if (action === ModelBuilderActions.GET_BLOCK_PORTS) {
      const sheetId = searchParams.get('sheetId');
      const blockId = searchParams.get('blockId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockId) {
        return ErrorResponses.missingParameter('blockId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Find the specific sheet
      const sheets = versionData.data?.sheets || [];
      const sheet = sheets.find((s: any) => s.id === sheetId);
      
      if (!sheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the specific block
      const blocks = sheet.blocks || [];
      const block = blocks.find((b: any) => b.id === blockId);
      
      if (!block) {
        return ErrorResponses.blockNotFound(blockId);
      }
      
      // Get all connections for this sheet
      const connections = sheet.connections || [];
      
      // Build port information with connection status
      const inputPorts = (block.inputs || []).map((portName: string) => {
        const connection = connections.find((conn: any) => 
          conn.targetBlockId === blockId && conn.targetPort === portName
        );
        
        return {
          name: portName,
          type: 'input',
          connected: !!connection,
          connectedTo: connection ? {
            blockId: connection.sourceBlockId,
            blockName: blocks.find((b: any) => b.id === connection.sourceBlockId)?.name || 'Unknown',
            port: connection.sourcePort,
            connectionId: connection.id
          } : null
        };
      });
      
      const outputPorts = (block.outputs || []).map((portName: string) => {
        const outgoingConnections = connections.filter((conn: any) => 
          conn.sourceBlockId === blockId && conn.sourcePort === portName
        );
        
        return {
          name: portName,
          type: 'output',
          connected: outgoingConnections.length > 0,
          connectionCount: outgoingConnections.length,
          connectedTo: outgoingConnections.map((conn: any) => ({
            blockId: conn.targetBlockId,
            blockName: blocks.find((b: any) => b.id === conn.targetBlockId)?.name || 'Unknown',
            port: conn.targetPort,
            connectionId: conn.id
          }))
        };
      });
      
      return successResponse({
        modelId,
        sheetId,
        blockId,
        blockType: block.type,
        blockName: block.name,
        ports: {
          inputs: inputPorts,
          outputs: outputPorts,
          summary: {
            totalInputs: inputPorts.length,
            connectedInputs: inputPorts.filter((p: any) => p.connected).length,
            totalOutputs: outputPorts.length,
            totalOutgoingConnections: outputPorts.reduce((sum: number, p: any) => sum + p.connectionCount, 0)
          }
        }
      });
    }
    
    // Handle getConnection action
    if (action === ModelBuilderActions.GET_CONNECTION) {
      const sheetId = searchParams.get('sheetId');
      const connectionId = searchParams.get('connectionId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!connectionId) {
        return ErrorResponses.missingParameter('connectionId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Find the specific sheet
      const sheets = versionData.data?.sheets || [];
      const sheet = sheets.find((s: any) => s.id === sheetId);
      
      if (!sheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the specific connection
      const connections = sheet.connections || [];
      const connection = connections.find((c: any) => c.id === connectionId);
      
      if (!connection) {
        return ErrorResponses.connectionNotFound(connectionId);
      }
      
      // Get block details for the connection
      const sourceBlock = sheet.blocks?.find((b: any) => b.id === connection.sourceBlockId);
      const targetBlock = sheet.blocks?.find((b: any) => b.id === connection.targetBlockId);
      
      // Return complete connection details
      return successResponse({
        modelId,
        sheetId,
        connection: {
          id: connection.id,
          source: {
            blockId: connection.sourceBlockId,
            blockName: sourceBlock?.name || 'Unknown',
            blockType: sourceBlock?.type || 'unknown',
            port: connection.sourcePort
          },
          target: {
            blockId: connection.targetBlockId,
            blockName: targetBlock?.name || 'Unknown',
            blockType: targetBlock?.type || 'unknown',
            port: connection.targetPort
          }
        }
      });
    }
    
    // Handle listConnections action
    if (action === ModelBuilderActions.LIST_CONNECTIONS) {
      const sheetId = searchParams.get('sheetId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Find the specific sheet
      const sheets = versionData.data?.sheets || [];
      const sheet = sheets.find((s: any) => s.id === sheetId);
      
      if (!sheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Extract connections from the sheet
      const connections = sheet.connections || [];
      
      // Transform connections to include full details
      const connectionDetails = connections.map((conn: any) => ({
        id: conn.id,
        sourceBlockId: conn.sourceBlockId,
        sourcePort: conn.sourcePort,
        targetBlockId: conn.targetBlockId,
        targetPort: conn.targetPort,
        // Include block names for easier identification
        sourceBlockName: sheet.blocks?.find((b: any) => b.id === conn.sourceBlockId)?.name || 'Unknown',
        targetBlockName: sheet.blocks?.find((b: any) => b.id === conn.targetBlockId)?.name || 'Unknown'
      }));
      
      return successResponse({
        modelId,
        sheetId,
        connectionCount: connectionDetails.length,
        connections: connectionDetails
      });
    }
    
    // Handle getBlock action
    if (action === ModelBuilderActions.GET_BLOCK) {
      const sheetId = searchParams.get('sheetId');
      const blockId = searchParams.get('blockId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockId) {
        return ErrorResponses.missingParameter('blockId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Find the specific sheet
      const sheets = versionData.data?.sheets || [];
      const sheet = sheets.find((s: any) => s.id === sheetId);
      
      if (!sheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the specific block
      const blocks = sheet.blocks || [];
      const block = blocks.find((b: any) => b.id === blockId);
      
      if (!block) {
        return ErrorResponses.blockNotFound(blockId);
      }
      
      // Return complete block details
      return successResponse({
        modelId,
        sheetId,
        block: {
          id: block.id,
          type: block.type,
          name: block.name,
          position: block.position || { x: 0, y: 0 },
          parameters: block.parameters || {},
          ports: {
            inputs: block.inputs || [],
            outputs: block.outputs || []
          },
          // Include any additional metadata if present
          metadata: {
            created: block.created,
            modified: block.modified,
            description: block.description
          }
        }
      });
    }
    
    // Handle listBlocks action
    if (action === ModelBuilderActions.LIST_BLOCKS) {
      const sheetId = searchParams.get('sheetId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Find the specific sheet
      const sheets = versionData.data?.sheets || [];
      const sheet = sheets.find((s: any) => s.id === sheetId);
      
      if (!sheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Extract blocks from the sheet
      const blocks = sheet.blocks || [];
      
      // Transform blocks to include all properties
      const blockDetails = blocks.map((block: any) => ({
        id: block.id,
        type: block.type,
        name: block.name,
        position: block.position || { x: 0, y: 0 },
        parameters: block.parameters || {},
        ports: {
          inputs: block.inputs || [],
          outputs: block.outputs || []
        }
      }));
      
      return successResponse({
        modelId,
        sheetId,
        blockCount: blockDetails.length,
        blocks: blockDetails
      });
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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const startTime = Date.now();
  let action = 'unknown';
  let body: any = {};
  
  // Await the params
  const { token } = await params;
  
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
      const { name, userId: providedUserId } = body;

      const userIdToUse = authResult.userId || providedUserId;
      
      // Validate required parameters
      if (!name) {
        return ErrorResponses.missingParameter('name');
      }
      if (!userIdToUse) {
        return ErrorResponses.missingParameter('userId');
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
      const initialModelData = {
        version: "1.0",
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
      
      // Return the created model
      return successResponse({
        id: newModel.id,
        name: newModel.name,
        user_id: newModel.user_id,
        latest_version: newModel.latest_version,
        created_at: newModel.created_at,
        updated_at: newModel.updated_at,
        initialData: initialModelData
      }, 201);
    }
    
    // Handle create sheet action
    if (action === ModelBuilderActions.CREATE_SHEET) {
      const { modelId, name } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Generate a unique sheet ID
      const sheetId = `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Generate sheet name if not provided
      const sheetName = name || `Sheet ${sheets.length + 1}`;
      
      // Create new sheet
      const newSheet = {
        id: sheetId,
        name: sheetName,
        blocks: [],
        connections: [],
        extents: {
          width: 2000,
          height: 2000
        }
      };
      
      // Add sheet to model data
      modelData.sheets.push(newSheet);
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to create sheet', 'CREATE_SHEET_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return the created sheet
      return successResponse({
        modelId,
        newVersion: nextVersion,
        sheet: {
          id: newSheet.id,
          name: newSheet.name,
          blockCount: 0,
          connectionCount: 0,
          extents: newSheet.extents
        }
      }, 201);
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
          if (['getModel', 'listSheets', 'listBlocks', 'getBlock', 'listConnections', 'getConnection', 'getBlockPorts'].includes(operation.action)) {
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
            
            response = await GET(getRequest, { params: Promise.resolve({ token }) });
          } else if (['createModel', 'createSheet', 'addBlock', 'addConnection', 'validateModel'].includes(operation.action)) {
            // POST operations
            const postRequest = new NextRequest(request.url, {
              method: 'POST',
              headers: request.headers,
              body: JSON.stringify(operation)
            });
            
            response = await POST(postRequest, { params: Promise.resolve({ token }) });
          } else if (['renameSheet', 'updateBlockPosition', 'updateBlockName', 'updateBlockParameters'].includes(operation.action)) {
            // PUT operations
            const putRequest = new NextRequest(request.url, {
              method: 'PUT',
              headers: request.headers,
              body: JSON.stringify(operation)
            });
            
            response = await PUT(putRequest, { params: Promise.resolve({ token }) });
          } else if (['deleteSheet', 'deleteBlock', 'deleteConnection'].includes(operation.action)) {
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
            
            response = await DELETE(deleteRequest, { params: Promise.resolve({ token }) });
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
              .eq('user_id', authResult.userId)
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
      const { modelId } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validate model has at least one sheet
      if (sheets.length === 0) {
        errors.push('Model must have at least one sheet');
      }
      
      // Validate each sheet
      sheets.forEach((sheet: any, sheetIndex: number) => {
        const blocks = sheet.blocks || [];
        const connections = sheet.connections || [];
        
        // Check for empty sheets
        if (blocks.length === 0) {
          warnings.push(`Sheet '${sheet.name}' (${sheet.id}) has no blocks`);
        }
        
        // Validate blocks
        blocks.forEach((block: any) => {
          // Check for missing required parameters
          if (!block.id) {
            errors.push(`Block at index ${blocks.indexOf(block)} in sheet '${sheet.name}' has no ID`);
          }
          if (!block.type) {
            errors.push(`Block '${block.id || 'unknown'}' in sheet '${sheet.name}' has no type`);
          }
          if (!block.name) {
            warnings.push(`Block '${block.id}' in sheet '${sheet.name}' has no name`);
          }
          
          // Validate block parameters based on type
          if (block.type && isValidBlockType(block.type)) {
            const validation = validateBlockParameters(block.type, block.parameters || {});
            if (!validation.valid) {
              validation.errors.forEach((error: string) => {
                errors.push(`Block '${block.name || block.id}' (${block.type}) in sheet '${sheet.name}': ${error}`);
              });
            }
          }
        });
        
        // Validate connections
        connections.forEach((conn: any, connIndex: number) => {
          // Check connection structure
          if (!conn.sourceBlockId || !conn.sourcePort || !conn.targetBlockId || !conn.targetPort) {
            errors.push(`Connection at index ${connIndex} in sheet '${sheet.name}' is incomplete`);
            return;
          }
          
          // Check if referenced blocks exist
          const sourceBlock = blocks.find((b: any) => b.id === conn.sourceBlockId);
          const targetBlock = blocks.find((b: any) => b.id === conn.targetBlockId);
          
          if (!sourceBlock) {
            errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references non-existent source block '${conn.sourceBlockId}'`);
          }
          if (!targetBlock) {
            errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references non-existent target block '${conn.targetBlockId}'`);
          }
          
          // Check if ports exist on blocks
          if (sourceBlock && (!sourceBlock.outputs || !sourceBlock.outputs.includes(conn.sourcePort))) {
            errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references non-existent output port '${conn.sourcePort}' on block '${sourceBlock.name || sourceBlock.id}'`);
          }
          if (targetBlock && (!targetBlock.inputs || !targetBlock.inputs.includes(conn.targetPort))) {
            errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references non-existent input port '${conn.targetPort}' on block '${targetBlock.name || targetBlock.id}'`);
          }
        });
        
        // Check for multiple connections to same input port
        const inputPortUsage = new Map<string, number>();
        connections.forEach((conn: any) => {
          const key = `${conn.targetBlockId}:${conn.targetPort}`;
          inputPortUsage.set(key, (inputPortUsage.get(key) || 0) + 1);
        });
        
        inputPortUsage.forEach((count, key) => {
          if (count > 1) {
            const [blockId, port] = key.split(':');
            const block = blocks.find((b: any) => b.id === blockId);
            errors.push(`Input port '${port}' on block '${block?.name || blockId}' in sheet '${sheet.name}' has ${count} connections (only 1 allowed)`);
          }
        });
        
        // Validate Sheet Labels
        const sheetLabelSinks = blocks.filter((b: any) => b.type === BlockTypes.SHEET_LABEL_SINK);
        const sheetLabelSources = blocks.filter((b: any) => b.type === BlockTypes.SHEET_LABEL_SOURCE);
        
        // Check for duplicate sheet label sink names
        const sinkNames = new Map<string, number>();
        sheetLabelSinks.forEach((sink: any) => {
          const signalName = sink.parameters?.signalName;
          if (signalName) {
            sinkNames.set(signalName, (sinkNames.get(signalName) || 0) + 1);
          }
        });
        
        sinkNames.forEach((count, name) => {
          if (count > 1) {
            errors.push(`Sheet label signal name '${name}' is used by ${count} sink blocks in sheet '${sheet.name}' (must be unique)`);
          }
        });
        
        // Check for sources without matching sinks
        sheetLabelSources.forEach((source: any) => {
          const signalName = source.parameters?.signalName;
          if (signalName && !sinkNames.has(signalName)) {
            errors.push(`Sheet label source '${source.name || source.id}' in sheet '${sheet.name}' references unknown signal '${signalName}'`);
          }
        });
        
        // Check for unconnected required ports
        blocks.forEach((block: any) => {
          // Check for blocks that typically need inputs
          if (['sum', 'multiply', 'scale', 'transfer_function', 'output_port', 'signal_display', 'signal_logger'].includes(block.type)) {
            const hasInputConnection = connections.some((conn: any) => conn.targetBlockId === block.id);
            if (!hasInputConnection) {
              warnings.push(`Block '${block.name || block.id}' (${block.type}) in sheet '${sheet.name}' has no input connections`);
            }
          }
        });
      });
      
      // Check for model-level issues
      if (!modelData.globalSettings) {
        warnings.push('Model has no global settings defined');
      }
      
      const isValid = errors.length === 0;
      
      return successResponse({
        modelId,
        valid: isValid,
        errors,
        warnings,
        summary: {
          sheetCount: sheets.length,
          totalBlocks: sheets.reduce((sum: number, sheet: any) => sum + (sheet.blocks?.length || 0), 0),
          totalConnections: sheets.reduce((sum: number, sheet: any) => sum + (sheet.connections?.length || 0), 0),
          errorCount: errors.length,
          warningCount: warnings.length
        }
      });
    }
    
    // Handle add block action
    if (action === ModelBuilderActions.ADD_BLOCK) {
      const { modelId, sheetId, blockType, position, name, parameters } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockType) {
        return ErrorResponses.missingParameter('blockType');
      }
      
      // Validate block type
      if (!isValidBlockType(blockType)) {
        return errorResponse(`Invalid block type: ${blockType}`, 'INVALID_BLOCK_TYPE', 400);
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      const sheet = sheets[sheetIndex];
      const existingBlocks = sheet.blocks || [];
      
      // Generate block ID
      const blockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Generate block name if not provided
      let blockName = name;
      if (!blockName) {
        // Count existing blocks of this type to generate name
        const typeCount = existingBlocks.filter((b: any) => b.type === blockType).length;
        const displayName = blockType.split('_').map((word: string) => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
        blockName = `${displayName}${typeCount + 1}`;
      }
      
      // Set default position if not provided
      const blockPosition = position || { x: 100, y: 100 };
      
      // Create the new block instance
      const newBlock = createBlockInstance(blockType, blockId, blockName, blockPosition);
      
      // Override with any provided parameters
      if (parameters) {
        newBlock.parameters = { ...newBlock.parameters, ...parameters };
      }
      
      // Add block to sheet
      sheet.blocks.push(newBlock);
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to add block', 'ADD_BLOCK_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return the created block
      return successResponse({
        modelId,
        sheetId,
        newVersion: nextVersion,
        block: {
          id: newBlock.id,
          type: newBlock.type,
          name: newBlock.name,
          position: newBlock.position,
          parameters: newBlock.parameters,
          ports: {
            inputs: newBlock.inputs,
            outputs: newBlock.outputs
          }
        }
      }, 201);
    }
    
    // Handle add connection action
    if (action === ModelBuilderActions.ADD_CONNECTION) {
      const { modelId, sheetId, sourceBlockId, sourcePort, targetBlockId, targetPort } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!sourceBlockId) {
        return ErrorResponses.missingParameter('sourceBlockId');
      }
      if (!sourcePort) {
        return ErrorResponses.missingParameter('sourcePort');
      }
      if (!targetBlockId) {
        return ErrorResponses.missingParameter('targetBlockId');
      }
      if (!targetPort) {
        return ErrorResponses.missingParameter('targetPort');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      const sheet = sheets[sheetIndex];
      const blocks = sheet.blocks || [];
      const connections = sheet.connections || [];
      
      // Find source and target blocks
      const sourceBlock = blocks.find((b: any) => b.id === sourceBlockId);
      const targetBlock = blocks.find((b: any) => b.id === targetBlockId);
      
      if (!sourceBlock) {
        return ErrorResponses.blockNotFound(sourceBlockId);
      }
      if (!targetBlock) {
        return ErrorResponses.blockNotFound(targetBlockId);
      }
      
      // Validate ports exist on blocks
      if (!sourceBlock.outputs || !sourceBlock.outputs.includes(sourcePort)) {
        return errorResponse(
          `Block '${sourceBlockId}' does not have output port '${sourcePort}'`,
          'INVALID_PORT',
          400
        );
      }
      if (!targetBlock.inputs || !targetBlock.inputs.includes(targetPort)) {
        return errorResponse(
          `Block '${targetBlockId}' does not have input port '${targetPort}'`,
          'INVALID_PORT',
          400
        );
      }
      
      // Check for existing connection on target port (single input rule)
      const existingConnection = connections.find((conn: any) =>
        conn.targetBlockId === targetBlockId && conn.targetPort === targetPort
      );
      
      if (existingConnection) {
        return errorResponse(
          `Input port '${targetPort}' on block '${targetBlockId}' already has a connection`,
          'PORT_ALREADY_CONNECTED',
          400
        );
      }
      
      // Check for self-connection
      if (sourceBlockId === targetBlockId) {
        return errorResponse(
          'Cannot connect a block to itself',
          'SELF_CONNECTION',
          400
        );
      }
      
      // Check for duplicate connection
      const duplicateConnection = connections.find((conn: any) =>
        conn.sourceBlockId === sourceBlockId &&
        conn.sourcePort === sourcePort &&
        conn.targetBlockId === targetBlockId &&
        conn.targetPort === targetPort
      );
      
      if (duplicateConnection) {
        return errorResponse(
          'This connection already exists',
          'PORT_ALREADY_CONNECTED',
          400
        );
      }
      
      // Generate connection ID
      const connectionId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create the new connection
      const newConnection = {
        id: connectionId,
        sourceBlockId,
        sourcePort,
        targetBlockId,
        targetPort
      };
      
      // Add connection to sheet
      sheet.connections.push(newConnection);
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to add connection', 'ADD_CONNECTION_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return the created connection
      return successResponse({
        modelId,
        sheetId,
        newVersion: nextVersion,
        connection: {
          id: newConnection.id,
          sourceBlockId: newConnection.sourceBlockId,
          sourcePort: newConnection.sourcePort,
          targetBlockId: newConnection.targetBlockId,
          targetPort: newConnection.targetPort
        }
      }, 201);
    }
    
    // Handle import sheet action
    if (action === ModelBuilderActions.IMPORT_SHEET) {
      const { modelId, sheetData, overrideId, overrideName } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetData || typeof sheetData !== 'object') {
        return errorResponse('Invalid sheetData: must be a sheet object', 'INVALID_SHEET_DATA', 400);
      }
      
      // Validate sheet structure
      if (!sheetData.id || !sheetData.name) {
        return errorResponse('Sheet data must have id and name properties', 'INVALID_SHEET_STRUCTURE', 400);
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Generate new IDs to avoid conflicts
      const sheetIdMap = new Map<string, string>();
      const blockIdMap = new Map<string, string>();
      const connectionIdMap = new Map<string, string>();
      
      // Use override ID if provided, otherwise generate new one
      const newSheetId = overrideId || `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sheetIdMap.set(sheetData.id, newSheetId);
      
      // Check for duplicate sheet ID
      if (sheets.some((s: any) => s.id === newSheetId)) {
        return errorResponse(`Sheet with ID '${newSheetId}' already exists`, 'DUPLICATE_SHEET_ID', 400);
      }
      
      // Process blocks with new IDs
      const importedBlocks = (sheetData.blocks || []).map((block: any) => {
        const newBlockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        blockIdMap.set(block.id, newBlockId);
        
        return {
          ...block,
          id: newBlockId
        };
      });
      
      // Process connections with updated block IDs
      const importedConnections = (sheetData.connections || []).map((conn: any) => {
        const newConnectionId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        connectionIdMap.set(conn.id || `conn_${Date.now()}`, newConnectionId);
        
        // Update block IDs in connections
        const newSourceId = blockIdMap.get(conn.sourceBlockId);
        const newTargetId = blockIdMap.get(conn.targetBlockId);
        
        if (!newSourceId || !newTargetId) {
          console.warn(`Connection references non-existent blocks: ${conn.sourceBlockId} -> ${conn.targetBlockId}`);
          return null; // Skip invalid connections
        }
        
        return {
          ...conn,
          id: newConnectionId,
          sourceBlockId: newSourceId,
          targetBlockId: newTargetId
        };
      }).filter((conn: any) => conn !== null); // Remove invalid connections
      
      // Create the imported sheet
      const importedSheet = {
        ...sheetData,
        id: newSheetId,
        name: overrideName || sheetData.name,
        blocks: importedBlocks,
        connections: importedConnections,
        extents: sheetData.extents || { width: 2000, height: 2000 }
      };
      
      // Add imported sheet to model
      modelData.sheets.push(importedSheet);
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to import sheet', 'IMPORT_SHEET_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return the imported sheet info
      const response = successResponse({
        modelId,
        newVersion: nextVersion,
        importedSheet: {
          id: importedSheet.id,
          name: importedSheet.name,
          blockCount: importedSheet.blocks.length,
          connectionCount: importedSheet.connections.length,
          extents: importedSheet.extents
        },
        idMappings: {
          sheet: Object.fromEntries(sheetIdMap),
          blocks: Object.fromEntries(blockIdMap),
          connections: Object.fromEntries(connectionIdMap)
        }
      }, 201);
      
      logRequest('POST', action, { modelId, hasSheetData: true, overrideId, overrideName }, startTime, { success: true, status: 201 });
      return response;
    }
    
    // Handle clone sheet action
    if (action === ModelBuilderActions.CLONE_SHEET) {
      const { modelId, sheetId, newName } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the sheet to clone
      const sourceSheet = sheets.find((sheet: any) => sheet.id === sheetId);
      
      if (!sourceSheet) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Generate new sheet ID
      const newSheetId = `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Generate new sheet name if not provided
      const clonedSheetName = newName || `${sourceSheet.name} (Copy)`;
      
      // Create ID mappings for blocks (old ID -> new ID)
      const blockIdMap = new Map<string, string>();
      
      // Clone blocks with new IDs
      const clonedBlocks = (sourceSheet.blocks || []).map((block: any) => {
        const newBlockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        blockIdMap.set(block.id, newBlockId);
        
        return {
          ...block,
          id: newBlockId,
          // Optionally append (Copy) to block names
          name: block.name ? `${block.name} (Copy)` : block.name
        };
      });
      
      // Clone connections with updated block IDs
      const clonedConnections = (sourceSheet.connections || []).map((conn: any) => {
        const newConnectionId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        return {
          ...conn,
          id: newConnectionId,
          sourceBlockId: blockIdMap.get(conn.sourceBlockId) || conn.sourceBlockId,
          targetBlockId: blockIdMap.get(conn.targetBlockId) || conn.targetBlockId
        };
      });
      
      // Create the cloned sheet
      const clonedSheet = {
        id: newSheetId,
        name: clonedSheetName,
        blocks: clonedBlocks,
        connections: clonedConnections,
        extents: sourceSheet.extents || { width: 2000, height: 2000 }
      };
      
      // Add cloned sheet to model
      modelData.sheets.push(clonedSheet);
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to clone sheet', 'CLONE_SHEET_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return the cloned sheet info
      const response = successResponse({
        modelId,
        newVersion: nextVersion,
        sourceSheetId: sheetId,
        clonedSheet: {
          id: clonedSheet.id,
          name: clonedSheet.name,
          blockCount: clonedSheet.blocks.length,
          connectionCount: clonedSheet.connections.length,
          extents: clonedSheet.extents
        },
        blockMapping: Object.fromEntries(blockIdMap)
      }, 201);
      
      logRequest('POST', action, { modelId, sheetId, newName }, startTime, { success: true, status: 201 });
      return response;
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
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const startTime = Date.now();
  let action = 'unknown';
  let body: any = {};
  
  // Await the params
  const { token } = await params;
  
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
      const { modelId, name } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!name) {
        return ErrorResponses.missingParameter('name');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Check if model exists and get current name
      const { data: currentModel, error: fetchError } = await supabase
        .from('models')
        .select('id, name')
        .eq('id', modelId)
        .eq('user_id', authResult.userId)
        .single();
        
      if (fetchError || !currentModel) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Update the model name
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          name: name,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model name:', updateError);
        return errorResponse('Failed to update model name', 'UPDATE_MODEL_NAME_FAILED', 500);
      }
      
      // Return success response
      const response = successResponse({
        modelId,
        name,
        previousName: currentModel.name
      });
      
      logRequest('PUT', action, { modelId, name }, startTime, { success: true, status: 200 });
      return response;
    }
    
    // Handle update block parameters action
    if (action === ModelBuilderActions.UPDATE_BLOCK_PARAMETERS) {
      const { modelId, sheetId, blockId, parameters } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockId) {
        return ErrorResponses.missingParameter('blockId');
      }
      if (!parameters || typeof parameters !== 'object') {
        return errorResponse('Invalid parameters: must be an object', 'INVALID_PARAMETERS', 400);
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the block to update
      const blocks = sheets[sheetIndex].blocks || [];
      const blockIndex = blocks.findIndex((block: any) => block.id === blockId);
      
      if (blockIndex === -1) {
        return ErrorResponses.blockNotFound(blockId);
      }
      
      const block = blocks[blockIndex];
      const blockType = block.type;
      
      // Validate parameters based on block type
      const validation = validateBlockParameters(blockType, parameters);
      
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          timestamp: new Date().toISOString(),
          error: 'Parameter validation failed',
          code: 'VALIDATION_FAILED',
          details: { errors: validation.errors }
        }, { status: 400 });
      }
      
      // Update block parameters
      const oldParameters = { ...block.parameters };
      block.parameters = validation.sanitizedParameters;
      
      // For Sum and Multiply blocks, update ports based on numInputs
      if (blockType === BlockTypes.SUM || blockType === BlockTypes.MULTIPLY) {
        const ports = generateDynamicPorts(blockType, block.parameters);
        block.inputs = ports.inputs.map(p => p.name);
        block.outputs = ports.outputs.map(p => p.name);
        
        // Remove any connections to inputs that no longer exist
        const maxInputs = block.parameters.numInputs;
        const connections = sheets[sheetIndex].connections || [];
        sheets[sheetIndex].connections = connections.filter((conn: any) => {
          if (conn.targetBlockId === blockId) {
            const portMatch = conn.targetPort.match(/^input(\d+)$/);
            if (portMatch) {
              const inputNum = parseInt(portMatch[1]);
              return inputNum <= maxInputs;
            }
          }
          return true;
        });
      }
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to update block parameters', 'UPDATE_PARAMETERS_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        sheetId,
        blockId,
        blockType,
        newVersion: nextVersion,
        oldParameters,
        newParameters: block.parameters,
        ports: {
          inputs: block.inputs,
          outputs: block.outputs
        }
      });
    }
    
    // Handle update block name action
    if (action === ModelBuilderActions.UPDATE_BLOCK_NAME) {
      const { modelId, sheetId, blockId, name } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockId) {
        return ErrorResponses.missingParameter('blockId');
      }
      if (!name) {
        return ErrorResponses.missingParameter('name');
      }
      
      // Validate C-style identifier rules
      const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
      if (!identifierRegex.test(name)) {
        return errorResponse(
          'Invalid name: must follow C-style identifier rules (start with letter or underscore, contain only letters, digits, and underscores)',
          'INVALID_NAME',
          400
        );
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the block to update
      const blocks = sheets[sheetIndex].blocks || [];
      const blockIndex = blocks.findIndex((block: any) => block.id === blockId);
      
      if (blockIndex === -1) {
        return ErrorResponses.blockNotFound(blockId);
      }
      
      // Check if name is already taken by another block on the same sheet
      const nameTaken = blocks.some((block: any, idx: number) => 
        idx !== blockIndex && block.name === name
      );
      
      if (nameTaken) {
        return errorResponse(
          `Block name '${name}' is already used on this sheet`,
          'DUPLICATE_NAME',
          400
        );
      }
      
      // Update the block name
      blocks[blockIndex].name = name;
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to update block name', 'UPDATE_NAME_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        sheetId,
        blockId,
        newVersion: nextVersion,
        name: name,
        previousName: blocks[blockIndex].name
      });
    }
    
    // Handle update block position action
    if (action === ModelBuilderActions.UPDATE_BLOCK_POSITION) {
      const { modelId, sheetId, blockId, position } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockId) {
        return ErrorResponses.missingParameter('blockId');
      }
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
        return errorResponse('Invalid position: must have numeric x and y properties', 'INVALID_POSITION', 400);
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the block to update
      const blocks = sheets[sheetIndex].blocks || [];
      const blockIndex = blocks.findIndex((block: any) => block.id === blockId);
      
      if (blockIndex === -1) {
        return ErrorResponses.blockNotFound(blockId);
      }
      
      // Update the block position
      blocks[blockIndex].position = {
        x: Math.round(position.x),
        y: Math.round(position.y)
      };
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to update block position', 'UPDATE_POSITION_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        sheetId,
        blockId,
        newVersion: nextVersion,
        position: blocks[blockIndex].position
      });
    }
    
    // Handle rename sheet action
    if (action === ModelBuilderActions.RENAME_SHEET) {
      const { modelId, sheetId, newName } = body;
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!newName) {
        return ErrorResponses.missingParameter('newName');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .eq('user_id', authResult.userId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the sheet to rename
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Update the sheet name
      sheets[sheetIndex].name = newName;
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to rename sheet', 'RENAME_SHEET_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        newVersion: nextVersion,
        sheet: {
          id: sheetId,
          name: newName,
          blockCount: sheets[sheetIndex].blocks?.length || 0,
          connectionCount: sheets[sheetIndex].connections?.length || 0
        }
      });
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const modelId = searchParams.get('modelId');
  
  // Await the params
  const { token } = await params;
  
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

      if (modelId && authResult.userId && !authResult.isEnvironmentToken) {
      const { data: model, error: modelCheckError } = await supabase
        .from('models')
        .select('user_id')
        .eq('id', modelId)
        .single();
        
      if (modelCheckError || !model || model.user_id !== authResult.userId) {
        return NextResponse.json(
          {
            success: false,
            timestamp: new Date().toISOString(),
            error: 'Access denied: You can only access your own models',
            code: 'FORBIDDEN'
          },
          { status: 403 }
        );
      }
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
      const sheetId = searchParams.get('sheetId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the sheet to delete
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Prevent deletion of the last sheet
      if (sheets.length <= 1) {
        return errorResponse('Cannot delete the last sheet in a model', 'LAST_SHEET_ERROR', 400);
      }
      
      // Prevent deletion of main sheet
      if (sheetId === 'main' || sheetId.endsWith('_main')) {
        return errorResponse('Cannot delete the main sheet', 'MAIN_SHEET_ERROR', 400);
      }
      
      // Remove the sheet
      const deletedSheet = sheets.splice(sheetIndex, 1)[0];
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to delete sheet', 'DELETE_SHEET_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        newVersion: nextVersion,
        deletedSheet: {
          id: deletedSheet.id,
          name: deletedSheet.name,
          blockCount: deletedSheet.blocks?.length || 0,
          connectionCount: deletedSheet.connections?.length || 0
        },
        remainingSheets: sheets.length
      });
    }
    
    // Handle clear sheet action
    if (action === ModelBuilderActions.CLEAR_SHEET) {
      const sheetId = searchParams.get('sheetId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the sheet to clear
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Store counts before clearing
      const removedBlockCount = sheets[sheetIndex].blocks?.length || 0;
      const removedConnectionCount = sheets[sheetIndex].connections?.length || 0;
      
      // Clear blocks and connections
      sheets[sheetIndex].blocks = [];
      sheets[sheetIndex].connections = [];
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        const errorResp = errorResponse('Failed to clear sheet', 'CLEAR_SHEET_FAILED', 500);
        logRequest('DELETE', action, logParams, startTime, { success: false, status: 500, error: 'Failed to clear sheet' });
        return errorResp;
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        const errorResp = errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
        logRequest('DELETE', action, logParams, startTime, { success: false, status: 500, error: 'Failed to update model' });
        return errorResp;
      }
      
      // Return success response
      const response = successResponse({
        modelId,
        sheetId,
        newVersion: nextVersion,
        clearedSheet: {
          id: sheetId,
          name: sheets[sheetIndex].name
        },
        removedBlockCount,
        removedConnectionCount
      });
      
      logRequest('DELETE', action, logParams, startTime, { success: true, status: 200 });
      return response;
    }
    
    // Handle delete connection action
    if (action === ModelBuilderActions.DELETE_CONNECTION) {
      const sheetId = searchParams.get('sheetId');
      const connectionId = searchParams.get('connectionId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!connectionId) {
        return ErrorResponses.missingParameter('connectionId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the connection to delete
      const connections = sheets[sheetIndex].connections || [];
      const connectionIndex = connections.findIndex((conn: any) => conn.id === connectionId);
      
      if (connectionIndex === -1) {
        return ErrorResponses.connectionNotFound(connectionId);
      }
      
      // Store connection info for response
      const deletedConnection = connections[connectionIndex];
      
      // Remove the connection
      connections.splice(connectionIndex, 1);
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to delete connection', 'DELETE_CONNECTION_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        sheetId,
        newVersion: nextVersion,
        deletedConnection: {
          id: deletedConnection.id,
          sourceBlockId: deletedConnection.sourceBlockId,
          sourcePort: deletedConnection.sourcePort,
          targetBlockId: deletedConnection.targetBlockId,
          targetPort: deletedConnection.targetPort
        },
        remainingConnectionCount: connections.length
      });
    }
    
    // Handle delete block action
    if (action === ModelBuilderActions.DELETE_BLOCK) {
      const sheetId = searchParams.get('sheetId');
      const blockId = searchParams.get('blockId');
      
      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!sheetId) {
        return ErrorResponses.missingParameter('sheetId');
      }
      if (!blockId) {
        return ErrorResponses.missingParameter('blockId');
      }
      
      // Initialize Supabase client
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];
      
      // Find the target sheet
      const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);
      
      if (sheetIndex === -1) {
        return ErrorResponses.sheetNotFound(sheetId);
      }
      
      // Find the block to delete
      const blocks = sheets[sheetIndex].blocks || [];
      const blockIndex = blocks.findIndex((block: any) => block.id === blockId);
      
      if (blockIndex === -1) {
        return ErrorResponses.blockNotFound(blockId);
      }
      
      // Store block info for response
      const deletedBlock = blocks[blockIndex];
      
      // Remove the block
      blocks.splice(blockIndex, 1);
      
      // Remove all connections to/from this block
      const connections = sheets[sheetIndex].connections || [];
      const removedConnections = connections.filter((conn: any) => 
        conn.sourceBlockId === blockId || conn.targetBlockId === blockId
      );
      
      sheets[sheetIndex].connections = connections.filter((conn: any) => 
        conn.sourceBlockId !== blockId && conn.targetBlockId !== blockId
      );
      
      // Create a new version with the updated data
      const nextVersion = versionData.version + 1;
      
      const { error: insertError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelId,
          version: nextVersion,
          data: modelData
        });
        
      if (insertError) {
        console.error('Error creating new version:', insertError);
        return errorResponse('Failed to delete block', 'DELETE_BLOCK_FAILED', 500);
      }
      
      // Update model's latest version
      const { error: updateError } = await supabase
        .from('models')
        .update({ 
          latest_version: nextVersion,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);
        
      if (updateError) {
        console.error('Error updating model:', updateError);
        return errorResponse('Failed to update model version', 'UPDATE_MODEL_FAILED', 500);
      }
      
      // Return success response
      return successResponse({
        modelId,
        sheetId,
        newVersion: nextVersion,
        deletedBlock: {
          id: deletedBlock.id,
          type: deletedBlock.type,
          name: deletedBlock.name
        },
        removedConnectionCount: removedConnections.length,
        remainingBlockCount: blocks.length
      });
    }
    
    // If no valid action or modelId
    return ErrorResponses.missingParameter('modelId or action');
    
  } catch (error) {
    console.error('Model Builder API DELETE error:', error);
    return ErrorResponses.serverError();
  }
}