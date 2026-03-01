# Supabase Database Design for AI Agency

## Key Principles

1. **Everything connects through `clients` table** (the "spine" of the database)
2. **Use UUIDs** for all primary keys (better for distributed systems)
3. **Domain-based schemas** for organization (like folders in database)
4. **Foreign keys** ensure referential integrity

## Database Structure

### Supabase Doesn't Have "Folders" - Uses Schemas Instead

```sql
-- PostgreSQL Schemas = Logical namespaces (like folders)

┌─────────────────────────────────────────────────┐
│  Database: oneclaw_production                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Schema: public (default)                       │
│  ├── clients         ← MASTER TABLE             │
│  ├── users                                      │
│  └── audit_log                                  │
│                                                 │
│  Schema: crm                                    │
│  ├── leads                                      │
│  ├── email_campaigns                            │
│  └── outreach_sequences                         │
│                                                 │
│  Schema: content                                │
│  ├── content_pieces                             │
│  ├── citations                                  │
│  └── entities                                   │
│                                                 │
│  Schema: technical                              │
│  ├── gbp_profiles                               │
│  ├── nap_citations                              │
│  └── schema_markup                              │
│                                                 │
│  Schema: analytics                              │
│  ├── ai_visibility_tracking                     │
│  ├── ai_search_rankings                         │
│  └── reports                                    │
│                                                 │
│  Schema: platform                               │
│  ├── agents                                     │
│  ├── tasks                                      │
│  └── approvals_queue                            │
└─────────────────────────────────────────────────┘
```

## Master Schema Design

### The "Spine" - Client Journey

```
lead (crm.leads)
    ↓ [converts]
client (public.clients) ← EVERYTHING REFERENCES THIS
    ↓ [has many]
    ├→ content (content.content_pieces)
    ├→ GBP profile (technical.gbp_profiles)
    ├→ visibility tracking (analytics.ai_visibility_tracking)
    └→ metrics (analytics.metrics)
```

## Complete Schema SQL

