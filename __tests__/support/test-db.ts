// __tests__/support/test-db.ts
// Direct access to the local Obliq store for integration-test cleanup.
//
// Integration tests drive a running server via the HTTP API; this helper opens
// the same store ($OBLIQ_HOME, default ~/.config/obliq-2) to remove the models
// they created. Run the server and the tests with the same OBLIQ_HOME.

import { openStorage, type Storage } from '@/lib/server/storage';

export class TestDatabase {
  private storage: Storage | null = null;
  private createdModelIds: string[] = [];

  /**
   * Open the local store
   */
  async init(): Promise<void> {
    if (!this.storage) this.storage = openStorage();
  }

  /**
   * Track a model ID for cleanup
   */
  trackModel(modelId: string): void {
    if (!this.createdModelIds.includes(modelId)) {
      this.createdModelIds.push(modelId);
    }
  }

  /**
   * Get all tracked model IDs
   */
  getTrackedModels(): string[] {
    return [...this.createdModelIds];
  }

  /**
   * Clean up all tracked models
   */
  async cleanup(): Promise<{ deleted: string[]; errors: string[] }> {
    const deleted: string[] = [];
    const errors: string[] = [];
    for (const modelId of this.createdModelIds) {
      if (await this.deleteModel(modelId)) {
        deleted.push(modelId);
      } else if (await this.modelExists(modelId)) {
        errors.push(`Failed to delete model ${modelId}`);
      }
    }
    this.createdModelIds = [];
    this.storage?.db.close();
    this.storage = null;
    return { deleted, errors };
  }

  /**
   * Delete a specific model by ID
   */
  async deleteModel(modelId: string): Promise<boolean> {
    await this.init();
    this.createdModelIds = this.createdModelIds.filter(id => id !== modelId);
    try {
      this.storage!.models.delete(modelId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a model exists
   */
  async modelExists(modelId: string): Promise<boolean> {
    await this.init();
    return this.storage!.models.get(modelId) !== null;
  }

  /**
   * Get model version (snapshot) count
   */
  async getVersionCount(modelId: string): Promise<number> {
    await this.init();
    try {
      return this.storage!.models.listVersions(modelId).length;
    } catch {
      return -1;
    }
  }
}

/**
 * Create a test database instance with automatic initialization
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new TestDatabase();
  await db.init();
  return db;
}
