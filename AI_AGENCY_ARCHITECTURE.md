# OneClaw AI-Native Agency Architecture

## Vision

AI-native marketing agency focused on GEO (Generative Engine Optimization) and AEO (Answer Engine Optimization).

## Agency Org Chart

```
                    ┌─────────────────────┐
                    │   CSM (Human)       │
                    │  Final Sign-off     │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
    ┌───────▼────────┐  ┌─────▼──────┐  ┌───────▼────────┐
    │ Sales/SDR Team │  │ Operations │  │ Delivery Team  │
    └───────┬────────┘  └─────┬──────┘  └───────┬────────┘
            │                 │                  │
    ┌───────┴────────┐  ┌─────┴──────┐  ┌───────┴────────┐
    │                │  │            │  │                │
┌───▼────┐    ┌─────▼──┐ │  ┌────────▼──┐ │  ┌──────────▼───┐
│ Prospector  │ Lead   │ │  │ Client    │ │  │ Content      │
│ (Find leads)│ Qualifier│ │ Onboarder │ │  │ Writer       │
└────────┘    └────────┘ │  └───────────┘ │  │ (Articles)   │
                         │                │  └──────────────┘
                    ┌────▼────┐      ┌────▼────┐
                    │ Email   │      │ GBP     │
                    │ Outreach│      │ Manager │
                    └─────────┘      │ (NAP)   │
                                     └─────────┘
                                     
                                     ┌──────────┐
                                     │ Reporter │
                                     │ (Analytics)│
                                     └──────────┘
```

## AI Agents (Roles)

### 1. SDR/Outreach Team

#### 1.1 Prospector Agent
**Purpose:** Find and qualify potential clients
```
Responsibilities:
- Discover businesses in target niches
- Enrich contact data
- Score lead quality
- Categorize by vertical

Tools Used:
- discover-businesses
- enrich-contact
- supabase-database (store leads)

Output:
- Qualified leads in CRM
- Contact information
- Business metadata
```

#### 1.2 Lead Qualifier Agent
**Purpose:** Research and score leads
```
Responsibilities:
- Audit website quality
- Check GEO/AEO readiness
- Identify pain points
- Prioritize outreach

Tools Used:
- audit-website
- supabase-database (update scores)

Output:
- Lead scores
- Audit reports
- Opportunity notes
```

#### 1.3 Email Outreach Agent
**Purpose:** Personalized cold outreach
```
Responsibilities:
- Generate personalized emails
- A/B test subject lines
- Schedule follow-ups
- Track engagement

Tools Used:
- database (learning.db for templates)
- send-gmail
- supabase-database (track outreach)

Requires CSM Approval:
✅ YES - Review email templates before sending
```

### 2. Operations Team

#### 2.1 Client Onboarder Agent
**Purpose:** Onboard new clients
```
Responsibilities:
- Collect client information
- Set up dashboards
- Create project timeline
- Initialize tracking

Tools Used:
- supabase-database (client records)
- supabase-storage (onboarding docs)

Requires CSM Approval:
✅ YES - Review onboarding plan
```

### 3. Delivery Team

#### 3.1 Content Writer Agent
**Purpose:** Create GEO/AEO optimized content
```
Responsibilities:
- Research topics
- Generate articles
- Optimize for AI engines
- Create citations

Tools Used:
- execute-code (research scripts)
- write-file (draft articles)
- supabase-storage (store articles)

Requires CSM Approval:
✅ YES - Review articles before publishing
```

#### 3.2 GBP Manager Agent
**Purpose:** Manage Google Business Profiles
```
Responsibilities:
- Update NAP (Name, Address, Phone)
- Post updates
- Respond to reviews
- Track rankings

Tools Used:
- supabase-database (NAP data)
- external APIs (Google My Business)

Requires CSM Approval:
✅ YES - Review before posting
```

#### 3.3 Reporter Agent
**Purpose:** Analytics and reporting
```
Responsibilities:
- Track KPIs
- Generate reports
- Identify trends
- Recommend optimizations

Tools Used:
- supabase-database (query metrics)
- execute-code (generate charts)

Requires CSM Approval:
❌ NO - Informational only
```

## Shared Supabase Architecture

### Yes, ONE Supabase - Organized by Domain

