// handlers/parameter/write.ts
// Parameter write action handlers (SET_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * SET_PARAMETER - Create or update a model parameter
 */
export async function handleSetParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, body } = ctx;
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

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData!;

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

  // Persist in place (a version snapshot is recorded only on checkpoint)
  const saved = persistModelData(ctx, modelId, modelData, versionData.hash);
  if (!saved.ok) {
    return saved.errorResponse;
  }

  // Return the result
  return successResponse({
    modelId,
    newVersion: saved.version,
    hash: saved.hash,
    parameter: { name, signalType, value },
    created
  }, created ? 201 : 200);
}
