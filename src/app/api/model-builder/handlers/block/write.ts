// handlers/block/write.ts
// Block write action handlers (ADD_BLOCK)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { isValidBlockType } from '@/lib/blockTypeRegistry';
import { createBlock, syncSubsystemPortsFromSheets } from '@/lib/blockFactory';
import { validateBlockParameters } from '@/lib/blockParameterValidator';

/**
 * ADD_BLOCK - Add a new block to a sheet
 */
export async function handleAddBlock(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, sheetId, blockType, position, name, parameters } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }
  if (!blockType) {
    return ErrorResponses.missingParameter('blockType');
  }

  // Validate block type
  if (!isValidBlockType(blockType)) {
    return errorResponse(`Invalid block type: ${blockType}`, 'INVALID_BLOCK_TYPE', 400);
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

  const sheet = sheetResult.sheet;
  const existingBlocks = sheet.blocks || [];

  // Count existing blocks of this type for auto-naming
  const existingBlocksOfType = existingBlocks.filter((b: any) => b.type === blockType).length;

  // Use the unified block factory for consistent block creation
  const newBlock = createBlock(blockType, {
    name: name || undefined,
    position: position || { x: 100, y: 100 },
    parameters: parameters || undefined,
    existingBlocksOfType: existingBlocksOfType + 1
  });

  // Validate and sanitize block parameters after creation
  const validation = validateBlockParameters(blockType, newBlock.parameters);
  if (!validation.valid) {
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Parameter validation failed',
      code: 'VALIDATION_FAILED',
      details: { errors: validation.errors }
    }, { status: 400 });
  }
  // Apply sanitized parameters (includes legacy parameter conversions)
  newBlock.parameters = validation.sanitizedParameters!;

  // For subsystem blocks, extract sheet info for the response
  let createdSheet = null;
  if (blockType === 'subsystem' && newBlock.parameters?.sheets?.[0]) {
    const subsystemSheet = newBlock.parameters.sheets[0];
    const inputPort = subsystemSheet.blocks?.find((b: any) => b.type === 'input_port');
    const outputPort = subsystemSheet.blocks?.find((b: any) => b.type === 'output_port');

    createdSheet = {
      id: subsystemSheet.id,
      name: subsystemSheet.name,
      inputPort: inputPort ? {
        id: inputPort.id,
        name: inputPort.name
      } : null,
      outputPort: outputPort ? {
        id: outputPort.id,
        name: outputPort.name
      } : null
    };
  }

  // Add block to sheet
  sheet.blocks.push(newBlock);

  // If we added an input_port or output_port to a subsystem's sheet,
  // sync the parent subsystem's inputPorts/outputPorts arrays
  if ((blockType === 'input_port' || blockType === 'output_port') && sheetResult.parentBlock) {
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
    return errorResponse('Failed to add block', 'ADD_BLOCK_FAILED', 500);
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

  // Return the created block (with subsystem sheet info if applicable)
  const response: any = {
    modelId,
    sheetId,
    newVersion: nextVersion,
    block: {
      id: newBlock.id,
      type: newBlock.type,
      name: newBlock.name,
      position: newBlock.position,
      parameters: newBlock.parameters,
      ports: {
        inputs: newBlock.inputs,
        outputs: newBlock.outputs
      }
    }
  };

  // Include subsystem sheet information for better MCP guidance
  if (createdSheet) {
    response.subsystemSheet = createdSheet;
  }

  return successResponse(response, 201);
}
