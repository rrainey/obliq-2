// handlers/parameter/read.ts
// Parameter read action handlers (LIST_PARAMETERS)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';

/**
 * LIST_PARAMETERS - List all model parameters
 */
export async function handleListParameters(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;

  // Validate modelId parameter
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

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
