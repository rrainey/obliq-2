// lib/api-support/auth.ts
// Authentication and rate limiting utilities for the Model Builder API

import { NextRequest, NextResponse } from 'next/server';
import { RateLimitResult } from './types';

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
  return setInterval(() => {
    const now = Date.now();
    for (const [token, limiter] of rateLimitStore.entries()) {
      if (now > limiter.resetTime + RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(token);
      }
    }
  }, 5 * 60 * 1000); // Every 5 minutes
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
 * Result of model ownership verification
 */
export interface ModelOwnershipResult {
  authorized: boolean;
  model?: any;
  versionData?: any;
  errorResponse?: NextResponse;
}

/**
 * Verify that the requesting user owns the specified model.
 * This is the central authorization check for all model operations.
 *
 * @param supabase - Supabase client instance
 * @param modelId - The model ID to check
 * @param userId - The authenticated user's ID
 * @returns ModelOwnershipResult with authorization status and model data if authorized
 */
export async function verifyModelOwnership(
  supabase: any,
  modelId: string,
  userId: string
): Promise<ModelOwnershipResult> {
  // Fetch the model and verify ownership in a single query
  const { data: model, error } = await supabase
    .from('models')
    .select('*')
    .eq('id', modelId)
    .eq('user_id', userId)
    .single();

  if (error || !model) {
    // Check if model exists but belongs to another user
    const { data: existingModel } = await supabase
      .from('models')
      .select('id')
      .eq('id', modelId)
      .single();

    if (existingModel) {
      // Model exists but user doesn't own it - return 403
      return {
        authorized: false,
        errorResponse: NextResponse.json(
          {
            success: false,
            timestamp: new Date().toISOString(),
            error: 'Access denied: You do not have permission to access this model',
            code: 'FORBIDDEN'
          },
          { status: 403 }
        )
      };
    } else {
      // Model doesn't exist - return 404
      return {
        authorized: false,
        errorResponse: NextResponse.json(
          {
            success: false,
            timestamp: new Date().toISOString(),
            error: 'Model not found',
            code: 'MODEL_NOT_FOUND',
            details: { modelId }
          },
          { status: 404 }
        )
      };
    }
  }

  return {
    authorized: true,
    model
  };
}

/**
 * Verify model ownership and fetch the latest version data.
 * Combines ownership check with version data retrieval for efficiency.
 *
 * @param supabase - Supabase client instance
 * @param modelId - The model ID to check
 * @param userId - The authenticated user's ID
 * @returns ModelOwnershipResult with model and version data if authorized
 */
export async function verifyModelOwnershipWithVersion(
  supabase: any,
  modelId: string,
  userId: string
): Promise<ModelOwnershipResult> {
  // First verify ownership
  const ownershipResult = await verifyModelOwnership(supabase, modelId, userId);

  if (!ownershipResult.authorized) {
    return ownershipResult;
  }

  // Fetch the latest version data
  const { data: versionData, error: versionError } = await supabase
    .from('model_versions')
    .select('*')
    .eq('model_id', modelId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !versionData) {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          error: 'Model version data not found',
          code: 'VERSION_NOT_FOUND',
          details: { modelId }
        },
        { status: 404 }
      )
    };
  }

  return {
    authorized: true,
    model: ownershipResult.model,
    versionData
  };
}
