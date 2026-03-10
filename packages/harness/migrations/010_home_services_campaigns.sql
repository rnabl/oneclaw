-- Home Services Campaign Tables
-- Clean structure for AEO/GEO outreach campaigns

-- 1. Home Services Leads Table
CREATE TABLE IF NOT EXISTS crm.home_services_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core Info
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT,
  state TEXT,
  website TEXT,
  phone TEXT,
  
  -- Industry/Service
  industry TEXT NOT NULL, -- 'hvac', 'plumbing', 'electrical', 'roofing', etc.
  service_description TEXT,
  
  -- Contact
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  
  -- Google Data
  google_place_id TEXT,
  google_maps_url TEXT,
  google_rating NUMERIC,
  google_review_count INTEGER,
  
  -- Signal Data (JSONB for flexibility)
  hiring_signal JSONB, -- { job_title: "HVAC Technician", posted_date: "2024-03-01" }
  ads_signal JSONB, -- { platform: "Google Ads", detected_date: "2024-03-01" }
  reviews_signal JSONB, -- [{ reviewer_name: "John Smith", rating: 5, text: "...", date: "..." }]
  
  -- AI Citation Test Results
  competitors JSONB, -- [{ name: "Competitor HVAC", mentioned_in: ["ChatGPT", "Gemini"] }]
  ai_visibility JSONB, -- { chatgpt: false, gemini: false, perplexity: false, tested_date: "2024-03-01" }
  
  -- Source
  source_lead_id UUID REFERENCES crm.leads(id), -- Link back to original lead
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Home Services Campaigns Table
CREATE TABLE IF NOT EXISTS crm.home_services_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to lead
  lead_id UUID NOT NULL REFERENCES crm.home_services_leads(id) ON DELETE CASCADE,
  
  -- Campaign Info
  campaign_type TEXT DEFAULT 'cold_outreach', -- 'cold_outreach', 'follow_up', etc.
  signal_used TEXT NOT NULL, -- 'hiring', 'ads', 'reviews'
  template_variant TEXT NOT NULL, -- 'V1', 'V2', 'V3'
  
  -- Email Content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Sending
  sent_from_email TEXT, -- 'riley@closelanepro.com', 'madison@closelanepro.com', etc.
  approval_status TEXT DEFAULT 'pending_approval', -- 'pending_approval', 'approved', 'rejected'
  
  -- Delivery
  sent_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  
  -- Engagement
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  reply_content TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'queued', 'sent', 'opened', 'replied', 'bounced', 'failed'
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for performance
CREATE INDEX idx_home_services_leads_email ON crm.home_services_leads(email);
CREATE INDEX idx_home_services_leads_industry ON crm.home_services_leads(industry);
CREATE INDEX idx_home_services_leads_google_rating ON crm.home_services_leads(google_rating DESC);
CREATE INDEX idx_home_services_leads_source ON crm.home_services_leads(source_lead_id);

CREATE INDEX idx_home_services_campaigns_lead ON crm.home_services_campaigns(lead_id);
CREATE INDEX idx_home_services_campaigns_status ON crm.home_services_campaigns(approval_status, sent_at);
CREATE INDEX idx_home_services_campaigns_signal ON crm.home_services_campaigns(signal_used);
CREATE INDEX idx_home_services_campaigns_sent_from ON crm.home_services_campaigns(sent_from_email, sent_at);

-- 4. Unique constraints
CREATE UNIQUE INDEX idx_home_services_leads_email_unique ON crm.home_services_leads(LOWER(email));
CREATE UNIQUE INDEX idx_home_services_campaigns_one_per_lead ON crm.home_services_campaigns(lead_id) 
  WHERE approval_status != 'rejected';

-- 5. Comments
COMMENT ON TABLE crm.home_services_leads IS 'Qualified home services leads for AEO/GEO campaigns';
COMMENT ON TABLE crm.home_services_campaigns IS 'Email campaigns for home services leads with signal-based personalization';

COMMENT ON COLUMN crm.home_services_leads.industry IS 'Primary service type: hvac, plumbing, electrical, roofing, etc.';
COMMENT ON COLUMN crm.home_services_leads.hiring_signal IS 'Job posting data if company is hiring';
COMMENT ON COLUMN crm.home_services_leads.ads_signal IS 'Detected paid advertising activity';
COMMENT ON COLUMN crm.home_services_leads.reviews_signal IS 'Array of 5-star reviews with full reviewer names';
COMMENT ON COLUMN crm.home_services_leads.competitors IS 'Companies that show up in AI search results for same service/location';
COMMENT ON COLUMN crm.home_services_leads.ai_visibility IS 'Whether company appears in ChatGPT/Gemini/Perplexity results';

COMMENT ON COLUMN crm.home_services_campaigns.signal_used IS 'Which signal was used: hiring, ads, or reviews';
COMMENT ON COLUMN crm.home_services_campaigns.template_variant IS 'Which playbook variant: V1 (punchy), V2 (observational), V3 (gap focus)';
