// handlers/model/write.ts
// Model write action handlers (CREATE_MODEL, UPDATE_MODEL_NAME)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';

/**
 * CREATE_MODEL - Create a new model with initial structure
 */
export async function handleCreateModel(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, body } = ctx;
  const { name } = body || {};

  if (!userId) {
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Unable to determine user from API token',
      code: 'INVALID_TOKEN'
    }, { status: 401 });
  }

  if (!name) {
    return ErrorResponses.missingParameter('name');
  }

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

/**
 * UPDATE_MODEL_NAME - Update a model's name
 */
export async function handleUpdateModelName(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, modelId, userId, body } = ctx;
  const { name } = body || {};

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  if (!name) {
    return ErrorResponses.missingParameter('name');
  }

  // Verify model exists and user owns it
  const { data: model, error: fetchError } = await supabase
    .from('models')
    .select('id, user_id')
    .eq('id', modelId)
    .single();

  if (fetchError || !model) {
    return ErrorResponses.modelNotFound(modelId);
  }

  if (model.user_id !== userId) {
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Access denied: You can only modify your own models',
      code: 'FORBIDDEN'
    }, { status: 403 });
  }

  // Update the model name
  const { data: updatedModel, error: updateError } = await supabase
    .from('models')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', modelId)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating model name:', updateError);
    return errorResponse('Failed to update model name', 'UPDATE_FAILED', 500);
  }

  return successResponse({
    id: updatedModel.id,
    name: updatedModel.name,
    updated_at: updatedModel.updated_at
  });
}
