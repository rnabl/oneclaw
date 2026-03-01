# OneClaw Data Storage Strategy

## Current Situation

You already have **Supabase integration** in the codebase, but SQLite was added for AI self-improvement. Let's organize this properly.

## Two-Tier Storage Strategy

### Tier 1: SQLite (Local/AI Workspace)
**Purpose:** AI self-improvement, prototyping, temporary data

```
Use SQLite for:
✅ AI-generated code prototypes
✅ Learning/experimentation data
✅ Temporary campaign drafts
✅ Local development
✅ Single-node deployments

Location:
- Dev: packages/harness/oneclaw-workspace/data/
- Prod: ~/.oneclaw/workspace/data/
```

**Limitations:**
- ❌ Not great for multi-user/multi-node
- ❌ No built-in file storage (images, PDFs)
- ❌ Manual backups required
- ❌ Limited concurrent writes

### Tier 2: Supabase (Production/Scale)
**Purpose:** Production data, user accounts, file storage, multi-tenant

```
Use Supabase for:
✅ User accounts & auth
✅ Production business databases
✅ Email campaign tracking
✅ File storage (images, PDFs, screenshots)
✅ Multi-node deployments
✅ Real-time updates
✅ Automatic backups
```

**Benefits:**
- ✅ Postgres (handles millions of rows)
- ✅ Built-in Storage for images/files
- ✅ Row-level security (multi-tenant)
- ✅ Automatic backups
- ✅ Real-time subscriptions
- ✅ RESTful API + client libs

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Rust Daemon                              │
│                  (User Interface)                           │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 TypeScript Harness                          │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │   SQLite Tools       │  │   Supabase Integration   │   │
│  │   (Self-Improvement) │  │   (Production Data)      │   │
│  │                      │  │                          │   │
│  │ • execute-code       │  │ • Business records       │   │
│  │ • write-file         │  │ • User accounts          │   │
│  │ • database (local)   │  │ • Campaign tracking      │   │
│  │ • Learning data      │  │ • File storage           │   │
│  └──────────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
           │                            │
           ▼                            ▼
   ~/.oneclaw/workspace/        Supabase Cloud
   ├── code/                    ├── postgres (data)
   ├── data/                    ├── storage (files)
   │   └── learning.db          └── auth (users)
   └── tools/
```

## When to Use What

### SQLite (Local AI Workspace)

```typescript
// AI learning and experimentation
await harness.execute("database", {
  action: "insert",
  table: "knowledge_base",
  database: "learning.db",  // ← SQLite
  data: {
    topic: "email_templates",
    key: "hvac_best_opener",
    value: JSON.stringify({ ... }),
    confidence: 0.9
  }
});

// Prototyping new tools
await harness.execute("write-file", {
  path: "tools/linkedin-scraper.ts",
  content: generatedCode
});
```

### Supabase (Production Data)

```typescript
// Store discovered businesses
await supabase
  .from('businesses')
  .insert({
    name: 'ABC HVAC',
    website: 'https://abchvac.com',
    phone: '555-1234',
    niche: 'hvac',
    user_id: 'user-123',  // Multi-tenant
    audit_screenshot_url: 'storage/audits/abc-hvac.png'  // ← Image URL
  });

// Upload audit screenshots
const { data } = await supabase.storage
  .from('audit-screenshots')
  .upload(`${businessId}/homepage.png`, imageBuffer);
```

## Migration Path: SQLite → Supabase

### Option 1: Hybrid (Recommended)

Keep both, use them for different purposes:

```
SQLite (AI Workspace):
├── learning.db           # AI learning data
├── prototypes.db         # Tool prototypes
└── temp-campaigns.db     # Draft campaigns

Supabase (Production):
├── businesses            # All discovered businesses
├── campaigns             # Active campaigns
├── outreach              # Email tracking
├── users                 # User accounts
└── storage/              # Images, PDFs, screenshots
    ├── audit-screenshots/
    ├── website-previews/
    └── email-attachments/
