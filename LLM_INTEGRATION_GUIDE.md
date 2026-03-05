# LLM Integration Guide

## ✅ Yes! Your LLM Can Now Discover & Execute Workflows

Your modular workflows are **fully integrated** and accessible to LLMs via the Harness API.

---

## How It Works

### 1. **Workflow Discovery** (LLM asks: "What can I do?")

```bash
GET http://localhost:8787/workflows
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "discover-businesses",
      "name": "Geographic Discovery (Google Maps)",
      "description": "Find local businesses via Google Maps search...",
      "category": "discovery",
      "estimatedCostPer100": 0.50,
      "avgTimePerLead": 500,
      "benchmarks": {
        "avgLeadsFound": 95,
        "emailCoverageRate": 35,
        "dataQualityScore": 8,
        "successRate": 98
      },
      "bestFor": [
        "Finding local service businesses",
        "Companies with physical storefronts"
      ],
      "requiredInputs": ["niche", "location"],
      "optionalInputs": ["limit", "enrich"]
    },
    {
      "id": "discover-hiring-businesses",
      "name": "Job Posting Discovery (Hiring Signal)",
      ...
    }
  ],
  "count": 10
}
```

### 2. **Intent-Based Suggestions** (LLM asks: "Which method for hiring companies?")

```bash
GET http://localhost:8787/workflows?intent=hiring
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "discover-hiring-businesses",
      "name": "Job Posting Discovery (Hiring Signal)",
      ...
    }
  ],
  "count": 1
}
```

### 3. **Workflow Execution** (LLM says: "Run it!")

```bash
POST http://localhost:8787/execute
Content-Type: application/json

{
  "workflowId": "full-sdr-pipeline-geo",
  "input": {
    "niche": "HVAC companies",
    "city": "Austin",
    "state": "TX",
    "limit": 100,
    "checkAIRankings": true
  }
}
```

**Response:**
```json
{
  "jobId": "job_abc123",
  "status": "running",
  "message": "Workflow started successfully"
}
```

---

## LLM Conversation Flow

### Example 1: Clear Intent (Auto-Execute)

**User:** "Find HVAC companies hiring in Austin, TX"

**LLM thinks:**
1. Calls `GET /workflows?intent=hiring`
2. Gets `discover-hiring-businesses` as top match
3. Extracts params: `keyword="HVAC technician"`, `city="Austin"`, `state="TX"`
4. Calls `POST /execute` with `full-sdr-pipeline-hiring`

**LLM responds:**
```
🎯 Found the perfect method: Job Posting Discovery

📊 Expected Results:
- ~70 companies actively hiring
- Quality: 7/10
- Cost: ~$1.00 per 100 leads

🚀 Running discovery now...
JobID: job_abc123
```

---

### Example 2: Ambiguous Intent (Asks User)

**User:** "Find roofing companies in Colorado"

**LLM thinks:**
1. Calls `GET /workflows?intent=roofing colorado`
2. Gets 2+ matches (Google Maps + Hiring Discovery)
3. Presents options to user

**LLM responds:**
```
I found 2 discovery methods that could work:

1. **Geographic Discovery (Google Maps)**
   - Avg leads: 95 per search
   - Quality: 8/10
   - Cost: $0.50 per 100 leads
   ✅ Best for: Finding local service businesses

2. **Job Posting Discovery (Hiring Signal)**
   - Avg leads: 70 per search
   - Quality: 7/10
   - Cost: $1.00 per 100 leads
   ✅ Best for: High-intent signals (hiring = budget)

Which method would you prefer? (1 or 2)
```

---

### Example 3: Budget-Conscious (Smart Filtering)

**User:** "Find plumbing companies but keep it cheap"

**LLM thinks:**
1. Calls `GET /workflows?category=discovery`
2. Sorts by `estimatedCostPer100` (ascending)
3. Picks cheapest: `discover-businesses` ($0.50)

