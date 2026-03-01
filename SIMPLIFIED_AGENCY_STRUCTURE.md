# Simplified AI Agency Structure (3-4 Agents)

## Core Philosophy

**Instead of 15 specialized agents → 3-4 generalist agents with modular tasks**

Each agent is a **role** that can execute multiple **tasks** using shared **sub-agents/tools**.

## The 4 Core Agents

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agency Structure                      │
└─────────────────────────────────────────────────────────────┘

1. 🎯 SDR Agent (Sales/Prospecting)
   ├── Discover leads
   ├── Qualify & score
   ├── Outreach campaigns
   └── Demo generation

2. 📝 Content Agent (Content Creation)
   ├── Research & strategy
   ├── Write articles
   ├── Entity optimization
   └── Citation building

3. 🔧 Technical Agent (Implementation)
   ├── Schema markup
   ├── GBP/NAP management
   ├── Site optimization
   └── Technical SEO

4. 📊 Analytics Agent (Monitoring & Reporting)
   ├── AI visibility tracking
   ├── Citation monitoring
   ├── Competitive analysis
   └── Client reporting

+ CSM (You - Human Sign-off)
```

## Agent Deep Dive

### 1. SDR Agent

**One agent, multiple tasks:**

```typescript
const SDRAgent = {
  role: 'sdr',
  tasks: [
    'prospect_discovery',
    'lead_qualification', 
    'email_outreach',
    'demo_creation',
    'follow_up'
  ],
  
  // Task execution
  async execute(task, params) {
    switch(task) {
      case 'prospect_discovery':
        // 1. Use discover-businesses tool
        // 2. Store in Supabase leads table
        // 3. Enrich contact data
        break;
        
      case 'lead_qualification':
        // 1. Audit website
        // 2. Calculate GEO/AEO opportunity score
        // 3. Update lead_score in Supabase
        break;
        
      case 'email_outreach':
        // 1. Query learning.db for best templates
        // 2. Personalize based on audit data
        // 3. Submit to approval queue
        // 4. If approved, send via Gmail
        break;
        
      case 'demo_creation':
        // 1. Generate AI visibility report
        // 2. Create before/after projections
        // 3. Store in Supabase Storage
        break;
    }
  }
};
```

**Database Tables:**
- `leads` - All prospects
- `lead_scores` - Qualification data
- `email_campaigns` - Outreach tracking
- `demos` - Generated reports

### 2. Content Agent

**One agent, multiple tasks:**

```typescript
const ContentAgent = {
  role: 'content',
  tasks: [
    'content_research',
    'article_writing',
    'entity_optimization',
    'citation_building',
    'faq_generation'
  ],
  
  async execute(task, params) {
    switch(task) {
      case 'content_research':
        // 1. Query AI engines for topic
        // 2. Find what content is being cited
        // 3. Identify gaps
        // 4. Store in content_gap_analysis table
        break;
        
      case 'article_writing':
        // 1. Get research from content_gap_analysis
        // 2. Generate article optimized for AI
        // 3. Save draft to Supabase Storage
        // 4. Submit to approval queue
        break;
        
      case 'entity_optimization':
        // 1. Generate schema markup
        // 2. Build knowledge graph
        // 3. Optimize entity relationships
        break;
        
      case 'citation_building':
        // 1. Find high-authority sources AI trusts
        // 2. Create outreach for backlinks
        // 3. Track citation acquisition
        break;
    }
  }
};
```

**Database Tables:**
- `content_pieces` - All articles/content
- `content_gaps` - Opportunities identified
- `entities` - Knowledge graph data
- `citations` - Backlink tracking

### 3. Technical Agent

**One agent, multiple tasks:**

```typescript
const TechnicalAgent = {
  role: 'technical',
  tasks: [
    'schema_implementation',
    'gbp_management',
    'nap_consistency',
    'site_optimization',
    'technical_audit'
  ],
  
  async execute(task, params) {
    switch(task) {
      case 'schema_implementation':
        // 1. Generate schema markup
        // 2. Write code to implement it
        // 3. Submit to approval queue
        break;
        
      case 'gbp_management':
        // 1. Update NAP data
        // 2. Post updates
        // 3. Respond to reviews
        break;
        
      case 'nap_consistency':
        // 1. Audit NAP across platforms
        // 2. Identify inconsistencies
        // 3. Create update tasks
        break;
    }
  }
};
```

**Database Tables:**
- `gbp_profiles` - Google Business Profiles
- `nap_citations` - NAP mentions across web
- `schema_implementations` - Schema markup tracking
- `technical_audits` - Site health checks

### 4. Analytics Agent

**One agent, multiple tasks:**

```typescript
const AnalyticsAgent = {
  role: 'analytics',
  tasks: [
    'ai_visibility_monitoring',
    'citation_tracking',
    'competitive_analysis',
    'performance_reporting'
  ],
  
  async execute(task, params) {
    switch(task) {
      case 'ai_visibility_monitoring':
        // 1. Query ChatGPT/Perplexity daily
        // 2. Track if client is mentioned
        // 3. Store in ai_visibility_tracking
        break;
        
      case 'citation_tracking':
        // 1. Check all client citations
        // 2. Verify they still show in AI
        // 3. Alert if citations drop
        break;
        
      case 'competitive_analysis':
        // 1. Query competitors
        // 2. Compare AI visibility
        // 3. Identify gaps
        break;
        
      case 'performance_reporting':
        // 1. Aggregate all metrics
        // 2. Generate insights
        // 3. Create client reports
        break;
    }
  }
};
```

**Database Tables:**
- `ai_visibility_tracking` - Daily AI search tests
- `ai_search_rankings` - Position tracking
- `competitor_analysis` - Competitive data
- `reports` - Generated reports

## Shared Sub-Agents (Reusable Tools)

These are **shared utilities** all agents can use:

```typescript
const SharedSubAgents = {
  // Research
  web_scraper: { /* scrape websites */ },
  ai_query_executor: { /* query ChatGPT/Perplexity */ },
  
  // Creation
  content_generator: { /* LLM writing */ },
  schema_generator: { /* generate schema markup */ },
  
  // Data
  database_operations: { /* Supabase queries */ },
  file_storage: { /* upload files */ },
  
  // Communication
  email_sender: { /* Gmail */ },
  approval_submitter: { /* CSM queue */ },
};
```

## Simplified Database Architecture

### Core Tables (Domain-Based)

```sql
-- ============================================
-- CRM DOMAIN (SDR Agent)
-- ============================================
leads
lead_scores
email_campaigns
demos

