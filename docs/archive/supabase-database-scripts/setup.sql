-- Create models table
CREATE TABLE models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS (Row Level Security)
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own models
CREATE POLICY "Users can view their own models" ON models
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own models
CREATE POLICY "Users can insert their own models" ON models
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own models
CREATE POLICY "Users can update their own models" ON models
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own models
CREATE POLICY "Users can delete their own models" ON models
  FOR DELETE USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();