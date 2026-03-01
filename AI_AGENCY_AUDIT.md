# AI Agency Architecture Audit

## 1. Mission Check: AEO/GEO Agency

### What I Captured ✅
- Focus on GEO (Generative Engine Optimization)
- Focus on AEO (Answer Engine Optimization)
- Content creation optimized for AI engines

### What I MISSED ❌

#### A. Citation Building
**Critical for AEO/GEO!**
- Getting cited by ChatGPT, Perplexity, Claude
- Building authority signals AI engines trust
- Backlink strategy for AI crawlers

**New Role Needed:**
```
Citation Builder Agent
├── Monitor AI engine citations
├── Build high-authority backlinks
├── Create linkable assets
├── Pitch to AI-cited sources
└── Track citation growth
```

#### B. AI Search Monitoring
**Missing from current design!**
- Track brand mentions in ChatGPT responses
- Monitor Perplexity citations
- Measure "AI visibility score"
- Competitive AI presence analysis

**New Role Needed:**
```
AI Search Analyst Agent
├── Query AI engines daily
├── Track brand visibility
├── Competitive analysis
├── Alert on ranking changes
└── Measure share of voice in AI
```

#### C. Entity Optimization
**Core to AEO!**
- Knowledge graph optimization
- Entity relationships
- Schema markup
- Wikipedia/Wikidata presence

**New Role Needed:**
```
Entity Optimizer Agent
├── Build knowledge graph
├── Create schema markup
├── Manage Wikipedia presence
├── Build entity relationships
└── Optimize for entity understanding
```

#### D. Answer Optimization
**Specific to getting featured in AI responses**
- Q&A content creation
- FAQ optimization
- Featured snippet targeting
- Position zero optimization

**Enhancement to Content Writer:**
```
Content Writer Agent (Enhanced)
├── Original: Create GEO/AEO articles
├── ADD: Generate Q&A content
├── ADD: Optimize for featured snippets
├── ADD: Create FAQ schemas
└── ADD: Answer engine formatting
```

## 2. Complete Role List for AEO/GEO Agency

### Revenue Generation (Sales/SDR)
```
1. Prospector Agent
   - Find businesses that need AEO/GEO
   - Target: Brands not showing up in AI search

2. Lead Qualifier Agent  
   - Audit current AI visibility
   - Score AEO/GEO opportunity size
   - Calculate potential ROI

3. Email Outreach Agent
   - Personalized cold outreach
   - Share AI visibility reports
   - Book discovery calls

4. Demo Creator Agent (NEW!)
   - Generate AI visibility reports
   - Create before/after projections
   - Build compelling case studies
```

### Client Onboarding (Operations)
```
5. Onboarder Agent
   - Collect brand information
   - Set up tracking dashboards
   - Initialize AI monitoring

6. Baseline Analyzer Agent (NEW!)
   - Current AI visibility audit
   - Competitive AI presence
   - Set benchmark metrics
```

### Content & Optimization (Delivery)
```
7. Content Strategist Agent (NEW!)
   - Research what AI engines cite
   - Find content gaps
   - Plan topical authority
   - Identify citation opportunities

8. Content Writer Agent (Enhanced)
   - Create GEO/AEO articles
   - Generate Q&A content
   - Optimize for entity understanding
   - Format for AI parsing

9. Entity Optimizer Agent (NEW!)
   - Schema markup implementation
   - Knowledge graph building
   - Wikipedia presence
   - Entity relationship mapping

10. Citation Builder Agent (NEW!)
    - Outreach to cited sources
    - Build backlinks from AI-trusted domains
    - Create linkable assets
    - Monitor citation growth
```

### Technical Implementation (Delivery)
```
11. GBP Manager Agent
    - NAP consistency (critical for local AI results)
    - Google Business Profile optimization
    - Review management
    - Local entity signals

12. Technical SEO Agent (NEW!)
    - Schema markup implementation
    - Site speed (AI crawler friendly)
    - Structured data
    - API accessibility for AI
```

### Monitoring & Reporting (Analytics)
```
13. AI Search Analyst Agent (NEW!)
    - Daily AI engine queries
    - Track citations in ChatGPT/Perplexity
    - Measure AI visibility
    - Competitive monitoring

14. Performance Reporter Agent
    - Client dashboards
    - ROI tracking
    - Trend analysis
    - Recommendations

15. Competitive Intelligence Agent (NEW!)
    - Monitor competitor AI visibility
    - Identify gaps
    - Benchmark performance
```

