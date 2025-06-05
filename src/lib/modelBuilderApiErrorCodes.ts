// lib/modelBuilderApiErrorCodes.ts

/**
 * Standardized error codes for Model Builder API
 */
export const ModelBuilderErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Request Validation
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_JSON: 'INVALID_JSON',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  
  // Resource Not Found
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  BLOCK_NOT_FOUND: 'BLOCK_NOT_FOUND',
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  
  // Model Constraints
  LAST_SHEET_ERROR: 'LAST_SHEET_ERROR',
  MAIN_SHEET_ERROR: 'MAIN_SHEET_ERROR',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  
  // Block Validation
  INVALID_BLOCK_TYPE: 'INVALID_BLOCK_TYPE',
  INVALID_POSITION: 'INVALID_POSITION',
  INVALID_NAME: 'INVALID_NAME',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  
  // Connection Validation
  INVALID_PORT: 'INVALID_PORT',
  PORT_ALREADY_CONNECTED: 'PORT_ALREADY_CONNECTED',
  SELF_CONNECTION: 'SELF_CONNECTION',
  DUPLICATE_CONNECTION: 'DUPLICATE_CONNECTION',
  INVALID_CONNECTION: 'INVALID_CONNECTION',
  
  // Operation Failures
  CREATE_FAILED: 'CREATE_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  
  // Specific Operation Failures
  CREATE_MODEL_FAILED: 'CREATE_MODEL_FAILED',
  VERSION_CREATE_FAILED: 'VERSION_CREATE_FAILED',
  CREATE_SHEET_FAILED: 'CREATE_SHEET_FAILED',
  RENAME_SHEET_FAILED: 'RENAME_SHEET_FAILED',
  DELETE_SHEET_FAILED: 'DELETE_SHEET_FAILED',
  ADD_BLOCK_FAILED: 'ADD_BLOCK_FAILED',
  UPDATE_POSITION_FAILED: 'UPDATE_POSITION_FAILED',
  UPDATE_NAME_FAILED: 'UPDATE_NAME_FAILED',
  UPDATE_PARAMETERS_FAILED: 'UPDATE_PARAMETERS_FAILED',
  DELETE_BLOCK_FAILED: 'DELETE_BLOCK_FAILED',
  ADD_CONNECTION_FAILED: 'ADD_CONNECTION_FAILED',
  DELETE_CONNECTION_FAILED: 'DELETE_CONNECTION_FAILED',
  
  // Version Management
  UPDATE_MODEL_FAILED: 'UPDATE_MODEL_FAILED',
  DELETE_VERSIONS_FAILED: 'DELETE_VERSIONS_FAILED',
  
  // Batch Operations
  INVALID_OPERATIONS: 'INVALID_OPERATIONS',
  EMPTY_OPERATIONS: 'EMPTY_OPERATIONS',
  TOO_MANY_OPERATIONS: 'TOO_MANY_OPERATIONS',
  MISSING_ACTION: 'MISSING_ACTION',
  OPERATION_FAILED: 'OPERATION_FAILED',
  OPERATION_ERROR: 'OPERATION_ERROR',
  
  // Server Errors
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
} as const;

export type ModelBuilderErrorCode = typeof ModelBuilderErrorCodes[keyof typeof ModelBuilderErrorCodes];

/**
 * Error code descriptions for documentation
 */
