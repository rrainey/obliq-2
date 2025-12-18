// handlers/sheet/read.ts
// Sheet read action handlers (LIST_SHEETS, EXPORT_SHEET)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';

/**
 * LIST_SHEETS - List all sheets in a model with summary information
 */
export async function handleListSheets(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;

  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }

  // Get the latest version of the model to access sheets
  const { data: versionData, error: versionError } = await supabase
    .from('model_versions')
    .select('data')
    .eq('model_id', modelId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !versionData) {
    return ErrorResponses.modelNotFound(modelId);
  }

  // Extract sheets from the model data
  const sheets = versionData.data?.sheets || [];

  // Transform sheets to include summary information
  const sheetSummaries = sheets.map((sheet: any) => ({
    id: sheet.id,
    name: sheet.name,
    blockCount: sheet.blocks?.length || 0,
    connectionCount: sheet.connections?.length || 0,
    extents: sheet.extents || { width: 2000, height: 2000 }
  }));

  return successResponse({
    modelId,
    sheetCount: sheetSummaries.length,
    sheets: sheetSummaries
  });
}

/**
 * EXPORT_SHEET - Export a sheet as standalone JSON
 */
export async function handleExportSheet(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;

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
    .select('data')
    .eq('model_id', modelId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !versionData) {
    return ErrorResponses.modelNotFound(modelId);
  }

  // Find the specific sheet
  const sheets = versionData.data?.sheets || [];
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
