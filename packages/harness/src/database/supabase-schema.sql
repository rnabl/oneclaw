-- ============================================================================
-- OneClaw AI Agency - Supabase Production Schema
-- ============================================================================
-- 
-- Structure: Schema-based organization (like folders)
-- - public: Core master tables (clients, users)
-- - crm: Sales & prospecting (SDR Agent)
-- - content: Content creation (Content Agent)
-- - technical: Implementation (Technical Agent)
-- - analytics: Monitoring (Analytics Agent)
-- - platform: System/meta (All agents)
--
-- All tables use UUID primary keys
-- Everything connects through public.clients (the "spine")
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schemas (logical namespaces)
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS content;
CREATE SCHEMA IF NOT EXISTS technical;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS platform;

-- ============================================================================
-- PUBLIC SCHEMA: Core Master Tables
-- ============================================================================

-- MASTER CLIENT TABLE (The "Spine")
-- Everything else references this via client_id
CREATE TABLE public.clients (
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
  status TEXT DEFAULT 'active',
  contract_start_date DATE,
  monthly_retainer DECIMAL(10,2),
  
  -- Services enabled (array of services)
  services_enabled JSONB DEFAULT '[]'::jsonb,
  
  -- CSM assignment
  csm_user_id TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_clients_created ON public.clients(created_at DESC);

-- ============================================================================
-- CRM SCHEMA: Sales & Prospecting (SDR Agent)
-- ============================================================================

CREATE TABLE crm.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Business info
  company_name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  industry TEXT,
  city TEXT,
  state TEXT,
  
  -- Google data
  google_place_id TEXT,
  google_rating REAL,
  google_reviews INTEGER,
  
  -- AEO/GEO Scoring
  lead_score INTEGER,
  geo_readiness_score REAL,
  aeo_readiness_score REAL,
  opportunity_value DECIMAL(10,2),
  
  -- Pipeline stage
  stage TEXT DEFAULT 'discovered',
  
  -- Enrichment (JSON blobs for flexibility)
  audit_data JSONB,
  contact_data JSONB,
  
  -- Conversion tracking
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

CREATE TABLE crm.email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References (can be lead OR client)
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
  
  -- Engagement tracking
  opened BOOLEAN DEFAULT FALSE,
  clicked BOOLEAN DEFAULT FALSE,
  replied BOOLEAN DEFAULT FALSE,
  
  -- CSM Approval workflow
  approval_status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_lead ON crm.email_campaigns(lead_id);
CREATE INDEX idx_email_client ON crm.email_campaigns(client_id);
CREATE INDEX idx_email_approval ON crm.email_campaigns(approval_status);

-- ============================================================================
-- CONTENT SCHEMA: Content Creation (Content Agent)
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
  
  -- Keywords & topics
  target_keywords JSONB DEFAULT '[]'::jsonb,
  entity_mentions JSONB,
  
  -- AEO/GEO optimization
  geo_score REAL,
  aeo_score REAL,
  
  -- Workflow
  status TEXT DEFAULT 'draft',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  
  -- Storage (draft in Supabase Storage)
  draft_file_path TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_client ON content.content_pieces(client_id);
CREATE INDEX idx_content_status ON content.content_pieces(status);

CREATE TABLE content.citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content_piece_id UUID REFERENCES content.content_pieces(id),
  
  -- Citation source
  source_url TEXT,
  source_domain TEXT,
  source_authority_score REAL,
  
  -- AI visibility (shows up in which engines?)
  shows_in_chatgpt BOOLEAN DEFAULT FALSE,
  shows_in_perplexity BOOLEAN DEFAULT FALSE,
  shows_in_claude BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_citations_client ON content.citations(client_id);

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
  
  is_primary_entity BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_client ON content.entities(client_id);

-- ============================================================================
-- TECHNICAL SCHEMA: Implementation (Technical Agent)
-- ============================================================================

CREATE TABLE technical.gbp_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- NAP
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  
  -- Google
  google_place_id TEXT,
  verification_status TEXT,
  
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gbp_client ON technical.gbp_profiles(client_id);

-- ============================================================================
-- ANALYTICS SCHEMA: Monitoring (Analytics Agent)
-- ============================================================================

CREATE TABLE analytics.ai_visibility_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Test query
  test_query TEXT,
  ai_engine TEXT,
  
  -- Results
  brand_mentioned BOOLEAN,
  citation_position INTEGER,
  citation_snippet TEXT,
  
  tested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_visibility_client ON analytics.ai_visibility_tracking(client_id);
CREATE INDEX idx_ai_visibility_tested ON analytics.ai_visibility_tracking(tested_at DESC);

CREATE TABLE analytics.metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Metric
  metric_name TEXT,
  metric_value REAL,
  
  -- Period
  period_start DATE,
  period_end DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_client ON analytics.metrics(client_id);

-- ============================================================================
-- PLATFORM SCHEMA: System/Meta (All Agents)
-- ============================================================================

CREATE TABLE platform.agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  agent_name TEXT UNIQUE NOT NULL,
  agent_type TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB,
  
  -- Performance tracking
  total_tasks_executed INTEGER DEFAULT 0,
  successful_tasks INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the 4 core agents
INSERT INTO platform.agents (agent_name, agent_type, config) VALUES
('sdr', 'core', '{"tasks": ["prospect_discovery", "lead_qualification", "email_outreach"]}'::jsonb),
('content', 'core', '{"tasks": ["content_research", "article_writing", "entity_optimization", "citation_building"]}'::jsonb),
('technical', 'core', '{"tasks": ["schema_implementation", "gbp_management", "nap_consistency"]}'::jsonb),
('analytics', 'core', '{"tasks": ["ai_visibility_monitoring", "citation_tracking", "performance_reporting"]}'::jsonb);

CREATE TABLE platform.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What to do
  task_type TEXT NOT NULL,
  task_params JSONB,
  
  -- Who does it
  assigned_to_agent TEXT REFERENCES platform.agents(agent_name),
  
  -- Context
  client_id UUID REFERENCES public.clients(id),
  
  -- Status
  status TEXT DEFAULT 'queued',
  priority INTEGER DEFAULT 0,
  
  -- Results
  result JSONB,
  error_message TEXT,
  
  -- Timing
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_status ON platform.tasks(status, priority DESC);
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
  preview_data JSONB,
  
  -- Approval
  status TEXT DEFAULT 'pending',
  approved_by_user TEXT,
  approved_at TIMESTAMPTZ,
  
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_status ON platform.approvals_queue(status, priority DESC);

-- ============================================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON crm.leads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content.content_pieces 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gbp_updated_at BEFORE UPDATE ON technical.gbp_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS: Common Queries
-- ============================================================================

CREATE VIEW public.csm_approval_dashboard AS
SELECT 
  a.id,
  a.approval_type,
  a.priority,
  a.preview_title,
  a.preview_data,
  c.company_name,
  a.created_at as submitted_at
FROM platform.approvals_queue a
LEFT JOIN public.clients c ON a.client_id = c.id
WHERE a.status = 'pending'
ORDER BY a.priority DESC, a.created_at ASC;
