// handlers/sheet/read.ts
// Sheet read action handlers (LIST_SHEETS, EXPORT_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * Helper to recursively collect all sheets including those in subsystems
 */
function collectAllSheets(
  sheets: any[],
  parentPath: string = ''
): Array<{
  id: string;
  name: string;
  blockCount: number;
  connectionCount: number;
  extents: { width: number; height: number };
  parentSubsystemId?: string;
  path: string;
}> {
  const result: any[] = [];

  for (const sheet of sheets) {
    const sheetPath = parentPath ? `${parentPath}/${sheet.name}` : sheet.name;

    result.push({
      id: sheet.id,
      name: sheet.name,
      blockCount: sheet.blocks?.length || 0,
      connectionCount: sheet.connections?.length || 0,
      extents: sheet.extents || { width: 2000, height: 2000 },
      ...(parentPath && { parentSubsystemId: parentPath }),
      path: sheetPath
    });

    // Look for subsystem blocks that have embedded sheets
    for (const block of sheet.blocks || []) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        const subsystemPath = `${sheetPath}/${block.name}`;
        const embeddedSheets = collectAllSheets(block.parameters.sheets, subsystemPath);
        for (const embeddedSheet of embeddedSheets) {
          // Add the parent subsystem block ID for reference
          embeddedSheet.parentSubsystemId = block.id;
        }
        result.push(...embeddedSheets);
      }
    }
  }

  return result;
}

/**
 * LIST_SHEETS - List all sheets in a model with summary information
 */
export async function handleListSheets(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  // Extract sheets from the model data (top-level)
  const sheets = authResult.versionData.data?.sheets || [];

  // Collect all sheets recursively, including subsystem sheets
  const allSheets = collectAllSheets(sheets);

  return successResponse({
    modelId,
    sheetCount: allSheets.length,
    sheets: allSheets
  });
}

/**
 * EXPORT_SHEET - Export a sheet as standalone JSON
 */
export async function handleExportSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }

  // Verify user owns this model and get version data
  const authResult = await verifyModelOwnershipWithVersion(supabase, modelId, userId);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  // Find the specific sheet
  const sheets = authResult.versionData.data?.sheets || [];
  const sheet = sheets.find((s: any) => s.id === sheetId);

  if (!sheet) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Create standalone sheet JSON with metadata
  const exportData = {
    exportMetadata: {
      exportedAt: new Date().toISOString(),
      sourceModelId: modelId,
      exportVersion: '1.0',
      sheetFormat: 'obliq-2'
    },
    sheet: {
      id: sheet.id,
      name: sheet.name,
      blocks: sheet.blocks || [],
      connections: sheet.connections || [],
      extents: sheet.extents || { width: 2000, height: 2000 }
    }
  };

  // Return the exported sheet
  return successResponse({
    modelId,
    sheetId,
    sheetName: sheet.name,
    statistics: {
      blockCount: sheet.blocks?.length || 0,
      connectionCount: sheet.connections?.length || 0
    },
    exportData
  });
}
