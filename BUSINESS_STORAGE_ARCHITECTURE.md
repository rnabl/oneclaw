# Business Storage Architecture - Modular & Agnostic

## The Question:
> "I get business info, website scanned, and it's stored somewhere. Is it in crm.leads?"

## The Answer: **TWO Storage Layers**

### 1. **Temporary Checkpoint** (workflow_artifacts)
```
Purpose: Workflow resumability
Table: workflow_artifacts
Lifespan: 7 days (auto-cleanup)
Format: Raw JSON
Use case: "Discovery failed at step 2, recover the 100 businesses"
```

### 2. **Permanent Storage** (Modular/Configurable)
```
Purpose: Long-term CRM/lead management
Default: crm.leads (Supabase)
Lifespan: Permanent
Format: Structured records with scoring
Use case: "Show me all HVAC leads in Denver with score > 70"
```

---

## Storage Adapters (Modular!)

Created: `packages/harness/src/storage/business-adapter.ts`

### Available Adapters:

#### 1. **SupabaseCRMAdapter** (Default)
```typescript
// Saves to crm.leads table
const adapter = new SupabaseCRMAdapter();
await adapter.store(businesses);
```

**Schema:**
```sql
crm.leads (
  company_name,
  website,
  phone,
  email,
  address,
  city,
  state,
  zip_code,
  google_place_id,
  google_rating,
  google_reviews,
  website_signals JSONB,  -- { hasSSL, hasAds, aiReadable, etc. }
  lead_score,             -- 0-100
  geo_readiness_score,    -- 0-10
  aeo_readiness_score,    -- 0-10
  stage,                  -- 'discovered', 'qualified', 'contacted', etc.
  source_job_id           -- Links back to workflow
)
```

#### 2. **JSONFileAdapter**
```typescript
// Saves to local JSON file
const adapter = new JSONFileAdapter('./businesses.json');
await adapter.store(businesses);
```

**Use case:** Local dev, simple storage, no database needed

#### 3. **MemoryAdapter**
```typescript
// Stores in memory (testing)
const adapter = new MemoryAdapter();
await adapter.store(businesses);
```

**Use case:** Unit tests, temporary storage

---

## How to Configure

### Option 1: Environment Variable
```env
# In .env
BUSINESS_STORAGE_ADAPTER=supabase-crm  # Default
# or
BUSINESS_STORAGE_ADAPTER=json-file
BUSINESS_STORAGE_PATH=./data/businesses.json
# or
BUSINESS_STORAGE_ADAPTER=memory
```

### Option 2: Programmatic
```typescript
import { createStorageAdapter, SupabaseCRMAdapter, JSONFileAdapter } from '@oneclaw/harness/storage/business-adapter';

// Auto-detect from env
const storage = createStorageAdapter();

// Or explicit
const storage = new SupabaseCRMAdapter();
const storage = new JSONFileAdapter('./data.json');
```

---

## Workflow Flow (Updated)

```
User: "find hvac in Denver"
  ↓
Step 1: Apify Discovery
  → 100 businesses found
  → ✅ Checkpoint to workflow_artifacts (temporary)
  ↓
Step 2: Website Scanning
  → 100 websites scanned
  → ✅ Checkpoint to workflow_artifacts (temporary)
  ↓
Step 3: Enrichment
  → Business signals calculated
  → ✅ Checkpoint to workflow_artifacts (temporary)
  ↓
Step 4: Permanent Storage
  → ✅ Save to crm.leads (permanent)
  OR
  → ✅ Save to JSON file (permanent)
  OR
  → ✅ Save to custom adapter (permanent)
  ↓
Return results to user
```

---

## Query Businesses

### From Permanent Storage (crm.leads):
```typescript
const storage = createStorageAdapter();

const result = await storage.query({
  industry: 'HVAC',
  city: 'Denver',
  state: 'CO',
  minScore: 70,
  stage: 'discovered',
  limit: 100
});

// Returns: { success: true, businesses: [...] }
```

### From Checkpoint (workflow_artifacts):
```typescript
import { checkpointStore } from '@oneclaw/harness';

const businesses = await checkpointStore.getArtifact(runId, 'enriched_businesses');
// Returns: [...100 businesses...]
```

---

## Why Two Layers?

### Checkpoint (workflow_artifacts):
✅ **Fast** - No schema validation
✅ **Complete** - Stores raw workflow output
✅ **Resumable** - Can recover from failures
❌ **Temporary** - Auto-deleted after 7 days
❌ **Not queryable** - Just key-value store

### Permanent (crm.leads):
✅ **Structured** - Queryable by industry, location, score
✅ **Permanent** - Never auto-deleted
✅ **Indexed** - Fast lookups
✅ **Relational** - Links to clients, campaigns, etc.
❌ **Slower** - Schema validation, constraints
❌ **Less flexible** - Must fit schema

---

## Example: Full Flow

```typescript
// Discovery workflow runs
const businesses = await discoverBusinesses({ niche: 'HVAC', location: 'Denver' });

// CHECKPOINT 1: Temporary storage (automatic)
await ctx.saveArtifact('enriched_businesses', businesses);
// ↑ Saved to workflow_artifacts (7 day TTL)

// CHECKPOINT 2: Permanent storage (automatic)
const storage = createStorageAdapter(); // Uses env var
await storage.store(businesses);
// ↑ Saved to crm.leads (permanent)

// Later: Query from permanent storage
const hvacLeads = await storage.query({
  industry: 'HVAC',
  city: 'Denver',
  minScore: 70
});

// Or: Recover from checkpoint if workflow failed
const recovered = await checkpointStore.getArtifact(runId, 'enriched_businesses');
```

---

## Custom Adapter (For Your Own Database)

```typescript
import { StorageAdapter, BusinessRecord } from '@oneclaw/harness/storage/business-adapter';

export class CustomPostgresAdapter implements StorageAdapter {
  async store(businesses: BusinessRecord[]) {
    // Your custom logic
    await this.db.query('INSERT INTO my_businesses ...');
    return { success: true, count: businesses.length };
  }

  async query(filters: Record<string, any>) {
    // Your custom query logic
    const results = await this.db.query('SELECT * FROM my_businesses WHERE ...');
    return { success: true, businesses: results };
  }
}
```

---

## Summary

**Question:** "Where do businesses get stored?"

**Answer:**
1. **Temporary** → `workflow_artifacts` table (7 days, for recovery)
2. **Permanent** → `crm.leads` table (forever, for CRM) **OR** your custom adapter

**Modularity:**
- ✅ Can switch storage backend via env var
- ✅ Can use JSON file instead of database
- ✅ Can create custom adapters
- ✅ Workflow doesn't care where it saves

**Current Default:** Supabase `crm.leads` table (from migration 004)
