// handlers/connection/delete.ts
// Connection delete action handlers (DELETE_CONNECTION)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';

/**
 * DELETE_CONNECTION - Delete a connection from a sheet
 */
export async function handleDeleteConnection(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;
  const connectionId = searchParams?.get('connectionId') || body?.connectionId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }
  if (!connectionId) {
    return ErrorResponses.missingParameter('connectionId');
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

  // Find the target sheet (searching both top-level and subsystem sheets)
  const sheetResult = findSheetRecursively(sheets, sheetId);

  if (!sheetResult) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Find the connection to delete
  const connections = sheetResult.sheet.connections || [];
  const connectionIndex = connections.findIndex((conn: any) => conn.id === connectionId);

  if (connectionIndex === -1) {
    return ErrorResponses.connectionNotFound(connectionId);
  }

  // Store connection info for response
  const deletedConnection = connections[connectionIndex];

  // Get blocks to compute port names for the response
  const blocks = sheetResult.sheet.blocks || [];
  const sourceBlock = blocks.find((b: any) => b.id === deletedConnection.sourceBlockId);
  const targetBlock = blocks.find((b: any) => b.id === deletedConnection.targetBlockId);

  // Remove the connection
  connections.splice(connectionIndex, 1);

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
    return errorResponse('Failed to delete connection', 'DELETE_CONNECTION_FAILED', 500);
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
    deletedConnection: {
      id: deletedConnection.id,
      sourceBlockId: deletedConnection.sourceBlockId,
      sourcePortIndex: deletedConnection.sourcePortIndex,
      sourcePort: sourceBlock?.outputs?.[deletedConnection.sourcePortIndex] || `output${deletedConnection.sourcePortIndex}`,
      targetBlockId: deletedConnection.targetBlockId,
      targetPortIndex: deletedConnection.targetPortIndex,
      targetPort: targetBlock?.inputs?.[deletedConnection.targetPortIndex] || `input${deletedConnection.targetPortIndex}`
    },
    remainingConnectionCount: connections.length
  });
}
