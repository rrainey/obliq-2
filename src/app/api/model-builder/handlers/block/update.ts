// handlers/block/update.ts
// Block update action handlers (UPDATE_BLOCK_POSITION, UPDATE_BLOCK_NAME, UPDATE_BLOCK_PARAMETERS)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { BlockTypes, generateDynamicPorts } from '@/lib/blockTypeRegistry';
import { validateBlockParameters } from '@/lib/blockParameterValidator';
import { syncSubsystemPortsFromSheets } from '@/lib/blockFactory';

/**
 * UPDATE_BLOCK_POSITION - Update a block's position on the canvas
 */
export async function handleUpdateBlockPosition(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, sheetId, blockId, position } = body || {};

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
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return errorResponse('Invalid position: must have numeric x and y properties', 'INVALID_POSITION', 400);
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

  // Find the block to update
  const blocks = sheetResult.sheet.blocks || [];
  const blockIndex = blocks.findIndex((block: any) => block.id === blockId);

  if (blockIndex === -1) {
    return ErrorResponses.blockNotFound(blockId);
  }

  // Update the block position
  blocks[blockIndex].position = {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };

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
    return errorResponse('Failed to update block position', 'UPDATE_POSITION_FAILED', 500);
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
    blockId,
    newVersion: nextVersion,
    position: blocks[blockIndex].position
  });
}

/**
 * UPDATE_BLOCK_NAME - Update a block's name
 */
export async function handleUpdateBlockName(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, sheetId, blockId, name } = body || {};

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
  if (!name) {
    return ErrorResponses.missingParameter('name');
  }

  // Validate C-style identifier rules
  const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!identifierRegex.test(name)) {
    return errorResponse(
      'Invalid name: must follow C-style identifier rules (start with letter or underscore, contain only letters, digits, and underscores)',
      'INVALID_NAME',
      400
    );
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

  // Find the block to update
  const blocks = sheetResult.sheet.blocks || [];
  const blockIndex = blocks.findIndex((block: any) => block.id === blockId);

  if (blockIndex === -1) {
    return ErrorResponses.blockNotFound(blockId);
  }

  // Check if name is already taken by another block on the same sheet
  const nameTaken = blocks.some((block: any, idx: number) =>
    idx !== blockIndex && block.name === name
  );

  if (nameTaken) {
    return errorResponse(
      `Block name '${name}' is already used on this sheet`,
      'DUPLICATE_NAME',
      400
    );
  }

  // Update the block name
  const block = blocks[blockIndex];
  const previousName = block.name;
  block.name = name;

  // For input_port and output_port blocks, also update the portName parameter
  if (block.type === 'input_port' || block.type === 'output_port') {
    if (!block.parameters) {
      block.parameters = {};
    }
    block.parameters.portName = name;

    // Sync the parent subsystem's inputPorts/outputPorts arrays
    if (sheetResult.parentBlock) {
      syncSubsystemPortsFromSheets(sheetResult.parentBlock);
    }
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
    return errorResponse('Failed to update block name', 'UPDATE_NAME_FAILED', 500);
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
    blockId,
    newVersion: nextVersion,
    name: name,
    previousName: previousName
  });
}

/**
 * UPDATE_BLOCK_PARAMETERS - Update a block's parameters
 */
