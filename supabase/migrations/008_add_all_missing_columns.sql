-- ============================================================================
-- Migration: Add All Missing Columns to crm.leads
-- ============================================================================
-- This adds all columns needed for the full OneClaw discovery system
-- Safe to run - only adds columns that don't exist
-- ============================================================================

-- Location columns
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'address') THEN
    ALTER TABLE crm.leads ADD COLUMN address TEXT;
    RAISE NOTICE '✅ Added address column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'zip_code') THEN
    ALTER TABLE crm.leads ADD COLUMN zip_code TEXT;
    RAISE NOTICE '✅ Added zip_code column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'country') THEN
    ALTER TABLE crm.leads ADD COLUMN country TEXT DEFAULT 'US';
    RAISE NOTICE '✅ Added country column';
  END IF;
END $$;

-- Google data columns
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'google_maps_url') THEN
    ALTER TABLE crm.leads ADD COLUMN google_maps_url TEXT;
    RAISE NOTICE '✅ Added google_maps_url column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'image_url') THEN
    ALTER TABLE crm.leads ADD COLUMN image_url TEXT;
    RAISE NOTICE '✅ Added image_url column';
  END IF;
END $$;

-- LinkedIn/Owner columns
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'linkedin_url') THEN
    ALTER TABLE crm.leads ADD COLUMN linkedin_url TEXT;
    RAISE NOTICE '✅ Added linkedin_url column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'owner_name') THEN
    ALTER TABLE crm.leads ADD COLUMN owner_name TEXT;
    RAISE NOTICE '✅ Added owner_name column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'owner_title') THEN
    ALTER TABLE crm.leads ADD COLUMN owner_title TEXT;
    RAISE NOTICE '✅ Added owner_title column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'owner_linkedin') THEN
    ALTER TABLE crm.leads ADD COLUMN owner_linkedin TEXT;
    RAISE NOTICE '✅ Added owner_linkedin column';
  END IF;
END $$;

-- Company data columns
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'company_size') THEN
    ALTER TABLE crm.leads ADD COLUMN company_size TEXT;
    RAISE NOTICE '✅ Added company_size column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'company_revenue') THEN
    ALTER TABLE crm.leads ADD COLUMN company_revenue TEXT;
    RAISE NOTICE '✅ Added company_revenue column';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'company_description') THEN
    ALTER TABLE crm.leads ADD COLUMN company_description TEXT;
    RAISE NOTICE '✅ Added company_description column';
  END IF;
END $$;

-- Website signals column (JSONB for flexibility)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'website_signals') THEN
    ALTER TABLE crm.leads ADD COLUMN website_signals JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '✅ Added website_signals column';
  END IF;
END $$;

-- Source job ID (for tracking which workflow discovered this lead)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'crm' AND table_name = 'leads' AND column_name = 'source_job_id') THEN
    ALTER TABLE crm.leads ADD COLUMN source_job_id TEXT;
    RAISE NOTICE '✅ Added source_job_id column';
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN crm.leads.address IS 'Full street address';
COMMENT ON COLUMN crm.leads.zip_code IS 'Postal/ZIP code';
COMMENT ON COLUMN crm.leads.country IS 'Country code (default: US)';
COMMENT ON COLUMN crm.leads.google_maps_url IS 'Google Maps URL for the business';
COMMENT ON COLUMN crm.leads.image_url IS 'Business photo/logo URL';
COMMENT ON COLUMN crm.leads.linkedin_url IS 'Company LinkedIn profile';
COMMENT ON COLUMN crm.leads.owner_name IS 'Business owner/contact name';
COMMENT ON COLUMN crm.leads.owner_title IS 'Business owner/contact title';
COMMENT ON COLUMN crm.leads.owner_linkedin IS 'Owner LinkedIn profile';
COMMENT ON COLUMN crm.leads.company_size IS 'Employee count range';
COMMENT ON COLUMN crm.leads.company_revenue IS 'Revenue range';
COMMENT ON COLUMN crm.leads.company_description IS 'Business description';
COMMENT ON COLUMN crm.leads.website_signals IS 'Website analysis data (SEO, ads, chatbots, etc.)';
COMMENT ON COLUMN crm.leads.source_job_id IS 'Workflow job ID that discovered this lead';

-- Verify all columns now exist
SELECT 
  '✅ Migration complete! Columns now in crm.leads:' as status;

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  CASE 
    WHEN column_name IN ('address', 'city', 'state', 'zip_code', 'country') THEN '📍 Location'
    WHEN column_name IN ('source_type', 'source_metadata', 'source_job_id') THEN '🔍 Discovery source'
    WHEN column_name IN ('website_signals', 'lead_score', 'geo_readiness_score', 'aeo_readiness_score') THEN '📊 Scoring'
    WHEN column_name IN ('google_place_id', 'google_rating', 'google_reviews', 'google_maps_url') THEN '🗺️ Google data'
    WHEN column_name IN ('linkedin_url', 'owner_name', 'owner_title', 'owner_linkedin') THEN '👤 LinkedIn'
    ELSE ''
  END as category
FROM information_schema.columns
WHERE table_schema = 'crm'
  AND table_name = 'leads'
ORDER BY ordinal_position;