### Quality Control (CSM)
```
16. CSM (Human) - Final Approvals
    - Review content before publishing
    - Approve outreach campaigns
    - Client communication
    - Strategic decisions
```

## 3. Modularity & Scalability Analysis

### Current Design Issues ❌

**Problem 1: Monolithic Agent Design**
```typescript
// Current approach - one big agent
const ContentWriterAgent = {
  responsibilities: [
    'research',
    'writing',
    'optimization',
    'publishing',
    'formatting'
  ]
};
// ❌ Hard to scale, hard to improve individual parts
```

### Better Design: Micro-Agent Architecture ✅

```typescript
// Modular approach - composable sub-agents
const ContentWriterAgent = {
  subAgents: [
    ResearchSubAgent,
    OutlineSubAgent,
    WritingSubAgent,
    OptimizationSubAgent,
    FormattingSubAgent,
    PublishingSubAgent
  ]
};
// ✅ Each sub-agent can be improved independently
// ✅ Can swap out sub-agents
// ✅ Can reuse sub-agents across different parent agents
```

### Recommended Framework: Domain + Task Architecture

```
Domain Layer (Business Logic)
├── CRM Domain
│   ├── Lead Management
│   ├── Outreach Management
│   └── Pipeline Management
│
├── Content Domain
│   ├── Strategy
│   ├── Creation
│   ├── Optimization
│   └── Publishing
│
├── Technical Domain
│   ├── Schema Implementation
│   ├── Entity Optimization
│   └── Site Performance
│
└── Analytics Domain
    ├── AI Visibility Tracking
    ├── Citation Monitoring
    └── Reporting

Task Layer (Execution Units)
├── Research Tasks
│   ├── Keyword Research
│   ├── Competitor Analysis
│   ├── Citation Discovery
│   └── Topic Research
│
├── Writing Tasks
│   ├── Outline Generation
│   ├── Content Writing
│   ├── Q&A Creation
│   └── FAQ Generation
│
├── Optimization Tasks
│   ├── Schema Markup
│   ├── Entity Tagging
│   ├── Citation Building
│   └── Answer Optimization
│
└── Monitoring Tasks
    ├── AI Query Testing
    ├── Citation Tracking
    ├── Ranking Monitoring
    └── Performance Analysis

Sub-Agent Layer (Reusable Components)
├── WebScraperSubAgent
├── AIQuerySubAgent
├── SchemaGeneratorSubAgent
├── OutreachSubAgent
└── ApprovalSubAgent
```

## 4. Domain vs Task-Based: Recommendation

### Option A: Domain-Based (Current Design)
```
Pros:
✅ Clear ownership
✅ Aligns with business structure
✅ Easy to understand

Cons:
❌ Duplication across domains
❌ Hard to reuse logic
❌ Tight coupling
```

### Option B: Task-Based
```
Pros:
✅ Highly reusable
✅ Fine-grained control
✅ Easy to optimize individual tasks

Cons:
❌ Complex orchestration
❌ Unclear ownership
❌ Harder to understand flow
```

### ✅ RECOMMENDED: Hybrid Approach

```
Domains (High-Level Organization)
    ↓
Agents (Role-Based, Domain-Specific)
    ↓
Tasks (Reusable Work Units)
    ↓
Sub-Agents (Shared Components)
```

**Example Flow:**
```
Content Domain
    ↓
ContentWriterAgent (owns the process)
    ↓
Tasks:
- ResearchTask (uses: WebScraperSubAgent, AIQuerySubAgent)
- OutlineTask (uses: ContentPlannerSubAgent)
- WritingTask (uses: LLMSubAgent, CitationSubAgent)
- OptimizationTask (uses: SchemaSubAgent, EntitySubAgent)
- PublishingTask (uses: CMSSubAgent, ApprovalSubAgent)
    ↓
Sub-Agents (shared across all agents):
- WebScraperSubAgent
- AIQuerySubAgent
- SchemaSubAgent
- ApprovalSubAgent
```

## 5. Updated Architecture Recommendation

### Database Schema Update

Add these tables:

