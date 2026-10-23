// handlers/model/read.ts
// Model read action handlers (GET_MODEL, GET_MODEL_METADATA)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { logRequest, loadModelData, storageErrorResponse } from '@/lib/api-support/auth';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';

/**
 * GET_MODEL - Retrieve full model data including sheets, blocks, connections
 */
export async function handleGetModel(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, modelId, startTime } = ctx;

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  // Load the model record and its current data (sheets, blocks, connections, parameters)
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const model = authResult.model!;
  const versionData = authResult.versionData!;

  // Build response in the same format as UI export for consistency
  const responseData: any = {
    id: model.id,
    name: model.name,
    created_at: model.created_at,
    updated_at: model.updated_at,
    latest_version: model.latest_version,
    version: versionData.version,
    data: {
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
    }
  };


  return successResponse(responseData);
}

/**
 * GET_MODEL_METADATA - Retrieve model metadata without full data
 */
export async function handleGetModelMetadata(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, modelId, startTime } = ctx;

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  // Load the model record and current data (for statistics)
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const model = authResult.model!;
  const modelData = authResult.versionData!.data;

  // Get version count
  let versionCount: number;
  try {
    versionCount = storage.models.listVersions(modelId).length;
  } catch (error) {
    const response = storageErrorResponse(error);
    if (!response) throw error;
    return response;
  }

  let statistics = {
    sheetCount: 0,
    totalBlocks: 0,
    totalConnections: 0
  };

  if (modelData?.sheets) {
    const sheets = modelData.sheets;
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
    latestVersion: model.latest_version,
    versionCount,
    createdAt: model.created_at,
    updatedAt: model.updated_at,
    statistics
  });
}
