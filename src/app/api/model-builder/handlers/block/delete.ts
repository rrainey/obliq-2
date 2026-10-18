// handlers/block/delete.ts
// Block delete action handlers (DELETE_BLOCK)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { syncSubsystemPortsFromSheets } from '@/lib/blockFactory';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * DELETE_BLOCK - Delete a block and its connections from a sheet
 */
export async function handleDeleteBlock(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
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
    deletedBlock: {
      id: deletedBlock.id,
      type: deletedBlock.type,
      name: deletedBlock.name
    },
    removedConnectionCount: removedConnections.length,
    remainingBlockCount: blocks.length
  });
}
