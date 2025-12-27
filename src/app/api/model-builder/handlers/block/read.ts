// handlers/block/read.ts
// Block read action handlers (LIST_BLOCKS, GET_BLOCK, GET_BLOCK_PORTS)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { verifyModelOwnershipWithVersion } from '@/lib/api-support/auth';

/**
 * LIST_BLOCKS - List all blocks in a sheet
 */
export async function handleListBlocks(ctx: HandlerContext): Promise<NextResponse> {
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

  // Find the specific sheet (searching both top-level and subsystem sheets)
  const sheets = authResult.versionData.data?.sheets || [];
  const sheetResult = findSheetRecursively(sheets, sheetId);

  if (!sheetResult) {
    return ErrorResponses.sheetNotFound(sheetId);
  }

  // Extract blocks from the sheet
  const blocks = sheetResult.sheet.blocks || [];

  // Transform blocks to include all properties
  const blockDetails = blocks.map((block: any) => ({
    id: block.id,
    type: block.type,
    name: block.name,
    position: block.position || { x: 0, y: 0 },
    parameters: block.parameters || {},
    ports: {
      inputs: block.inputs || [],
      outputs: block.outputs || []
    }
  }));

  return successResponse({
    modelId,
    sheetId,
    blockCount: blockDetails.length,
    blocks: blockDetails
  });
}

/**
 * GET_BLOCK - Get details of a specific block
 */
export async function handleGetBlock(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;
  const blockId = searchParams?.get('blockId') || body?.blockId;

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

  // Find the specific block
  const blocks = sheet.blocks || [];
  const block = blocks.find((b: any) => b.id === blockId);

  if (!block) {
    return ErrorResponses.blockNotFound(blockId);
  }

  // Return complete block details
  return successResponse({
    modelId,
    sheetId,
    block: {
      id: block.id,
      type: block.type,
      name: block.name,
      position: block.position || { x: 0, y: 0 },
      parameters: block.parameters || {},
      ports: {
        inputs: block.inputs || [],
        outputs: block.outputs || []
      },
      metadata: {
        created: block.created,
        modified: block.modified,
        description: block.description
      }
    }
  });
}

/**
 * GET_BLOCK_PORTS - Get port information for a specific block
 */
export async function handleGetBlockPorts(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, userId, searchParams, body } = ctx;
  const modelId = searchParams?.get('modelId') || body?.modelId;
  const sheetId = searchParams?.get('sheetId') || body?.sheetId;
  const blockId = searchParams?.get('blockId') || body?.blockId;

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

  // Find the specific block
  const blocks = sheet.blocks || [];
  const block = blocks.find((b: any) => b.id === blockId);

  if (!block) {
    return ErrorResponses.blockNotFound(blockId);
  }

  // Get all connections for this sheet
  const connections = sheet.connections || [];

  // Build port information with connection status
  const inputPorts = (block.inputs || []).map((portName: string, portIndex: number) => {
    const connection = connections.find((conn: any) =>
      conn.targetBlockId === blockId && conn.targetPortIndex === portIndex
    );

    const sourceBlock = connection ? blocks.find((b: any) => b.id === connection.sourceBlockId) : null;
    return {
      name: portName,
      type: 'input',
      connected: !!connection,
      connectedTo: connection ? {
        blockId: connection.sourceBlockId,
        blockName: sourceBlock?.name || 'Unknown',
        port: sourceBlock?.outputs?.[connection.sourcePortIndex] || `output${connection.sourcePortIndex}`,
        connectionId: connection.id
      } : null
    };
  });

  const outputPorts = (block.outputs || []).map((portName: string, portIndex: number) => {
    const outgoingConnections = connections.filter((conn: any) =>
      conn.sourceBlockId === blockId && conn.sourcePortIndex === portIndex
    );

    return {
      name: portName,
      type: 'output',
      connected: outgoingConnections.length > 0,
      connectionCount: outgoingConnections.length,
      connectedTo: outgoingConnections.map((conn: any) => {
        const targetBlock = blocks.find((b: any) => b.id === conn.targetBlockId);
        return {
          blockId: conn.targetBlockId,
          blockName: targetBlock?.name || 'Unknown',
          port: targetBlock?.inputs?.[conn.targetPortIndex] || `input${conn.targetPortIndex}`,
          connectionId: conn.id
        };
      })
    };
  });

  return successResponse({
    modelId,
    sheetId,
    blockId,
    blockType: block.type,
    blockName: block.name,
    ports: {
      inputs: inputPorts,
      outputs: outputPorts,
      summary: {
        totalInputs: inputPorts.length,
        connectedInputs: inputPorts.filter((p: any) => p.connected).length,
        totalOutputs: outputPorts.length,
        totalOutgoingConnections: outputPorts.reduce((sum: number, p: any) => sum + p.connectionCount, 0)
      }
    }
  });
}