**LLM responds:**
```
💰 For cost-effective discovery, I recommend:

📦 Geographic Discovery (Google Maps)
💵 Cost: $0.50 per 100 leads
⭐ Quality: 8/10
📊 Avg leads: 95 per search

This is our most affordable high-quality option.
Proceed?
```

---

## API Reference

### `GET /workflows`
**Purpose:** List all available workflows with metadata

**Query Params:**
- `?intent=<query>` - Get suggestions based on user intent
- `?category=<type>` - Filter by category (discovery, enrichment, outreach, analysis)

**Response:**
```typescript
{
  workflows: WorkflowMetadata[],
  count: number,
  help: {
    intent: "Usage instructions",
    category: "Filter instructions"
  }
}
```

---

### `GET /workflows/:id`
**Purpose:** Get detailed info about a specific workflow

**Example:**
```bash
GET /workflows/discover-hiring-businesses
```

**Response:**
```json
{
  "workflow": {
    "id": "discover-hiring-businesses",
    "name": "Job Posting Discovery (Hiring Signal)",
    "description": "...",
    "requiredInputs": ["keyword", "location"],
    "benchmarks": { ... }
  }
}
```

---

### `POST /execute`
**Purpose:** Execute a workflow

**Request:**
```json
{
  "workflowId": "full-sdr-pipeline-geo",
  "input": {
    "niche": "HVAC companies",
    "city": "Austin",
    "state": "TX"
  }
}
```

**Response:**
```json
{
  "jobId": "job_abc123",
  "status": "running"
}
```

---

## Testing It Now

### 1. Start the Harness
```bash
cd packages/harness
pnpm run dev
```

### 2. Test Workflow Discovery
```bash
curl http://localhost:8787/workflows
```

### 3. Test Intent-Based Suggestions
```bash
curl "http://localhost:8787/workflows?intent=hiring"
```

### 4. Test Workflow Execution
```bash
curl -X POST http://localhost:8787/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "check-ai-rankings",
    "input": {
      "niche": "HVAC",
      "city": "Austin",
      "state": "TX"
    }
  }'
```

---

## What's Integrated

### ✅ Atomic Workflows
- `discover-businesses`
- `discover-hiring-businesses`
- `check-ai-rankings`
- `match-ai-visibility`
- `generate-hiring-campaign`
- `enrich-contact`

### ✅ Pipeline Workflows
- `full-sdr-pipeline-geo`
- `full-sdr-pipeline-hiring`

### ✅ Metadata Registry
- Cost estimates
- Quality benchmarks
- Use case descriptions
- Input/output schemas

### ✅ LLM-Friendly API
- Intent-based discovery
- Structured JSON responses
- Clear documentation
- Error handling

---

## Next Steps: Building Your LLM Chat Interface

### Option 1: Use the Example
```bash
# Run the provided example
npx tsx examples/llm-chat-with-registry.ts
```

### Option 2: Integrate with Your Chat System
```typescript
import { suggestWorkflows, formatWorkflowOptions } from '@oneclaw/harness/workflows/registry';

async function handleChatMessage(userMessage: string) {
  // Get workflow suggestions
  const suggestions = suggestWorkflows(userMessage);
  
  // If clear intent, execute
  if (suggestions.length === 1) {
    const workflow = suggestions[0];
    return await executeWorkflow(workflow.id, extractParams(userMessage));
  }
  
  // If ambiguous, present options
  return formatWorkflowOptions(suggestions);
}
```

---

## Summary

**Q: Does it work?**  
✅ **Yes!** Workflows are registered, exposed via API, and discoverable by LLMs.

**Q: Can I talk to my LLM and it will know what to do?**  
✅ **Yes!** LLM can:
1. Discover available workflows (`GET /workflows`)
2. Get suggestions based on intent (`?intent=hiring`)
3. Execute workflows (`POST /execute`)
4. Handle ambiguous queries (present options to user)

**Your LLM is ready to intelligently select and execute modular workflows! 🚀**
