-- WASM Cache Infrastructure
-- Tables and policies for caching compiled WebAssembly modules

-- ============================================================================
-- WASM Cache Metadata Table
-- ============================================================================
-- Stores metadata about compiled WASM modules for fast lookup and management

CREATE TABLE IF NOT EXISTS wasm_cache_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  model_id UUID NOT NULL,
  model_hash TEXT NOT NULL,
  wasm_path TEXT NOT NULL,
  js_path TEXT NOT NULL,
  source_map_path TEXT,
  compilation_time_ms INTEGER NOT NULL,
  optimization_level TEXT NOT NULL CHECK (optimization_level IN ('O0', 'O1', 'O2', 'O3')),
  wasm_size_bytes INTEGER NOT NULL,
  js_size_bytes INTEGER NOT NULL,
  block_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id),

  CONSTRAINT valid_paths CHECK (
    wasm_path LIKE 'wasm-cache/%' AND
    js_path LIKE 'wasm-cache/%'
  )
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_wasm_cache_model_hash ON wasm_cache_metadata(model_id, model_hash);
CREATE INDEX IF NOT EXISTS idx_wasm_cache_key ON wasm_cache_metadata(cache_key);
CREATE INDEX IF NOT EXISTS idx_wasm_cache_created_at ON wasm_cache_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_wasm_cache_accessed_at ON wasm_cache_metadata(last_accessed_at);

-- Row Level Security
ALTER TABLE wasm_cache_metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all cache entries (compilation is deterministic)
DROP POLICY IF EXISTS "Anyone can read cache metadata" ON wasm_cache_metadata;
CREATE POLICY "Anyone can read cache metadata"
  ON wasm_cache_metadata FOR SELECT
  USING (true);

-- Policy: Only service role can insert/update
DROP POLICY IF EXISTS "Service role can manage cache" ON wasm_cache_metadata;
CREATE POLICY "Service role can manage cache"
  ON wasm_cache_metadata FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- WASM Compilation Metrics Table
-- ============================================================================
-- Tracks compilation requests for analytics and monitoring

CREATE TABLE IF NOT EXISTS wasm_compilation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  cache_hit BOOLEAN NOT NULL,
  compilation_time_ms INTEGER,
  block_count INTEGER NOT NULL,
  optimization_level TEXT NOT NULL,
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compilation_metrics_created_at ON wasm_compilation_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_compilation_metrics_model ON wasm_compilation_metrics(model_id);
CREATE INDEX IF NOT EXISTS idx_compilation_metrics_cache_hit ON wasm_compilation_metrics(cache_hit);

-- ============================================================================
-- WASM Simulation Performance Metrics Table
-- ============================================================================
-- Tracks simulation performance for monitoring and optimization

CREATE TABLE IF NOT EXISTS wasm_simulation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  cache_key TEXT NOT NULL,
  steps_executed INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,
  avg_step_time_us FLOAT NOT NULL,
  peak_memory_mb FLOAT,
  browser_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulation_metrics_created_at ON wasm_simulation_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_simulation_metrics_model ON wasm_simulation_metrics(model_id);

-- ============================================================================
-- Helper Function: Increment Access Count
-- ============================================================================
-- Used to update access_count atomically

CREATE OR REPLACE FUNCTION increment_access_count(cache_key_param TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE wasm_cache_metadata
  SET
    last_accessed_at = NOW(),
    access_count = access_count + 1
  WHERE cache_key = cache_key_param;
END;
$$;

-- ============================================================================
-- View: Cache Statistics
-- ============================================================================
-- Provides aggregated cache statistics for monitoring

CREATE OR REPLACE VIEW wasm_cache_stats AS
SELECT
  COUNT(*) as total_entries,
  ROUND(SUM(wasm_size_bytes + js_size_bytes) / 1024.0 / 1024.0, 2) as total_size_mb,
  ROUND(AVG(wasm_size_bytes) / 1024.0, 2) as avg_wasm_kb,
  ROUND(AVG(js_size_bytes) / 1024.0, 2) as avg_js_kb,
  ROUND(AVG(compilation_time_ms), 0) as avg_compile_ms,
  MAX(created_at) as last_cache_entry,
  MAX(last_accessed_at) as last_accessed
FROM wasm_cache_metadata;

-- ============================================================================
-- View: Daily Cache Hit Rate
-- ============================================================================
-- Shows cache performance over time

CREATE OR REPLACE VIEW wasm_cache_hit_rate_daily AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
  ROUND(100.0 * SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) / COUNT(*), 2) as hit_rate_pct,
  ROUND(AVG(CASE WHEN NOT cache_hit THEN compilation_time_ms END), 0) as avg_compile_time_ms
FROM wasm_compilation_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================================
-- View: Most Accessed Cache Entries
-- ============================================================================
-- Identifies frequently used models for optimization

CREATE OR REPLACE VIEW wasm_most_accessed AS
SELECT
  cache_key,
  model_id,
  access_count,
  ROUND(wasm_size_bytes / 1024.0, 2) as wasm_kb,
  ROUND(js_size_bytes / 1024.0, 2) as js_kb,
  compilation_time_ms,
  optimization_level,
  created_at,
  last_accessed_at,
  EXTRACT(EPOCH FROM (NOW() - last_accessed_at)) / 3600 as hours_since_access
FROM wasm_cache_metadata
ORDER BY access_count DESC
LIMIT 50;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE wasm_cache_metadata IS 'Metadata for cached compiled WebAssembly modules';
COMMENT ON TABLE wasm_compilation_metrics IS 'Analytics data for WASM compilation requests';
COMMENT ON TABLE wasm_simulation_metrics IS 'Performance metrics for WASM simulation execution';
COMMENT ON FUNCTION increment_access_count IS 'Atomically increments access count and updates last access time';
COMMENT ON VIEW wasm_cache_stats IS 'Aggregated statistics about the WASM cache';
COMMENT ON VIEW wasm_cache_hit_rate_daily IS 'Daily cache hit rate for the last 30 days';
COMMENT ON VIEW wasm_most_accessed IS 'Top 50 most frequently accessed cache entries';