```sql
-- ============================================================================
-- SETUP: Create Schemas (Logical Organization)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS content;
CREATE SCHEMA IF NOT EXISTS technical;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS platform;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PUBLIC SCHEMA: Core Master Tables
-- ============================================================================

-- MASTER CLIENT TABLE
-- This is the "spine" - everything else references this
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
  status TEXT DEFAULT 'active', -- active, paused, churned
  contract_start_date DATE,
  monthly_retainer DECIMAL(10,2),
  
  -- Services
  services_enabled JSONB DEFAULT '[]'::jsonb, -- ["geo", "aeo", "gbp", "content"]
  
  -- CSM
  csm_user_id TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (for multi-tenant later)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Indexes
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
  
  -- Location
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',
  
  -- Google data
  google_place_id TEXT,
  google_rating REAL,
  google_reviews INTEGER,
  
  -- Scoring (AEO/GEO opportunity)
  lead_score INTEGER, -- 0-100
  geo_readiness_score REAL, -- 0-10
  aeo_readiness_score REAL, -- 0-10
  opportunity_value DECIMAL(10,2),
  
  -- Pipeline
  stage TEXT DEFAULT 'discovered', 
  -- discovered → qualified → contacted → meeting_set → proposal_sent → won/lost
  
  -- Assignment
  assigned_to TEXT DEFAULT 'sdr', -- Which agent owns this
  
  -- Enrichment data (JSON blobs)
  audit_data JSONB,
  contact_data JSONB,
  
  -- Conversion
  converted_to_client_id UUID REFERENCES public.clients(id),
  converted_at TIMESTAMPTZ,
  
  -- Metadata
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
  
  -- Who are we emailing?
  lead_id UUID REFERENCES crm.leads(id),
  client_id UUID REFERENCES public.clients(id), -- Null if still a lead
  
  -- Email details
  campaign_type TEXT, -- cold_outreach, follow_up, nurture, client_update
  subject TEXT,
  body TEXT,
  template_name TEXT,
  
  -- Sending
  sent_at TIMESTAMPTZ,
  sent_from_email TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  
  -- Engagement
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ,
  replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMPTZ,
  
  -- Approval workflow
  requires_approval BOOLEAN DEFAULT TRUE,
  approval_status TEXT DEFAULT 'pending', -- pending, approved, rejected
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Agent tracking
  created_by_agent TEXT DEFAULT 'sdr',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_campaigns_lead ON crm.email_campaigns(lead_id);
CREATE INDEX idx_email_campaigns_client ON crm.email_campaigns(client_id);
CREATE INDEX idx_email_campaigns_approval ON crm.email_campaigns(approval_status);

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
  
  -- Type
  content_type TEXT, -- blog_post, pillar_content, faq, service_page
  target_keywords JSONB DEFAULT '[]'::jsonb,
  
  -- AEO/GEO optimization
  geo_optimized BOOLEAN DEFAULT FALSE,
  aeo_optimized BOOLEAN DEFAULT FALSE,
  entity_mentions JSONB, -- Entities mentioned in content
  citation_sources JSONB, -- Sources cited
  
  -- Quality scores
  geo_score REAL,
  aeo_score REAL,
  readability_score REAL,
  
  -- Workflow
  status TEXT DEFAULT 'draft', -- draft, awaiting_approval, approved, published
  drafted_by_agent TEXT DEFAULT 'content',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  published_url TEXT,
  
  -- Storage
  draft_file_path TEXT, -- Path in Supabase Storage
  
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
  
  -- Optional: Which content piece earned this citation
  content_piece_id UUID REFERENCES content.content_pieces(id),
  
  -- Citation source
  source_url TEXT,
  source_domain TEXT,
  source_title TEXT,
  source_authority_score REAL, -- Domain authority
  
  -- AI visibility
  shows_in_chatgpt BOOLEAN DEFAULT FALSE,
  shows_in_perplexity BOOLEAN DEFAULT FALSE,
  shows_in_claude BOOLEAN DEFAULT FALSE,
  shows_in_gemini BOOLEAN DEFAULT FALSE,
  
  -- Citation quality
  citation_context TEXT,
  anchor_text TEXT,
  relevance_score REAL,
  
  -- Acquisition
  acquisition_method TEXT, -- organic, outreach, syndication
  acquired_by_agent TEXT DEFAULT 'content',
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_citations_client ON content.citations(client_id);
CREATE INDEX idx_citations_active ON content.citations(is_active, client_id);

CREATE TABLE content.entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Entity details
  entity_name TEXT NOT NULL,
  entity_type TEXT, -- Organization, Person, Product, Service, LocalBusiness
  
  -- Schema.org markup
  schema_markup JSONB,
  
  -- Knowledge graph
  wikipedia_url TEXT,
  wikidata_id TEXT,
  related_entities JSONB,
  
  -- Optimization
  optimization_score REAL,
  is_primary_entity BOOLEAN DEFAULT FALSE, -- Main brand entity
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_client ON content.entities(client_id);
CREATE INDEX idx_entities_primary ON content.entities(client_id, is_primary_entity);

-- ============================================================================
-- TECHNICAL SCHEMA: Implementation (Technical Agent)
-- ============================================================================

CREATE TABLE technical.gbp_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client (1:1 or 1:many for multi-location)
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- NAP (Name, Address, Phone)
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  
  -- GBP
  google_place_id TEXT UNIQUE,
  google_url TEXT,
  
  -- Status
  verification_status TEXT, -- unverified, pending, verified
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Tracking
  last_synced_at TIMESTAMPTZ,
  sync_frequency TEXT DEFAULT 'daily',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gbp_client ON technical.gbp_profiles(client_id);
CREATE INDEX idx_gbp_verified ON technical.gbp_profiles(verification_status);

CREATE TABLE technical.nap_citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to GBP profile
  gbp_profile_id UUID NOT NULL REFERENCES technical.gbp_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Where is NAP listed
  platform TEXT, -- yelp, facebook, yellowpages, etc.
  listing_url TEXT,
  
  -- NAP data on that platform
  listed_name TEXT,
  listed_address TEXT,
  listed_phone TEXT,
  
  -- Consistency check
  name_matches BOOLEAN,
  address_matches BOOLEAN,
  phone_matches BOOLEAN,
  consistency_score REAL, -- 0-1
  
  -- Status
  needs_update BOOLEAN DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nap_client ON technical.nap_citations(client_id);
CREATE INDEX idx_nap_needs_update ON technical.nap_citations(needs_update);

CREATE TABLE technical.schema_implementations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- What page
  page_url TEXT,
  page_type TEXT, -- homepage, service_page, article, etc.
  
  -- Schema.org types implemented
  schema_types JSONB, -- ["Organization", "LocalBusiness", "Product"]
  schema_markup JSONB, -- The actual JSON-LD
  
  -- Validation
  is_valid BOOLEAN DEFAULT TRUE,
  validation_errors JSONB,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, approved, implemented, live
  implemented_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schema_client ON technical.schema_implementations(client_id);
CREATE INDEX idx_schema_status ON technical.schema_implementations(status);

-- ============================================================================
-- ANALYTICS SCHEMA: Monitoring & Reporting (Analytics Agent)
-- ============================================================================

CREATE TABLE analytics.ai_visibility_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- What we tested
  test_query TEXT,
  query_category TEXT, -- brand, service, location, informational
  
  -- AI Engine results
  ai_engine TEXT, -- chatgpt, perplexity, claude, gemini, meta_ai
  
  -- Did client appear?
  brand_mentioned BOOLEAN,
  citation_position INTEGER, -- 1, 2, 3... or null
  citation_snippet TEXT,
  
  -- Competition
  competitors_mentioned JSONB, -- ["Competitor A", "Competitor B"]
  client_rank_vs_competitors INTEGER,
  
  -- Full response (for analysis)
  full_response TEXT,
  
  -- Tracking
  tested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_visibility_client ON analytics.ai_visibility_tracking(client_id);
CREATE INDEX idx_ai_visibility_tested ON analytics.ai_visibility_tracking(tested_at DESC);
CREATE INDEX idx_ai_visibility_mentioned ON analytics.ai_visibility_tracking(client_id, brand_mentioned);

CREATE TABLE analytics.metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Metric details
  metric_name TEXT, -- geo_visibility_rate, aeo_citation_count, ai_traffic, etc.
  metric_value REAL,
  metric_unit TEXT, -- percentage, count, usd, etc.
  
  -- Comparison
  previous_value REAL,
  change_percent REAL,
  
  -- Time period
  period_start DATE,
  period_end DATE,
  reporting_period TEXT, -- daily, weekly, monthly
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_metrics_client ON analytics.metrics(client_id);
CREATE INDEX idx_metrics_period ON analytics.metrics(client_id, period_end DESC);

CREATE TABLE analytics.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Belongs to client
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Report details
  report_type TEXT, -- monthly, quarterly, ad_hoc
  report_title TEXT,
  
  -- Content
  summary TEXT,
  insights JSONB,
  recommendations JSONB,
  
  -- File
  report_file_path TEXT, -- Supabase Storage path
  
  -- Metadata
  generated_by_agent TEXT DEFAULT 'analytics',
  period_start DATE,
  period_end DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_client ON analytics.reports(client_id, created_at DESC);

-- ============================================================================
-- PLATFORM SCHEMA: System/Meta (All Agents)
-- ============================================================================

CREATE TABLE platform.agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Agent identity
  agent_name TEXT UNIQUE NOT NULL, -- sdr, content, technical, analytics
  agent_type TEXT, -- core, utility, specialist
  
  -- Configuration
  is_active BOOLEAN DEFAULT TRUE,
  capabilities JSONB, -- List of tasks this agent can perform
  config JSONB,
  
  -- Performance
  total_tasks_executed INTEGER DEFAULT 0,
  successful_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  avg_execution_time_ms INTEGER,
  
  -- Version
  version TEXT DEFAULT '1.0.0',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE platform.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Task details
  task_type TEXT NOT NULL, -- discover_leads, write_content, track_visibility, etc.
  task_params JSONB,
  
  -- Assignment
  assigned_to_agent TEXT REFERENCES platform.agents(agent_name),
  
  -- Context (what client/resource this is for)
  client_id UUID REFERENCES public.clients(id),
  resource_type TEXT, -- lead, content, gbp, etc.
  resource_id UUID,
  
  -- Execution
  status TEXT DEFAULT 'queued', -- queued, running, completed, failed, cancelled
  priority INTEGER DEFAULT 0,
  
  -- Results
  result JSONB,
  error_message TEXT,
  
  -- Timing
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

CREATE INDEX idx_tasks_status ON platform.tasks(status, priority DESC);
CREATE INDEX idx_tasks_agent ON platform.tasks(assigned_to_agent, status);
CREATE INDEX idx_tasks_client ON platform.tasks(client_id);

CREATE TABLE platform.approvals_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What needs approval
  approval_type TEXT NOT NULL, -- email, content, gbp_update, schema_markup
  
  -- What table/record needs approval
  reference_table TEXT, -- crm.email_campaigns, content.content_pieces, etc.
  reference_id UUID,
  
  -- Context
  client_id UUID REFERENCES public.clients(id),
  
  -- Preview for CSM
  preview_title TEXT,
  preview_data JSONB,
  
  -- Created by
  created_by_agent TEXT,
  
  -- Approval decision
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  approved_by_user TEXT, -- CSM user ID
  approval_notes TEXT,
  approved_at TIMESTAMPTZ,
  
  -- Priority (1-10, higher = more urgent)
  priority INTEGER DEFAULT 5,
  
  -- Expiration (auto-reject if not reviewed)
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_status ON platform.approvals_queue(status, priority DESC);
CREATE INDEX idx_approvals_client ON platform.approvals_queue(client_id);
CREATE INDEX idx_approvals_type ON platform.approvals_queue(approval_type, status);

CREATE TABLE platform.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who did what
  agent_name TEXT,
  user_id TEXT, -- If CSM or human user
  action TEXT, -- created, updated, deleted, approved, rejected
  
  -- What was affected
  resource_table TEXT, -- Full schema.table name
  resource_id UUID,
  
  -- Context
  client_id UUID REFERENCES public.clients(id),
  
  -- Details
  changes JSONB, -- Before/after values
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_client ON platform.audit_log(client_id, created_at DESC);
CREATE INDEX idx_audit_resource ON platform.audit_log(resource_table, resource_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON crm.leads 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content.content_pieces 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gbp_updated_at BEFORE UPDATE ON technical.gbp_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON platform.agents 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS: Common Queries
-- ============================================================================

-- Client overview with all related data counts
CREATE VIEW public.client_overview AS
SELECT 
  c.id,
  c.company_name,
  c.status,
  c.monthly_retainer,
  
  -- Content stats
  (SELECT COUNT(*) FROM content.content_pieces WHERE client_id = c.id) as total_content,
  (SELECT COUNT(*) FROM content.content_pieces WHERE client_id = c.id AND status = 'published') as published_content,
  
  -- Citation stats
  (SELECT COUNT(*) FROM content.citations WHERE client_id = c.id AND is_active = TRUE) as active_citations,
  
  -- AI visibility
  (SELECT AVG(CASE WHEN brand_mentioned THEN 1 ELSE 0 END) 
   FROM analytics.ai_visibility_tracking 
   WHERE client_id = c.id 
   AND tested_at > NOW() - INTERVAL '30 days') as visibility_rate_30d,
  
  c.created_at,
  c.updated_at
FROM public.clients c;

-- Pending approvals for CSM dashboard
CREATE VIEW public.csm_approval_dashboard AS
SELECT 
  a.id as approval_id,
  a.approval_type,
  a.priority,
  a.created_at as submitted_at,
  
  -- Client context
  c.company_name,
  c.id as client_id,
  
  -- Preview
  a.preview_title,
  a.preview_data,
  
  -- Meta
  a.created_by_agent,
  a.expires_at
  
FROM platform.approvals_queue a
LEFT JOIN public.clients c ON a.client_id = c.id
WHERE a.status = 'pending'
ORDER BY a.priority DESC, a.created_at ASC;
```