export const ErrorCodeDescriptions: Record<ModelBuilderErrorCode, string> = {
  // Authentication & Authorization
  UNAUTHORIZED: 'Invalid or missing API token',
  INVALID_TOKEN: 'The provided API token is not valid',
  
  // Request Validation
  INVALID_REQUEST: 'The request format is invalid',
  INVALID_JSON: 'The request body contains invalid JSON',
  MISSING_PARAMETER: 'A required parameter is missing',
  INVALID_PARAMETER: 'A parameter value is invalid',
  UNKNOWN_ACTION: 'The specified action is not recognized',
  
  // Resource Not Found
  MODEL_NOT_FOUND: 'The specified model does not exist',
  SHEET_NOT_FOUND: 'The specified sheet does not exist',
  BLOCK_NOT_FOUND: 'The specified block does not exist',
  CONNECTION_NOT_FOUND: 'The specified connection does not exist',
  
  // Model Constraints
  LAST_SHEET_ERROR: 'Cannot delete the last sheet in a model',
  MAIN_SHEET_ERROR: 'Cannot delete the main sheet',
  DUPLICATE_NAME: 'A resource with this name already exists',
  
  // Block Validation
  INVALID_BLOCK_TYPE: 'The specified block type is not valid',
  INVALID_POSITION: 'The block position is invalid',
  INVALID_NAME: 'The name does not follow C-style identifier rules',
  VALIDATION_FAILED: 'Parameter validation failed',
  
  // Connection Validation
  INVALID_PORT: 'The specified port does not exist on the block',
  PORT_ALREADY_CONNECTED: 'The input port already has a connection',
  SELF_CONNECTION: 'Cannot connect a block to itself',
  DUPLICATE_CONNECTION: 'This connection already exists',
  INVALID_CONNECTION: 'The connection is not valid',
  
  // Operation Failures
  CREATE_FAILED: 'Failed to create the resource',
  UPDATE_FAILED: 'Failed to update the resource',
  DELETE_FAILED: 'Failed to delete the resource',
  
  // Specific Operation Failures
  CREATE_MODEL_FAILED: 'Failed to create the model',
  VERSION_CREATE_FAILED: 'Failed to create model version',
  CREATE_SHEET_FAILED: 'Failed to create the sheet',
  RENAME_SHEET_FAILED: 'Failed to rename the sheet',
  DELETE_SHEET_FAILED: 'Failed to delete the sheet',
  ADD_BLOCK_FAILED: 'Failed to add the block',
  UPDATE_POSITION_FAILED: 'Failed to update block position',
  UPDATE_NAME_FAILED: 'Failed to update block name',
  UPDATE_PARAMETERS_FAILED: 'Failed to update block parameters',
  DELETE_BLOCK_FAILED: 'Failed to delete the block',
  ADD_CONNECTION_FAILED: 'Failed to add the connection',
  DELETE_CONNECTION_FAILED: 'Failed to delete the connection',
  
  // Version Management
  UPDATE_MODEL_FAILED: 'Failed to update model version',
  DELETE_VERSIONS_FAILED: 'Failed to delete model versions',
  
  // Batch Operations
  INVALID_OPERATIONS: 'The operations array is invalid',
  EMPTY_OPERATIONS: 'The operations array cannot be empty',
  TOO_MANY_OPERATIONS: 'Too many operations in batch',
  MISSING_ACTION: 'Operation is missing the action field',
  OPERATION_FAILED: 'The operation failed',
  OPERATION_ERROR: 'An error occurred during the operation',
  
  // Server Errors
  SERVER_ERROR: 'An internal server error occurred',
  DATABASE_ERROR: 'A database error occurred'
};

/**
 * Get HTTP status code for error code
 */
export function getStatusCodeForError(errorCode: ModelBuilderErrorCode): number {
  switch (errorCode) {
    case ModelBuilderErrorCodes.UNAUTHORIZED:
    case ModelBuilderErrorCodes.INVALID_TOKEN:
      return 401;
      
    case ModelBuilderErrorCodes.MODEL_NOT_FOUND:
    case ModelBuilderErrorCodes.SHEET_NOT_FOUND:
    case ModelBuilderErrorCodes.BLOCK_NOT_FOUND:
    case ModelBuilderErrorCodes.CONNECTION_NOT_FOUND:
      return 404;
      
    case ModelBuilderErrorCodes.SERVER_ERROR:
    case ModelBuilderErrorCodes.DATABASE_ERROR:
    case ModelBuilderErrorCodes.CREATE_FAILED:
    case ModelBuilderErrorCodes.UPDATE_FAILED:
    case ModelBuilderErrorCodes.DELETE_FAILED:
    case ModelBuilderErrorCodes.CREATE_MODEL_FAILED:
    case ModelBuilderErrorCodes.VERSION_CREATE_FAILED:
    case ModelBuilderErrorCodes.CREATE_SHEET_FAILED:
    case ModelBuilderErrorCodes.RENAME_SHEET_FAILED:
    case ModelBuilderErrorCodes.DELETE_SHEET_FAILED:
    case ModelBuilderErrorCodes.ADD_BLOCK_FAILED:
    case ModelBuilderErrorCodes.UPDATE_POSITION_FAILED:
    case ModelBuilderErrorCodes.UPDATE_NAME_FAILED:
    case ModelBuilderErrorCodes.UPDATE_PARAMETERS_FAILED:
    case ModelBuilderErrorCodes.DELETE_BLOCK_FAILED:
    case ModelBuilderErrorCodes.ADD_CONNECTION_FAILED:
    case ModelBuilderErrorCodes.DELETE_CONNECTION_FAILED:
    case ModelBuilderErrorCodes.UPDATE_MODEL_FAILED:
    case ModelBuilderErrorCodes.DELETE_VERSIONS_FAILED:
      return 500;
      
    default:
      return 400;
  }
}