// handlers/model/read.ts
// Model read action handlers (GET_MODEL, GET_MODEL_METADATA)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { logRequest, verifyModelOwnership } from '@/lib/api-support/auth';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';

/**
 * GET_MODEL - Retrieve full model data including sheets, blocks, connections
 */
export async function handleGetModel(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, modelId, userId, startTime } = ctx;

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
  if (model.user_id !== userId) {
    modelBuilderApiMetrics.record(
      'GET',
      'getModel',
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

  modelBuilderApiMetrics.record(
    'GET',
    'getModel',
    Date.now() - startTime,
    true,
    200
  );

  return successResponse(responseData);
}

/**
 * GET_MODEL_METADATA - Retrieve model metadata without full data
 */
export async function handleGetModelMetadata(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, modelId, userId, startTime } = ctx;

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  // Verify user owns this model
  const authResult = await verifyModelOwnership(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const model = authResult.model;

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

  logRequest('GET', 'getModelMetadata', { modelId }, startTime, { success: true, status: 200 });

  return successResponse({
    id: model.id,
    name: model.name,
    userId: model.user_id,
    latestVersion: model.latest_version,
    versionCount: versionCount || 0,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    statistics
  });
}
