// __tests__/support/test-db.ts
// Test database management for integration tests

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class TestDatabase {
  private supabase: SupabaseClient | null = null;
  private createdModelIds: string[] = [];
  private initialized: boolean = false;

  /**
   * Initialize the test database connection
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials not configured - direct DB cleanup unavailable');
      this.initialized = true;
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.initialized = true;
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

    if (!this.supabase) {
      // If no direct DB access, models must be deleted via API
      console.warn('No direct DB access - cleanup must be done via API');
      return { deleted, errors };
    }

    for (const modelId of this.createdModelIds) {
      try {
        // Delete model versions first (foreign key constraint)
        const { error: versionsError } = await this.supabase
          .from('model_versions')
          .delete()
          .eq('model_id', modelId);

        if (versionsError) {
          errors.push(`Failed to delete versions for ${modelId}: ${versionsError.message}`);
          continue;
        }

        // Delete the model
        const { error: modelError } = await this.supabase
          .from('models')
          .delete()
          .eq('id', modelId);

        if (modelError) {
          errors.push(`Failed to delete model ${modelId}: ${modelError.message}`);
          continue;
        }

        deleted.push(modelId);
      } catch (err) {
        errors.push(`Exception deleting ${modelId}: ${err}`);
      }
    }

    // Clear tracked models
    this.createdModelIds = [];

    return { deleted, errors };
  }

  /**
   * Delete a specific model by ID
   */
  async deleteModel(modelId: string): Promise<boolean> {
    if (!this.supabase) {
      console.warn('No direct DB access - cannot delete model directly');
      return false;
    }

    try {
      // Delete model versions first
      await this.supabase
        .from('model_versions')
        .delete()
        .eq('model_id', modelId);

      // Delete the model
      const { error } = await this.supabase
        .from('models')
        .delete()
        .eq('id', modelId);

      // Remove from tracked list
      this.createdModelIds = this.createdModelIds.filter(id => id !== modelId);

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Check if a model exists
   */
  async modelExists(modelId: string): Promise<boolean> {
    if (!this.supabase) {
      console.warn('No direct DB access - cannot check model existence');
      return false;
    }

    const { data, error } = await this.supabase
      .from('models')
      .select('id')
      .eq('id', modelId)
      .single();

    return !error && !!data;
  }

  /**
   * Get model version count
   */
  async getVersionCount(modelId: string): Promise<number> {
    if (!this.supabase) {
      return -1;
    }

    const { count, error } = await this.supabase
      .from('model_versions')
      .select('*', { count: 'exact', head: true })
      .eq('model_id', modelId);

    return error ? -1 : (count || 0);
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
