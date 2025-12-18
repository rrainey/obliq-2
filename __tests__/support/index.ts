// __tests__/support/index.ts
// Export all test support utilities

// Import everything first
import { TestApiClient } from './api-client';
import type { ApiResponse, CreateModelResponse, BlockResponse, ConnectionResponse } from './api-client';
import { TestDatabase, createTestDatabase } from './test-db';
import { McpToolSimulator, McpTools } from './mcp-simulator';
import type { BlockSpec, ConnectionSpec } from './mcp-simulator';

// Re-export classes and functions
export { TestApiClient };
export type { ApiResponse, CreateModelResponse, BlockResponse, ConnectionResponse };
export { TestDatabase, createTestDatabase };
export { McpToolSimulator, McpTools };
export type { BlockSpec, ConnectionSpec };

/**
 * Check if integration tests should run
 * Returns true if TEST_API_TOKEN is configured
 */
export function shouldRunIntegrationTests(): boolean {
  return !!process.env.TEST_API_TOKEN;
}

/**
 * Skip message for when integration tests are disabled
 */
export const INTEGRATION_SKIP_MESSAGE =
  'Integration tests skipped: TEST_API_TOKEN not configured. ' +
  'Set TEST_API_TOKEN in .env.local to run integration tests.';

/**
 * Create a configured test client
 * Throws if TEST_API_TOKEN is not set
 */
export function createTestClient(): TestApiClient {
  const token = process.env.TEST_API_TOKEN;
  if (!token) {
    throw new Error('TEST_API_TOKEN environment variable is required for integration tests');
  }
  return new TestApiClient(token);
}

/**
 * Generate a unique test model name
 */
export function uniqueModelName(prefix: string = 'Test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Wait for a specified duration (for rate limiting, etc.)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
