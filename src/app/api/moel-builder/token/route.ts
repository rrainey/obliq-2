import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper function to validate API token
function validateToken(token: string): boolean {
  const validToken = process.env.MODEL_BUILDER_API_TOKEN;
  
  if (!validToken) {
    console.error('MODEL_BUILDER_API_TOKEN not configured');
    return false;
  }
  
  return token === validToken;
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
  CREATE_MODEL: 'createModel',
  LIST_SHEETS: 'listSheets',
  CREATE_SHEET: 'createSheet',
  RENAME_SHEET: 'renameSheet'
} as const;

// GET handler for retrieving model data and introspection
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Validate token
  if (!validateToken(params.token)) {
    return unauthorizedResponse();
  }
  
  try {
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
      
      // Initialize Supabase client with service role for full access
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      // Fetch the model
      const { data: model, error } = await supabase
        .from('models')
        .select('*')
        .eq('id', modelId)
        .single();
        
      if (error || !model) {
        return ErrorResponses.modelNotFound(modelId);
      }
      
      // Return the complete model data
      return successResponse({
        id: model.id,
        name: model.name,
        user_id: model.user_id,
        data: model.data,
        created_at: model.created_at,
        updated_at: model.updated_at
      });
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
    
    // Other GET actions will be implemented in subsequent tasks
    return errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    
  } catch (error) {
    console.error('Model Builder API GET error:', error);
    return ErrorResponses.serverError();
  }
}

// POST handler for creating models, sheets, blocks, and connections
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Validate token
  if (!validateToken(params.token)) {
    return unauthorizedResponse();
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
    
    // Handle create model action
    if (action === 'createModel') {
      const { name, userId } = body;
      
      // Validate required parameters
      if (!name) {
        return ErrorResponses.missingParameter('name');
      }
      if (!userId) {
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
          user_id: userId,
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
    
    // Other POST actions will be implemented in subsequent tasks
    return errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    
  } catch (error) {
    console.error('Model Builder API POST error:', error);
    return ErrorResponses.serverError();
  }
}

// PUT handler for updating models, sheets, blocks, and connections
export async function PUT(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Validate token
  if (!validateToken(params.token)) {
    return unauthorizedResponse();
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
    
    // Other PUT actions will be implemented in subsequent tasks
    return errorResponse(`Unknown action: ${action}`, 'UNKNOWN_ACTION');
    
  } catch (error) {
    console.error('Model Builder API PUT error:', error);
    return ErrorResponses.serverError();
  }
}

// DELETE handler for removing models, sheets, blocks, and connections
export async function DELETE(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  // Validate token
  if (!validateToken(params.token)) {
    return unauthorizedResponse();
  }
  
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId');
    
    // For now, we only support deleting models directly via query parameter
    // Later tasks will add action-based deletion for sheets, blocks, etc.
    if (modelId) {
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
    
    // If no modelId provided, return error
    return ErrorResponses.missingParameter('modelId');
    
  } catch (error) {
    console.error('Model Builder API DELETE error:', error);
    return ErrorResponses.serverError();
  }
}