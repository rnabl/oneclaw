-- ============================================================================
-- OneClaw AI Agency Schema
-- ============================================================================
-- 
-- Adds tables for AI-native GEO/AEO marketing agency with 4 core agents:
-- 1. SDR Agent (prospecting, outreach)
-- 2. Content Agent (articles, citations, entities)
-- 3. Technical Agent (GBP, NAP, schema)
-- 4. Analytics Agent (AI visibility, reporting)
--
-- Organization: Schema-based (like folders)
-- All tables reference public.clients as the master/spine
-- ============================================================================

-- Create schemas (logical organization)
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS content;
CREATE SCHEMA IF NOT EXISTS technical;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS platform;

-- ============================================================================
-- PUBLIC SCHEMA: Master Client Table (The "Spine")
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- From lead conversion
  original_lead_id UUID,
  
  -- Basic info
  company_name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  
  -- Contact
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  
  -- Contract
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  contract_start_date DATE,
  monthly_retainer DECIMAL(10,2),
  
  -- Services (JSON array: ["geo", "aeo", "gbp", "content"])
  services_enabled JSONB DEFAULT '[]'::jsonb,
  
  -- CSM assignment
  csm_user_id TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_clients_created ON public.clients(created_at DESC);

COMMENT ON TABLE public.clients IS 'Master client table - everything references this';

-- ============================================================================
-- CRM SCHEMA: SDR Agent Tables
-- ============================================================================

CREATE TABLE crm.leads (
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
  -- Structure: { hasSSL, hasAds, aiReadable, aiReadabilityScore, etc. }
  
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
  
  -- Conversion
  converted_to_client_id UUID REFERENCES public.clients(id),
  converted_at TIMESTAMPTZ,
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_stage ON crm.leads(stage);
CREATE INDEX idx_leads_score ON crm.leads(lead_score DESC);
CREATE INDEX idx_leads_industry ON crm.leads(industry);
CREATE INDEX idx_leads_location ON crm.leads(city, state);

CREATE TABLE crm.email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Can reference lead OR client
  lead_id UUID REFERENCES crm.leads(id),
  client_id UUID REFERENCES public.clients(id),
  
  -- Email details
  campaign_type TEXT,
  subject TEXT,
  body TEXT,
  template_name TEXT,
  
  -- Sending
  sent_at TIMESTAMPTZ,
  sent_from_email TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  
  -- Engagement tracking
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMPTZ,
  reply_text TEXT,
  
  -- CSM Approval workflow
  approval_status TEXT DEFAULT 'pending' 
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_lead ON crm.email_campaigns(lead_id);
CREATE INDEX idx_email_client ON crm.email_campaigns(client_id);
CREATE INDEX idx_email_approval ON crm.email_campaigns(approval_status);

-- ============================================================================
-- CONTENT SCHEMA: Content Agent Tables
-- ============================================================================

CREATE TABLE content.content_pieces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Content
  title TEXT,
  slug TEXT,
  body TEXT,
  word_count INTEGER,
  content_type TEXT,
  
  -- Keywords (JSON array)
  target_keywords JSONB DEFAULT '[]'::jsonb,
  entity_mentions JSONB DEFAULT '[]'::jsonb,
  
  -- AEO/GEO optimization scores
  geo_score REAL,
  aeo_score REAL,
  
  -- Workflow
  status TEXT DEFAULT 'draft' 
    CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'published')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  
  -- Storage (path in Supabase Storage)
  draft_file_path TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_client ON content.content_pieces(client_id);
CREATE INDEX idx_content_status ON content.content_pieces(status);
CREATE INDEX idx_content_published ON content.content_pieces(published_at DESC);

CREATE TABLE content.citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content_piece_id UUID REFERENCES content.content_pieces(id),
  
  -- Citation source
  source_url TEXT,
  source_domain TEXT,
  source_authority_score REAL,
  
  -- AI visibility (which engines cite this?)
  shows_in_chatgpt BOOLEAN DEFAULT FALSE,
  shows_in_perplexity BOOLEAN DEFAULT FALSE,
  shows_in_claude BOOLEAN DEFAULT FALSE,
  shows_in_gemini BOOLEAN DEFAULT FALSE,
  
  -- Citation details
  citation_snippet TEXT,
  anchor_text TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_citations_client ON content.citations(client_id);
