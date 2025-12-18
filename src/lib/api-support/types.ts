// lib/api-support/types.ts
// Shared types for the Model Builder API

import { NextRequest, NextResponse } from 'next/server';

/**
 * Model Builder API action constants
 */
export const ModelBuilderActions = {
  // Model operations
  GET_MODEL: 'getModel',
  GET_MODEL_METADATA: 'getModelMetadata',
  CREATE_MODEL: 'createModel',
  UPDATE_MODEL_NAME: 'updateModelName',
  VALIDATE_MODEL: 'validateModel',

  // Sheet operations
  LIST_SHEETS: 'listSheets',
  CREATE_SHEET: 'createSheet',
  RENAME_SHEET: 'renameSheet',
  DELETE_SHEET: 'deleteSheet',
  CLONE_SHEET: 'cloneSheet',
  CLEAR_SHEET: 'clearSheet',
  IMPORT_SHEET: 'importSheet',
  EXPORT_SHEET: 'exportSheet',

  // Block operations
  LIST_BLOCKS: 'listBlocks',
  GET_BLOCK: 'getBlock',
  ADD_BLOCK: 'addBlock',
  UPDATE_BLOCK_POSITION: 'updateBlockPosition',
  UPDATE_BLOCK_NAME: 'updateBlockName',
  UPDATE_BLOCK_PARAMETERS: 'updateBlockParameters',
  DELETE_BLOCK: 'deleteBlock',
  GET_BLOCK_PORTS: 'getBlockPorts',

  // Connection operations
  LIST_CONNECTIONS: 'listConnections',
  GET_CONNECTION: 'getConnection',
  ADD_CONNECTION: 'addConnection',
  DELETE_CONNECTION: 'deleteConnection',

  // Parameter operations (model-level)
  LIST_PARAMETERS: 'listParameters',
  SET_PARAMETER: 'setParameter',
  DELETE_PARAMETER: 'deleteParameter',

  // Block parameter operations (subsystem parameters)
  LIST_BLOCK_PARAMETERS: 'listBlockParameters',
  GET_BLOCK_PARAMETER: 'getBlockParameter',
  ADD_BLOCK_PARAMETER: 'addBlockParameter',
  UPDATE_BLOCK_PARAMETER: 'updateBlockParameter',
  DELETE_BLOCK_PARAMETER: 'deleteBlockParameter',

  // Batch operations
  BATCH_OPERATIONS: 'batchOperations'
} as const;

export type ModelBuilderAction = typeof ModelBuilderActions[keyof typeof ModelBuilderActions];

/**
 * Result type for finding sheets (including nested subsystem sheets)
 */
export interface SheetSearchResult {
  sheet: any;
  sheetIndex: number;
  parentArray: any[];  // The array containing this sheet (for mutations)
  parentBlock?: any;   // If this is a subsystem sheet, the parent subsystem block
  path: string[];      // Path to this sheet for debugging
}

/**
 * Authentication result from API middleware
 */
export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  error?: string;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * Context passed to action handlers
 */
export interface HandlerContext {
  request: NextRequest;
  supabase: any;  // SupabaseClient
  userId: string;
  token: string;
  startTime: number;
  modelId?: string;
  sheetId?: string;
  blockId?: string;
  connectionId?: string;
  body?: any;
  searchParams?: URLSearchParams;
}

/**
 * Standard API response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  timestamp: string;
  data?: T;
  error?: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Action handler function type
 */
export type ActionHandler = (ctx: HandlerContext) => Promise<NextResponse>;

/**
 * Handler registry entry
 */
export interface HandlerRegistryEntry {
  action: ModelBuilderAction;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: ActionHandler;
}