```sql
-- ============================================
-- AEO/GEO SPECIFIC TABLES
-- ============================================

CREATE TABLE ai_visibility_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Query tracking
  test_query TEXT,
  ai_engine TEXT, -- chatgpt, perplexity, claude, gemini
  
  -- Results
  brand_mentioned BOOLEAN,
  citation_position INTEGER, -- 1-10 or null if not cited
  citation_context TEXT,
  competitor_mentions JSONB,
  
  -- Metadata
  tested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Citation source
  source_url TEXT,
  source_domain TEXT,
  source_authority_score REAL,
  
  -- What's being cited
  cited_content_id UUID REFERENCES content_pieces(id),
  citation_text TEXT,
  
  -- AI engine visibility
  shows_in_chatgpt BOOLEAN DEFAULT FALSE,
  shows_in_perplexity BOOLEAN DEFAULT FALSE,
  
  -- Quality metrics
  relevance_score REAL,
  authority_score REAL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ
);

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Entity info
  entity_name TEXT,
  entity_type TEXT, -- person, organization, product, service
  
  -- Knowledge graph
  schema_markup JSONB,
  wikipedia_url TEXT,
  wikidata_id TEXT,
  
  -- Relationships
  related_entities JSONB,
  
  -- Status
  optimization_score REAL,
  last_updated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_search_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Query
  search_query TEXT,
  query_category TEXT, -- informational, transactional, navigational
  
  -- Rankings
  chatgpt_position INTEGER,
  perplexity_position INTEGER,
  claude_position INTEGER,
  gemini_position INTEGER,
  
  -- Share of voice
  total_ai_mentions INTEGER,
  client_mentions INTEGER,
  competitor_mentions JSONB,
  
  -- Tracking
  measured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_gap_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id),
  
  -- Gap identified
  topic TEXT,
  search_intent TEXT,
  
  -- Opportunity
  current_ai_coverage TEXT, -- who's being cited now
  opportunity_score REAL,
  
  -- Recommendations
  content_type TEXT, -- article, faq, guide, etc.
  target_keywords JSONB,
  citation_targets JSONB, -- sources to get backlinks from
  
  -- Status
  status TEXT DEFAULT 'identified', -- identified, planned, in_progress, completed
  assigned_to_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Agent Registry Update

```sql
-- Update agents table to support sub-agents
ALTER TABLE agents ADD COLUMN parent_agent_id UUID REFERENCES agents(id);
ALTER TABLE agents ADD COLUMN agent_level TEXT; -- parent, task, sub_agent

-- Example data
INSERT INTO agents (agent_name, agent_type, agent_level) VALUES
-- Parent Agents (User-Facing Roles)
('content_writer', 'delivery', 'parent'),
('citation_builder', 'delivery', 'parent'),
('ai_search_analyst', 'analytics', 'parent'),

-- Task Agents (Specific Jobs)
('research_task', 'delivery', 'task'),
('writing_task', 'delivery', 'task'),
('optimization_task', 'delivery', 'task'),

-- Sub-Agents (Reusable Components)
('web_scraper', 'utility', 'sub_agent'),
('ai_query_executor', 'utility', 'sub_agent'),
('schema_generator', 'utility', 'sub_agent'),
('citation_finder', 'utility', 'sub_agent');
```

## Summary of Gaps Found

### What Was Missing:

1. **Citation Building** - Core to AEO/GEO!
2. **AI Search Monitoring** - Track visibility in ChatGPT/Perplexity
3. **Entity Optimization** - Knowledge graph & schema
4. **Content Strategy** - Research what AI engines cite
5. **Competitive Intelligence** - Monitor competitor AI presence
6. **Baseline Analysis** - Before/after metrics
7. **Demo Creator** - Sales tool for prospects
8. **Technical SEO** - AI crawler optimization

### Architecture Improvements Needed:

1. **Sub-Agent Layer** - Reusable components
2. **Task-Based Execution** - More granular than full agents
3. **Hybrid Domain+Task Model** - Best of both worlds
4. **AEO-Specific Tables** - Citations, entities, AI rankings

## Recommended Next Steps

1. **Refine Roles** - Finalize which agents are needed
2. **Design Sub-Agent Framework** - Build reusable components
3. **Update Database Schema** - Add AEO/GEO specific tables
4. **Build Core Loop** - Start with one complete workflow
5. **Add Modularity** - Make agents composable

---

**Key Question: Should we redesign with the hybrid Domain+Task+SubAgent model before implementing?**
