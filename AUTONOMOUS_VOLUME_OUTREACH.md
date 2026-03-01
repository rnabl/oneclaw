# Autonomous Volume Outreach - How It Works

## What You Already Have ✅

Your Rust daemon already supports **long-running autonomous jobs**:

```rust
// User says in Telegram:
"Get me all HVAC businesses in Texas and draft emails"

// Daemon detects it's complex (multi-step)
is_complex_request() → true

// LLM generates job plan:
generate_job_plan() → {
  steps: [
    { action: "discover", params: { niche: "hvac", location: "Texas" } },
    { action: "enrich", params: { businesses: "{{from_step_1}}" } },
    { action: "draft-email", params: { businesses: "{{from_step_1}}" } }
  ]
}

// Creates job in harness
create_harness_job() → job_id

// Polls in background
JobPoller.run_until_complete()
  ├── Sends progress updates to Telegram
  ├── "🔍 Discover complete! (1/3)"
  ├── "📞 Enrich in progress... (2/3)"
  └── "✉️ Draft-email complete! (3/3)"

// Shows final results when done
```

## Current Storage: SQLite (Harness Local)

```
packages/harness/src/database/
└── jobs.db (SQLite)
    ├── jobs table
    ├── businesses table
    ├── contacts table
    └── job_logs table
```

This is for **job execution tracking**.

## What We Need: Dual Storage

```
Job Execution Data → SQLite (Harness)
├── Job progress
├── Step status
├── Temporary results
└── Execution logs

Business/Campaign Data → Supabase (Production)
├── crm.leads
├── crm.email_campaigns
├── platform.approvals_queue
└── All agency data
```

## How Autonomous Jobs Should Work

### Example 1: Simple Request
```
User: "Find 100 HVAC in Austin"

Daemon: Calls discover-businesses directly (not autonomous)
Returns immediately with results
```

### Example 2: Multi-State Campaign (Autonomous)
```
User: "Get me all HVAC businesses in Texas and draft personalized emails"

Daemon detects: Complex, multi-step → Creates autonomous job

Job runs for hours:
Step 1: Discover 1000 businesses in Texas
  ↓ Store in Supabase crm.leads
  ↓ Send update to Telegram: "🔍 Found 1000 businesses"
  
Step 2: Enrich 1000 contacts
  ↓ Update Supabase with emails
  ↓ Send update: "📞 Enriched 847 contacts"
  
Step 3: Generate 847 personalized emails
  ↓ Store in crm.email_campaigns
  ↓ Create approval batch
  ↓ Send update: "✉️ 847 emails ready for approval"
  
Step 4: Wait for your approval
  ↓ You click Blink approval link
  ↓ Approved → Send all 847
  ↓ Update: "✅ Campaign sent!"
```

### Example 3: Multi-State (REALLY Autonomous)
```
User: "Get me HVAC businesses in all 50 states"

Job runs for DAYS:
Day 1: Discover 1000 in Texas → Store in Supabase
Day 2: Discover 1000 in California → Store in Supabase
Day 3: Discover 1000 in Florida → Store in Supabase
...
Day 50: Discover 1000 in Wyoming → Store in Supabase

Total: 50,000 businesses discovered
Cost: $2.50 (50 × $0.05)
Time: 50 days (or parallelize)

Then: "Draft emails for all 50,000"
  ↓ Enrich all contacts: $75
  ↓ Generate 45,000 emails
  ↓ Batch approval (review 3 samples, approve all)
  ↓ Send over 90 days (Gmail limit: 500/day)
```

## What Needs to Be Updated

### Your Existing Workflows Need Dual Storage

```typescript
// Current: discover-businesses workflow
async function businessDiscoveryHandler(ctx, input) {
  const businesses = await apify.discover(...);
  
  // Currently: Just return results
  return { businesses };
  
  // NEEDED: Also store in Supabase
  await supabase.from('crm.leads').insert(
    businesses.map(b => ({
      company_name: b.name,
      website: b.website,
      // ... etc
    }))
  );
  
  return { businesses };
}
```

### The Fix: Add Supabase Storage to Existing Workflows

Option 1: **Modify existing workflows** (adds Supabase storage)
Option 2: **Create wrapper workflows** (calls existing + stores)
Option 3: **Post-processing hook** (automatic after any job completes)

## Recommendation

**Add a post-job hook that auto-stores in Supabase:**

```typescript
// After ANY autonomous job completes
runner.on('job-completed', async (job) => {
  // Get businesses from SQLite job DB
  const businesses = await jobDb.getBusinesses(job.id);
  const contacts = await jobDb.getContacts(job.id);
  
  // Store in Supabase
  await supabase.from('crm.leads').insert(
    businesses.map(b => ({
      company_name: b.name,
      website: b.website,
      phone: b.phone,
      // ... map all fields
    }))
  );
});
```

This way:
- ✅ SQLite tracks job execution (temporary)
- ✅ Supabase stores production data (permanent)
- ✅ No changes to existing workflows
- ✅ Works for all autonomous jobs

---

**Want me to build the dual-storage hook? Then your daemon can run jobs for days and all data ends up in Supabase automatically.**
