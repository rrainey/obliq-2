// handlers/block/model-reference.ts
// Model reference actions (ADD_MODEL_REFERENCE, SET_MODEL_REFERENCE)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, errorResponse, ErrorResponses } from '@/lib/api-support/responses';
import { findSheetRecursively } from '@/lib/api-support/sheet-search';
import { createBlock } from '@/lib/blockFactory';
import { loadModelData, persistModelData } from '@/lib/api-support/auth';
import { isModelReference, modelInterface, modelRefOf, remapReferencePorts } from '@/lib/modelReferences';
import { ModelReferenceError, storageModelLoader } from '@/lib/server/modelReferenceLoader';

/** Loads the referenced model, or returns an error response. */
function loadTarget(ctx: HandlerContext, hostId: string, referencedModelId: unknown, version: unknown) {
  if (typeof referencedModelId !== 'string' || !referencedModelId) {
    return { error: ErrorResponses.missingParameter('referencedModelId') };
  }
  if (referencedModelId === hostId) {
    return { error: errorResponse('A model cannot reference itself', 'INVALID_REFERENCE', 400) };
  }
  if (version != null && !(Number.isInteger(version) && (version as number) > 0)) {
    return { error: errorResponse('version must be a positive integer, or null for the latest save', 'INVALID_PARAMETER', 400) };
  }
  try {
    const target = storageModelLoader(ctx.storage)({ modelId: referencedModelId, version: (version as number) ?? null });
    return { target };
  } catch (e) {
    const status = e instanceof ModelReferenceError ? 404 : 500;
    return { error: errorResponse((e as Error).message, 'REFERENCED_MODEL_NOT_FOUND', status) };
  }
}

/**
 * ADD_MODEL_REFERENCE - Add a block that embeds another saved model.
 * Body: { modelId, sheetId, referencedModelId, version?, name?, position? }
 * version: a saved version to pin, or null/absent for the latest save.
 */
export async function handleAddModelReference(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, body } = ctx;
  const { modelId, sheetId, referencedModelId, version, name, position } = body || {};
  if (!modelId) return ErrorResponses.missingParameter('modelId');
  if (!sheetId) return ErrorResponses.missingParameter('sheetId');

  const loaded = loadTarget(ctx, modelId, referencedModelId, version);
  if (loaded.error) return loaded.error;
  const target = loaded.target!;

  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) return authResult.errorResponse!;
  const versionData = authResult.versionData!;
  const modelData = versionData.data;
  const sheetResult = findSheetRecursively(modelData.sheets || [], sheetId);
  if (!sheetResult) return ErrorResponses.sheetNotFound(sheetId);
  const sheet = sheetResult.sheet;

  // Default name: the referenced model's, made unique on the sheet
  const taken = new Set((sheet.blocks || []).map((b: any) => b.name));
  let blockName = typeof name === 'string' && name ? name : target.name.replace(/[^A-Za-z0-9_]/g, '_');
  if (taken.has(blockName)) {
    if (name) return errorResponse(`A block named "${blockName}" already exists on this sheet`, 'DUPLICATE_NAME', 409);
    const base = blockName;
    for (let i = 2; taken.has(blockName); i++) blockName = `${base}${i}`;
  }

  const iface = modelInterface(target.data);
  const block = createBlock('subsystem', { name: blockName, position: position || { x: 100, y: 100 } });
  block.parameters = {
    ...block.parameters,
    sheets: [],
    inputPorts: iface.inputs,
    outputPorts: iface.outputs,
    modelRef: { modelId: target.id, version: target.version, name: target.name },
    modelRefName: target.name,
  };
  sheet.blocks.push(block);

  const saved = persistModelData(ctx, modelId, modelData, versionData.hash);
  if (!saved.ok) return saved.errorResponse;
  return successResponse(
    {
      modelId,
      sheetId,
      newVersion: saved.version,
      hash: saved.hash,
      block: { id: block.id, type: block.type, name: block.name, position: block.position, parameters: block.parameters },
      ports: iface,
    },
    201
  );
}

