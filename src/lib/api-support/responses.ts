// lib/api-support/responses.ts
// Standard response helpers for the Model Builder API

import { NextResponse } from 'next/server';

/**
 * Create a successful API response
 */
export function successResponse<T = any>(data: T, status: number = 200): NextResponse {
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    data
  }, { status });
}

/**
 * Create a generic error response
 */
export function errorResponse(error: string, code?: string, status: number = 400): NextResponse {
  return NextResponse.json({
    success: false,
    timestamp: new Date().toISOString(),
    error,
    ...(code && { code })
  }, { status });
}

/**
 * Standard error response factories
 */
export const ErrorResponses = {
  missingParameter: (param: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: `Missing required parameter: ${param}`,
      code: 'MISSING_PARAMETER'
    }, { status: 400 }),

  invalidParameter: (param: string, reason?: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: reason ? `Invalid parameter '${param}': ${reason}` : `Invalid parameter: ${param}`,
      code: 'INVALID_PARAMETER'
    }, { status: 400 }),

  modelNotFound: (modelId: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Model not found',
      code: 'MODEL_NOT_FOUND',
      details: { modelId }
    }, { status: 404 }),

  sheetNotFound: (sheetId: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Sheet not found',
      code: 'SHEET_NOT_FOUND',
      details: { sheetId }
    }, { status: 404 }),

  blockNotFound: (blockId: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Block not found',
      code: 'BLOCK_NOT_FOUND',
      details: { blockId }
    }, { status: 404 }),

  connectionNotFound: (connectionId: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Connection not found',
      code: 'CONNECTION_NOT_FOUND',
      details: { connectionId }
    }, { status: 404 }),

  parameterNotFound: (paramName: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Parameter not found',
      code: 'PARAMETER_NOT_FOUND',
      details: { paramName }
    }, { status: 404 }),

  duplicateEntity: (entityType: string, identifier: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: `${entityType} already exists: ${identifier}`,
      code: 'DUPLICATE_ENTITY',
      details: { entityType, identifier }
    }, { status: 409 }),

  validationError: (errors: string[]) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: { errors }
    }, { status: 400 }),

  serverError: (details?: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Internal server error',
      code: 'SERVER_ERROR',
      ...(details && { details: { message: details } })
    }, { status: 500 }),

  databaseError: (operation: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: `Database operation failed: ${operation}`,
      code: 'DATABASE_ERROR'
    }, { status: 500 }),

  unknownAction: (action: string) =>
    NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: `Unknown action: ${action}`,
      code: 'UNKNOWN_ACTION'
    }, { status: 400 })
};
