// lib/api-support/auth.ts
// Authentication and rate limiting utilities for the Model Builder API

import { NextRequest, NextResponse } from 'next/server';
import { HandlerContext, RateLimitResult } from './types';
import { modelBuilderApiMetrics } from '@/lib/modelBuilderApiMetrics';
import {
  InvalidModelFileError,
  ModelConflictError,
  ModelFileMissingError,
  ModelNotFoundError,
  type ModelRecord,
  type Storage,
} from '@/lib/server/storage';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 1000; // 1000 requests per minute (increased for testing)

// In-memory rate limit store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Check if a request is within rate limits
 */
export function checkRateLimit(token: string): RateLimitResult {
  const now = Date.now();
  const limiter = rateLimitStore.get(token);

  if (!limiter || now > limiter.resetTime) {
    // New window or expired window
    rateLimitStore.set(token, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true };
  }

  if (limiter.count >= RATE_LIMIT_MAX_REQUESTS) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((limiter.resetTime - now) / 1000); // seconds
    return { allowed: false, retryAfter };
  }

  // Increment counter
  limiter.count++;
  return { allowed: true };
}

/**
 * Start cleanup interval for rate limit store
 * Call this once at module initialization
 */
export function startRateLimitCleanup(): NodeJS.Timeout {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [token, limiter] of rateLimitStore.entries()) {
      if (now > limiter.resetTime + RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(token);
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  // Don't keep the process alive just for cleanup (scripts, tests).
  timer.unref?.();
  return timer;
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  // Also support raw token for backward compatibility during transition
  return authHeader;
}

/**
 * Create rate limit exceeded response
 */
export function rateLimitExceededResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter)
      }
    }
  );
}

/**
 * Create unauthorized response for missing auth header
 */
export function missingAuthResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Missing Authorization header. Use: Authorization: Bearer <token>',
      code: 'MISSING_AUTH_HEADER'
    },
    { status: 401 }
  );
}

/**
 * Create unauthorized response for failed authentication
 */
export function unauthorizedResponse(error?: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      timestamp: new Date().toISOString(),
      error: error || 'Authentication failed',
      code: 'UNAUTHORIZED'
    },
    { status: 401 }
  );
}

/**
 * Log an API request for monitoring
 */
export function logRequest(
  method: string,
  action: string | null,
  params: Record<string, any>,
  startTime: number,
  response: { success: boolean; status: number; error?: string }
): void {
  const duration = Date.now() - startTime;
  const timestamp = new Date().toISOString();

  // Errors handled here also count in the API metrics (successful requests
  // are recorded where the route dispatches them)
  modelBuilderApiMetrics.record(method, action || 'none', duration, response.success, response.status, response.error);

  console.log(JSON.stringify({
    timestamp,
    api: 'model-builder',
    method,
    action: action || 'none',
    params: {
      ...params,
      token: params.token ? '***' : undefined // Mask token
    },
    response: {
      success: response.success,
      status: response.status,
      ...(response.error && { error: response.error })
    },
    duration_ms: duration
  }));
}

// Start cleanup on module load
startRateLimitCleanup();

/**
 * Result of loading a model for an API handler
 */
export interface ModelAccessResult {
  authorized: boolean;
  model?: ModelRecord;
  /** Current model content. `version` is the latest recorded snapshot number. */
  versionData?: { model_id: string; version: number; data: any; hash: string; created_at: string };
  errorResponse?: NextResponse;
}

/**
 * Map storage-layer errors to API responses. Returns null for unknown errors.
 */
export function storageErrorResponse(error: unknown): NextResponse | null {
  const respond = (status: number, code: string, message: string, details?: Record<string, any>) =>
    NextResponse.json(
      { success: false, timestamp: new Date().toISOString(), error: message, code, ...(details && { details }) },
      { status }
    );
  if (error instanceof ModelNotFoundError) {
    return respond(404, 'MODEL_NOT_FOUND', 'Model not found', { modelId: error.modelId });
  }
  if (error instanceof ModelFileMissingError) {
    return respond(404, 'MODEL_FILE_MISSING', error.message, { modelId: error.modelId, filePath: error.filePath });
  }
  if (error instanceof ModelConflictError) {
    return respond(409, 'MODEL_CONFLICT', error.message, { modelId: error.modelId, currentHash: error.currentHash });
  }
  if (error instanceof InvalidModelFileError) {
    return respond(422, 'INVALID_MODEL_FILE', error.message);
  }
  return null;
}

function accessFailure(error: unknown): ModelAccessResult {
  const response = storageErrorResponse(error);
  if (!response) throw error;
  return { authorized: false, errorResponse: response };
}

/**
 * Load a model's index record (no file read). Single-user: existence is the
 * only access check.
 */
export function loadModel(storage: Storage, modelId: string): ModelAccessResult {
  try {
    return { authorized: true, model: storage.models.require(modelId) };
  } catch (error) {
    return accessFailure(error);
  }
}

/**
 * Load a model's record and current content from its model file.
 */
export function loadModelData(storage: Storage, modelId: string): ModelAccessResult {
  try {
    const current = storage.models.readCurrent(modelId);
    return {
      authorized: true,
      model: current.record,
      versionData: {
        model_id: modelId,
        version: current.record.latest_version,
        data: current.data,
        hash: current.hash,
        created_at: current.record.updated_at,
      },
    };
  } catch (error) {
    return accessFailure(error);
  }
}

export type PersistResult =
  | { ok: true; version: number | null; latestVersion: number; hash: string }
  | { ok: false; errorResponse: NextResponse };

/**
 * Persist a mutated model from a Model Builder handler.
 *
 * Writes model.json in place. A version snapshot is recorded only when the
 * caller asks for one with `checkpoint: true` (JSON body) or
 * `?checkpoint=true` (query string). `baseHash` should be the hash returned
 * by loadModelData so concurrent edits surface as 409 instead of being lost.
 */
export function persistModelData(
  ctx: HandlerContext,
  modelId: string,
  data: any,
  baseHash: string | undefined
): PersistResult {
  const checkpoint =
    ctx.body?.checkpoint === true || ctx.searchParams?.get('checkpoint') === 'true';
  try {
    const result = ctx.storage.models.writeInPlace(modelId, data, {
      baseHash,
      checkpoint,
      note: checkpoint ? 'api checkpoint' : undefined,
    });
    return { ok: true, version: result.version, latestVersion: result.record.latest_version, hash: result.hash };
  } catch (error) {
    const response = storageErrorResponse(error);
    if (!response) {
      console.error('Failed to persist model:', error);
      return {
        ok: false,
        errorResponse: NextResponse.json(
          { success: false, timestamp: new Date().toISOString(), error: 'Failed to save model', code: 'SAVE_FAILED' },
          { status: 500 }
        ),
      };
    }
    return { ok: false, errorResponse: response };
  }
}