## Unique Identifiers & Cross-Table Communication

### Primary Strategy: UUIDs Everywhere

```sql
-- All tables use UUID primary keys
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()

-- Benefits:
✅ Globally unique (can merge databases later)
✅ Non-sequential (security)
✅ Generated in code or database
✅ Works across distributed systems
```

### Referencing Across Tables

```typescript
// Example: Lead → Client → Content flow

// 1. SDR Agent discovers lead
const { data: lead } = await supabase.from('crm.leads').insert({
  company_name: 'ABC HVAC',
  stage: 'discovered'
}).select().single();
// Returns: { id: 'uuid-123', ... }

// 2. Lead converts to client
const { data: client } = await supabase.from('public.clients').insert({
  company_name: 'ABC HVAC',
  original_lead_id: lead.id  // ← References lead
}).select().single();
// Returns: { id: 'uuid-456', ... }

// Update lead to mark conversion
await supabase.from('crm.leads').update({
  converted_to_client_id: client.id,  // ← Back-reference
  converted_at: new Date().toISOString()
}).eq('id', lead.id);

// 3. Content Agent creates article
await supabase.from('content.content_pieces').insert({
  client_id: client.id,  // ← References client
  title: 'Best HVAC Tips',
  body: '...'
});

// 4. Analytics Agent tracks visibility
await supabase.from('analytics.ai_visibility_tracking').insert({
  client_id: client.id,  // ← References same client
  test_query: 'best hvac company austin',
  brand_mentioned: true
});
```

