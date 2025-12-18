// app/api/model-builder/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  BlockTypes,
  isValidBlockType,
  generateDynamicPorts
} from '@/lib/blockTypeRegistry';
import {
  createBlock,
  syncSubsystemPortsFromSheets
} from '@/lib/blockFactory';
import { validateBlockParameters } from '@/lib/blockParameterValidator';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';
import { authenticateApiRequest } from '@/lib/apiAuthMiddleware';
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

// Result type for finding sheets (including nested subsystem sheets)
interface SheetSearchResult {
  sheet: any;
  sheetIndex: number;
  parentArray: any[];  // The array containing this sheet (for mutations)
  parentBlock?: any;   // If this is a subsystem sheet, the parent subsystem block
  path: string[];      // Path to this sheet for debugging
}

/**
 * Recursively find a sheet by ID, searching both top-level sheets and
 * sheets nested inside subsystem blocks' parameters.sheets arrays.
 *
 * @param sheets - Top-level sheets array to search
 * @param sheetId - ID of the sheet to find
 * @param path - Current path (for debugging/tracking)
 * @returns SheetSearchResult or null if not found
 */
function findSheetRecursively(
  sheets: any[],
  sheetId: string,
  path: string[] = ['sheets']
): SheetSearchResult | null {
  // First, search top-level sheets
  const topLevelIndex = sheets.findIndex((s: any) => s.id === sheetId);
  if (topLevelIndex !== -1) {
    return {
      sheet: sheets[topLevelIndex],
      sheetIndex: topLevelIndex,
      parentArray: sheets,
      path: [...path, `[${topLevelIndex}]`]
    };
  }

  // Search nested sheets inside subsystem blocks
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const blocks = sheet.blocks || [];

    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j];

      // If this is a subsystem with nested sheets, search recursively
      if (block.type === 'subsystem' && block.parameters?.sheets && Array.isArray(block.parameters.sheets)) {
        const nestedSheets = block.parameters.sheets;
        const nestedPath = [...path, `[${i}].blocks[${j}].parameters.sheets`];

        // Check direct children first
        const nestedIndex = nestedSheets.findIndex((s: any) => s.id === sheetId);
        if (nestedIndex !== -1) {
          return {
            sheet: nestedSheets[nestedIndex],
            sheetIndex: nestedIndex,
            parentArray: nestedSheets,
            parentBlock: block,
            path: [...nestedPath, `[${nestedIndex}]`]
          };
        }

        // Recurse deeper into nested subsystems
        const deepResult = findSheetRecursively(nestedSheets, sheetId, nestedPath);
        if (deepResult) {
          return deepResult;
        }
      }
    }
  }

  return null;
}

/**
 * Find the parent subsystem block that contains a given sheet ID.
 * This searches recursively through the model's sheet hierarchy.
 *
 * @param sheets - Top-level sheets array to search
 * @param sheetId - ID of the sheet to find the parent subsystem for
 * @returns The parent subsystem block, or null if the sheet is a top-level sheet
 */
