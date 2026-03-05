# Modular Workflow Architecture

## Philosophy: Small, Focused, Composable

Instead of monolithic "God Workflows" that do everything, we now have:

1. **Atomic Workflows** - Single responsibility, pure functions
2. **Pipeline Workflows** - Orchestrate atomic workflows
3. **Durable Execution** - Each step is checkpointed

---

## Atomic Workflows (Building Blocks)

### Discovery
- `discover-businesses` - Google Maps discovery
- `discover-hiring-businesses` - Job posting discovery

### Analysis
- `check-ai-rankings` - Query Perplexity for AI search results
- `match-ai-visibility` - Match businesses against AI results (pure function)

### Outreach
- `generate-hiring-campaign` - Create personalized hiring emails
- `enrich-contact` - Find contact info

---

## Pipeline Workflows (Orchestrators)

### `full-sdr-pipeline-geo`
**Long-form durable workflow for geographic discovery**

```typescript
{
  niche: "HVAC companies",
  city: "Austin",
  state: "TX",
  service: "AC repair", // Optional
  limit: 100,
  checkAIRankings: true,
  storeInSupabase: true
}
```

**Steps:**
1. Discover businesses (Google Maps)
2. Check AI rankings (optional)
3. Match visibility
4. Store in Supabase

**Use when:** You want established businesses with physical locations.

---

### `full-sdr-pipeline-hiring`
**Long-form durable workflow for hiring signal discovery**

```typescript
{
  keyword: "HVAC technician",
  city: "Austin",
  state: "TX",
  service: "HVAC services", // Optional
  days: 30,
  maxResults: 100,
  checkAIRankings: true,
  storeInSupabase: true
}
```

**Steps:**
1. Discover hiring businesses (job postings)
2. Check AI rankings (optional)
3. Match visibility
4. Store in Supabase

**Use when:** You want growth-stage companies actively hiring.

---

## Benefits of This Architecture

### ✅ Modularity
```typescript
// Want JUST AI rankings? Use the atomic workflow:
const result = await runner.execute('check-ai-rankings', {
  niche: 'HVAC',
  city: 'Austin',
  state: 'TX'
});

// Want the full pipeline? Use the orchestrator:
const result = await runner.execute('full-sdr-pipeline-geo', {
  niche: 'HVAC companies',
  city: 'Austin',
  state: 'TX'
});
```

### ✅ Durability
Each step is checkpointed. If Step 3 fails:
- Steps 1 & 2 don't need to re-run
- Resume from the failure point
- Artifacts saved at each step

### ✅ Testability
```typescript
// Test atomic workflows in isolation
test('check-ai-rankings returns top businesses', async () => {
  const result = await checkAIRankingsHandler(ctx, {
    niche: 'HVAC',
    city: 'Austin',
    state: 'TX'
  });
  
  expect(result.top_businesses).toBeDefined();
  expect(result.total_businesses_mentioned).toBeGreaterThan(0);
});
```

### ✅ Composability
Build new pipelines by mixing atomic workflows:

```typescript
// Custom pipeline: Discovery + AI visibility + Custom scoring
async function myCustomPipeline(ctx, input) {
  // Step 1: Discover
  const businesses = await runner.execute('discover-businesses', {...});
  
  // Step 2: Check AI
  const aiRankings = await runner.execute('check-ai-rankings', {...});
  
  // Step 3: Custom logic
  const scored = myCustomScoringLogic(businesses, aiRankings);
  
  return scored;
}
```

---

## Migration Guide

### ❌ Old Way (Monolithic)
```typescript
// complete-sdr-discovery.ts - 400+ lines, does everything
const result = await runner.execute('complete-sdr-discovery', {
  method: 'auto', // Magic
  niche: 'HVAC',
  city: 'Austin',
  state: 'TX'
});
```

**Problems:**
- Can't reuse parts
- Hard to test
- All-or-nothing execution
- Complex configuration

### ✅ New Way (Modular)
```typescript
// Option 1: Use atomic workflows for flexibility
const businesses = await runner.execute('discover-businesses', {...});
const aiRankings = await runner.execute('check-ai-rankings', {...});
const visibility = await runner.execute('match-ai-visibility', {...});

// Option 2: Use pipeline for convenience
const result = await runner.execute('full-sdr-pipeline-geo', {
  niche: 'HVAC companies',
  city: 'Austin',
  state: 'TX'
});
```

**Benefits:**
- Mix and match workflows
- Test each piece separately
- Durable execution with checkpoints
- Clear, explicit inputs

---

## When to Use What

### Atomic Workflows
**Use when:**
- You need ONE specific thing (e.g., just AI rankings)
- Building a custom pipeline
- Testing/debugging individual steps

**Examples:**
- `check-ai-rankings` - Just get AI visibility data
- `match-ai-visibility` - Just match businesses against rankings

### Pipeline Workflows
**Use when:**
- You want the full end-to-end flow
- You need durability (resume from failures)
- You want convenience over flexibility

**Examples:**
- `full-sdr-pipeline-geo` - Geographic discovery → AI check → Store
- `full-sdr-pipeline-hiring` - Hiring discovery → AI check → Store

---

## Cost Optimization

### Atomic = Pay for What You Use
```typescript
// Only pay for discovery ($0.50 per 100)
await runner.execute('discover-businesses', {...});

// Only pay for AI rankings ($0.02 per query)
await runner.execute('check-ai-rankings', {...});
```

### Pipeline = Opt-in to Expensive Steps
```typescript
await runner.execute('full-sdr-pipeline-geo', {
  niche: 'HVAC',
  city: 'Austin',
  state: 'TX',
  checkAIRankings: false, // Skip AI check ($0 cost)
  storeInSupabase: false  // Skip storage (dry run)
});
```

---

## Next Steps

### Deprecate
- ❌ `complete-sdr-discovery` - Too complex, use pipelines instead

### Keep
- ✅ All atomic workflows
- ✅ Pipeline workflows
- ✅ Domain-specific workflows (e.g., `generate-hiring-campaign`)

### Future
- Add more atomic workflows (e.g., `enrich-emails`, `score-leads`)
- Create domain-specific pipelines (e.g., `real-estate-pipeline`, `healthcare-pipeline`)
- Build a visual pipeline builder UI
