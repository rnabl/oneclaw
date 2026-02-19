# Restate Implementation Plan

## 🎯 Current Situation

**What's Working:**
- ✅ Discovery workflow completes successfully
- ✅ Discord bot integration working
- ✅ Cost metering and wallet system
- ✅ Basic step tracking and logging

**What's Not Cohesive:**
- ❌ No durability - failures lose all progress
- ❌ No automatic retries on transient failures
- ❌ No replay capability from checkpoints
- ❌ Website scanner not executing (separate issue)
- ❌ Manual step management in workflows

## 🤔 Implementation Options

### Option 1: Full Restate Integration (RECOMMENDED)
**Pros:**
- Industry-standard durable execution
- Automatic retries with exponential backoff
- Checkpoint/replay out of the box
- Scales well for long-running workflows
- Great for $5 enrichment tier (could take 2-5 minutes)

**Cons:**
- Requires separate Restate server (Docker or cloud)
- Additional infrastructure to manage
- Learning curve for team
- Overkill for simple $1 discovery tier

**Best For:**
- Enrichment workflow ($5 tier) - 50 websites, owner finding, deep analysis
- Long-running analysis jobs
- Multi-step workflows with external API dependencies

### Option 2: DIY Durable Execution (SIMPLER)
**Pros:**
- No additional infrastructure
- Full control over retry logic
- Can use existing Supabase for state storage
- Easier to debug
- Good enough for current needs

**Cons:**
- Need to write retry/checkpoint logic ourselves
- Manual replay implementation
- More code to maintain

**Best For:**
- Discovery workflow ($1 tier) - simple, fast, <30 seconds
- MVP/early stage
- When you want to move fast

### Option 3: Hybrid Approach (PRAGMATIC) ⭐
**Use DIY for Discovery ($1), Restate for Enrichment ($5)**

**Why This Makes Sense:**
- Discovery is fast (<30s), doesn't need heavy durability
- Enrichment is slow (2-5min), benefits from checkpointing
- Can start with DIY, migrate discovery to Restate later if needed
- Match infrastructure complexity to workflow complexity

## 📋 Recommended: Hybrid Implementation

### Phase 1: DIY for Discovery (TODAY) ✅
Keep current approach but add:
1. Better error handling
2. Simple retry logic
3. State persistence in Supabase
4. Clear failure recovery

### Phase 2: Restate for Enrichment (NEXT WEEK)
When building enrichment workflow:
1. Install Restate SDK
2. Set up Restate server (Docker locally, Railway/Fly.io for prod)
3. Wrap enrichment in Restate services
4. Add checkpointing at each major step

## 🔨 Implementation Details

### DIY Approach (Discovery)

```typescript
// packages/harness/src/execution/durable-runner.ts

interface WorkflowState {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  currentStep: number;
  stepResults: Record<number, any>;
  error?: string;
}

export class DurableWorkflowRunner {
  async execute(workflow: WorkflowHandler, input: any, options: ExecuteOptions) {
    const jobId = nanoid();
    
    // Save initial state
    await this.saveState(jobId, {
      status: 'running',
      currentStep: 0,
      stepResults: {},
    });
    
    try {
      // Execute with automatic checkpoint after each step
      const result = await this.executeWithCheckpoints(workflow, input, jobId);
      
      await this.saveState(jobId, {
        status: 'completed',
        stepResults: { final: result },
      });
      
      return result;
    } catch (error) {
      await this.saveState(jobId, {
        status: 'failed',
        error: error.message,
      });
      
      throw error;
    }
  }
  
  async executeWithCheckpoints(workflow: WorkflowHandler, input: any, jobId: string) {
    const ctx = this.createStepContext(jobId);
    
    // Wrap ctx.run to auto-checkpoint
    const originalRun = ctx.run;
    ctx.run = async (fn: Function) => {
      const stepResult = await this.retryWithExponentialBackoff(fn);
      
      // Checkpoint after successful step
      await this.saveStepResult(jobId, ctx.stepIndex, stepResult);
      
      return stepResult;
    };
    
    return await workflow(ctx, input);
  }
  
  async retryWithExponentialBackoff(fn: Function, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry terminal errors
        if (this.isTerminalError(error)) {
          throw error;
        }
        
        // Wait before retry: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
  
  async resume(jobId: string) {
    // Load previous state
    const state = await this.loadState(jobId);
    
    // Resume from last successful step
    // ... implementation
  }
}
```

### Restate Approach (Enrichment - Future)

