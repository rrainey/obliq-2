// handlers/block-parameter/read.ts
// Block parameter read action handlers (LIST_BLOCK_PARAMETERS, GET_BLOCK_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively, getAllSheets } from '@/lib/api-support/sheet-search';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

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
 * LIST_BLOCK_PARAMETERS - List all parameters for a subsystem block
 */
export async function handleListBlockParameters(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const blockId = searchParams?.get('blockId') || body?.blockId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!blockId) {
    return ErrorResponses.missingParameter('blockId');
  }

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const modelData = authResult.versionData.data;
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

  // Get parameters from the block
  const parameters = block.parameters?.parameters || [];

  return successResponse({
    modelId,
    blockId,
    blockName: block.name,
    parameterCount: parameters.length,
    parameters: parameters.map((p: any) => ({
      name: p.name,
      dataType: p.dataType,
      defaultValue: p.defaultValue
    }))
  });
}

/**
 * GET_BLOCK_PARAMETER - Get a specific parameter from a subsystem block
 */
export async function handleGetBlockParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
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

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const modelData = authResult.versionData.data;
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
  const param = parameters.find((p: any) => p.name === paramName);

  if (!param) {
    return errorResponse(
      `Parameter not found: ${paramName}`,
      'PARAMETER_NOT_FOUND',
      404
    );
  }

  return successResponse({
    modelId,
    blockId,
    parameter: {
      name: param.name,
      dataType: param.dataType,
      defaultValue: param.defaultValue
    }
  });
}