```

### Option 2: Add Supabase Tool

Create a new tool that mirrors the SQLite interface but uses Supabase:

```typescript
// New tool: packages/harness/src/tools/supabase-database.ts
export const SUPABASE_DATABASE_TOOL = {
  id: 'supabase-database',
  handler: async (input, context) => {
    const supabase = getSupabaseClient();
    
    switch (input.action) {
      case 'insert':
        return await supabase
          .from(input.table)
          .insert(input.data);
      
      case 'query':
        return await supabase
          .from(input.table)
          .select(input.select || '*')
          .match(input.where || {});
    }
  }
};
```

### Option 3: Smart Router

Let AI decide which database to use:

```typescript
// packages/harness/src/tools/smart-database.ts
export async function smartDatabaseHandler(input, context) {
  // Determine storage type based on data
  const useSupabase = 
    input.table === 'businesses' ||      // Production data
    input.table === 'campaigns' ||       // Production data
    input.table === 'users' ||           // User accounts
    context.tenantId !== 'local';        // Multi-tenant
  
  if (useSupabase) {
    return await supabaseDatabaseHandler(input, context);
  } else {
    return await sqliteDatabaseHandler(input, context);
  }
}
```

## Image Storage Strategy

### With Supabase Storage

```typescript
// Store audit screenshots
const screenshot = await page.screenshot();

// Upload to Supabase Storage
const { data, error } = await supabase.storage
  .from('audit-screenshots')
  .upload(`${businessId}/${Date.now()}.png`, screenshot, {
    contentType: 'image/png',
    cacheControl: '3600'
  });

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('audit-screenshots')
  .getPublicUrl(data.path);

// Save URL in database
await supabase
  .from('businesses')
  .update({ 
    audit_screenshot_url: publicUrl 
  })
  .eq('id', businessId);
```

### Cost Comparison

**SQLite (Free but manual)**
- Storage: VPS disk space (20GB = $0)
- Backups: Manual scripts
- Images: Store in filesystem, serve via nginx

**Supabase (Paid but managed)**
- Free tier: 500MB database, 1GB storage
- Pro ($25/mo): 8GB database, 100GB storage
- Images: Built-in CDN, automatic optimization

## Recommended Setup

### Phase 1: Keep Both (Now)

```yaml
SQLite:
  purpose: AI self-improvement, learning
  location: ~/.oneclaw/workspace/data/
  tables: [knowledge_base, learning_logs, prototypes]

Supabase:
  purpose: Production business data
  tables: [businesses, campaigns, outreach, users]
  storage: [audit-screenshots, website-previews]
```

### Phase 2: Add Supabase Tool (Next)

```typescript
// Add to packages/harness/src/tools/
supabase-database.ts    # Postgres operations
supabase-storage.ts     # Image/file uploads
```

### Phase 3: Migrate Data (Future)

```typescript
// Migration script
const businesses = await sqlite.query("SELECT * FROM businesses");

for (const business of businesses) {
  await supabase
    .from('businesses')
    .insert({
      ...business,
      user_id: 'migrated'
    });
}
```

## When to Get Supabase

### Get Supabase Now If:
- ✅ You need to store images/screenshots
- ✅ You have multiple users/tenants
- ✅ You want automatic backups
- ✅ You need real-time updates
- ✅ You want to avoid manual database management

### Stick with SQLite If:
- ✅ Single user/tenant only
- ✅ Prototyping/learning phase
- ✅ No image storage needs
- ✅ Comfortable with manual backups
- ✅ Want to minimize costs

## My Recommendation

**Get Supabase for production, keep SQLite for AI workspace:**

```
Production Business Data → Supabase
├── All discovered businesses
├── Campaign tracking
├── Email outreach logs
├── Audit screenshots
└── User accounts

AI Self-Improvement → SQLite
├── Learning data
├── Tool prototypes
├── Temporary experiments
└── Code generation cache
```

**Cost:** $25/mo Supabase Pro (includes 8GB DB + 100GB storage)

**Benefits:**
- Professional-grade database
- Built-in image hosting/CDN
- Automatic backups
- Multi-tenant ready
- Real-time updates
- Let AI keep experimenting in SQLite

## Implementation Steps

1. **Setup Supabase** (30 min)
   ```bash
   # Create project at supabase.com
   # Copy URL and anon key to .env
   ```

2. **Create Schema** (15 min)
   ```sql
   -- Run autonomous-schema.sql in Supabase SQL editor
   -- Add RLS policies for multi-tenant
   ```

3. **Add Supabase Tool** (1 hour)
   ```typescript
   // Create src/tools/supabase-database.ts
   // Mirror SQLite tool interface
   ```

4. **Add Storage Tool** (30 min)
   ```typescript
   // Create src/tools/supabase-storage.ts
   // Upload images, get public URLs
   ```

5. **Update Workflows** (30 min)
   ```typescript
   // Change business discovery to use Supabase
   // Upload audit screenshots to Storage
   ```

**Total setup time:** ~3 hours to be fully multi-tenant with image storage

---

**TL;DR:** Keep SQLite for AI self-improvement workspace. Add Supabase for production business data and image storage. Best of both worlds! 🚀
