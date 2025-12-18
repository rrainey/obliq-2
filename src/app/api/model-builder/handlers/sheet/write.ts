// handlers/sheet/write.ts
// Sheet write action handlers (CREATE_SHEET, IMPORT_SHEET, CLONE_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';

/**
 * Helper function to find a block recursively in all sheets (including nested subsystems)
 */
function findBlockRecursively(
  sheetsToSearch: any[],
  blockId: string
): { block: any; parentSheet: any } | null {
  for (const sheet of sheetsToSearch) {
    for (const block of sheet.blocks || []) {
      if (block.id === blockId) {
        return { block, parentSheet: sheet };
      }
      // If this is a subsystem, search its nested sheets
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        const found = findBlockRecursively(block.parameters.sheets, blockId);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * CREATE_SHEET - Create a new sheet in a model
 */
export async function handleCreateSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, name, subsystemBlockId } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
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

  // Generate a unique sheet ID
  const sheetId = `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Determine target sheets array and sheet name
  let targetSheetsArray: any[];
  let subsystemBlock: any = null;

  if (subsystemBlockId) {
    // Find the subsystem block (searching recursively)
    const found = findBlockRecursively(sheets, subsystemBlockId);

    if (!found) {
      return errorResponse(`Subsystem block not found: ${subsystemBlockId}`, 'SUBSYSTEM_NOT_FOUND', 404);
    }

    subsystemBlock = found.block;

    if (subsystemBlock.type !== 'subsystem') {
      return errorResponse(`Block ${subsystemBlockId} is not a subsystem`, 'NOT_A_SUBSYSTEM', 400);
    }

    // Ensure the subsystem has a sheets array
    if (!subsystemBlock.parameters) {
      subsystemBlock.parameters = {};
    }
    if (!subsystemBlock.parameters.sheets) {
      subsystemBlock.parameters.sheets = [];
    }

    targetSheetsArray = subsystemBlock.parameters.sheets;
  } else {
    // Add to model's root sheets
    targetSheetsArray = modelData.sheets;
  }

  // Generate sheet name if not provided
  const sheetName = name || (subsystemBlockId
    ? `${subsystemBlock?.name || 'Subsystem'} Sheet ${targetSheetsArray.length + 1}`
    : `Sheet ${targetSheetsArray.length + 1}`);

  // Create new sheet
  const newSheet = {
    id: sheetId,
    name: sheetName,
    blocks: [],
    connections: [],
    extents: {
      width: 2000,
      height: 2000
    }
  };

  // Add sheet to target array
  targetSheetsArray.push(newSheet);

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
    return errorResponse('Failed to create sheet', 'CREATE_SHEET_FAILED', 500);
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

  // Build response
  const response: any = {
    modelId,
    newVersion: nextVersion,
    sheet: {
      id: newSheet.id,
      name: newSheet.name,
      blockCount: 0,
      connectionCount: 0,
      extents: newSheet.extents
    }
  };

  // Include subsystem info if sheet was added to a subsystem
  if (subsystemBlockId && subsystemBlock) {
    response.subsystemBlockId = subsystemBlockId;
    response.subsystemName = subsystemBlock.name;
  }

  // Return the created sheet
  return successResponse(response, 201);
}

/**
 * IMPORT_SHEET - Import a sheet from external data
 */
export async function handleImportSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, sheetData, overrideId, overrideName } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetData || typeof sheetData !== 'object') {
    return errorResponse('Invalid sheetData: must be a sheet object', 'INVALID_SHEET_DATA', 400);
  }

  // Validate sheet structure
  if (!sheetData.id || !sheetData.name) {
    return errorResponse('Sheet data must have id and name properties', 'INVALID_SHEET_STRUCTURE', 400);
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

  // Generate new IDs to avoid conflicts
  const sheetIdMap = new Map<string, string>();
  const blockIdMap = new Map<string, string>();
  const connectionIdMap = new Map<string, string>();

  // Use override ID if provided, otherwise generate new one
  const newSheetId = overrideId || `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sheetIdMap.set(sheetData.id, newSheetId);

  // Check for duplicate sheet ID
  if (sheets.some((s: any) => s.id === newSheetId)) {
    return errorResponse(`Sheet with ID '${newSheetId}' already exists`, 'DUPLICATE_SHEET_ID', 400);
  }

  // Process blocks with new IDs
  const importedBlocks = (sheetData.blocks || []).map((block: any) => {
    const newBlockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    blockIdMap.set(block.id, newBlockId);

    return {
      ...block,
      id: newBlockId
    };
  });

  // Process connections with updated block IDs
  const importedConnections = (sheetData.connections || []).map((conn: any) => {
    const newConnectionId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    connectionIdMap.set(conn.id || `conn_${Date.now()}`, newConnectionId);

    // Update block IDs in connections
    const newSourceId = blockIdMap.get(conn.sourceBlockId);
    const newTargetId = blockIdMap.get(conn.targetBlockId);

    if (!newSourceId || !newTargetId) {
      console.warn(`Connection references non-existent blocks: ${conn.sourceBlockId} -> ${conn.targetBlockId}`);
      return null; // Skip invalid connections
    }

    return {
      ...conn,
      id: newConnectionId,
      sourceBlockId: newSourceId,
      targetBlockId: newTargetId
    };
  }).filter((conn: any) => conn !== null);

  // Create the imported sheet
  const importedSheet = {
    ...sheetData,
    id: newSheetId,
    name: overrideName || sheetData.name,
    blocks: importedBlocks,
    connections: importedConnections,
    extents: sheetData.extents || { width: 2000, height: 2000 }
  };

  // Add imported sheet to model
  modelData.sheets.push(importedSheet);

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
    return errorResponse('Failed to import sheet', 'IMPORT_SHEET_FAILED', 500);
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

  // Return the imported sheet info
  return successResponse({
    modelId,
    newVersion: nextVersion,
    importedSheet: {
      id: importedSheet.id,
      name: importedSheet.name,
      blockCount: importedSheet.blocks.length,
      connectionCount: importedSheet.connections.length,
      extents: importedSheet.extents
    },
    idMappings: {
      sheet: Object.fromEntries(sheetIdMap),
      blocks: Object.fromEntries(blockIdMap),
      connections: Object.fromEntries(connectionIdMap)
    }
  }, 201);
}

/**
 * CLONE_SHEET - Clone an existing sheet
 */
export async function handleCloneSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const { modelId, sheetId, newName } = body || {};

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
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

  // Find the sheet to clone
  const sourceSheet = sheets.find((sheet: any) => sheet.id === sheetId);

  if (!sourceSheet) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Generate new sheet ID
  const newSheetId = `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Generate new sheet name if not provided
  const clonedSheetName = newName || `${sourceSheet.name} (Copy)`;

  // Create ID mappings for blocks (old ID -> new ID)
  const blockIdMap = new Map<string, string>();

  // Clone blocks with new IDs
  const clonedBlocks = (sourceSheet.blocks || []).map((block: any) => {
    const newBlockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    blockIdMap.set(block.id, newBlockId);

    return {
      ...block,
      id: newBlockId,
      name: block.name ? `${block.name} (Copy)` : block.name
    };
  });

  // Clone connections with updated block IDs
  const clonedConnections = (sourceSheet.connections || []).map((conn: any) => {
    const newConnectionId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      ...conn,
      id: newConnectionId,
      sourceBlockId: blockIdMap.get(conn.sourceBlockId) || conn.sourceBlockId,
      targetBlockId: blockIdMap.get(conn.targetBlockId) || conn.targetBlockId
    };
  });

  // Create the cloned sheet
  const clonedSheet = {
    id: newSheetId,
    name: clonedSheetName,
    blocks: clonedBlocks,
    connections: clonedConnections,
    extents: sourceSheet.extents || { width: 2000, height: 2000 }
  };

  // Add cloned sheet to model
  modelData.sheets.push(clonedSheet);

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
    return errorResponse('Failed to clone sheet', 'CLONE_SHEET_FAILED', 500);
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

  // Return the cloned sheet info
  return successResponse({
    modelId,
    newVersion: nextVersion,
    sourceSheetId: sheetId,
    clonedSheet: {
      id: clonedSheet.id,
      name: clonedSheet.name,
      blockCount: clonedSheet.blocks.length,
      connectionCount: clonedSheet.connections.length,
      extents: clonedSheet.extents
    },
    blockMapping: Object.fromEntries(blockIdMap)
  }, 201);
}