```typescript
// packages/harness/src/workflows/enrichment-restate.ts
import * as restate from '@restatedev/restate-sdk';

const enrichmentService = restate.service({
  name: 'enrichment',
  handlers: {
    async enrichBusiness(ctx: restate.Context, input: EnrichmentInput) {
      // Step 1: Comprehensive website scan (durable)
      const scanResult = await ctx.run('scan-website', async () => {
        return await scanWebsite(input.website, 30000);
      });
      
      // Step 2: Owner lookup (durable)
      const owner = await ctx.run('find-owner', async () => {
        return await findBusinessOwner(input.businessName, input.website);
      });
      
      // Step 3: Deep analysis with nabl (durable, expensive)
      const auditResult = await ctx.run('deep-audit', async () => {
        return await nablAuditService(input.website);
      });
      
      // Step 4: Generate lead score (durable)
      const score = await ctx.run('lead-score', async () => {
        return calculateLeadScore(scanResult, owner, auditResult);
      });
      
      return {
        scanResult,
        owner,
        auditResult,
        leadScore: score,
      };
    },
    
    async enrichBatch(ctx: restate.Context, input: { businesses: Business[] }) {
      // Process 50 businesses with parallel durable execution
      const promises = input.businesses.map((business) =>
        ctx.serviceClient(enrichmentService).enrichBusiness(business)
      );
      
      return await Promise.all(promises);
    },
  },
});
```

## 🚀 Action Plan for Today

### 1. Fix Website Scanner First (Priority #1)
The scanner not working is separate from Restate. Debug this first:

```bash
# Create standalone test
npx tsx scripts/test-scanner.ts

# Check if it's even imported
cd packages/harness && npx tsc --noEmit

# Add explicit logging
# See SCANNER_TODO.md for full checklist
```

### 2. Improve Current Discovery Workflow (Priority #2)
Add better error handling and simple retry logic:

```typescript
// In discovery.ts

// Wrap Apify call with retry
let businesses: DiscoveryToolOutput['businesses'] = [];
let apifyAttempt = 0;
const maxApifyRetries = 2;

while (apifyAttempt < maxApifyRetries) {
  try {
    const results = await searchBusinesses({
      query: niche,
      city,
      state,
      maxResults: limit,
    });
    
    businesses = results.map(/* transform */);
    break; // Success
    
  } catch (error) {
    apifyAttempt++;
    
    if (apifyAttempt >= maxApifyRetries) {
      await ctx.log('error', 'Apify failed after retries', { error: String(error) });
      throw error;
    }
    
    await ctx.log('warn', `Apify attempt ${apifyAttempt} failed, retrying...`);
    await new Promise(r => setTimeout(r, 2000)); // Wait 2s
  }
}

// Same for website scanner
try {
  const scanResults = await scanWebsitesBatch(websitesToScan, 5, 8000);
  // ... update businesses
} catch (error) {
  await ctx.log('warn', 'Website scanning failed, continuing without enrichment', { error: String(error) });
  // Don't fail the whole workflow if scanning fails
}
```

### 3. Add Workflow State Persistence (Priority #3)
Store workflow progress in Supabase:

```sql
-- Add to Supabase schema
CREATE TABLE workflow_states (
  job_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'running' | 'completed' | 'failed'
  current_step INT NOT NULL DEFAULT 0,
  step_results JSONB DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

```typescript
// In runner.ts, add after each step
await artifactStore.storeWorkflowState(jobId, {
  currentStep,
  stepResults: { [currentStep]: result },
});
```

## 📅 Timeline

### Today (Wednesday)
- [ ] Fix website scanner (SCANNER_TODO.md)
- [ ] Add retry logic to discovery workflow
- [ ] Add better error logging

### This Week
- [ ] Add workflow state persistence to Supabase
- [ ] Create resume-from-failure capability
- [ ] Test discovery workflow resilience

### Next Week (When Building Enrichment)
- [ ] Install Restate SDK (`pnpm add @restatedev/restate-sdk`)
- [ ] Set up local Restate server (Docker)
- [ ] Build enrichment workflow with Restate
- [ ] Deploy Restate to production (Railway/Fly.io)

## 💡 Decision: Hybrid Approach

**Recommendation:** 
1. **Use DIY durability for Discovery** - it's simple, fast, good enough
2. **Save Restate for Enrichment** - where durability really matters
3. **Focus on fixing scanner TODAY** - that's the immediate blocker

This way you:
- Move fast without infrastructure overhead
- Add durability where it matters most
- Can migrate discovery to Restate later if needed
- Keep code simple and maintainable

## 📚 Resources

- [Restate TypeScript SDK](https://docs.restate.dev/develop/ts/durable-steps)
- [Restate Examples](https://github.com/restatedev/examples/tree/main/typescript/basics)
- [DIY Durable Execution Patterns](https://temporal.io/blog/durable-execution-patterns)

---

**TL;DR:** Use simple DIY retry logic for Discovery ($1 tier), save Restate for Enrichment ($5 tier) workflow next week. Focus on fixing the website scanner today - that's blocking real progress.
