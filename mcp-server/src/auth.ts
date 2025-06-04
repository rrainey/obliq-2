// mcp-server/src/auth.ts
import { config } from './config.js';

export interface AuthContext {
  authenticated: boolean;
  error?: string;
}

/**
 * Validates the MCP API token
 * @param token - Token provided by the MCP client
 * @returns Authentication context
 */
export function validateMCPToken(token: string | undefined): AuthContext {
  // If no token is configured, authentication is disabled
  if (!config.apiToken) {
    return { authenticated: true };
  }
  
  // Token is required but not provided
  if (!token) {
    return { 
      authenticated: false, 
      error: 'Authentication required but no token provided' 
    };
  }
  
  // Validate the token
  if (token !== config.apiToken) {
    return { 
      authenticated: false, 
      error: 'Invalid authentication token' 
    };
  }
  
  return { authenticated: true };
}

/**
 * Extracts token from various possible locations in MCP context
 * @param params - Tool parameters that might contain auth info
 * @param metadata - Request metadata that might contain auth info
 * @returns Extracted token or undefined
 */
export function extractToken(params?: any, metadata?: any): string | undefined {
  // Check for token in params (some MCP clients might put it there)
  if (params?.auth?.token) {
    return params.auth.token;
  }
  
  // Check for token in a special _auth parameter
  if (params?._auth) {
    return params._auth;
  }
  
  // Check for token in metadata
  if (metadata?.token) {
    return metadata.token;
  }
  
  // Check for Authorization header style in metadata
  if (metadata?.authorization) {
    const auth = metadata.authorization;
    if (auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    return auth;
  }
  
  return undefined;
}

/**
 * Middleware for authenticating MCP requests
 * @param toolName - Name of the tool being called
 * @param params - Tool parameters
 * @param metadata - Request metadata
 * @returns Authentication result
 */
export function authenticateRequest(
  toolName: string, 
  params?: any, 
  metadata?: any
): AuthContext {
  if (config.debug) {
    console.error(`[Auth] Authenticating request for tool: ${toolName}`);
  }
  
  const token = extractToken(params, metadata);
  const result = validateMCPToken(token);
  
  if (config.debug) {
    console.error(`[Auth] Authentication result:`, {
      tool: toolName,
      hasToken: !!token,
      authenticated: result.authenticated,
      error: result.error
    });
  }
  
  return result;
}