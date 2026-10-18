// handlers/block-parameter/delete.ts
// Block parameter delete action handlers (DELETE_BLOCK_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { getAllSheets } from '@/lib/api-support/sheet-search';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';

/**
 * Find a block by ID across all sheets (including nested subsystem sheets)
 */
function findBlockById(sheets: any[], blockId: string): { block: any; sheet: any } | null {
  const allSheets = getAllSheets(sheets);
  for (const sheet of allSheets) {
    const blocks = sheet.blocks || [];
    const block = blocks.find((b: any) => b.id === blockId);
    if (block) {
      return { block, sheet };
    }
  }
  return null;
}

/**
 * DELETE_BLOCK_PARAMETER - Delete a parameter from a subsystem block
 */
export async function handleDeleteBlockParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const blockId = searchParams?.get('blockId') || body?.blockId;
  const paramName = searchParams?.get('paramName') || body?.paramName;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!blockId) {
    return ErrorResponses.missingParameter('blockId');
  }
  if (!paramName) {
    return ErrorResponses.missingParameter('paramName');
  }

  // Load the model and its current data
  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData!;

  const modelData = versionData.data;
  const sheets = modelData.sheets || [];

  // Find the block
  const result = findBlockById(sheets, blockId);
  if (!result) {
    return ErrorResponses.blockNotFound(blockId);
  }

  const { block } = result;

  // Verify it's a subsystem block
  if (block.type !== 'subsystem') {
    return errorResponse(
      'Only subsystem blocks can have parameters',
      'NOT_A_SUBSYSTEM',
      400
    );
  }

  // Find the parameter
  const parameters = block.parameters?.parameters || [];
  const paramIndex = parameters.findIndex((p: any) => p.name === paramName);

  if (paramIndex === -1) {
    return errorResponse(
      `Parameter not found: ${paramName}`,
      'PARAMETER_NOT_FOUND',
      404
    );
  }

  // Store deleted parameter info
  const deletedParam = { ...parameters[paramIndex] };

  // Remove the parameter
  parameters.splice(paramIndex, 1);

  // Persist in place (a version snapshot is recorded only on checkpoint)
  const saved = persistModelData(ctx, modelId, modelData, versionData.hash);
  if (!saved.ok) {
    return saved.errorResponse;
  }

  return successResponse({
    modelId,
    blockId,
    newVersion: saved.version,
    hash: saved.hash,
    deletedParameter: deletedParam,
    remainingParameterCount: parameters.length
  });
}
