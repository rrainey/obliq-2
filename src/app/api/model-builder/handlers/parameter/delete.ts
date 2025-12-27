// handlers/parameter/delete.ts
// Parameter delete action handlers (DELETE_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * DELETE_PARAMETER - Delete a model parameter
 */
export async function handleDeleteParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const name = searchParams?.get('name') || body?.name;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!name) {
    return ErrorResponses.missingParameter('name');
  }

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData;

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