/**
 * SET_MODEL_REFERENCE - Point a model reference at another model or version.
 * Body: { modelId, blockId, referencedModelId?, version?, dropMissingWires? }
 * Wires follow port names; a wire to a port the model does not have is an
 * error unless dropMissingWires is true (then those wires are removed).
 */
export async function handleSetModelReference(ctx: HandlerContext): Promise<NextResponse> {
  const { storage, body } = ctx;
  const { modelId, blockId, dropMissingWires } = body || {};
  if (!modelId) return ErrorResponses.missingParameter('modelId');
  if (!blockId) return ErrorResponses.missingParameter('blockId');

  const authResult = loadModelData(storage, modelId);
  if (!authResult.authorized) return authResult.errorResponse!;
  const versionData = authResult.versionData!;
  const modelData = versionData.data;

  // Find the block and the sheet holding it
  let found: { sheet: any; block: any } | null = null;
  const search = (sheets: any[]) => {
    for (const s of sheets || []) {
      for (const b of s.blocks || []) {
        if (b.id === blockId) found = { sheet: s, block: b };
        if (!found && Array.isArray(b.parameters?.sheets)) search(b.parameters.sheets);
      }
      if (found) return;
    }
  };
  search(modelData.sheets || []);
  if (!found) return ErrorResponses.blockNotFound(blockId);
  const { sheet, block } = found as { sheet: any; block: any };
  if (!isModelReference(block)) {
    return errorResponse(`Block "${block.name}" is not a model reference`, 'NOT_A_MODEL_REFERENCE', 400);
  }

  const current = modelRefOf(block);
  const nextId = body.referencedModelId ?? current?.modelId;
  const nextVersion = 'version' in body ? body.version : current?.version ?? null;
  const loaded = loadTarget(ctx, modelId, nextId, nextVersion);
  if (loaded.error) return loaded.error;
  const target = loaded.target!;

  const iface = modelInterface(target.data);
  let remap = remapReferencePorts(sheet.connections || [], block, iface);
  let removed = 0;
  if (remap.missing.length > 0) {
    if (!dropMissingWires) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          error: `Wires use ports model "${target.name}" does not have: ${[...new Set(remap.missing.map(m => m.port))].join(', ')}. Pass dropMissingWires: true to remove them.`,
          code: 'PORTS_REMOVED',
          details: { missing: remap.missing },
        },
        { status: 409 }
      );
    }
    const gone = new Set(remap.missing.map(m => `${m.kind}:${m.port}`));
    const cachedIn: string[] = block.parameters?.inputPorts || [];
    const cachedOut: string[] = block.parameters?.outputPorts || [];
    const kept = (sheet.connections || []).filter((c: any) => {
      const drop =
        (c.targetBlockId === block.id && gone.has(`input:${cachedIn[c.targetPortIndex] ?? `#${c.targetPortIndex + 1}`}`)) ||
        (c.sourceBlockId === block.id && gone.has(`output:${cachedOut[c.sourcePortIndex] ?? `#${c.sourcePortIndex + 1}`}`));
      if (drop) removed++;
      return !drop;
    });
    remap = remapReferencePorts(kept, block, iface);
  }
  sheet.connections = remap.connections;
  block.parameters = {
    ...block.parameters,
    sheets: [],
    inputPorts: iface.inputs,
    outputPorts: iface.outputs,
    modelRef: { modelId: target.id, version: target.version, name: target.name },
    modelRefName: target.name,
  };

  const saved = persistModelData(ctx, modelId, modelData, versionData.hash);
  if (!saved.ok) return saved.errorResponse;
  return successResponse({
    modelId,
    newVersion: saved.version,
    hash: saved.hash,
    block: { id: block.id, name: block.name, parameters: block.parameters },
    ports: iface,
    removedWires: removed,
  });
}
