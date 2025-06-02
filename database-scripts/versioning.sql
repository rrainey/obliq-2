-- Create model_versions table to store version history
CREATE TABLE model_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID REFERENCES models(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure version numbers are unique per model
  UNIQUE(model_id, version)
);

-- Add RLS (Row Level Security)
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see versions of their own models
CREATE POLICY "Users can view their own model versions" ON model_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM models 
      WHERE models.id = model_versions.model_id 
      AND models.user_id = auth.uid()
    )
  );

-- Policy: Users can insert versions for their own models
CREATE POLICY "Users can insert versions for their own models" ON model_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM models 
      WHERE models.id = model_versions.model_id 
      AND models.user_id = auth.uid()
    )
  );

-- Policy: Users can update versions of their own models (for auto-save)
CREATE POLICY "Users can update versions of their own models" ON model_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM models 
      WHERE models.id = model_versions.model_id 
      AND models.user_id = auth.uid()
    )
  );

-- Policy: Users can delete versions of their own models
CREATE POLICY "Users can delete versions of their own models" ON model_versions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM models 
      WHERE models.id = model_versions.model_id 
      AND models.user_id = auth.uid()
    )
  );

-- Update models table to remove data column (metadata only)
ALTER TABLE models DROP COLUMN IF EXISTS data;

-- Add latest_version column to track the highest version number
ALTER TABLE models ADD COLUMN IF NOT EXISTS latest_version INTEGER DEFAULT 0;

-- Function to get next version number for a model
CREATE OR REPLACE FUNCTION get_next_version_number(p_model_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_latest_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) INTO v_latest_version
  FROM model_versions
  WHERE model_id = p_model_id AND version > 0;
  
  RETURN v_latest_version + 1;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update models.latest_version when a new version is inserted
CREATE OR REPLACE FUNCTION update_latest_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if the new version is greater than 0 (not auto-save)
  IF NEW.version > 0 THEN
    UPDATE models 
    SET latest_version = NEW.version,
        updated_at = NOW()
    WHERE id = NEW.model_id
    AND latest_version < NEW.version;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_models_latest_version
  AFTER INSERT ON model_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_latest_version();

-- Migration: Move existing model data to model_versions
-- This should be run once to migrate existing data
DO $$
BEGIN
  -- Check if models table still has data column
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'models' 
    AND column_name = 'data'
  ) THEN
    -- Insert existing model data as version 1
    INSERT INTO model_versions (model_id, version, data, created_at)
    SELECT id, 1, data, created_at
    FROM models
    WHERE data IS NOT NULL;
    
    -- Update latest_version in models table
    UPDATE models
    SET latest_version = 1
    WHERE EXISTS (
      SELECT 1 FROM model_versions 
      WHERE model_versions.model_id = models.id 
      AND model_versions.version = 1
    );
  END IF;
END $$;