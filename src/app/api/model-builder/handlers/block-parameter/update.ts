// handlers/block-parameter/update.ts
// Block parameter update action handlers (UPDATE_BLOCK_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { getAllSheets } from '@/lib/api-support/sheet-search';
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
 * UPDATE_BLOCK_PARAMETER - Update a parameter on a subsystem block
 */
export async function handleUpdateBlockParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, body } = ctx;
  const { modelId, blockId, paramName, name: newName, defaultValue } = body || {};

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

  // At least one update field must be provided
  if (newName === undefined && defaultValue === undefined) {
    return errorResponse(
      'At least one of name or defaultValue must be provided',
      'NO_UPDATES_PROVIDED',
      400
    );
  }

  // Validate new name format if provided
  if (newName !== undefined) {
    const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!nameRegex.test(newName)) {
      return errorResponse(
        'Parameter name must be a valid identifier (alphanumeric + underscore, cannot start with number)',
        'INVALID_PARAMETER_NAME',
        400
      );
    }
  }

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  const versionData = authResult.versionData;

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

  // If renaming, check for duplicate name
  if (newName !== undefined && newName !== paramName) {
    const duplicateParam = parameters.find((p: any) => p.name === newName);
    if (duplicateParam) {
      return errorResponse(
        `Parameter already exists: ${newName}`,
        'PARAMETER_EXISTS',
        409
      );
    }
  }

  // Update the parameter
  const param = parameters[paramIndex];
  const oldParam = { ...param };

  if (newName !== undefined) {
    param.name = newName;
  }
  if (defaultValue !== undefined) {
    param.defaultValue = defaultValue;
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
    return errorResponse('Failed to update parameter', 'UPDATE_PARAMETER_FAILED', 500);
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

  return successResponse({
    modelId,
    blockId,
    newVersion: nextVersion,
    parameter: {
      name: param.name,
      dataType: param.dataType,
      defaultValue: param.defaultValue
    },
    oldParameter: oldParam
  });
}
