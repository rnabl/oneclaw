-- Contact Enrichment Schema for Home Services Leads
-- Supports waterfall enrichment: Perplexity -> Apify -> Website Scrape

-- =============================================================================
-- Main contacts table - stores all enriched contacts for a lead
-- =============================================================================
CREATE TABLE IF NOT EXISTS crm.lead_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to parent lead
  lead_id UUID NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  
  -- Contact Information
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  seniority_level TEXT CHECK (seniority_level IN ('owner', 'c_suite', 'director', 'vp', 'head', 'manager', 'partner', 'staff')),
  
  -- Contact Methods
  email TEXT,
  email_status TEXT DEFAULT 'unverified' CHECK (email_status IN ('unverified', 'verified', 'bounced_hard', 'bounced_soft', 'invalid')),
  bounced_at TIMESTAMPTZ,
  bounce_reason TEXT,
  
  phone TEXT,
  phone_type TEXT CHECK (phone_type IN ('mobile', 'work', 'unknown')),
  
  linkedin_url TEXT,
  
  -- Enrichment Metadata
  source TEXT NOT NULL CHECK (source IN ('perplexity', 'apify', 'website_scrape', 'manual')),
  enriched_at TIMESTAMPTZ DEFAULT NOW(),
  apify_run_id TEXT, -- Track which Apify run found this contact
  confidence_score DECIMAL(3,2), -- 0.00-1.00 confidence in data accuracy
  
  -- Priority for outreach
  is_primary BOOLEAN DEFAULT false, -- Primary contact for this lead
  outreach_priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Indexes for performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead_id ON crm.lead_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_email_status ON crm.lead_contacts(email_status);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_is_primary ON crm.lead_contacts(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_lead_contacts_seniority ON crm.lead_contacts(seniority_level);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_source ON crm.lead_contacts(source);

-- Unique constraint: one primary contact per lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_contacts_one_primary 
  ON crm.lead_contacts(lead_id) 
  WHERE is_primary = true;

-- =============================================================================
-- Update leads table to add enrichment tracking
-- =============================================================================
ALTER TABLE crm.leads 
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'enriching', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS enrichment_tier TEXT CHECK (enrichment_tier IN ('perplexity', 'apify', 'website_scrape', 'none')),
  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contacts_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contacts_with_email INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contacts_with_phone INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON crm.leads(enrichment_status);

-- =============================================================================
-- Function to update lead stats when contacts change
-- =============================================================================
CREATE OR REPLACE FUNCTION crm.update_lead_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update counts on the parent lead
  UPDATE crm.leads
  SET 
    contacts_count = (
      SELECT COUNT(*) 
      FROM crm.lead_contacts 
      WHERE lead_id = NEW.lead_id
    ),
    contacts_with_email = (
      SELECT COUNT(*) 
      FROM crm.lead_contacts 
      WHERE lead_id = NEW.lead_id 
        AND email IS NOT NULL 
        AND email_status NOT IN ('bounced_hard', 'invalid')
    ),
    contacts_with_phone = (
      SELECT COUNT(*) 
      FROM crm.lead_contacts 
      WHERE lead_id = NEW.lead_id 
        AND phone IS NOT NULL
    ),
    last_enriched_at = NOW(),
    enrichment_status = 'completed'
  WHERE id = NEW.lead_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_lead_contact_stats ON crm.lead_contacts;
CREATE TRIGGER trigger_update_lead_contact_stats
  AFTER INSERT OR UPDATE ON crm.lead_contacts
  FOR EACH ROW
  EXECUTE FUNCTION crm.update_lead_contact_stats();

-- =============================================================================
-- View: Get primary contact for each lead (for outreach)
-- =============================================================================
CREATE OR REPLACE VIEW crm.leads_with_primary_contact AS
SELECT 
  l.*,
  c.full_name as primary_contact_name,
  c.title as primary_contact_title,
  c.email as primary_contact_email,
  c.phone as primary_contact_phone,
  c.linkedin_url as primary_contact_linkedin,
  c.seniority_level as primary_contact_seniority,
  c.source as contact_source
FROM crm.leads l
LEFT JOIN crm.lead_contacts c ON l.id = c.lead_id AND c.is_primary = true;

-- =============================================================================
-- View: Get all contacts with valid emails for outreach
-- =============================================================================
CREATE OR REPLACE VIEW crm.leads_ready_for_outreach AS
SELECT 
  l.id as lead_id,
  l.company_name,
  l.website,
  l.city,
  l.state,
  l.industry,
  c.id as contact_id,
  c.full_name,
  c.title,
  c.email,
  c.phone,
  c.seniority_level,
  c.is_primary,
  c.outreach_priority,
  c.source as contact_source
FROM crm.leads l
INNER JOIN crm.lead_contacts c ON l.id = c.lead_id
WHERE 
  c.email IS NOT NULL 
  AND c.email_status IN ('unverified', 'verified')
  AND l.enrichment_status = 'completed'
ORDER BY l.id, c.is_primary DESC, c.outreach_priority ASC;

-- =============================================================================
-- Helper function: Mark email as bounced
-- =============================================================================
CREATE OR REPLACE FUNCTION crm.mark_email_bounced(
  p_email TEXT,
  p_bounce_type TEXT,
  p_bounce_reason TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE crm.lead_contacts
  SET 
    email_status = CASE 
      WHEN p_bounce_type = 'hard' THEN 'bounced_hard'
      WHEN p_bounce_type = 'soft' THEN 'bounced_soft'
      ELSE 'invalid'
    END,
    bounced_at = NOW(),
    bounce_reason = p_bounce_reason,
    updated_at = NOW()
  WHERE email = p_email
    AND email_status NOT IN ('bounced_hard', 'bounced_soft', 'invalid');
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper function: Get leads needing enrichment
-- =============================================================================
CREATE OR REPLACE FUNCTION crm.get_leads_needing_enrichment(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  lead_id UUID,
  company_name TEXT,
  website TEXT,
  city TEXT,
  state TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.company_name,
    l.website,
    l.city,
    l.state
  FROM crm.leads l
  WHERE 
    l.enrichment_status IN ('pending', 'failed')
    AND l.website IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM crm.lead_contacts c 
      WHERE c.lead_id = l.id 
        AND c.email IS NOT NULL
        AND c.email_status IN ('unverified', 'verified')
    )
  ORDER BY l.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE crm.lead_contacts IS 'Enriched contact information from waterfall enrichment (Perplexity -> Apify -> Website)';
COMMENT ON COLUMN crm.lead_contacts.is_primary IS 'Primary contact for outreach (only one per lead)';
COMMENT ON COLUMN crm.lead_contacts.outreach_priority IS '1=highest priority (owner/CEO), 10=lowest (staff)';
COMMENT ON COLUMN crm.lead_contacts.confidence_score IS 'Confidence in data accuracy (0.00-1.00)';
COMMENT ON COLUMN crm.lead_contacts.source IS 'Which enrichment tier found this contact';

-- =============================================================================
-- Grants
-- =============================================================================
GRANT ALL ON crm.lead_contacts TO service_role;
GRANT ALL ON crm.lead_contacts TO authenticated;
GRANT SELECT ON crm.leads_with_primary_contact TO service_role;
GRANT SELECT ON crm.leads_with_primary_contact TO authenticated;
GRANT SELECT ON crm.leads_ready_for_outreach TO service_role;
GRANT SELECT ON crm.leads_ready_for_outreach TO authenticated;