function findParentSubsystemForSheet(
  sheets: any[],
  sheetId: string
): { subsystemBlock: any; containingSheet: any } | null {
  for (const sheet of sheets) {
    if (!sheet.blocks) continue;

    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        // Check if the target sheet is directly in this subsystem
        const foundSheet = block.parameters.sheets.find((s: any) => s.id === sheetId);
        if (foundSheet) {
          return { subsystemBlock: block, containingSheet: sheet };
        }

        // Recursively search in nested subsystems
        const nestedResult = findParentSubsystemForSheet(block.parameters.sheets, sheetId);
        if (nestedResult) {
          return nestedResult;
        }
      }
    }
  }

  return null;
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

      // Fetch the model metadata
      const { data: model, error } = await supabase
        .from('models')
        .select('*')
        .eq('id', modelId)
        .single();

      if (error || !model) {
        return ErrorResponses.modelNotFound(modelId);
      }

      // Verify ownership - user can only access their own models
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

      // Fetch the latest version data (contains sheets, blocks, connections, parameters)
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('version, data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      // Build response in the same format as UI export for consistency
      const responseData: any = {
        id: model.id,
        name: model.name,
        user_id: model.user_id,
        created_at: model.created_at,
        updated_at: model.updated_at,
        latest_version: model.latest_version
      };

      // Include version data if available
      if (versionData && !versionError) {
        responseData.version = versionData.version;
        responseData.data = {
          version: versionData.data?.version || '2.1',
          metadata: versionData.data?.metadata || {
            description: `Model retrieved via API`
          },
          sheets: versionData.data?.sheets || [],
          parameters: versionData.data?.parameters || [],
          globalSettings: versionData.data?.globalSettings || {
            simulationTimeStep: 0.01,
            simulationDuration: 10
          }
        };
      }

      const response = successResponse(responseData);

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
      const inputPorts = (block.inputs || []).map((portName: string, portIndex: number) => {
        const connection = connections.find((conn: any) =>
          conn.targetBlockId === blockId && conn.targetPortIndex === portIndex
        );

        const sourceBlock = connection ? blocks.find((b: any) => b.id === connection.sourceBlockId) : null;
        return {
          name: portName,
          type: 'input',
          connected: !!connection,
          connectedTo: connection ? {
            blockId: connection.sourceBlockId,
            blockName: sourceBlock?.name || 'Unknown',
            port: sourceBlock?.outputs?.[connection.sourcePortIndex] || `output${connection.sourcePortIndex}`,
            connectionId: connection.id
          } : null
        };
      });

      const outputPorts = (block.outputs || []).map((portName: string, portIndex: number) => {
        const outgoingConnections = connections.filter((conn: any) =>
          conn.sourceBlockId === blockId && conn.sourcePortIndex === portIndex
        );

        return {
          name: portName,
          type: 'output',
          connected: outgoingConnections.length > 0,
          connectionCount: outgoingConnections.length,
          connectedTo: outgoingConnections.map((conn: any) => {
            const targetBlock = blocks.find((b: any) => b.id === conn.targetBlockId);
            return {
              blockId: conn.targetBlockId,
              blockName: targetBlock?.name || 'Unknown',
              port: targetBlock?.inputs?.[conn.targetPortIndex] || `input${conn.targetPortIndex}`,
              connectionId: conn.id
            };
          })
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
            port: sourceBlock?.outputs?.[connection.sourcePortIndex] || `output${connection.sourcePortIndex}`
          },
          target: {
            blockId: connection.targetBlockId,
            blockName: targetBlock?.name || 'Unknown',
            blockType: targetBlock?.type || 'unknown',
            port: targetBlock?.inputs?.[connection.targetPortIndex] || `input${connection.targetPortIndex}`
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
      
      // Find the specific sheet (searching both top-level and subsystem sheets)
      const sheets = versionData.data?.sheets || [];
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      const sheet = sheetResult.sheet;

      // Extract connections from the sheet
      const connections = sheet.connections || [];

      // Transform connections to include full details
      const connectionDetails = connections.map((conn: any) => {
        const sourceBlock = sheet.blocks?.find((b: any) => b.id === conn.sourceBlockId);
        const targetBlock = sheet.blocks?.find((b: any) => b.id === conn.targetBlockId);
        return {
          id: conn.id,
          sourceBlockId: conn.sourceBlockId,
          sourcePortIndex: conn.sourcePortIndex,
          sourcePort: sourceBlock?.outputs?.[conn.sourcePortIndex] || `output${conn.sourcePortIndex}`,
          targetBlockId: conn.targetBlockId,
          targetPortIndex: conn.targetPortIndex,
          targetPort: targetBlock?.inputs?.[conn.targetPortIndex] || `input${conn.targetPortIndex}`,
          // Include block names for easier identification
          sourceBlockName: sourceBlock?.name || 'Unknown',
          targetBlockName: targetBlock?.name || 'Unknown'
        };
      });
      
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
      
      // Find the specific sheet (searching both top-level and subsystem sheets)
      const sheets = versionData.data?.sheets || [];
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      // Extract blocks from the sheet
      const blocks = sheetResult.sheet.blocks || [];
      
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

    // Handle listParameters action
    if (action === ModelBuilderActions.LIST_PARAMETERS) {
      // Validate modelId parameter
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
        .select('data')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }

      // Extract parameters from the model data
      const parameters = versionData.data?.parameters || [];

      // Transform parameters to summary format
      const parameterDetails = parameters.map((param: any) => ({
        name: param.name,
        signalType: param.signalType,
        value: param.value
      }));

      return successResponse({
        modelId,
        parameterCount: parameterDetails.length,
        parameters: parameterDetails
      });
    }

    // Block parameter GET actions (subsystem parameters)
    if (action === ModelBuilderActions.LIST_BLOCK_PARAMETERS ||
        action === ModelBuilderActions.GET_BLOCK_PARAMETER) {
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
  let action = 'unknown';
  let body: any = {};

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
      const { modelId, name, subsystemBlockId, parentSheetId } = body;

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

      // Helper function to find a block recursively in all sheets (including nested subsystems)
      const findBlockRecursively = (sheetsToSearch: any[], blockId: string): { block: any, parentSheet: any } | null => {
        for (const sheet of sheetsToSearch) {
          for (const block of (sheet.blocks || [])) {
            if (block.id === blockId) {
              return { block, parentSheet: sheet };
            }
            // If this is a subsystem, search its nested sheets
            if (block.type === 'subsystem' && block.parameters?.sheets) {
              const found = findBlockRecursively(block.parameters.sheets, blockId);
              if (found) return found;
            }
          }
        }
        return null;
      };

      // Determine target sheets array and sheet name
      let targetSheetsArray: any[];
      let subsystemBlock: any = null;

      if (subsystemBlockId) {
        // Find the subsystem block (searching recursively if parentSheetId not provided)
        const found = findBlockRecursively(sheets, subsystemBlockId);

        if (!found) {
          return errorResponse(`Subsystem block not found: ${subsystemBlockId}`, 'SUBSYSTEM_NOT_FOUND', 404);
        }

        subsystemBlock = found.block;

        if (subsystemBlock.type !== 'subsystem') {
          return errorResponse(`Block ${subsystemBlockId} is not a subsystem`, 'NOT_A_SUBSYSTEM', 400);
        }

        // Ensure the subsystem has a sheets array
        if (!subsystemBlock.parameters) {
          subsystemBlock.parameters = {};
        }
        if (!subsystemBlock.parameters.sheets) {
          subsystemBlock.parameters.sheets = [];
        }

        targetSheetsArray = subsystemBlock.parameters.sheets;
      } else {
        // Add to model's root sheets
        targetSheetsArray = modelData.sheets;
      }

      // Generate sheet name if not provided
      const sheetName = name || (subsystemBlockId
        ? `${subsystemBlock?.name || 'Subsystem'} Sheet ${targetSheetsArray.length + 1}`
        : `Sheet ${targetSheetsArray.length + 1}`);

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

      // Add sheet to target array
      targetSheetsArray.push(newSheet);

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

      // Build response
      const response: any = {
        modelId,
        newVersion: nextVersion,
        sheet: {
          id: newSheet.id,
          name: newSheet.name,
          blockCount: 0,
          connectionCount: 0,
          extents: newSheet.extents
        }
      };

      // Include subsystem info if sheet was added to a subsystem
      if (subsystemBlockId && subsystemBlock) {
        response.subsystemBlockId = subsystemBlockId;
        response.subsystemName = subsystemBlock.name;
      }

      // Return the created sheet
      return successResponse(response, 201);
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
          // Check connection structure - require port indices
          if (!conn.sourceBlockId || conn.sourcePortIndex === undefined || !conn.targetBlockId || conn.targetPortIndex === undefined) {
            errors.push(`Connection at index ${connIndex} in sheet '${sheet.name}' is incomplete (missing block IDs or port indices)`);
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

          // Check if port indices are valid
          if (sourceBlock && (!sourceBlock.outputs || conn.sourcePortIndex < 0 || conn.sourcePortIndex >= sourceBlock.outputs.length)) {
            errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references invalid output port index ${conn.sourcePortIndex} on block '${sourceBlock.name || sourceBlock.id}'`);
          }
          if (targetBlock && (!targetBlock.inputs || conn.targetPortIndex < 0 || conn.targetPortIndex >= targetBlock.inputs.length)) {
            errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references invalid input port index ${conn.targetPortIndex} on block '${targetBlock.name || targetBlock.id}'`);
          }
        });

        // Check for multiple connections to same input port
        const inputPortUsage = new Map<string, number>();
        connections.forEach((conn: any) => {
          const key = `${conn.targetBlockId}:${conn.targetPortIndex}`;
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

      console.log('Adding block for user ', authResult.userId)
      console.log('Adding block to model: ', modelId)

      // Get the latest version of the model
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelId)
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      console.log('Version data: ', versionData)
      console.log('Version error: ', versionError)

      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      const sheet = sheetResult.sheet;
      const existingBlocks = sheet.blocks || [];

      // Count existing blocks of this type for auto-naming
      const existingBlocksOfType = existingBlocks.filter((b: any) => b.type === blockType).length;

      // Use the unified block factory for consistent block creation
      // This handles all default parameters and special cases like subsystem sheet creation
      const newBlock = createBlock(blockType, {
        name: name || undefined,
        position: position || { x: 100, y: 100 },
        parameters: parameters || undefined,
        existingBlocksOfType: existingBlocksOfType + 1
      });

      // Validate and sanitize block parameters after creation
      // This handles conversions like 'segregated: true' -> 'codeGenStrategy: segregated'
      const validation = validateBlockParameters(blockType, newBlock.parameters);
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          timestamp: new Date().toISOString(),
          error: 'Parameter validation failed',
          code: 'VALIDATION_FAILED',
          details: { errors: validation.errors }
        }, { status: 400 });
      }
      // Apply sanitized parameters (includes legacy parameter conversions)
      newBlock.parameters = validation.sanitizedParameters!;

      // For subsystem blocks, extract sheet info for the response
      let createdSheet = null;
      if (blockType === 'subsystem' && newBlock.parameters?.sheets?.[0]) {
        const subsystemSheet = newBlock.parameters.sheets[0];
        const inputPort = subsystemSheet.blocks?.find((b: any) => b.type === 'input_port');
        const outputPort = subsystemSheet.blocks?.find((b: any) => b.type === 'output_port');

        createdSheet = {
          id: subsystemSheet.id,
          name: subsystemSheet.name,
          inputPort: inputPort ? {
            id: inputPort.id,
            name: inputPort.name
          } : null,
          outputPort: outputPort ? {
            id: outputPort.id,
            name: outputPort.name
          } : null
        };
      }

      // Add block to sheet
      sheet.blocks.push(newBlock);

      // If we added an input_port or output_port to a subsystem's sheet,
      // sync the parent subsystem's inputPorts/outputPorts arrays
      if ((blockType === 'input_port' || blockType === 'output_port') && sheetResult.parentBlock) {
        syncSubsystemPortsFromSheets(sheetResult.parentBlock);
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
      
      // Return the created block (with subsystem sheet info if applicable)
      const response: any = {
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
      };

      // Include subsystem sheet information for better MCP guidance
      if (createdSheet) {
        response.subsystemSheet = createdSheet;
      }

      return successResponse(response, 201);
    }
    
    // Handle add connection action
    if (action === ModelBuilderActions.ADD_CONNECTION) {
      const { modelId, sheetId, sourceBlockId, sourcePort, sourcePortIndex, targetBlockId, targetPort, targetPortIndex } = body;

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
      if (sourcePort === undefined && sourcePortIndex === undefined) {
        return errorResponse('Either sourcePort or sourcePortIndex must be provided', 'MISSING_PARAMETER', 400);
      }
      if (!targetBlockId) {
        return ErrorResponses.missingParameter('targetBlockId');
      }
      if (targetPort === undefined && targetPortIndex === undefined) {
        return errorResponse('Either targetPort or targetPortIndex must be provided', 'MISSING_PARAMETER', 400);
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

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      const sheet = sheetResult.sheet;
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

      // Resolve port indices - convert port names to indices if needed
      let resolvedSourcePortIndex: number;
      let resolvedTargetPortIndex: number;

      if (sourcePortIndex !== undefined) {
        resolvedSourcePortIndex = sourcePortIndex;
        // Validate index is in range
        if (!sourceBlock.outputs || resolvedSourcePortIndex < 0 || resolvedSourcePortIndex >= sourceBlock.outputs.length) {
          return errorResponse(
            `Block '${sourceBlockId}' does not have output port at index ${resolvedSourcePortIndex}`,
            'INVALID_PORT',
            400
          );
        }
      } else {
        // Convert port name to index
        if (!sourceBlock.outputs || !sourceBlock.outputs.includes(sourcePort)) {
          return errorResponse(
            `Block '${sourceBlockId}' does not have output port '${sourcePort}'`,
            'INVALID_PORT',
            400
          );
        }
        resolvedSourcePortIndex = sourceBlock.outputs.indexOf(sourcePort);
      }

      if (targetPortIndex !== undefined) {
        resolvedTargetPortIndex = targetPortIndex;
        // Validate index is in range
        if (!targetBlock.inputs || resolvedTargetPortIndex < 0 || resolvedTargetPortIndex >= targetBlock.inputs.length) {
          return errorResponse(
            `Block '${targetBlockId}' does not have input port at index ${resolvedTargetPortIndex}`,
            'INVALID_PORT',
            400
          );
        }
      } else {
        // Convert port name to index
        if (!targetBlock.inputs || !targetBlock.inputs.includes(targetPort)) {
          return errorResponse(
            `Block '${targetBlockId}' does not have input port '${targetPort}'`,
            'INVALID_PORT',
            400
          );
        }
        resolvedTargetPortIndex = targetBlock.inputs.indexOf(targetPort);
      }

      // Check for existing connection on target port (single input rule)
      const existingConnection = connections.find((conn: any) =>
        conn.targetBlockId === targetBlockId && conn.targetPortIndex === resolvedTargetPortIndex
      );

      if (existingConnection) {
        const portName = targetBlock.inputs[resolvedTargetPortIndex];
        return errorResponse(
          `Input port '${portName}' (index ${resolvedTargetPortIndex}) on block '${targetBlockId}' already has a connection`,
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
        conn.sourcePortIndex === resolvedSourcePortIndex &&
        conn.targetBlockId === targetBlockId &&
        conn.targetPortIndex === resolvedTargetPortIndex
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

      // Create the new connection with port indices only (canonical form)
      const newConnection = {
        id: connectionId,
        sourceBlockId,
        sourcePortIndex: resolvedSourcePortIndex,
        targetBlockId,
        targetPortIndex: resolvedTargetPortIndex
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

      // Return the created connection (include computed port names for display)
      return successResponse({
        modelId,
        sheetId,
        newVersion: nextVersion,
        connection: {
          id: newConnection.id,
          sourceBlockId: newConnection.sourceBlockId,
          sourcePortIndex: newConnection.sourcePortIndex,
          sourcePort: sourceBlock.outputs[newConnection.sourcePortIndex],
          targetBlockId: newConnection.targetBlockId,
          targetPortIndex: newConnection.targetPortIndex,
          targetPort: targetBlock.inputs[newConnection.targetPortIndex]
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

    // Handle setParameter action (creates or updates a model parameter)
    if (action === ModelBuilderActions.SET_PARAMETER) {
      const { modelId, name, signalType, value } = body;

      // Validate required parameters
      if (!modelId) {
        return ErrorResponses.missingParameter('modelId');
      }
      if (!name) {
        return ErrorResponses.missingParameter('name');
      }
      if (!signalType) {
        return ErrorResponses.missingParameter('signalType');
      }
      if (value === undefined || value === null) {
        return ErrorResponses.missingParameter('value');
      }

      // Validate parameter name format (valid C identifier)
      const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
      if (!nameRegex.test(name)) {
        return errorResponse(
          'Parameter name must be a valid identifier (alphanumeric + underscore, cannot start with number)',
          'INVALID_PARAMETER_NAME',
          400
        );
      }

      // Validate signalType
      const validSignalTypes = ['float', 'double', 'long', 'bool'];
      const arrayTypeRegex = /^(float|double|long|bool)\[\d+\]$/;
      const matrixTypeRegex = /^(float|double|long|bool)\[\d+\]\[\d+\]$/;
      if (!validSignalTypes.includes(signalType) && !arrayTypeRegex.test(signalType) && !matrixTypeRegex.test(signalType)) {
        return errorResponse(
          `Invalid signalType: ${signalType}. Must be float, double, long, bool, or array/matrix type like double[3] or double[3][3]`,
          'INVALID_SIGNAL_TYPE',
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
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }

      // Extract current model data
      const modelData = versionData.data;
      const parameters = modelData.parameters || [];

      // Check if parameter already exists
      const existingIndex = parameters.findIndex((p: any) => p.name === name);
      const created = existingIndex === -1;

      if (created) {
        // Add new parameter
        parameters.push({ name, signalType, value });
      } else {
        // Update existing parameter
        parameters[existingIndex] = { name, signalType, value };
      }

      // Update model data with new parameters
      modelData.parameters = parameters;

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
        return errorResponse('Failed to set parameter', 'SET_PARAMETER_FAILED', 500);
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

      // Return the result
      const response = successResponse({
        modelId,
        newVersion: nextVersion,
        parameter: { name, signalType, value },
        created
      }, created ? 201 : 200);

      logRequest('POST', action, { modelId, name }, startTime, { success: true, status: created ? 201 : 200 });
      return response;
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
  let action = 'unknown';
  let body: any = {};

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
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      // Find the block to update
      const blocks = sheetResult.sheet.blocks || [];
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
        const numInputs = block.parameters.numInputs;
        const connections = sheetResult.sheet.connections || [];
        sheetResult.sheet.connections = connections.filter((conn: any) => {
          if (conn.targetBlockId === blockId) {
            // Port indices are 0-based, numInputs is the count
            return conn.targetPortIndex < numInputs;
          }
          return true;
        });
      }

      // If we updated an input_port or output_port's portName in a subsystem's sheet,
      // sync the parent subsystem's inputPorts/outputPorts arrays
      if ((blockType === 'input_port' || blockType === 'output_port') && sheetResult.parentBlock) {
        syncSubsystemPortsFromSheets(sheetResult.parentBlock);
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
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      // Find the block to update
      const blocks = sheetResult.sheet.blocks || [];
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
      const block = blocks[blockIndex];
      const previousName = block.name;
      block.name = name;

      // For input_port and output_port blocks, also update the portName parameter
      // to keep them in sync (portName is what defines the subsystem's external interface)
      if (block.type === 'input_port' || block.type === 'output_port') {
        if (!block.parameters) {
          block.parameters = {};
        }
        block.parameters.portName = name;

        // Sync the parent subsystem's inputPorts/outputPorts arrays
        if (sheetResult.parentBlock) {
          syncSubsystemPortsFromSheets(sheetResult.parentBlock);
        }
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
        previousName: previousName
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
        .order('version', { ascending: false })
        .limit(1)
        .single();
        
      if (versionError || !versionData) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Extract current model data
      const modelData = versionData.data;
      const sheets = modelData.sheets || [];

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      // Find the block to update
      const blocks = sheetResult.sheet.blocks || [];
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

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      // Find the connection to delete
      const connections = sheetResult.sheet.connections || [];
      const connectionIndex = connections.findIndex((conn: any) => conn.id === connectionId);

      if (connectionIndex === -1) {
        return ErrorResponses.connectionNotFound(connectionId);
      }

      // Store connection info for response
      const deletedConnection = connections[connectionIndex];

      // Get blocks to compute port names for the response
      const blocks = sheetResult.sheet.blocks || [];
      const sourceBlock = blocks.find((b: any) => b.id === deletedConnection.sourceBlockId);
      const targetBlock = blocks.find((b: any) => b.id === deletedConnection.targetBlockId);

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
          sourcePortIndex: deletedConnection.sourcePortIndex,
          sourcePort: sourceBlock?.outputs?.[deletedConnection.sourcePortIndex] || `output${deletedConnection.sourcePortIndex}`,
          targetBlockId: deletedConnection.targetBlockId,
          targetPortIndex: deletedConnection.targetPortIndex,
          targetPort: targetBlock?.inputs?.[deletedConnection.targetPortIndex] || `input${deletedConnection.targetPortIndex}`
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

      // Find the target sheet (searching both top-level and subsystem sheets)
      const sheetResult = findSheetRecursively(sheets, sheetId);

      if (!sheetResult) {
        return ErrorResponses.sheetNotFound(sheetId);
      }

      // Find the block to delete
      const blocks = sheetResult.sheet.blocks || [];
      const blockIndex = blocks.findIndex((block: any) => block.id === blockId);

      if (blockIndex === -1) {
        return ErrorResponses.blockNotFound(blockId);
      }

      // Store block info for response
      const deletedBlock = blocks[blockIndex];

      // Remove the block
      blocks.splice(blockIndex, 1);

      // Remove all connections to/from this block
      const connections = sheetResult.sheet.connections || [];
      const removedConnections = connections.filter((conn: any) =>
        conn.sourceBlockId === blockId || conn.targetBlockId === blockId
      );

      sheetResult.sheet.connections = connections.filter((conn: any) =>
        conn.sourceBlockId !== blockId && conn.targetBlockId !== blockId
      );

      // If we deleted an input_port or output_port from a subsystem's sheet,
      // sync the parent subsystem's inputPorts/outputPorts arrays
      if ((deletedBlock.type === 'input_port' || deletedBlock.type === 'output_port') && sheetResult.parentBlock) {
        syncSubsystemPortsFromSheets(sheetResult.parentBlock);
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

    // Handle deleteParameter action
    if (action === ModelBuilderActions.DELETE_PARAMETER) {
      const name = searchParams.get('name');

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
      const parameters = modelData.parameters || [];

      // Find the parameter to delete
      const paramIndex = parameters.findIndex((p: any) => p.name === name);

      if (paramIndex === -1) {
        return errorResponse(`Parameter not found: ${name}`, 'PARAMETER_NOT_FOUND', 404);
      }

      // Remove the parameter
      parameters.splice(paramIndex, 1);
      modelData.parameters = parameters;

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
        return errorResponse('Failed to delete parameter', 'DELETE_PARAMETER_FAILED', 500);
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
        deletedParameter: { name },
        remainingParameterCount: parameters.length
      });
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