CREATE INDEX idx_citations_active ON content.citations(client_id, is_active);

CREATE TABLE content.entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Entity info
  entity_name TEXT NOT NULL,
  entity_type TEXT,
  schema_markup JSONB,
  
  -- Knowledge graph
  wikipedia_url TEXT,
  wikidata_id TEXT,
  
  -- Primary brand entity?
  is_primary_entity BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_client ON content.entities(client_id);

-- ============================================================================
-- TECHNICAL SCHEMA: Technical Agent Tables
-- ============================================================================

CREATE TABLE technical.gbp_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client (can have multiple locations)
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- NAP (Name, Address, Phone)
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  
  -- Google
  google_place_id TEXT,
  google_url TEXT,
  verification_status TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gbp_client ON technical.gbp_profiles(client_id);

-- ============================================================================
-- ANALYTICS SCHEMA: Analytics Agent Tables
-- ============================================================================

CREATE TABLE analytics.ai_visibility_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Test query
  test_query TEXT,
  query_category TEXT,
  ai_engine TEXT,
  
  -- Results
  brand_mentioned BOOLEAN,
  citation_position INTEGER,
  citation_snippet TEXT,
  
  -- Competition
  competitors_mentioned JSONB DEFAULT '[]'::jsonb,
  
  tested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_visibility_client ON analytics.ai_visibility_tracking(client_id);
CREATE INDEX idx_ai_visibility_tested ON analytics.ai_visibility_tracking(tested_at DESC);

CREATE TABLE analytics.metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_name TEXT,
  metric_value REAL,
  metric_unit TEXT,
  
  -- Time period
  period_start DATE,
  period_end DATE,
  reporting_period TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_client ON analytics.metrics(client_id);
CREATE INDEX idx_metrics_period ON analytics.metrics(client_id, period_end DESC);

-- ============================================================================
-- PLATFORM SCHEMA: Shared System Tables
-- ============================================================================

CREATE TABLE platform.agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Agent identity
  agent_name TEXT UNIQUE NOT NULL,
  agent_type TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Configuration
  capabilities JSONB DEFAULT '[]'::jsonb,
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Performance tracking
  total_tasks_executed INTEGER DEFAULT 0,
  successful_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the 4 core agents
INSERT INTO platform.agents (agent_name, agent_type, capabilities) VALUES
('sdr', 'core', '["prospect_discovery", "lead_qualification", "email_outreach", "demo_creation"]'::jsonb),
('content', 'core', '["content_research", "article_writing", "entity_optimization", "citation_building"]'::jsonb),
('technical', 'core', '["schema_implementation", "gbp_management", "nap_consistency"]'::jsonb),
('analytics', 'core', '["ai_visibility_monitoring", "citation_tracking", "performance_reporting"]'::jsonb);

CREATE TABLE platform.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Task details
  task_type TEXT NOT NULL,
  task_params JSONB DEFAULT '{}'::jsonb,
  
  -- Assignment
  assigned_to_agent TEXT REFERENCES platform.agents(agent_name),
  
  -- Context
  client_id UUID REFERENCES public.clients(id),
  resource_type TEXT,
  resource_id UUID,
  
  -- Execution
  status TEXT DEFAULT 'queued' 
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER DEFAULT 0,
  
  -- Results
  result JSONB,
  error_message TEXT,
  
  -- Timing
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Retry
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

CREATE INDEX idx_tasks_status ON platform.tasks(status, priority DESC);
CREATE INDEX idx_tasks_agent ON platform.tasks(assigned_to_agent, status);
CREATE INDEX idx_tasks_client ON platform.tasks(client_id);

