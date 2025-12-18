// handlers/block-parameter/delete.ts
// Block parameter delete action handlers (DELETE_BLOCK_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { getAllSheets } from '@/lib/api-support/sheet-search';

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
  const { supabase, searchParams, body } = ctx;
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
    return errorResponse('Failed to delete parameter', 'DELETE_PARAMETER_FAILED', 500);
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
    deletedParameter: deletedParam,
    remainingParameterCount: parameters.length
  });
}
