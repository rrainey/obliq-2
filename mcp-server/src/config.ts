// mcp-server/src/config.ts
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  port: number;
  apiBaseUrl: string;
  automationToken: string;
  modelBuilderToken: string;
  apiToken?: string;
  debug: boolean;
}

export const config: Config = {
  port: parseInt(process.env.MCP_SERVER_PORT || '3001', 10),
  apiBaseUrl: process.env.MCP_API_BASE_URL || 'http://localhost:3000',
  automationToken: process.env.AUTOMATION_API_TOKEN || '',
  modelBuilderToken: process.env.MODEL_BUILDER_API_TOKEN || '',
  apiToken: process.env.MCP_API_TOKEN,
  debug: process.env.MCP_DEBUG === 'true'
};

// Helper to get masked config for logging
export function getMaskedConfig(): Record<string, any> {
  return {
    port: config.port,
    apiBaseUrl: config.apiBaseUrl,
    automationToken: config.automationToken ? '***' + config.automationToken.slice(-4) : 'NOT SET',
    modelBuilderToken: config.modelBuilderToken ? '***' + config.modelBuilderToken.slice(-4) : 'NOT SET',
    apiToken: config.apiToken ? '***' + config.apiToken.slice(-4) : 'NOT SET',
    debug: config.debug
  };
}