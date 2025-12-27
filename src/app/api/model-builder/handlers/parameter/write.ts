// handlers/parameter/write.ts
// Parameter write action handlers (SET_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * SET_PARAMETER - Create or update a model parameter
 */
export async function handleSetParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, body } = ctx;
  const { modelId, name, signalType, value } = body || {};

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

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData;

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
  return successResponse({
    modelId,
    newVersion: nextVersion,
    parameter: { name, signalType, value },
    created
  }, created ? 201 : 200);
}
