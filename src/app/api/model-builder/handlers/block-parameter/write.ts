// handlers/block-parameter/write.ts
// Block parameter write action handlers (ADD_BLOCK_PARAMETER)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { getAllSheets } from '@/lib/api-support/sheet-search';
import { isValidType, getTypeValidationError } from '@/lib/typeValidator';
import { isValidC99Initializer, getC99InitializerError } from '@/lib/c99InitializerValidator';
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
 * ADD_BLOCK_PARAMETER - Add a parameter to a subsystem block
 */
export async function handleAddBlockParameter(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, body } = ctx;
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
    parameter: newParam
  }, 201);
}
