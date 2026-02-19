# Local Storage Options: SQLite vs pgvector vs Redis

## 🎯 TL;DR Recommendations

**For Development:**
- ✅ **SQLite** - Perfect for local dev, testing, self-hosted
- ✅ **Redis** - Great for caching, sessions, real-time features

**For Production:**
- ✅ **Supabase (Postgres)** - Your current choice, still best for SaaS
- ✅ **Redis** - Add for caching/performance optimization
- ⚠️ **pgvector** - Only if you need semantic search

**For Self-Hosted:**
- ✅ **SQLite** - Zero infrastructure, works everywhere
- ✅ **Postgres (local)** - If they want full Postgres features

## 📊 Detailed Comparison

### SQLite 🗃️

**What It Is:**
- File-based SQL database (single `.db` file)
- Embedded in your app, no server needed
- Used by: Signal, WhatsApp, Apple apps, VS Code

**Pros:**
- ✅ **Zero infrastructure** - just a file on disk
- ✅ **Perfect for self-hosted** - users don't need to run Postgres
- ✅ **Fast for single-user** - great for dev/testing
- ✅ **Portable** - backup = copy a file
- ✅ **Built into Node.js** via `better-sqlite3`
- ✅ **Transactions & ACID guarantees**
- ✅ **Works offline**

**Cons:**
- ❌ **No concurrent writes** - multiple processes can't write simultaneously
- ❌ **No network access** - can't scale horizontally
- ❌ **No pgvector equivalent** - can't do semantic search
- ❌ **Limited to one server** - not for multi-tenant SaaS

**Best For:**
- Local development environment
- Self-hosted single-user deployments
- Testing/CI pipelines
- Desktop apps
- Edge deployments (Cloudflare Workers)

**Use Cases in OneClaw:**
```typescript
// User wants to self-host OneClaw without any external services
// Just: npm install && npm start
// SQLite stores everything locally
```

---

### Postgres (Supabase) 🐘

**What It Is:**
- Full-featured SQL database server
- Your current production setup via Supabase

**Pros:**
- ✅ **Multi-tenant SaaS ready** - concurrent users/tenants
- ✅ **Network accessible** - API server can be separate from DB
- ✅ **Scales horizontally** - read replicas, connection pooling
- ✅ **Rich features** - JSON, full-text search, triggers, functions
- ✅ **Supabase managed** - backups, auth, real-time, edge functions
- ✅ **Can add pgvector** for semantic search

**Cons:**
- ❌ **Infrastructure required** - need to run/pay for server
- ❌ **Overkill for single user** - heavy for self-hosted
- ❌ **Latency** - network round-trips
- ❌ **Cost** - $25+/month for production

**Best For:**
- Multi-tenant SaaS (OneClaw Cloud)
- Production workloads
- When you need concurrent access from multiple services
- Team collaboration

**Current Use:**
- ✅ Users, identities, wallets, transactions
- ✅ Workflow states, artifacts, metering

---

### pgvector 🔍

**What It Is:**
- Postgres extension for vector embeddings
- Enables semantic search via vector similarity

**Pros:**
- ✅ **Semantic search** - find similar content by meaning
- ✅ **Hybrid search** - combine SQL + vector similarity
- ✅ **Built on Postgres** - use existing infrastructure
- ✅ **Fast with HNSW index** - millions of vectors

**Cons:**
- ❌ **Requires Postgres** - can't use with SQLite
- ❌ **Complex setup** - need embeddings pipeline
- ❌ **Cost** - embeddings API calls (OpenAI, etc.)
- ❌ **Maintenance** - re-embed on content changes

**Best For:**
- Semantic search over documents/content
- RAG (Retrieval Augmented Generation) systems
- Recommendation engines

**OneClaw Use Cases:**
- **Search workflow history** - "find similar discoveries"
- **Match businesses to buyer personas** - vector similarity
- **Smart duplicate detection** - semantic not exact match
- **Template/example suggestions** - find relevant past work

**Example:**
```typescript
// Find businesses similar to a target business
const targetEmbedding = await openai.embeddings.create({
  input: "Luxury hair salon with booking system and social media presence",
  model: "text-embedding-3-small"
});

const similar = await supabase.rpc('match_businesses', {
  query_embedding: targetEmbedding.data[0].embedding,
  match_threshold: 0.8,
  match_count: 10
});
```

**Do You Need It?**
- ❌ Not for MVP - exact search works fine
- ⚠️ Nice to have for "find similar businesses" feature
- ✅ Add later if users request semantic search

---

### Redis 🚀

**What It Is:**
- In-memory key-value store
- Ultra-fast cache and session storage

**Pros:**
- ✅ **Blazing fast** - sub-millisecond reads (<1ms)
- ✅ **Great for caching** - reduce DB load
- ✅ **Session storage** - Discord bot state, pagination data
- ✅ **Rate limiting** - track API calls per user
- ✅ **Job queues** - background tasks (BullMQ)
- ✅ **Real-time features** - pub/sub for live updates
- ✅ **Simple setup** - Docker or Upstash (serverless)

**Cons:**
- ❌ **No persistence by default** - data lost on restart (configurable)
- ❌ **Memory limited** - expensive for large datasets
- ❌ **No complex queries** - key-value only, no SQL

**Best For:**
- Caching expensive operations
- Session/temporary data
- Rate limiting
- Real-time features
- Background job queues

