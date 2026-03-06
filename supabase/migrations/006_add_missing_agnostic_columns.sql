-- ============================================================================
-- Migration: Add Missing Agnostic Columns to Existing crm.leads Table
-- ============================================================================
-- This adds source_type and source_metadata if they don't exist
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add source_type column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'crm' 
    AND table_name = 'leads' 
    AND column_name = 'source_type'
  ) THEN
    ALTER TABLE crm.leads 
    ADD COLUMN source_type TEXT DEFAULT 'geographic'
    CHECK (source_type IN ('geographic', 'job_posting', 'review', 'referral', 'manual', 'other'));
    
    RAISE NOTICE 'Added source_type column';
  ELSE
    RAISE NOTICE 'source_type column already exists';
  END IF;
END $$;

-- Add source_metadata column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'crm' 
    AND table_name = 'leads' 
    AND column_name = 'source_metadata'
  ) THEN
    ALTER TABLE crm.leads 
    ADD COLUMN source_metadata JSONB DEFAULT '{}'::jsonb;
    
    RAISE NOTICE 'Added source_metadata column';
  ELSE
    RAISE NOTICE 'source_metadata column already exists';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_leads_source_type ON crm.leads(source_type);
CREATE INDEX IF NOT EXISTS idx_leads_source_metadata_gin ON crm.leads USING GIN (source_metadata);

-- Add comments
COMMENT ON COLUMN crm.leads.source_type IS 'Discovery source: geographic (Google Maps), job_posting (hiring), review (reputation), etc.';
COMMENT ON COLUMN crm.leads.source_metadata IS 'Source-specific data (job postings, business type, etc.)';

-- Update existing records to have source_type
UPDATE crm.leads 
SET source_type = 'geographic'
WHERE source_type IS NULL;

-- Create helper function for deduplication
CREATE OR REPLACE FUNCTION crm.find_duplicate_lead(
  p_company_name TEXT,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_lead_id UUID;
BEGIN
  -- Try exact company name + location match first
  IF p_city IS NOT NULL AND p_state IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM crm.leads
    WHERE LOWER(company_name) = LOWER(p_company_name)
      AND LOWER(city) = LOWER(p_city)
      AND LOWER(state) = LOWER(p_state)
    LIMIT 1;
    
    IF v_lead_id IS NOT NULL THEN
      RETURN v_lead_id;
    END IF;
  END IF;
  
  -- Try website match
  IF p_website IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM crm.leads
    WHERE LOWER(website) = LOWER(p_website)
    LIMIT 1;
    
    IF v_lead_id IS NOT NULL THEN
      RETURN v_lead_id;
    END IF;
  END IF;
  
  -- Try fuzzy company name match in same state
  IF p_state IS NOT NULL THEN
    SELECT id INTO v_lead_id
    FROM crm.leads
    WHERE LOWER(state) = LOWER(p_state)
      AND LOWER(company_name) LIKE LOWER(p_company_name) || '%'
    LIMIT 1;
    
    IF v_lead_id IS NOT NULL THEN
      RETURN v_lead_id;
    END IF;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION crm.find_duplicate_lead IS 'Finds existing lead by company name, location, or website to prevent duplicates';

-- Create view for job posting leads
CREATE OR REPLACE VIEW crm.hiring_leads AS
SELECT 
  id,
  company_name,
  website,
  phone,
  email,
  city,
  state,
  lead_score,
  stage,
  source_metadata->>'hiring_signal' as hiring_signal,
  (source_metadata->'hiring_signal'->>'total_postings')::integer as total_job_postings,
  (source_metadata->'hiring_signal'->>'intensity') as hiring_intensity,
  (source_metadata->'hiring_signal'->'roles') as hiring_roles,
  source_metadata->>'business_type' as business_type,
  discovered_at,
  last_contacted_at
FROM crm.leads
WHERE source_type = 'job_posting'
ORDER BY discovered_at DESC;

COMMENT ON VIEW crm.hiring_leads IS 'Filtered view of leads discovered via job postings';

-- Verify the changes
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'crm'
  AND table_name = 'leads'
  AND column_name IN ('source_type', 'source_metadata', 'address')
ORDER BY column_name;