CREATE TABLE platform.approvals_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What needs approval
  approval_type TEXT NOT NULL,
  reference_table TEXT,
  reference_id UUID,
  
  -- Context
  client_id UUID REFERENCES public.clients(id),
  
  -- Preview for CSM
  preview_title TEXT,
  preview_data JSONB DEFAULT '{}'::jsonb,
  
  -- Created by which agent
  created_by_agent TEXT,
  
  -- Approval decision
  status TEXT DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by_user TEXT,
  approval_notes TEXT,
  approved_at TIMESTAMPTZ,
  
  -- Priority (1-10)
  priority INTEGER DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_status ON platform.approvals_queue(status, priority DESC);
CREATE INDEX idx_approvals_client ON platform.approvals_queue(client_id);

CREATE TABLE platform.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who did what
  agent_name TEXT,
  user_id TEXT,
  action TEXT,
  
  -- What was affected
  resource_table TEXT,
  resource_id UUID,
  
  -- Context
  client_id UUID REFERENCES public.clients(id),
  
  -- Details
  changes JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_client ON platform.audit_log(client_id, created_at DESC);
CREATE INDEX idx_audit_resource ON platform.audit_log(resource_table, resource_id);

-- ============================================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================================

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON crm.leads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content.content_pieces 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gbp_updated_at BEFORE UPDATE ON technical.gbp_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON content.entities 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON platform.agents 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS: CSM Dashboard
-- ============================================================================

CREATE VIEW public.csm_approval_dashboard AS
SELECT 
  a.id,
  a.approval_type,
  a.priority,
  a.preview_title,
  a.preview_data,
  a.created_by_agent,
  c.company_name,
  c.id as client_id,
  a.created_at as submitted_at
FROM platform.approvals_queue a
LEFT JOIN public.clients c ON a.client_id = c.id
WHERE a.status = 'pending'
ORDER BY a.priority DESC, a.created_at ASC;

COMMENT ON VIEW public.csm_approval_dashboard IS 'All pending items requiring CSM review';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE content.content_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE content.citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical.gbp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.ai_visibility_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.approvals_queue ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for backend/agents)
CREATE POLICY "Service role full access on clients" ON public.clients
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on leads" ON crm.leads
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on email_campaigns" ON crm.email_campaigns
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on content" ON content.content_pieces
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on citations" ON content.citations
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on entities" ON content.entities
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on gbp" ON technical.gbp_profiles
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on visibility" ON analytics.ai_visibility_tracking
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on metrics" ON analytics.metrics
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on tasks" ON platform.tasks
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access on approvals" ON platform.approvals_queue
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON SCHEMA crm IS 'SDR Agent: Prospecting, lead qualification, email outreach';
COMMENT ON SCHEMA content IS 'Content Agent: Articles, citations, entity optimization';
COMMENT ON SCHEMA technical IS 'Technical Agent: GBP, NAP, schema markup';
COMMENT ON SCHEMA analytics IS 'Analytics Agent: AI visibility monitoring, reporting';
COMMENT ON SCHEMA platform IS 'System tables shared by all agents';

COMMENT ON TABLE crm.leads IS 'Prospect pipeline - discovered businesses before conversion';
COMMENT ON TABLE crm.email_campaigns IS 'Email outreach tracking with approval workflow';
COMMENT ON TABLE content.content_pieces IS 'GEO/AEO optimized content with approval workflow';
COMMENT ON TABLE content.citations IS 'Backlinks and citations in AI engines';
COMMENT ON TABLE content.entities IS 'Knowledge graph entities and schema markup';
COMMENT ON TABLE technical.gbp_profiles IS 'Google Business Profile and NAP data';
COMMENT ON TABLE analytics.ai_visibility_tracking IS 'Daily AI engine visibility tests';
COMMENT ON TABLE platform.agents IS 'AI agent registry and performance tracking';
COMMENT ON TABLE platform.tasks IS 'Work queue for all agents';
COMMENT ON TABLE platform.approvals_queue IS 'Items requiring CSM review';
