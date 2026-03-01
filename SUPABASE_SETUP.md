# Supabase Setup Guide

## Overview

Your OneClaw now has two database tools:

1. **SQLite** (`database` tool) - For AI coding workspace
2. **Supabase** (`supabase-database` tool) - For production data

## Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Click "Start your project"
3. Create new project:
   - Name: `oneclaw-production`
   - Database password: (save this)
   - Region: Choose closest to your VPS

## Step 2: Get Credentials

From your Supabase dashboard:

1. Go to **Settings** → **API**
2. Copy these values:
   ```
   Project URL: https://xxxxx.supabase.co
   anon public key: eyJhbGci...
   service_role key: eyJhbGci... (secret!)
   ```

## Step 3: Add to Environment

Add to your `.env` or `.env.production`:

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # Service role for backend
```

On your VPS:
```bash
# Add to ~/.bashrc or /etc/environment
export SUPABASE_URL=https://xxxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

## Step 4: Create Database Schema

In Supabase Dashboard → **SQL Editor**, run:

```sql
-- Copy from packages/harness/src/database/autonomous-schema.sql
-- Modify SQLite syntax to Postgres:

CREATE TABLE IF NOT EXISTS businesses (
  id BIGSERIAL PRIMARY KEY,  -- Changed from INTEGER AUTOINCREMENT
  
  name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  
  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  
  -- Google Data
  google_place_id TEXT UNIQUE,
  google_rating REAL,
  google_reviews INTEGER,
  google_url TEXT,
  
  -- Categorization
  niche TEXT,
  category TEXT,
  subcategory TEXT,
  keywords TEXT,
  
  -- Discovery
  discovery_source TEXT,
  discovery_date TIMESTAMPTZ DEFAULT NOW(),  -- Changed from DATETIME
  discovery_job_id TEXT,
  
  -- Audit Results (JSONB for better querying)
  audit_data JSONB,  -- Changed from TEXT
  audit_date TIMESTAMPTZ,
  audit_score REAL,
  audit_screenshot_url TEXT,  -- NEW: Link to Supabase Storage
  
  -- Contact Enrichment
  contact_data JSONB,  -- Changed from TEXT
  enrichment_date TIMESTAMPTZ,
  
  -- Status
  status TEXT DEFAULT 'discovered',
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_businesses_niche ON businesses(niche);
CREATE INDEX idx_businesses_status ON businesses(status);
CREATE INDEX idx_businesses_location ON businesses(city, state);
CREATE INDEX idx_businesses_discovery_date ON businesses(discovery_date);

-- Create other tables (campaigns, outreach, contacts, etc.)
-- ... repeat for all tables in autonomous-schema.sql
```

## Step 5: Create Storage Buckets

In Supabase Dashboard → **Storage**:

1. Create bucket: `audit-screenshots`
   - Public: Yes
   - File size limit: 5MB
   - Allowed MIME types: `image/*`

2. Create bucket: `website-previews`
   - Public: Yes
   - File size limit: 5MB
   - Allowed MIME types: `image/*`

## Step 6: Test from Rust Daemon

Your Rust daemon will call the new tools automatically:

```rust
// Store business in Supabase
execute_tool(state, "supabase-database", serde_json::json!({
    "action": "insert",
    "table": "businesses",
    "data": {
        "name": "ABC HVAC",
        "website": "https://abchvac.com",
        "phone": "555-1234",
        "niche": "hvac",
        "city": "Austin",
        "state": "TX"
    }
})).await

// Upload audit screenshot
execute_tool(state, "supabase-storage", serde_json::json!({
    "action": "upload",
    "bucket": "audit-screenshots",
    "path": "abc-hvac/homepage.png",
    "content": base64ImageData,
    "contentType": "image/png"
})).await
```

## Usage Examples

### Store Discovered Business

```typescript
await harness.execute('supabase-database', {
  action: 'insert',
  table: 'businesses',
  data: {
    name: 'Denver Plumbing Co',
    website: 'https://denverplumbing.com',
    phone: '720-555-1234',
    niche: 'plumbing',
    city: 'Denver',
    state: 'CO',
    google_rating: 4.8,
    google_reviews: 127
  }
});
```

### Query Businesses

```typescript
const businesses = await harness.execute('supabase-database', {
  action: 'query',
  table: 'businesses',
  where: { niche: 'hvac', state: 'TX' },
  order: 'google_rating',
  limit: 50
});
```

### Upload Audit Screenshot

```typescript
// After auditing a website
const screenshot = await page.screenshot();
const base64 = screenshot.toString('base64');

const upload = await harness.execute('supabase-storage', {
  action: 'upload',
  bucket: 'audit-screenshots',
  path: `${businessId}/homepage-${Date.now()}.png`,
  content: base64,
  contentType: 'image/png'
});

// Save URL to database
await harness.execute('supabase-database', {
  action: 'update',
  table: 'businesses',
  where: { id: businessId },
  data: { audit_screenshot_url: upload.publicUrl }
});
```

## SQLite vs Supabase Usage

### Use SQLite (`database` tool) for:
```typescript
// AI learning what works
await harness.execute('database', {
  action: 'insert',
  table: 'knowledge_base',
  database: 'learning.db',  // ← SQLite
  data: {
    topic: 'email_templates',
    key: 'hvac_subject_lines',
    value: JSON.stringify({
      template: 'Free HVAC Audit...',
      openRate: 0.45
    })
  }
});

// Code prototypes
await harness.execute('write-file', {
  path: 'tools/new-scraper.ts',
  content: generatedCode
});
```

### Use Supabase (`supabase-database` tool) for:
```typescript
// Production business data
await harness.execute('supabase-database', {
  action: 'insert',
  table: 'businesses',  // ← Supabase Postgres
  data: {
    name: 'ABC HVAC',
    niche: 'hvac'
  }
});

// Image storage
await harness.execute('supabase-storage', {
  action: 'upload',
  bucket: 'audit-screenshots',
  path: 'abc-hvac.png',
  content: base64Image
});
```

## Cost

**Free Tier:**
- 500MB database
- 1GB file storage
- Good for testing

**Pro Tier ($25/mo):**
- 8GB database
- 100GB file storage
- Good for production

**Pay as you go:**
- Scales with usage

## Multi-Tenant (Optional)

To make it multi-tenant, enable Row Level Security (RLS):

```sql
-- Enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY tenant_isolation ON businesses
  USING (tenant_id = auth.uid());

-- Add tenant_id column
ALTER TABLE businesses ADD COLUMN tenant_id UUID REFERENCES auth.users(id);
```

Then uncomment this line in `supabase-database.ts`:
```typescript
// tenant_id: context.tenantId,
```

## Troubleshooting

### Error: "Supabase credentials not found"
- Check env vars: `echo $SUPABASE_URL`
- Restart harness after adding env vars

### Error: "permission denied for table"
- Using anon key? Switch to service_role key
- Check RLS policies if enabled

### Images not uploading
- Check bucket is public
- Verify content is base64 encoded
- Check file size limits

---

**You're all set!** Your Rust daemon can now store production data in Supabase while using SQLite for AI coding assistance. 🚀