```
┌────────────────────────────────────────────────────────────┐
│                    ONECLAW SUPABASE                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  CRM Domain (Sales/SDR)                                    │
│  ├── leads                                                 │
│  ├── outreach_sequences                                    │
│  ├── email_campaigns                                       │
│  └── lead_scores                                           │
│                                                            │
│  Client Domain (Operations)                                │
│  ├── clients                                               │
│  ├── onboarding_tasks                                      │
│  ├── client_projects                                       │
│  └── approvals                                             │
│                                                            │
│  Delivery Domain (Service Delivery)                        │
│  ├── content_pieces                                        │
│  ├── gbp_profiles                                          │
│  ├── nap_updates                                           │
│  └── publications                                          │
│                                                            │
│  Analytics Domain (Reporting)                              │
│  ├── metrics                                               │
│  ├── kpis                                                  │
│  └── reports                                               │
│                                                            │
│  Agency Meta (System)                                      │
│  ├── agents (AI agent registry)                            │
│  ├── tasks (work queue)                                    │
│  ├── approvals_queue (CSM review)                          │
│  └── audit_log                                             │
│                                                            │
│  Storage Buckets                                           │
│  ├── client-onboarding/                                    │
│  ├── content-drafts/                                       │
│  ├── published-articles/                                   │
│  ├── audit-reports/                                        │
│  └── screenshots/                                          │
└────────────────────────────────────────────────────────────┘
```

## Database Schema Design

### Core Principle: Domain-Driven Tables

Each domain has its own tables but they reference each other:

```sql
-- ============================================
-- CRM DOMAIN (Prospecting & Outreach)
-- ============================================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Business Info
  company_name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  
  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Scoring
  lead_score INTEGER,
  geo_readiness_score REAL,
  aeo_readiness_score REAL,
  
  -- Stages
  stage TEXT DEFAULT 'discovered', -- discovered, qualified, contacted, meeting_set, proposal, won, lost
  assigned_to_agent TEXT, -- Which AI agent owns this
  
  -- Metadata
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outreach_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  
  sequence_name TEXT, -- e.g., "hvac_cold_outreach_v1"
  
  -- Email tracking
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'active', -- active, paused, completed
  next_step_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outreach_sequence_id UUID REFERENCES outreach_sequences(id),
  
  -- Email details
  subject TEXT,
  body TEXT,
  template_name TEXT,
  
  -- Sending
  sent_at TIMESTAMPTZ,
  sent_from TEXT,
  gmail_message_id TEXT,
  
  -- Engagement
  opened BOOLEAN DEFAULT FALSE,
  clicked BOOLEAN DEFAULT FALSE,
  replied BOOLEAN DEFAULT FALSE,
  
  -- Approval workflow
  requires_approval BOOLEAN DEFAULT TRUE,
  approved_by TEXT, -- CSM user ID
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CLIENT DOMAIN (Operations)
-- ============================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Converted from lead
  lead_id UUID REFERENCES leads(id),
  
  -- Client info
  company_name TEXT NOT NULL,
  industry TEXT,
  
  -- Contract
  contract_start_date DATE,
  contract_end_date DATE,
  monthly_retainer DECIMAL,
  
  -- Service tier
  service_tier TEXT, -- starter, growth, enterprise
  services JSONB, -- ["geo", "aeo", "gbp", "content"]
  
  -- Status
  status TEXT DEFAULT 'active', -- active, paused, churned
  
  -- CSM assignment
  csm_name TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  task_name TEXT,
  task_type TEXT, -- collect_info, setup_tracking, create_content, etc.
  
  status TEXT DEFAULT 'pending', -- pending, in_progress, awaiting_approval, completed
  assigned_to_agent TEXT,
  
  -- Approval
  requires_approval BOOLEAN DEFAULT TRUE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  
  due_date DATE,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DELIVERY DOMAIN (Service Delivery)
-- ============================================

CREATE TABLE content_pieces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Content
  title TEXT,
  body TEXT,
  word_count INTEGER,
  
  -- Type
  content_type TEXT, -- blog_post, pillar_content, faq, etc.
  target_keywords JSONB,
  
  -- GEO/AEO optimization
  geo_score REAL,
  aeo_score REAL,
  citations JSONB,
  
  -- Workflow
  status TEXT DEFAULT 'draft', -- draft, awaiting_approval, approved, published
  drafted_by_agent TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  -- Storage
  draft_url TEXT, -- Supabase Storage link
  published_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gbp_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- NAP
  business_name TEXT,
  address TEXT,
  phone TEXT,
  
  -- GBP
  google_place_id TEXT,
  google_url TEXT,
  
  -- Status
  verification_status TEXT,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nap_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gbp_profile_id UUID REFERENCES gbp_profiles(id),
  
  -- What changed
  field_name TEXT, -- name, address, phone, hours, etc.
  old_value TEXT,
  new_value TEXT,
  
  -- Approval
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, published
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ANALYTICS DOMAIN (Reporting)
-- ============================================

CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Metric
  metric_name TEXT, -- geo_visibility, aeo_citations, organic_traffic, etc.
  metric_value REAL,
  metric_unit TEXT,
  
  -- Time
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  reporting_period TEXT, -- daily, weekly, monthly
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AGENCY META (System/Platform)
-- ============================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  agent_name TEXT UNIQUE, -- prospector, email_outreach, content_writer, etc.
  agent_type TEXT, -- sdr, operations, delivery, reporting
  
  -- Configuration
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB,
  
  -- Performance
  tasks_completed INTEGER DEFAULT 0,
  success_rate REAL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Assignment
  assigned_to_agent TEXT REFERENCES agents(agent_name),
  
  -- Task details
  task_type TEXT,
  task_data JSONB,
  
  -- Status
  status TEXT DEFAULT 'queued', -- queued, in_progress, completed, failed
  
  -- Results
  result JSONB,
  error_message TEXT,
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE approvals_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What needs approval
  approval_type TEXT, -- email, content, gbp_update, onboarding_plan
  reference_id UUID, -- ID of the thing needing approval
  reference_table TEXT, -- Which table the reference_id points to
  
  -- Created by which agent
  created_by_agent TEXT,
  
  -- Preview data for CSM
  preview_data JSONB,
  
  -- Approval
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  approved_by TEXT, -- CSM user ID
  approval_notes TEXT,
  approved_at TIMESTAMPTZ,
  
  -- Priority
  priority INTEGER DEFAULT 0, -- Higher = more urgent
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who/What
  agent_name TEXT,
  action TEXT,
  
  -- Context
  resource_type TEXT, -- lead, client, content, etc.
  resource_id UUID,
  
  -- Details
  changes JSONB,
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## How Agents Work Together

### Example: SDR Workflow

```typescript
// 1. Prospector discovers leads
await supabase.from('leads').insert({
  company_name: 'ABC HVAC',
  website: 'https://abchvac.com',
  stage: 'discovered',
  assigned_to_agent: 'prospector'
});

