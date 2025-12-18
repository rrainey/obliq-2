// handlers/sheet/delete.ts
// Sheet delete action handlers (DELETE_SHEET, CLEAR_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';

/**
 * DELETE_SHEET - Delete a sheet from a model
 */
export async function handleDeleteSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }

  // Get the latest version of the model
  const { data: versionData, error: versionError } = await supabase
    .from('model_versions')
    .select('*')
    .eq('model_id', modelId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !versionData) {
    return ErrorResponses.modelNotFound(modelId);
  }

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
    return errorResponse('Failed to delete sheet', 'DELETE_SHEET_FAILED', 500);
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
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }

  // Get the latest version of the model
  const { data: versionData, error: versionError } = await supabase
    .from('model_versions')
    .select('*')
    .eq('model_id', modelId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !versionData) {
    return ErrorResponses.modelNotFound(modelId);
  }

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
    return errorResponse('Failed to clear sheet', 'CLEAR_SHEET_FAILED', 500);
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
    sheetId,
    newVersion: nextVersion,
    clearedSheet: {
      id: sheetId,
      name: sheets[sheetIndex].name
    },
    removedBlockCount,
    removedConnectionCount
  });
}
