-- WASM Cache Storage Bucket Configuration
-- Creates and configures the Supabase Storage bucket for WASM files

-- ============================================================================
-- Create wasm-cache Bucket
-- ============================================================================
-- Note: This needs to be run with appropriate permissions
-- In Supabase Dashboard: Storage > Create a new bucket

-- Bucket name: wasm-cache
-- Public: false (requires authentication)
-- File size limit: 52428800 (50MB)
-- Allowed MIME types: application/wasm, application/javascript, application/json

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wasm-cache',
  'wasm-cache',
  false,  -- Not public - requires authentication
  52428800,  -- 50MB max file size
  ARRAY['application/wasm', 'application/javascript', 'application/json', 'text/javascript']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- Storage Bucket Policies
-- ============================================================================

-- Policy 1: Authenticated users can read (download) from wasm-cache
DROP POLICY IF EXISTS "Authenticated users can download WASM files" ON storage.objects;
CREATE POLICY "Authenticated users can download WASM files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'wasm-cache' AND
    auth.role() = 'authenticated'
  );

-- Policy 2: Service role can upload/manage files
DROP POLICY IF EXISTS "Service role can manage WASM cache" ON storage.objects;
CREATE POLICY "Service role can manage WASM cache"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'wasm-cache' AND
    auth.jwt()->>'role' = 'service_role'
  );

-- Policy 3: Allow anonymous downloads for public access (optional)
-- Uncomment if you want to allow unauthenticated downloads
-- DROP POLICY IF EXISTS "Public can download WASM files" ON storage.objects;
-- CREATE POLICY "Public can download WASM files"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'wasm-cache');

-- ============================================================================
-- Cleanup Function for Old Cache Entries
-- ============================================================================
-- Removes cache entries older than the specified number of days

CREATE OR REPLACE FUNCTION cleanup_old_wasm_cache(days_old INTEGER DEFAULT 30)
RETURNS TABLE(deleted_count INTEGER, freed_mb NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  old_entries RECORD;
  total_deleted INTEGER := 0;
  total_size BIGINT := 0;
BEGIN
  cutoff_date := NOW() - (days_old || ' days')::INTERVAL;

  -- Get old entries
  FOR old_entries IN
    SELECT cache_key, wasm_size_bytes, js_size_bytes, wasm_path, js_path
    FROM wasm_cache_metadata
    WHERE last_accessed_at < cutoff_date
  LOOP
    -- Delete from storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'wasm-cache' AND
          name IN (
            SUBSTRING(old_entries.wasm_path FROM 'wasm-cache/(.*)'),
            SUBSTRING(old_entries.js_path FROM 'wasm-cache/(.*)')
          );

    -- Delete metadata
    DELETE FROM wasm_cache_metadata
    WHERE cache_key = old_entries.cache_key;

    total_deleted := total_deleted + 1;
    total_size := total_size + old_entries.wasm_size_bytes + old_entries.js_size_bytes;
  END LOOP;

  RETURN QUERY SELECT total_deleted, ROUND(total_size / 1024.0 / 1024.0, 2);
END;
$$;

-- ============================================================================
-- Function: Get Storage Statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_wasm_storage_stats()
RETURNS TABLE(
  total_files INTEGER,
  total_size_mb NUMERIC,
  wasm_files INTEGER,
  js_files INTEGER,
  oldest_file TIMESTAMPTZ,
  newest_file TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_files,
    ROUND(SUM(COALESCE((metadata->>'size')::BIGINT, 0)) / 1024.0 / 1024.0, 2) as total_size_mb,
    COUNT(*) FILTER (WHERE name LIKE '%.wasm')::INTEGER as wasm_files,
    COUNT(*) FILTER (WHERE name LIKE '%.js')::INTEGER as js_files,
    MIN(created_at) as oldest_file,
    MAX(created_at) as newest_file
  FROM storage.objects
  WHERE bucket_id = 'wasm-cache';
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION cleanup_old_wasm_cache IS 'Removes WASM cache entries older than specified days (default 30)';
COMMENT ON FUNCTION get_wasm_storage_stats IS 'Returns statistics about WASM cache storage usage';

-- ============================================================================
-- Usage Examples
-- ============================================================================

-- Clean up cache entries older than 30 days:
-- SELECT * FROM cleanup_old_wasm_cache(30);

-- Get storage statistics:
-- SELECT * FROM get_wasm_storage_stats();

-- View cache hit rate:
-- SELECT * FROM wasm_cache_hit_rate_daily;

-- View cache statistics:
-- SELECT * FROM wasm_cache_stats;

-- View most accessed entries:
-- SELECT * FROM wasm_most_accessed;
