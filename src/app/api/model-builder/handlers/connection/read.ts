// handlers/connection/read.ts
// Connection read action handlers (LIST_CONNECTIONS, GET_CONNECTION)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';

/**
 * LIST_CONNECTIONS - List all connections in a sheet
 */
export async function handleListConnections(ctx: HandlerContext): Promise<NextResponse> {
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

  // Find the specific sheet (searching both top-level and subsystem sheets)
  const sheets = versionData.data?.sheets || [];
  const sheetResult = findSheetRecursively(sheets, sheetId);

  if (!sheetResult) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  const sheet = sheetResult.sheet;

  // Extract connections from the sheet
  const connections = sheet.connections || [];

  // Transform connections to include full details
  const connectionDetails = connections.map((conn: any) => {
    const sourceBlock = sheet.blocks?.find((b: any) => b.id === conn.sourceBlockId);
    const targetBlock = sheet.blocks?.find((b: any) => b.id === conn.targetBlockId);
    return {
      id: conn.id,
      sourceBlockId: conn.sourceBlockId,
      sourcePortIndex: conn.sourcePortIndex,
      sourcePort: sourceBlock?.outputs?.[conn.sourcePortIndex] || `output${conn.sourcePortIndex}`,
      targetBlockId: conn.targetBlockId,
      targetPortIndex: conn.targetPortIndex,
      targetPort: targetBlock?.inputs?.[conn.targetPortIndex] || `input${conn.targetPortIndex}`,
      // Include block names for easier identification
      sourceBlockName: sourceBlock?.name || 'Unknown',
      targetBlockName: targetBlock?.name || 'Unknown'
    };
  });

  return successResponse({
    modelId,
    sheetId,
    connectionCount: connectionDetails.length,
    connections: connectionDetails
  });
}

/**
 * GET_CONNECTION - Get details of a specific connection
 */
export async function handleGetConnection(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;
  const connectionId = searchParams?.get('connectionId') || body?.connectionId;

  // Validate required parameters
  if (!modelId) {
    return ErrorResponses.missingParameter('modelId');
  }
  if (!sheetId) {
    return ErrorResponses.missingParameter('sheetId');
  }
  if (!connectionId) {
    return ErrorResponses.missingParameter('connectionId');
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

  // Find the specific connection
  const connections = sheet.connections || [];
  const connection = connections.find((c: any) => c.id === connectionId);

  if (!connection) {
    return ErrorResponses.connectionNotFound(connectionId);
  }

  // Get block details for the connection
  const sourceBlock = sheet.blocks?.find((b: any) => b.id === connection.sourceBlockId);
  const targetBlock = sheet.blocks?.find((b: any) => b.id === connection.targetBlockId);

  // Return complete connection details
  return successResponse({
    modelId,
    sheetId,
    connection: {
      id: connection.id,
      source: {
        blockId: connection.sourceBlockId,
        blockName: sourceBlock?.name || 'Unknown',
        blockType: sourceBlock?.type || 'unknown',
        port: sourceBlock?.outputs?.[connection.sourcePortIndex] || `output${connection.sourcePortIndex}`
      },
      target: {
        blockId: connection.targetBlockId,
        blockName: targetBlock?.name || 'Unknown',
        blockType: targetBlock?.type || 'unknown',
        port: targetBlock?.inputs?.[connection.targetPortIndex] || `input${connection.targetPortIndex}`
      }
    }
  });
}
