-- ============================================================================
-- Combined Migration: Create CRM Schema + Make Leads Agnostic
-- ============================================================================
-- This combines 004 and 005 migrations for fresh Supabase projects
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS content;
CREATE SCHEMA IF NOT EXISTS technical;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS platform;

-- ============================================================================
-- CRM SCHEMA: Leads Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Business info
  company_name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  industry TEXT,
  
  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  
  -- Google data (from Apify)
  google_place_id TEXT,
  google_rating REAL,
  google_reviews INTEGER,
  google_maps_url TEXT,
  image_url TEXT,
  
  -- LinkedIn (from Apify Leads Finder)
  linkedin_url TEXT,
  owner_name TEXT,
  owner_title TEXT,
  owner_linkedin TEXT,
  
  -- Company data (from Apify)
  company_size TEXT,
  company_revenue TEXT,
  company_description TEXT,
  
  -- Website signals (from scanner - JSONB for flexibility)
  website_signals JSONB DEFAULT '{}'::jsonb,
  
  -- AEO/GEO opportunity scoring
  lead_score INTEGER CHECK (lead_score >= 0 AND lead_score <= 100),
  geo_readiness_score REAL CHECK (geo_readiness_score >= 0 AND geo_readiness_score <= 10),
  aeo_readiness_score REAL CHECK (aeo_readiness_score >= 0 AND aeo_readiness_score <= 10),
  opportunity_value DECIMAL(10,2),
  
  -- Pipeline stage
  stage TEXT DEFAULT 'discovered' 
    CHECK (stage IN ('discovered', 'qualified', 'contacted', 'meeting_set', 'proposal_sent', 'won', 'lost')),
  
  -- Enrichment data (flexible JSON storage)
  audit_data JSONB,
  contact_data JSONB,
  
  -- Job tracking (which autonomous job found this)
  source_job_id TEXT,
  
  -- NEW: Agnostic source tracking
  source_type TEXT DEFAULT 'geographic'
    CHECK (source_type IN ('geographic', 'job_posting', 'review', 'referral', 'manual', 'other')),
  source_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_stage ON crm.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_score ON crm.leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON crm.leads(industry);
CREATE INDEX IF NOT EXISTS idx_leads_location ON crm.leads(city, state);
CREATE INDEX IF NOT EXISTS idx_leads_source_type ON crm.leads(source_type);
CREATE INDEX IF NOT EXISTS idx_leads_source_metadata_gin ON crm.leads USING GIN (source_metadata);

-- Comments
COMMENT ON TABLE crm.leads IS 'Prospect pipeline - discovered businesses before conversion';
COMMENT ON COLUMN crm.leads.source_type IS 'Discovery source: geographic (Google Maps), job_posting (hiring), review (reputation), etc.';
COMMENT ON COLUMN crm.leads.source_metadata IS 'Source-specific data (job postings, business type, etc.)';

-- ============================================================================
-- Helper Function: Find Duplicate Leads
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

-- ============================================================================
-- View: Hiring Leads
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
-- Triggers: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON crm.leads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend/agents)
CREATE POLICY "Service role full access on leads" ON crm.leads
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- Done!
-- ============================================================================

-- Verify the setup
SELECT 
  source_type,
  COUNT(*) as count
FROM crm.leads
GROUP BY source_type
ORDER BY count DESC;
