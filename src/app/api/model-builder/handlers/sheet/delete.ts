// handlers/sheet/delete.ts
// Sheet delete action handlers (DELETE_SHEET, CLEAR_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * DELETE_SHEET - Delete a sheet from a model
 */
export async function handleDeleteSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData!;

  // Extract current model data
  const modelData = versionData.data;
  const sheets = modelData.sheets || [];

  // Find the sheet to delete
  const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);

  if (sheetIndex === -1) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Prevent deletion of the last sheet
  if (sheets.length <= 1) {
    return errorResponse('Cannot delete the last sheet in a model', 'LAST_SHEET_ERROR', 400);
  }

  // Prevent deletion of main sheet
  if (sheetId === 'main' || sheetId.endsWith('_main')) {
    return errorResponse('Cannot delete the main sheet', 'MAIN_SHEET_ERROR', 400);
  }

  // Remove the sheet
  const deletedSheet = sheets.splice(sheetIndex, 1)[0];

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
    deletedSheet: {
      id: deletedSheet.id,
      name: deletedSheet.name,
      blockCount: deletedSheet.blocks?.length || 0,
      connectionCount: deletedSheet.connections?.length || 0
    },
    remainingSheets: sheets.length
  });
}

/**
 * CLEAR_SHEET - Clear all blocks and connections from a sheet
 */
export async function handleClearSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData!;

  // Extract current model data
  const modelData = versionData.data;
  const sheets = modelData.sheets || [];

  // Find the sheet to clear
  const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);

  if (sheetIndex === -1) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Store counts before clearing
  const removedBlockCount = sheets[sheetIndex].blocks?.length || 0;
  const removedConnectionCount = sheets[sheetIndex].connections?.length || 0;

  // Clear blocks and connections
  sheets[sheetIndex].blocks = [];
  sheets[sheetIndex].connections = [];

  // Persist in place (a version snapshot is recorded only on checkpoint)
  const saved = persistModelData(ctx, modelId, modelData, versionData.hash);
  if (!saved.ok) {
    return saved.errorResponse;
  }

  // Return success response
  return successResponse({
    modelId,
    sheetId,
    newVersion: saved.version,
    hash: saved.hash,
    clearedSheet: {
      id: sheetId,
      name: sheets[sheetIndex].name
    },
    removedBlockCount,
    removedConnectionCount
  });
}