**OneClaw Use Cases:**
```typescript
// 1. Cache Apify results (avoid re-scraping same query)
const cacheKey = `discovery:${niche}:${location}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const results = await searchBusinesses(/*...*/);
await redis.set(cacheKey, JSON.stringify(results), { EX: 3600 }); // 1hr TTL

// 2. Store Discord pagination state (already doing in-memory)
await redis.set(`discord:pagination:${userId}`, JSON.stringify(state), { EX: 1800 }); // 30min

// 3. Rate limiting per tenant
const key = `ratelimit:${tenantId}:${hour}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 3600);
if (count > 100) throw new RateLimitError();

// 4. Website scan cache (expensive operation)
const scanKey = `website_scan:${domain}`;
const cached = await redis.get(scanKey);
if (cached) return JSON.parse(cached);

const scan = await scanWebsite(url);
await redis.set(scanKey, JSON.stringify(scan), { EX: 86400 }); // 24hr
```

**Setup:**
```bash
# Local development
docker run -d -p 6379:6379 redis:alpine

# Or use Upstash (serverless, free tier)
# https://upstash.com
```

---

## 🏗️ Recommended Architecture

### Current (Production SaaS)
```
Discord Bot → API Server → Supabase (Postgres)
                  ↓
            In-Memory Cache (Discord pagination)
```

### Enhanced (Add Redis)
```
Discord Bot → API Server → Redis (cache/sessions) → Supabase (Postgres)
                  ↓              ↓                      ↓
            Rate Limiting    Apify Cache           Persistent Data
            Pagination      Website Scans          Users/Wallets
            Sessions        Job Queue              Workflows
```

### Self-Hosted Option (Add SQLite)
```
Discord Bot → API Server → SQLite (local.db)
                  ↓
            Optional Redis (cache)
```

## 🎯 Implementation Plan

### Phase 1: Add Redis (THIS WEEK) ⭐
**Why:** Immediate performance boost, fixes pagination properly

**Benefits:**
- ✅ Fix Discord pagination (currently in-memory, lost on restart)
- ✅ Cache Apify results (save $$ and time)
- ✅ Cache website scans (expensive operation)
- ✅ Rate limiting per tenant
- ✅ Session management

**Setup:**
```bash
# Install
pnpm add ioredis

# Local dev
docker run -d --name oneclaw-redis -p 6379:6379 redis:alpine

# Production (Upstash)
# Sign up at upstash.com, get connection string, add to .env
```

**Code:**
```typescript
// packages/harness/src/cache/redis.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await redis.get(key);
  return val ? JSON.parse(val) : null;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export { redis };
```

### Phase 2: Add SQLite Support (NEXT WEEK)
**Why:** Enable self-hosted deployments without infrastructure

**Benefits:**
- ✅ Self-hosted users don't need Postgres
- ✅ Easier local development (no Supabase setup)
- ✅ Faster CI/CD tests
- ✅ Edge deployments possible

**Setup:**
```bash
pnpm add better-sqlite3 @types/better-sqlite3
```

**Implementation:**
```typescript
// packages/harness/src/stores/sqlite.ts
import Database from 'better-sqlite3';

export function createSQLiteStores(dbPath: string): Stores {
  const db = new Database(dbPath);
  
  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(provider, provider_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    -- ... rest of schema
  `);
  
  return {
    user: createSQLiteUserStore(db),
    identity: createSQLiteIdentityStore(db),
    wallet: createSQLiteWalletStore(db),
    transaction: createSQLiteTransactionStore(db),
  };
}
```

**Usage:**
```typescript
// apps/api/src/index.ts
import { initStores } from '@oneclaw/harness';
import { createSQLiteStores } from '@oneclaw/harness/stores/sqlite';
import { createSupabaseStores } from './stores/supabase';

// Choose based on environment
const stores = process.env.STORAGE === 'sqlite'
  ? createSQLiteStores('./data/oneclaw.db')
  : createSupabaseStores();

initStores(stores);
```

### Phase 3: Add pgvector (OPTIONAL, LATER)
**Why:** Only if you need semantic search features

**When to Add:**
- User requests "find similar businesses"
- Building AI-powered recommendations
- Need smart duplicate detection

**Don't Add If:**
- Exact search is good enough
- Trying to keep things simple
- Cost is a concern

---

## 💰 Cost Comparison

### Current (Supabase Only)
```
Supabase Pro: $25/month
- 8GB database
- 100GB bandwidth
- 50GB storage
```

### With Redis
```
Supabase Pro: $25/month
Upstash Redis: $0-10/month (free tier: 10k commands/day)
Total: $25-35/month
Performance: 10x faster for cached operations
```

### Self-Hosted (SQLite)
```
Server/VPS: $5-10/month (Hetzner, DigitalOcean)
SQLite: $0 (included)
Redis (optional): $0 (local)
Total: $5-10/month
Limitation: Single server, no horizontal scaling
```

## 🎯 Final Recommendations

### For OneClaw Cloud (Multi-tenant SaaS)
```
✅ Keep Supabase (Postgres) for core data
✅ Add Redis for caching & performance
⚠️ Add pgvector only if semantic search is needed
```

### For Self-Hosted Version
```
✅ Add SQLite support (zero infrastructure)
✅ Optional Redis for caching (Docker)
❌ Skip pgvector (too complex for self-hosted)
```

### Priority Order
1. **Redis** (this week) - immediate performance wins
2. **SQLite** (next week) - enable self-hosted
3. **pgvector** (maybe later) - only if users request semantic search

---

**Want me to start implementing Redis caching for Apify results and Discord pagination? That's the quickest win!**
