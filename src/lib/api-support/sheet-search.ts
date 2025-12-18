// lib/api-support/sheet-search.ts
// Utilities for recursively searching through model sheet hierarchies

import { SheetSearchResult } from './types';

/**
 * Recursively find a sheet by ID, searching both top-level sheets and
 * sheets nested inside subsystem blocks' parameters.sheets arrays.
 *
 * @param sheets - Top-level sheets array to search
 * @param sheetId - ID of the sheet to find
 * @param path - Current path (for debugging/tracking)
 * @returns SheetSearchResult or null if not found
 */
export function findSheetRecursively(
  sheets: any[],
  sheetId: string,
  path: string[] = ['sheets']
): SheetSearchResult | null {
  // First, search top-level sheets
  const topLevelIndex = sheets.findIndex((s: any) => s.id === sheetId);
  if (topLevelIndex !== -1) {
    return {
      sheet: sheets[topLevelIndex],
      sheetIndex: topLevelIndex,
      parentArray: sheets,
      path: [...path, `[${topLevelIndex}]`]
    };
  }

  // Search nested sheets inside subsystem blocks
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const blocks = sheet.blocks || [];

    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[j];

      // If this is a subsystem with nested sheets, search recursively
      if (block.type === 'subsystem' && block.parameters?.sheets && Array.isArray(block.parameters.sheets)) {
        const nestedSheets = block.parameters.sheets;
        const nestedPath = [...path, `[${i}].blocks[${j}].parameters.sheets`];

        // Check direct children first
        const nestedIndex = nestedSheets.findIndex((s: any) => s.id === sheetId);
        if (nestedIndex !== -1) {
          return {
            sheet: nestedSheets[nestedIndex],
            sheetIndex: nestedIndex,
            parentArray: nestedSheets,
            parentBlock: block,
            path: [...nestedPath, `[${nestedIndex}]`]
          };
        }

        // Recurse deeper into nested subsystems
        const deepResult = findSheetRecursively(nestedSheets, sheetId, nestedPath);
        if (deepResult) {
          return deepResult;
        }
      }
    }
  }

  return null;
}

/**
 * Find the parent subsystem block that contains a given sheet ID.
 * This searches recursively through the model's sheet hierarchy.
 *
 * @param sheets - Top-level sheets array to search
 * @param sheetId - ID of the sheet to find the parent subsystem for
 * @returns The parent subsystem block and containing sheet, or null if top-level sheet
 */
export function findParentSubsystemForSheet(
  sheets: any[],
  sheetId: string
): { subsystemBlock: any; containingSheet: any } | null {
  for (const sheet of sheets) {
    if (!sheet.blocks) continue;

    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        // Check if the target sheet is directly in this subsystem
        const foundSheet = block.parameters.sheets.find((s: any) => s.id === sheetId);
        if (foundSheet) {
          return { subsystemBlock: block, containingSheet: sheet };
        }

        // Recursively search in nested subsystems
        const nestedResult = findParentSubsystemForSheet(block.parameters.sheets, sheetId);
        if (nestedResult) {
          return nestedResult;
        }
      }
    }
  }

  return null;
}

/**
 * Find a block by ID within a sheet (searches top-level blocks only)
 */
export function findBlockInSheet(sheet: any, blockId: string): { block: any; index: number } | null {
  const blocks = sheet.blocks || [];
  const index = blocks.findIndex((b: any) => b.id === blockId);
  if (index === -1) return null;
  return { block: blocks[index], index };
}

/**
 * Find a connection by ID within a sheet
 */
export function findConnectionInSheet(sheet: any, connectionId: string): { connection: any; index: number } | null {
  const connections = sheet.connections || [];
  const index = connections.findIndex((c: any) => c.id === connectionId);
  if (index === -1) return null;
  return { connection: connections[index], index };
}

/**
 * Get all sheets in a model, including nested subsystem sheets (flattened)
 */
export function getAllSheets(sheets: any[], result: any[] = []): any[] {
  for (const sheet of sheets) {
    result.push(sheet);

    // Search for nested sheets in subsystem blocks
    const blocks = sheet.blocks || [];
    for (const block of blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        getAllSheets(block.parameters.sheets, result);
      }
    }
  }
  return result;
}

/**
 * Get the path to a sheet for debugging/logging purposes
 */
export function getSheetPath(sheets: any[], sheetId: string): string {
  const result = findSheetRecursively(sheets, sheetId);
  return result ? result.path.join('') : 'not found';
}
