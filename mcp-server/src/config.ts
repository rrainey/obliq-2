// mcp-server/src/config.ts
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  port: number;
  apiBaseUrl: string;
  // User-specific API token for authentication (generated via /api/tokens)
  // This token identifies the user and scopes all API access to that user's data
  apiToken: string;
  debug: boolean;
}

export const config: Config = {
  port: parseInt(process.env.MCP_SERVER_PORT || '3001', 10),
  apiBaseUrl: process.env.MCP_API_BASE_URL || 'http://localhost:3000',
  // Support multiple env var names for backwards compatibility during migration
  apiToken: process.env.MCP_API_TOKEN || process.env.MODEL_BUILDER_API_TOKEN || process.env.AUTOMATION_API_TOKEN || '',
  debug: process.env.MCP_DEBUG === 'true'
};

// Helper to get masked config for logging
export function getMaskedConfig(): Record<string, any> {
  return {
    port: config.port,
    apiBaseUrl: config.apiBaseUrl,
    apiToken: config.apiToken ? '***' + config.apiToken.slice(-4) : 'NOT SET',
    debug: config.debug
  };
}