### Data Relationships Map

```
public.clients (id: UUID)
    ↑ ↓
    │ └─→ crm.leads.converted_to_client_id
    │
    ├─→ crm.email_campaigns.client_id
    ├─→ content.content_pieces.client_id
    ├─→ content.citations.client_id
    ├─→ content.entities.client_id
    ├─→ technical.gbp_profiles.client_id
    ├─→ technical.nap_citations.client_id
    ├─→ analytics.ai_visibility_tracking.client_id
    ├─→ analytics.metrics.client_id
    └─→ analytics.reports.client_id
```

## Supabase UI Organization

### In Supabase Dashboard

```
Table Editor:
├── 📁 public
│   ├── clients ← START HERE (master table)
│   └── users
│
├── 📁 crm
│   ├── leads
│   └── email_campaigns
│
├── 📁 content
│   ├── content_pieces
│   ├── citations
│   └── entities
│
├── 📁 technical
│   ├── gbp_profiles
│   ├── nap_citations
│   └── schema_implementations
│
├── 📁 analytics
│   ├── ai_visibility_tracking
│   ├── metrics
│   └── reports
│
└── 📁 platform
    ├── agents
    ├── tasks
    ├── approvals_queue
    └── audit_log

Storage:
├── 📁 client-content/
│   ├── abc-hvac/
│   │   ├── article-1.html
│   │   └── article-2.html
│   └── denver-plumbing/
│
├── 📁 audit-screenshots/
│   ├── abc-hvac-homepage.png
│   └── denver-plumbing-homepage.png
│
└── 📁 reports/
    ├── abc-hvac-q1-2026.pdf
    └── denver-plumbing-monthly.pdf
```