export async function handleUpdateBlockParameters(ctx: HandlerContext): Promise<NextResponse> {
  console.log('[UPDATE_BLOCK_PARAMETERS] Handler invoked (v2 with pre-merge)');

  const { supabase, body } = ctx;
  const { modelId, sheetId, blockId } = body || {};
  let { parameters } = body || {};

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
  if (!parameters || typeof parameters !== 'object') {
    return errorResponse('Invalid parameters: must be an object', 'INVALID_PARAMETERS', 400);
  }

  // Handle case where caller sends an array of subsystem parameter definitions directly
  // instead of wrapping it as { parameters: [...] }. This is a common MCP client pattern.
  // We need to know the block type first, so we defer this normalization until after finding the block.
  const rawParametersIsArray = Array.isArray(parameters);

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

  // Find the block to update
  const blocks = sheetResult.sheet.blocks || [];
  const blockIndex = blocks.findIndex((block: any) => block.id === blockId);

  if (blockIndex === -1) {
    return ErrorResponses.blockNotFound(blockId);
  }

  const block = blocks[blockIndex];
  const blockType = block.type;

  // Normalize parameters for subsystem blocks when caller sends an array directly
  // This handles the case where MCP clients send updates.parameters as an array of
  // subsystem parameter definitions instead of { parameters: [...] }
  if (blockType === BlockTypes.SUBSYSTEM && rawParametersIsArray) {
    console.log('[UPDATE_BLOCK_PARAMETERS] Normalizing array parameters for subsystem');
    parameters = { parameters: parameters };
  }

  // For subsystem blocks, pre-merge incoming parameters with existing block parameters
  // before validation. This ensures the validator sees the complete context (e.g., existing
  // codeGenStrategy) when validating partial updates. Without this, updating just the
  // 'parameters' array would fail validation because the validator wouldn't know the
  // existing codeGenStrategy is 'segregated'.
  if (blockType === BlockTypes.SUBSYSTEM) {
    parameters = {
      ...block.parameters,  // Existing values (codeGenStrategy, inputPorts, etc.)
      ...parameters         // Incoming updates override existing
    };
    // Remove sheets from the merged parameters to avoid re-validating them
    // (sheets are handled separately via the merge after validation)
    delete parameters.sheets;
  }

  // DEBUG: Log incoming request for subsystems
  if (blockType === BlockTypes.SUBSYSTEM) {
    console.log('[UPDATE_BLOCK_PARAMETERS] ========== SUBSYSTEM UPDATE ==========');
    console.log('[UPDATE_BLOCK_PARAMETERS] Block ID:', blockId);
    console.log('[UPDATE_BLOCK_PARAMETERS] Block Name:', block.name);
    console.log('[UPDATE_BLOCK_PARAMETERS] Incoming request parameters:', JSON.stringify(parameters, null, 2));
    console.log('[UPDATE_BLOCK_PARAMETERS] Request has "sheets" key?', 'sheets' in parameters, 'value:', parameters.sheets);
    console.log('[UPDATE_BLOCK_PARAMETERS] Existing block.parameters.sheets?', !!block.parameters?.sheets, 'count:', block.parameters?.sheets?.length);
  }

  // Validate parameters based on block type
  const validation = validateBlockParameters(blockType, parameters);

  if (!validation.valid) {
    // Include validation errors directly in the error message for better visibility
    const errorSummary = validation.errors?.slice(0, 3).join('; ') || 'Unknown validation error';
    const moreErrors = (validation.errors?.length || 0) > 3 ? ` (and ${validation.errors!.length - 3} more)` : '';

    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: `Parameter validation failed: ${errorSummary}${moreErrors}`,
      code: 'VALIDATION_FAILED',
      errors: validation.errors,  // Also at top level for easier access
      details: { errors: validation.errors }
    }, { status: 400 });
  }

  // Update block parameters
  const oldParameters = { ...block.parameters };

  // For subsystem blocks, MERGE parameters to preserve sheets and internal data
  // that shouldn't be modified via UPDATE_BLOCK_PARAMETERS
  if (blockType === BlockTypes.SUBSYSTEM) {
    // DEBUG: Log detailed merge information
    console.log('[UPDATE_BLOCK_PARAMETERS] Validation passed. Sanitized parameters:');
    console.log('[UPDATE_BLOCK_PARAMETERS]   - sanitizedParameters keys:', Object.keys(validation.sanitizedParameters || {}));
    console.log('[UPDATE_BLOCK_PARAMETERS]   - sanitizedParameters has "sheets" key?', 'sheets' in (validation.sanitizedParameters || {}));
    console.log('[UPDATE_BLOCK_PARAMETERS]   - sanitizedParameters.sheets value:', validation.sanitizedParameters?.sheets);

    console.log('[UPDATE_BLOCK_PARAMETERS] BEFORE merge - block.parameters keys:', Object.keys(block.parameters || {}));
    console.log('[UPDATE_BLOCK_PARAMETERS] BEFORE merge - block.parameters.sheets?', !!block.parameters?.sheets, 'count:', block.parameters?.sheets?.length);

    block.parameters = {
      ...block.parameters,              // Keep existing (sheets, internal state)
      ...validation.sanitizedParameters // Apply sanitized updates
    };

    console.log('[UPDATE_BLOCK_PARAMETERS] AFTER merge - block.parameters keys:', Object.keys(block.parameters || {}));
    console.log('[UPDATE_BLOCK_PARAMETERS] AFTER merge - block.parameters.sheets?', !!block.parameters?.sheets, 'count:', block.parameters?.sheets?.length);
    console.log('[UPDATE_BLOCK_PARAMETERS] ========================================');
  } else {
    block.parameters = validation.sanitizedParameters;
  }

  // For Sum and Multiply blocks, update ports based on numInputs
  if (blockType === BlockTypes.SUM || blockType === BlockTypes.MULTIPLY) {
    const ports = generateDynamicPorts(blockType, block.parameters);
    block.inputs = ports.inputs.map(p => p.name);
    block.outputs = ports.outputs.map(p => p.name);

    // Remove any connections to inputs that no longer exist
    const numInputs = block.parameters.numInputs;
    const connections = sheetResult.sheet.connections || [];
    sheetResult.sheet.connections = connections.filter((conn: any) => {
      if (conn.targetBlockId === blockId) {
        return conn.targetPortIndex < numInputs;
      }
      return true;
    });
  }

  // If we updated an input_port or output_port's portName in a subsystem's sheet,
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
    return errorResponse('Failed to update block parameters', 'UPDATE_PARAMETERS_FAILED', 500);
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
    blockId,
    blockType,
    newVersion: nextVersion,
    oldParameters,
    newParameters: block.parameters,
    ports: {
      inputs: block.inputs,
      outputs: block.outputs
    }
  });
}
