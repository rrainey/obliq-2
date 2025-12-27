// handlers/block/delete.ts
// Block delete action handlers (DELETE_BLOCK)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { syncSubsystemPortsFromSheets } from '@/lib/blockFactory';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * DELETE_BLOCK - Delete a block and its connections from a sheet
 */
export async function handleDeleteBlock(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;
  const blockId = searchParams?.get('blockId') || body?.blockId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }
  if (!blockId) {
    return ErrorResponses.missingParameter('blockId');
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

  // Find the block to delete
  const blocks = sheetResult.sheet.blocks || [];
  const blockIndex = blocks.findIndex((block: any) => block.id === blockId);

  if (blockIndex === -1) {
    return ErrorResponses.blockNotFound(blockId);
  }

  // Store block info for response
  const deletedBlock = blocks[blockIndex];

  // Remove the block
  blocks.splice(blockIndex, 1);

  // Remove all connections to/from this block
  const connections = sheetResult.sheet.connections || [];
  const removedConnections = connections.filter((conn: any) =>
    conn.sourceBlockId === blockId || conn.targetBlockId === blockId
  );

  sheetResult.sheet.connections = connections.filter((conn: any) =>
    conn.sourceBlockId !== blockId && conn.targetBlockId !== blockId
  );

  // If we deleted an input_port or output_port from a subsystem's sheet,
  // sync the parent subsystem's inputPorts/outputPorts arrays
  if ((deletedBlock.type === 'input_port' || deletedBlock.type === 'output_port') && sheetResult.parentBlock) {
    syncSubsystemPortsFromSheets(sheetResult.parentBlock);
  }

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
    return errorResponse('Failed to delete block', 'DELETE_BLOCK_FAILED', 500);
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
    deletedBlock: {
      id: deletedBlock.id,
      type: deletedBlock.type,
      name: deletedBlock.name
    },
    removedConnectionCount: removedConnections.length,
    remainingBlockCount: blocks.length
  });
}
