// handlers/sheet/update.ts
// Sheet update action handlers (RENAME_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * RENAME_SHEET - Rename an existing sheet
 */
export async function handleRenameSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, body } = ctx;
  const { modelId, sheetId, newName } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }
  if (!newName) {
    return ErrorResponses.missingParameter('newName');
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

  // Find the sheet to rename
  const sheetIndex = sheets.findIndex((sheet: any) => sheet.id === sheetId);

  if (sheetIndex === -1) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Store previous name
  const previousName = sheets[sheetIndex].name;

  // Update the sheet name
  sheets[sheetIndex].name = newName;

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
    sheet: {
      id: sheetId,
      name: newName,
      previousName,
      blockCount: sheets[sheetIndex].blocks?.length || 0,
      connectionCount: sheets[sheetIndex].connections?.length || 0
    }
  });
}