// 2. Lead Qualifier audits and scores
const audit = await harness.execute('audit-website', {...});
await supabase.from('leads').update({
  lead_score: 85,
  geo_readiness_score: 6.5,
  stage: 'qualified',
  assigned_to_agent: 'email_outreach'
}).eq('id', leadId);

// 3. Email Outreach Agent drafts email
const email = await generateEmail(lead);

// 4. Create approval request for CSM
await supabase.from('approvals_queue').insert({
  approval_type: 'email',
  reference_id: emailId,
  reference_table: 'email_campaigns',
  created_by_agent: 'email_outreach',
  preview_data: { subject, body, to: lead.contact_email }
});

// 5. CSM reviews in dashboard
// 6. If approved, send email
if (approved) {
  await harness.execute('send-gmail', {...});
  await supabase.from('email_campaigns').update({
    approved_by: csmId,
    approved_at: now(),
    sent_at: now()
  });
}
```

## Modularity & Cohesion

### Modular by Domain
✅ Each domain has its own tables
✅ Clear boundaries between CRM, Client, Delivery, Analytics
✅ Easy to add new domains (e.g., billing, hr)

### Cohesive via References
✅ Foreign keys connect domains
✅ `lead_id` → `client_id` → `content_pieces`
✅ Audit log tracks all cross-domain actions

### Shared Services
✅ One approval queue for all agents
✅ One task queue for all work
✅ One audit log for compliance

## CSM Dashboard Requirements

The CSM needs a dashboard to approve:

1. **Outreach Emails** - Before sending
2. **Content** - Before publishing
3. **GBP Updates** - Before posting
4. **Onboarding Plans** - Before starting

**Query for approval queue:**
```sql
SELECT * FROM approvals_queue 
WHERE status = 'pending' 
ORDER BY priority DESC, created_at ASC;
```

## Next Steps to Discuss

1. **Agent Autonomy Levels**
   - Which agents can auto-execute?
   - Which always need CSM approval?

2. **Multi-Tenancy**
   - One agency = one Supabase?
   - Or support multiple agencies in one DB?

3. **Billing/Pricing**
   - Track usage per client?
   - Metering for AI costs?

4. **Handoffs**
   - How does a lead transition to client?
   - Who owns the relationship at each stage?

---

**What do you think? Should we refine the org chart, or dive into implementing the approval workflow first?**
