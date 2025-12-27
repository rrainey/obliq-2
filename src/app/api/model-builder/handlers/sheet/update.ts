// handlers/sheet/update.ts
// Sheet update action handlers (RENAME_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * RENAME_SHEET - Rename an existing sheet
 */
export async function handleRenameSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, body } = ctx;
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

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData;

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
    return errorResponse('Failed to rename sheet', 'RENAME_SHEET_FAILED', 500);
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
    sheet: {
      id: sheetId,
      name: newName,
      previousName,
      blockCount: sheets[sheetIndex].blocks?.length || 0,
      connectionCount: sheets[sheetIndex].connections?.length || 0
    }
  });
}
