-- Create api_tokens table for user-specific API authentication
CREATE TABLE api_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the token
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE, -- NULL means never expires
  last_used_at TIMESTAMP WITH TIME ZONE, -- Track token usage
  
  -- Ensure token names are unique per user
  UNIQUE(user_id, name)
);

-- Create index on token_hash for fast lookups during authentication
CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);

-- Create index on user_id for listing user's tokens
CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id);

-- Create index on expires_at for efficient cleanup of expired tokens
CREATE INDEX idx_api_tokens_expires_at ON api_tokens(expires_at) WHERE expires_at IS NOT NULL;

-- Add RLS (Row Level Security)
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own tokens
CREATE POLICY "Users can view their own API tokens" ON api_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create their own tokens
CREATE POLICY "Users can create their own API tokens" ON api_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own tokens
CREATE POLICY "Users can delete their own API tokens" ON api_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Policy: Users can update their own tokens (for last_used_at)
CREATE POLICY "Users can update their own API tokens" ON api_tokens
  FOR UPDATE USING (auth.uid() = user_id);

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_api_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_tokens
  WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the cleanup function to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_expired_api_tokens() TO authenticated;

-- Optional: Create a scheduled job to run cleanup periodically
-- This would need to be set up in Supabase dashboard or via pg_cron if available
-- Example (requires pg_cron extension):
-- SELECT cron.schedule('cleanup-expired-api-tokens', '0 0 * * *', 'SELECT cleanup_expired_api_tokens();');