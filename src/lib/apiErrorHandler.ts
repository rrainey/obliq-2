import { NextResponse } from 'next/server'

export interface ApiError {
  message: string
  code?: string
  details?: any
  statusCode: number
}

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code?: string
  public readonly details?: any

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.name = 'AppError'
  }
}

// Common error types
export const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

// Centralized error response handler
export function createErrorResponse(error: unknown, context?: string): NextResponse {
  console.error(`API Error${context ? ` in ${context}` : ''}:`, error)

  // Handle known AppError instances
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
        timestamp: new Date().toISOString()
      },
      { status: error.statusCode }
    )
  }

  // Handle Supabase database errors
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as any
    
    switch (dbError.code) {
      case 'PGRST116': // Row not found
        return NextResponse.json(
          {
            success: false,
            error: 'Resource not found',
            code: ErrorTypes.NOT_FOUND,
            timestamp: new Date().toISOString()
          },
          { status: 404 }
        )
      
      case '42501': // Insufficient privilege
        return NextResponse.json(
          {
            success: false,
            error: 'Access denied',
            code: ErrorTypes.FORBIDDEN,
            timestamp: new Date().toISOString()
          },
          { status: 403 }
        )
      
      default:
        return NextResponse.json(
          {
            success: false,
            error: 'Database operation failed',
            code: ErrorTypes.DATABASE_ERROR,
            details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
            timestamp: new Date().toISOString()
          },
          { status: 500 }
        )
    }
  }

  // Handle validation errors (from Zod or similar)
  if (error && typeof error === 'object' && 'issues' in error) {
    const validationError = error as any
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        code: ErrorTypes.VALIDATION_ERROR,
        details: validationError.issues || validationError.errors,
        timestamp: new Date().toISOString()
      },
      { status: 400 }
    )
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An error occurred',
        code: ErrorTypes.INTERNAL_ERROR,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }

  // Handle unknown error types
  return NextResponse.json(
    {
      success: false,
      error: 'An unexpected error occurred',
      code: ErrorTypes.INTERNAL_ERROR,
      timestamp: new Date().toISOString()
    },
    { status: 500 }
  )
}

// Async wrapper for API routes that automatically handles errors
export function withErrorHandling(
  handler: (request: any, params?: any) => Promise<NextResponse>,
  context?: string
) {
  return async (request: any, params?: any): Promise<NextResponse> => {
    try {
      return await handler(request, params)
    } catch (error) {
      return createErrorResponse(error, context)
    }
  }
}

// Input validation helper
export function validateRequiredFields(
  data: Record<string, any>, 
  requiredFields: string[]
): void {
  const missing = requiredFields.filter(field => 
    data[field] === undefined || data[field] === null || data[field] === ''
  )
  
  if (missing.length > 0) {
    throw new AppError(
      `Missing required fields: ${missing.join(', ')}`,
      400,
      ErrorTypes.VALIDATION_ERROR,
      { missingFields: missing }
    )
  }
}

// User-friendly error messages
export const UserFriendlyMessages = {
  [ErrorTypes.VALIDATION_ERROR]: 'Please check your input and try again',
  [ErrorTypes.NOT_FOUND]: 'The requested resource was not found',
  [ErrorTypes.UNAUTHORIZED]: 'Authentication required',
  [ErrorTypes.FORBIDDEN]: 'You do not have permission to perform this action',
  [ErrorTypes.DATABASE_ERROR]: 'A database error occurred. Please try again later',
  [ErrorTypes.EXTERNAL_SERVICE_ERROR]: 'An external service is currently unavailable',
  [ErrorTypes.INTERNAL_ERROR]: 'An internal error occurred. Please try again later'
}