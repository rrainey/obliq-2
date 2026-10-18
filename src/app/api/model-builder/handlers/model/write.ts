// handlers/model/write.ts
// Model write action handlers (CREATE_MODEL, UPDATE_MODEL_NAME)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { loadModel, storageErrorResponse } from '@/lib/api-support/auth';

/**
 * CREATE_MODEL - Create a new model with initial structure
 */
export async function handleCreateModel(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, userId, body } = ctx;
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

  // Create the model; this writes model.json and records version 1
  let newModel;
  try {
    newModel = storage.models.create({ name, data: initialModelData });
  } catch (error) {
    console.error('Error creating model:', error);
    return storageErrorResponse(error) ?? errorResponse('Failed to create model', 'CREATE_FAILED', 500);
  }

  // Return the created model with explicit main sheet info for MCP guidance
  return successResponse({
    id: newModel.id,
    name: newModel.name,
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
  const { storage, body } = ctx;
  const { modelId, name } = body || {};

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  if (!name) {
    return ErrorResponses.missingParameter('name');
  }

  // Verify model exists
  const authResult = loadModel(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  // Store previous name before updating
  const previousName = authResult.model!.name;

  // Update the model name
  let updatedModel;
  try {
    updatedModel = storage.models.rename(modelId, name);
  } catch (error) {
    console.error('Error updating model name:', error);
    return storageErrorResponse(error) ?? errorResponse('Failed to update model name', 'UPDATE_FAILED', 500);
  }

  return successResponse({
    id: updatedModel.id,
    name: updatedModel.name,
    previousName,
    updated_at: updatedModel.updated_at
  });
}
