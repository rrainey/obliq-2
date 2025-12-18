// handlers/block-parameter/write.ts
// Block parameter write action handlers (ADD_BLOCK_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { getAllSheets } from '@/lib/api-support/sheet-search';
import { isValidType, getTypeValidationError } from '@/lib/typeValidator';
import { isValidC99Initializer, getC99InitializerError } from '@/lib/c99InitializerValidator';

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
 * ADD_BLOCK_PARAMETER - Add a parameter to a subsystem block
 */
export async function handleAddBlockParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, blockId, name, dataType, defaultValue } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!blockId) {
    return ErrorResponses.missingParameter('blockId');
  }
  if (!name) {
    return ErrorResponses.missingParameter('name');
  }
  if (!dataType) {
    return ErrorResponses.missingParameter('dataType');
  }
  if (defaultValue === undefined) {
    return ErrorResponses.missingParameter('defaultValue');
  }

  // Validate parameter name format (valid C identifier)
  const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!nameRegex.test(name)) {
    return errorResponse(
      'Parameter name must be a valid identifier (alphanumeric + underscore, cannot start with number)',
      'INVALID_PARAMETER_NAME',
      400
    );
  }

  // Validate dataType using C-language type syntax (float, double, long, bool, arrays, matrices)
  if (!isValidType(dataType)) {
    const validationError = getTypeValidationError(dataType);
    return errorResponse(
      validationError || `Invalid dataType: ${dataType}`,
      'INVALID_DATA_TYPE',
      400
    );
  }

  // Validate defaultValue is a C99 initializer string that matches the dataType
  if (typeof defaultValue !== 'string') {
    return errorResponse(
      `defaultValue must be a C99 initializer string (e.g., "42", "{1, 2, 3}", "{{1, 0}, {0, 1}}")`,
      'INVALID_DEFAULT_VALUE',
      400
    );
  }

  if (!isValidC99Initializer(defaultValue, dataType)) {
    const validationError = getC99InitializerError(defaultValue, dataType);
    return errorResponse(
      validationError || `Invalid C99 initializer for type ${dataType}`,
      'INVALID_DEFAULT_VALUE',
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

  // Initialize parameters array if it doesn't exist
  if (!block.parameters.parameters) {
    block.parameters.parameters = [];
  }

  // Check if parameter already exists
  const existingParam = block.parameters.parameters.find((p: any) => p.name === name);
  if (existingParam) {
    return errorResponse(
      `Parameter already exists: ${name}`,
      'PARAMETER_EXISTS',
      409
    );
  }

  // Add the new parameter
  const newParam = { name, dataType, defaultValue };
  block.parameters.parameters.push(newParam);

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
    return errorResponse('Failed to add parameter', 'ADD_PARAMETER_FAILED', 500);
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
    parameter: newParam
  }, 201);
}