-- ============================================
-- CONTENT DOMAIN (Content Agent)
-- ============================================
content_pieces
content_gaps
entities
citations

-- ============================================
-- TECHNICAL DOMAIN (Technical Agent)
-- ============================================
gbp_profiles
nap_citations
schema_implementations
technical_audits

-- ============================================
-- ANALYTICS DOMAIN (Analytics Agent)
-- ============================================
ai_visibility_tracking
ai_search_rankings
competitor_analysis
reports

-- ============================================
-- SHARED (All Agents)
-- ============================================
clients                 -- Shared client master table
tasks                   -- Shared work queue
approvals_queue         -- Shared CSM review queue
audit_log               -- Shared activity log
agent_runs              -- Track agent executions
```

## Modular Task Framework

### Task Definition

```typescript
interface Task {
  id: string;
  name: string;
  agent: 'sdr' | 'content' | 'technical' | 'analytics';
  
  // Execution
  handler: (params: any) => Promise<any>;
  
  // Dependencies
  requiredTools: string[];
  requiredSubAgents: string[];
  
  // Workflow
  requiresApproval: boolean;
  estimatedDuration: number;
  
  // Learning
  successCriteria: (result: any) => boolean;
}
```

### Example: Email Outreach Task

```typescript
const EmailOutreachTask: Task = {
  id: 'email_outreach',
  name: 'Email Outreach',
  agent: 'sdr',
  
  async handler(params) {
    // 1. Get lead data
    const lead = await supabase.from('leads').select('*').eq('id', params.leadId).single();
    
    // 2. Check learning DB for best template
    const template = await sqlite.query(
      "SELECT * FROM knowledge_base WHERE topic = 'email_templates' ORDER BY confidence DESC LIMIT 1"
    );
    
    // 3. Personalize using audit data
    const email = personalizeEmail(template, lead);
    
    // 4. Submit to approval queue
    await supabase.from('approvals_queue').insert({
      approval_type: 'email',
      created_by_agent: 'sdr',
      preview_data: { to: lead.email, subject: email.subject, body: email.body }
    });
    
    // 5. Wait for approval (polling or webhook)
    // 6. If approved, send
    // 7. Track in email_campaigns table
  },
  
  requiredTools: ['supabase-database', 'database', 'send-gmail'],
  requiredSubAgents: ['email_personalizer', 'approval_submitter'],
  requiresApproval: true,
  
  successCriteria: (result) => result.sent && result.approved
};
```

## How It Scales

### Adding New Service = Add Tasks, Not Agents

```typescript
// Want to add LinkedIn outreach?
// DON'T create a new "LinkedIn Agent"
// DO add a task to existing SDR Agent

SDRAgent.tasks.push({
  id: 'linkedin_outreach',
  handler: async (params) => {
    // LinkedIn outreach logic
  }
});

// Want to add video content?
// DON'T create a new "Video Agent"  
// DO add a task to existing Content Agent

ContentAgent.tasks.push({
  id: 'video_script_writing',
  handler: async (params) => {
    // Video script logic
  }
});
```

## Database: Modular & Cohesive

### Modular (Domain Tables)
Each agent has its own domain tables:

```
SDR Agent → leads, email_campaigns, demos
Content Agent → content_pieces, entities, citations
Technical Agent → gbp_profiles, schema_implementations
Analytics Agent → ai_visibility_tracking, reports
```

### Cohesive (Shared Tables)
All agents reference shared core:

```
All Agents → clients (master client record)
All Agents → tasks (work queue)
All Agents → approvals_queue (CSM review)
All Agents → audit_log (activity tracking)
```

### Foreign Keys Connect Everything

```sql
-- Lead becomes client
leads.id → clients.lead_id

-- Client owns content
clients.id → content_pieces.client_id

-- Client has GBP
clients.id → gbp_profiles.client_id

-- Everything tracked in metrics
clients.id → ai_visibility_tracking.client_id
```

## Recommendation

**4 Agents + Task-Based Execution + Shared Sub-Agents**

This gives you:
- ✅ Simple to understand (4 clear roles)
- ✅ Easy to scale (add tasks, not agents)
- ✅ Modular (tasks are independent)
- ✅ Cohesive (shared database & tools)
- ✅ Reusable (sub-agents shared across agents)

**Should we redesign with this structure?**

Or is there a specific agent/role you want to start with to prove the concept?
