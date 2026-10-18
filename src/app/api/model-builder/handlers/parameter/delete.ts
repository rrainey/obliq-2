// handlers/parameter/delete.ts
// Parameter delete action handlers (DELETE_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * DELETE_PARAMETER - Delete a model parameter
 */
export async function handleDeleteParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const name = searchParams?.get('name') || body?.name;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!name) {
    return ErrorResponses.missingParameter('name');
  }

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData!;

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

  // Persist in place (a version snapshot is recorded only on checkpoint)
  const saved = persistModelData(ctx, modelId, modelData, versionData.hash);
  if (!saved.ok) {
    return saved.errorResponse;
  }

  // Return success response
  return successResponse({
    modelId,
    newVersion: saved.version,
    hash: saved.hash,
    deletedParameter: { name },
    remainingParameterCount: parameters.length
  });
}
