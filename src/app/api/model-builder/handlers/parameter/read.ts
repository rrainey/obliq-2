// handlers/parameter/read.ts
// Parameter read action handlers (LIST_PARAMETERS)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { loadModelData } from '@/lib/api-support/auth';

/**
 * LIST_PARAMETERS - List all model parameters
 */
export async function handleListParameters(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;

  // Validate modelId parameter
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  // Extract parameters from the model data
  const parameters = authResult.versionData!.data?.parameters || [];

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
