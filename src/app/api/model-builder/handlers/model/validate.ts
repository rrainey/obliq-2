// handlers/model/validate.ts
// Model validation action handler (VALIDATE_MODEL)

import { NextResponse } from 'next/server';
import { HandlerContext } from '@/lib/api-support/types';
import { successResponse, ErrorResponses } from '@/lib/api-support/responses';
import { BlockTypes, isValidBlockType } from '@/lib/blockTypeRegistry';
import { validateBlockParameters } from '@/lib/blockParameterValidator';

/**
 * VALIDATE_MODEL - Validate a model's structure and connections
 */
export async function handleValidateModel(ctx: HandlerContext): Promise<NextResponse> {
  const { supabase, body } = ctx;
  const modelId = body?.modelId || ctx.modelId;

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

  // Extract model data
  const modelData = versionData.data;
  const sheets = modelData.sheets || [];

  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate model has at least one sheet
  if (sheets.length === 0) {
    errors.push('Model must have at least one sheet');
  }

  // Validate each sheet
  sheets.forEach((sheet: any, sheetIndex: number) => {
    const blocks = sheet.blocks || [];
    const connections = sheet.connections || [];

    // Check for empty sheets
    if (blocks.length === 0) {
      warnings.push(`Sheet '${sheet.name}' (${sheet.id}) has no blocks`);
    }

    // Validate blocks
    blocks.forEach((block: any) => {
      // Check for missing required properties
      if (!block.id) {
        errors.push(`Block at index ${blocks.indexOf(block)} in sheet '${sheet.name}' has no ID`);
      }
      if (!block.type) {
        errors.push(`Block '${block.id || 'unknown'}' in sheet '${sheet.name}' has no type`);
      }
      if (!block.name) {
        warnings.push(`Block '${block.id}' in sheet '${sheet.name}' has no name`);
      }

      // Validate block parameters based on type
      if (block.type && isValidBlockType(block.type)) {
        const validation = validateBlockParameters(block.type, block.parameters || {});
        if (!validation.valid) {
          validation.errors.forEach((error: string) => {
            errors.push(`Block '${block.name || block.id}' (${block.type}) in sheet '${sheet.name}': ${error}`);
          });
        }
      }
    });

    // Validate connections
    connections.forEach((conn: any, connIndex: number) => {
      // Check connection structure - require port indices
      if (!conn.sourceBlockId || conn.sourcePortIndex === undefined || !conn.targetBlockId || conn.targetPortIndex === undefined) {
        errors.push(`Connection at index ${connIndex} in sheet '${sheet.name}' is incomplete (missing block IDs or port indices)`);
        return;
      }

      // Check if referenced blocks exist
      const sourceBlock = blocks.find((b: any) => b.id === conn.sourceBlockId);
      const targetBlock = blocks.find((b: any) => b.id === conn.targetBlockId);

      if (!sourceBlock) {
        errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references non-existent source block '${conn.sourceBlockId}'`);
      }
      if (!targetBlock) {
        errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references non-existent target block '${conn.targetBlockId}'`);
      }

      // Check if port indices are valid
      if (sourceBlock && (!sourceBlock.outputs || conn.sourcePortIndex < 0 || conn.sourcePortIndex >= sourceBlock.outputs.length)) {
        errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references invalid output port index ${conn.sourcePortIndex} on block '${sourceBlock.name || sourceBlock.id}'`);
      }
      if (targetBlock && (!targetBlock.inputs || conn.targetPortIndex < 0 || conn.targetPortIndex >= targetBlock.inputs.length)) {
        errors.push(`Connection '${conn.id || connIndex}' in sheet '${sheet.name}' references invalid input port index ${conn.targetPortIndex} on block '${targetBlock.name || targetBlock.id}'`);
      }
    });

    // Check for multiple connections to same input port
    const inputPortUsage = new Map<string, number>();
    connections.forEach((conn: any) => {
      const key = `${conn.targetBlockId}:${conn.targetPortIndex}`;
      inputPortUsage.set(key, (inputPortUsage.get(key) || 0) + 1);
    });

    inputPortUsage.forEach((count, key) => {
      if (count > 1) {
        const [blockId, port] = key.split(':');
        const block = blocks.find((b: any) => b.id === blockId);
        errors.push(`Input port '${port}' on block '${block?.name || blockId}' in sheet '${sheet.name}' has ${count} connections (only 1 allowed)`);
      }
    });

    // Validate Sheet Labels
    const sheetLabelSinks = blocks.filter((b: any) => b.type === BlockTypes.SHEET_LABEL_SINK);
    const sheetLabelSources = blocks.filter((b: any) => b.type === BlockTypes.SHEET_LABEL_SOURCE);

    // Check for duplicate sheet label sink names
    const sinkNames = new Map<string, number>();
    sheetLabelSinks.forEach((sink: any) => {
      const signalName = sink.parameters?.signalName;
      if (signalName) {
        sinkNames.set(signalName, (sinkNames.get(signalName) || 0) + 1);
      }
    });

    sinkNames.forEach((count, name) => {
      if (count > 1) {
        errors.push(`Sheet label signal name '${name}' is used by ${count} sink blocks in sheet '${sheet.name}' (must be unique)`);
      }
    });

    // Check for sources without matching sinks
    sheetLabelSources.forEach((source: any) => {
      const signalName = source.parameters?.signalName;
      if (signalName && !sinkNames.has(signalName)) {
        errors.push(`Sheet label source '${source.name || source.id}' in sheet '${sheet.name}' references unknown signal '${signalName}'`);
      }
    });

    // Check for unconnected required ports
    blocks.forEach((block: any) => {
      // Check for blocks that typically need inputs
      if (['sum', 'multiply', 'scale', 'transfer_function', 'output_port', 'signal_display', 'signal_logger'].includes(block.type)) {
        const hasInputConnection = connections.some((conn: any) => conn.targetBlockId === block.id);
        if (!hasInputConnection) {
          warnings.push(`Block '${block.name || block.id}' (${block.type}) in sheet '${sheet.name}' has no input connections`);
        }
      }
    });
  });

  // Check for model-level issues
  if (!modelData.globalSettings) {
    warnings.push('Model has no global settings defined');
  }

  const isValid = errors.length === 0;

  return successResponse({
    modelId,
    isValid,
    errors,
    warnings,
    summary: {
      sheetCount: sheets.length,
      totalBlocks: sheets.reduce((sum: number, sheet: any) => sum + (sheet.blocks?.length || 0), 0),
      totalConnections: sheets.reduce((sum: number, sheet: any) => sum + (sheet.connections?.length || 0), 0),
      errorCount: errors.length,
      warningCount: warnings.length
    }
  });
}
