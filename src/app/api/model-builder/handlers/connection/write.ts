// handlers/connection/write.ts
// Connection write action handlers (ADD_CONNECTION)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * ADD_CONNECTION - Add a new connection between blocks
 */
export async function handleAddConnection(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, body } = ctx;
  const { modelId, sheetId, sourceBlockId, sourcePort, sourcePortIndex, targetBlockId, targetPort, targetPortIndex } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }
  if (!sourceBlockId) {
    return ErrorResponses.missingParameter('sourceBlockId');
  }
  if (sourcePort === undefined && sourcePortIndex === undefined) {
    return errorResponse('Either sourcePort or sourcePortIndex must be provided', 'MISSING_PARAMETER', 400);
  }
  if (!targetBlockId) {
    return ErrorResponses.missingParameter('targetBlockId');
  }
  if (targetPort === undefined && targetPortIndex === undefined) {
    return errorResponse('Either targetPort or targetPortIndex must be provided', 'MISSING_PARAMETER', 400);
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

  // Find the target sheet (searching both top-level and subsystem sheets)
  const sheetResult = findSheetRecursively(sheets, sheetId);

  if (!sheetResult) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  const sheet = sheetResult.sheet;
  const blocks = sheet.blocks || [];
  const connections = sheet.connections || [];

  // Find source and target blocks
  const sourceBlock = blocks.find((b: any) => b.id === sourceBlockId);
  const targetBlock = blocks.find((b: any) => b.id === targetBlockId);

  if (!sourceBlock) {
    return ErrorResponses.blockNotFound(sourceBlockId);
  }
  if (!targetBlock) {
    return ErrorResponses.blockNotFound(targetBlockId);
  }

  // Resolve port indices - convert port names to indices if needed
  let resolvedSourcePortIndex: number;
  let resolvedTargetPortIndex: number;

  if (sourcePortIndex !== undefined) {
    resolvedSourcePortIndex = sourcePortIndex;
    // Validate index is in range
    if (!sourceBlock.outputs || resolvedSourcePortIndex < 0 || resolvedSourcePortIndex >= sourceBlock.outputs.length) {
      return errorResponse(
        `Block '${sourceBlockId}' does not have output port at index ${resolvedSourcePortIndex}`,
        'INVALID_PORT',
        400
      );
    }
  } else {
    // Convert port name to index
    if (!sourceBlock.outputs || !sourceBlock.outputs.includes(sourcePort)) {
      return errorResponse(
        `Block '${sourceBlockId}' does not have output port '${sourcePort}'`,
        'INVALID_PORT',
        400
      );
    }
    resolvedSourcePortIndex = sourceBlock.outputs.indexOf(sourcePort);
  }

  if (targetPortIndex !== undefined) {
    resolvedTargetPortIndex = targetPortIndex;
    // Validate index is in range
    if (!targetBlock.inputs || resolvedTargetPortIndex < 0 || resolvedTargetPortIndex >= targetBlock.inputs.length) {
      return errorResponse(
        `Block '${targetBlockId}' does not have input port at index ${resolvedTargetPortIndex}`,
        'INVALID_PORT',
        400
      );
    }
  } else {
    // Convert port name to index
    if (!targetBlock.inputs || !targetBlock.inputs.includes(targetPort)) {
      return errorResponse(
        `Block '${targetBlockId}' does not have input port '${targetPort}'`,
        'INVALID_PORT',
        400
      );
    }
    resolvedTargetPortIndex = targetBlock.inputs.indexOf(targetPort);
  }

  // Check for existing connection on target port (single input rule)
  const existingConnection = connections.find((conn: any) =>
    conn.targetBlockId === targetBlockId && conn.targetPortIndex === resolvedTargetPortIndex
  );

  if (existingConnection) {
    const portName = targetBlock.inputs[resolvedTargetPortIndex];
    return errorResponse(
      `Input port '${portName}' (index ${resolvedTargetPortIndex}) on block '${targetBlockId}' already has a connection`,
      'PORT_ALREADY_CONNECTED',
      400
    );
  }

  // Check for self-connection
  if (sourceBlockId === targetBlockId) {
    return errorResponse(
      'Cannot connect a block to itself',
      'SELF_CONNECTION',
      400
    );
  }

  // Check for duplicate connection
  const duplicateConnection = connections.find((conn: any) =>
    conn.sourceBlockId === sourceBlockId &&
    conn.sourcePortIndex === resolvedSourcePortIndex &&
    conn.targetBlockId === targetBlockId &&
    conn.targetPortIndex === resolvedTargetPortIndex
  );

  if (duplicateConnection) {
    return errorResponse(
      'This connection already exists',
      'PORT_ALREADY_CONNECTED',
      400
    );
  }

  // Generate connection ID
  const connectionId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Create the new connection with port indices only (canonical form)
  const newConnection = {
    id: connectionId,
    sourceBlockId,
    sourcePortIndex: resolvedSourcePortIndex,
    targetBlockId,
    targetPortIndex: resolvedTargetPortIndex
  };

  // Add connection to sheet
  sheet.connections.push(newConnection);

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
    return errorResponse('Failed to add connection', 'ADD_CONNECTION_FAILED', 500);
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

  // Return the created connection (include computed port names for display)
  return successResponse({
    modelId,
    sheetId,
    newVersion: nextVersion,
    connection: {
      id: newConnection.id,
      sourceBlockId: newConnection.sourceBlockId,
      sourcePortIndex: newConnection.sourcePortIndex,
      sourcePort: sourceBlock.outputs[newConnection.sourcePortIndex],
      targetBlockId: newConnection.targetBlockId,
      targetPortIndex: newConnection.targetPortIndex,
      targetPort: targetBlock.inputs[newConnection.targetPortIndex]
    }
  }, 201);
}