## Benefits of This Structure

### ✅ Organization
- Clear schema namespaces (like folders)
- Easy to find tables by domain
- Clean separation of concerns

### ✅ Modularity
- Each schema is independent
- Can add new schemas without touching others
- Easy to add new tables in any schema

### ✅ Cohesion
- All connect through `public.clients`
- UUID foreign keys enforce relationships
- Views provide joined data

### ✅ Scalability
- Add new agent = add new schema
- Add new task = add new table in schema
- No breaking changes

## Example Queries

### Get Everything for a Client

```sql
-- One client's complete data
SELECT 
  c.*,
  
  -- CRM data
  (SELECT json_agg(l.*) FROM crm.leads l WHERE l.converted_to_client_id = c.id) as leads,
  (SELECT COUNT(*) FROM crm.email_campaigns WHERE client_id = c.id) as total_emails,
  
  -- Content data
  (SELECT COUNT(*) FROM content.content_pieces WHERE client_id = c.id) as total_content,
  (SELECT COUNT(*) FROM content.citations WHERE client_id = c.id) as total_citations,
  
  -- Technical data
  (SELECT json_agg(g.*) FROM technical.gbp_profiles g WHERE g.client_id = c.id) as gbp_profiles,
  
  -- Analytics
  (SELECT AVG(CASE WHEN brand_mentioned THEN 1 ELSE 0 END) 
   FROM analytics.ai_visibility_tracking 
   WHERE client_id = c.id) as ai_visibility_rate
   
FROM public.clients c
WHERE c.id = 'client-uuid-here';
```

### CSM Approval Dashboard

```sql
SELECT * FROM public.csm_approval_dashboard
WHERE status = 'pending'
ORDER BY priority DESC, submitted_at ASC;
```

## Recommendation

**Use this schema-based structure:**

1. ✅ Clean organization (schemas = folders)
2. ✅ UUID primary keys everywhere
3. ✅ Everything references `public.clients`
4. ✅ Modular and expandable

**Next step: Should I create the SQL file you can run in Supabase to set this all up?**
