-- ============================================================================
-- Migration: Make crm.leads Agnostic for Multiple Discovery Sources
-- ============================================================================
--
-- Adds flexibility to store leads from:
-- - Geographic discovery (Google Maps)
-- - Job posting discovery (LinkedIn/Indeed)
-- - Review discovery (future)
-- - Any other source
--
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add new columns for agnostic lead storage
ALTER TABLE crm.leads 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'geographic'
    CHECK (source_type IN ('geographic', 'job_posting', 'review', 'referral', 'manual', 'other')),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}'::jsonb;

-- Create index for source filtering
CREATE INDEX IF NOT EXISTS idx_leads_source_type ON crm.leads(source_type);
CREATE INDEX IF NOT EXISTS idx_leads_source_metadata_gin ON crm.leads USING GIN (source_metadata);

-- Add comments
COMMENT ON COLUMN crm.leads.source_type IS 'Discovery source: geographic (Google Maps), job_posting (hiring), review (reputation), etc.';
COMMENT ON COLUMN crm.leads.source_metadata IS 'Source-specific data (job postings, business type, etc.)';

-- Example source_metadata structures:
--
-- Geographic discovery:
-- {
--   "discovery_method": "google_maps",
--   "search_query": "HVAC contractors in Austin",
--   "gbp_claimed": true
-- }
--
-- Job posting discovery:
-- {
--   "hiring_signal": {
--     "is_hiring": true,
--     "total_postings": 3,
--     "roles": ["HVAC Tech", "Sales Manager"],
--     "intensity": "high",
--     "most_recent_days": 2
--   },
--   "business_type": "residential",
--   "business_type_confidence": 0.85,
--   "job_postings": [
--     {
--       "role": "HVAC Technician",
--       "salary": "$50k-70k",
--       "url": "https://linkedin.com/...",
--       "posted_days_ago": 2
--     }
--   ]
-- }

-- ============================================================================
-- Update existing records to have source_type
-- ============================================================================

-- Set existing records to 'geographic' (they came from Google Maps)
UPDATE crm.leads 
SET source_type = 'geographic'
WHERE source_type IS NULL;

-- ============================================================================
-- Create helper function for deduplication
-- ============================================================================

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

-- ============================================================================
-- Create view for job posting leads
-- ============================================================================

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

-- ============================================================================
-- Done!
-- ============================================================================

-- Verify the changes
SELECT 
  source_type,
  COUNT(*) as count,
  AVG(lead_score) as avg_score
FROM crm.leads
GROUP BY source_type
ORDER BY count DESC;
