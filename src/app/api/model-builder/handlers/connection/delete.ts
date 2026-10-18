// handlers/connection/delete.ts
// Connection delete action handlers (DELETE_CONNECTION)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * DELETE_CONNECTION - Delete a connection from a sheet
 */
export async function handleDeleteConnection(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
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

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData!;

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
