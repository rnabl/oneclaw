# OneClaw Production Framework Architecture

## 🎯 Goal: Pluggable Everything

Build a production agent framework that:
1. **Works in production** with Upstash (Redis) + Supabase (Postgres)
2. **Runs locally** with Valkey/Dragonfly + SQLite/Postgres
3. **Supports durable workflows** with optional Restate
4. **Is truly modular** - swap backends without code changes

---

## 🏗️ Current Architecture (Already Good!)

### ✅ What You Already Have

```typescript
// packages/harness/src/stores/index.ts
export interface Stores {
  user: UserStore;
  identity: IdentityStore;
  wallet: WalletStore;
  transaction: TransactionStore;
}

// apps/api/src/index.ts
const stores = createSupabaseStores(); // Production
initStores(stores);
```

**This is EXACTLY the right approach!** Interface-based, pluggable, clean separation.

---

## 🔌 What's Missing: Cache Layer

You need the same pluggable approach for **caching**:

```typescript
// packages/harness/src/cache/index.ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
}

// Implementations
function createUpstashCache(url: string, token: string): Cache;
function createValkeyCache(url: string): Cache;
function createMemoryCache(): Cache;
```

---

## 📦 Complete Pluggable Stack

### Production (OneClaw Cloud)
```
┌─────────────────────────────────────────┐
│  Discord Bot / API Server               │
└─────────┬───────────────────────────────┘
          │
          ├─► Cache: Upstash Redis (managed)
          │   - Session storage
          │   - Apify result caching
          │   - Website scan caching
          │   - Rate limiting
          │
          ├─► Database: Supabase (managed)
          │   - Users, identities
          │   - Wallets, transactions
          │   - Workflow states
          │   - Audit logs
          │
          └─► Durable Workflows: Restate Cloud (optional)
              - Long-running enrichment workflows
              - Checkpointing & replay
```

### Self-Hosted (Local Development)
```
┌─────────────────────────────────────────┐
│  Discord Bot / API Server               │
└─────────┬───────────────────────────────┘
          │
          ├─► Cache: Valkey (Docker)
          │   OR: In-memory (Node-cache)
          │
          ├─► Database: SQLite (file-based)
          │   OR: Postgres (Docker)
          │
          └─► Durable Workflows: Restate (Docker, optional)
```

---

## 🚀 Implementation Plan

### Phase 1: Add Cache Abstraction Layer (TODAY)

```typescript
// packages/harness/src/cache/index.ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
}

// Global cache registry (like stores)
let _cache: Cache | null = null;

export function initCache(cache: Cache): void {
  _cache = cache;
  console.log('[cache] Initialized');
}

export function getCache(): Cache {
  if (!_cache) {
    throw new Error('[cache] Not initialized. Call initCache() on startup.');
  }
  return _cache;
}

export function isCacheInitialized(): boolean {
  return _cache !== null;
}
```

### Phase 2: Implement Backends

#### 1. Memory Cache (Dev/Simple)
```typescript
// packages/harness/src/cache/memory.ts
import NodeCache from 'node-cache';

export function createMemoryCache(): Cache {
  const nodeCache = new NodeCache({ 
    stdTTL: 3600,
    checkperiod: 120,
    useClones: false // Better performance
  });
  
  return {
    async get<T>(key: string): Promise<T | null> {
      return nodeCache.get<T>(key) ?? null;
    },
    
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      nodeCache.set(key, value, ttl ?? 3600);
    },
    
    async del(key: string): Promise<void> {
      nodeCache.del(key);
    },
    
    async exists(key: string): Promise<boolean> {
      return nodeCache.has(key);
    },
    
    async incr(key: string): Promise<number> {
      const current = nodeCache.get<number>(key) ?? 0;
      const next = current + 1;
      nodeCache.set(key, next);
      return next;
    },
    
    async expire(key: string, ttl: number): Promise<void> {
      nodeCache.ttl(key, ttl);
    },
  };
}
```

#### 2. Redis-Compatible Cache (Upstash, Valkey, Dragonfly)
```typescript
// packages/harness/src/cache/redis.ts
import { Redis } from 'ioredis';

export function createRedisCache(config: {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
}): Cache {
  const redis = config.url 
    ? new Redis(config.url)
    : new Redis({
        host: config.host || 'localhost',
        port: config.port || 6379,
        password: config.password,
      });
  
  return {
    async get<T>(key: string): Promise<T | null> {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    },
    
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.set(key, serialized, 'EX', ttl);
      } else {
        await redis.set(key, serialized);
      }
    },
    
    async del(key: string): Promise<void> {
      await redis.del(key);
    },
    
    async exists(key: string): Promise<boolean> {
      const result = await redis.exists(key);
      return result === 1;
    },
    
    async incr(key: string): Promise<number> {
      return await redis.incr(key);
    },
    
    async expire(key: string, ttl: number): Promise<void> {
      await redis.expire(key, ttl);
    },
  };
}

// Upstash-specific (HTTP REST API)
export function createUpstashCache(url: string, token: string): Cache {
  return createRedisCache({ url: `${url}?token=${token}` });
}
```

#### 3. SQLite Stores
```typescript
// packages/harness/src/stores/sqlite.ts
import Database from 'better-sqlite3';

export function createSQLiteStores(dbPath: string): Stores {
  const db = new Database(dbPath);
  
  // Schema initialization
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_email TEXT,
      provider_name TEXT,
      provider_avatar TEXT,
      metadata TEXT, -- JSON
      verified_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, provider_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT 'free',
      lifetime_spent_cents INTEGER NOT NULL DEFAULT 0,
      lifetime_topup_cents INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      description TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
  `);
  
  return {
    user: createSQLiteUserStore(db),
    identity: createSQLiteIdentityStore(db),
    wallet: createSQLiteWalletStore(db),
    transaction: createSQLiteTransactionStore(db),
  };
}
```

### Phase 3: Configuration-Based Backend Selection

```typescript
// apps/api/src/config/backends.ts
import { initStores, initCache } from '@oneclaw/harness';
import { createSupabaseStores } from '../stores/supabase';
import { createSQLiteStores } from '@oneclaw/harness/stores/sqlite';
import { createMemoryCache, createRedisCache, createUpstashCache } from '@oneclaw/harness/cache';

interface BackendConfig {
  // Storage
  storage: 'supabase' | 'sqlite' | 'postgres';
  supabaseUrl?: string;
  supabaseKey?: string;
  sqlitePath?: string;
  postgresUrl?: string;
  
  // Cache
  cache: 'memory' | 'redis' | 'upstash' | 'valkey' | 'dragonfly';
  cacheUrl?: string;
  upstashToken?: string;
  
  // Durable workflows
  durable: 'none' | 'restate';
  restateUrl?: string;
}

export function initializeBackends(config: BackendConfig) {
  console.log('[backends] Initializing...');
  console.log(`[backends] Storage: ${config.storage}`);
  console.log(`[backends] Cache: ${config.cache}`);
  console.log(`[backends] Durable: ${config.durable}`);
  
  // Initialize Storage
  switch (config.storage) {
    case 'supabase':
      if (!config.supabaseUrl || !config.supabaseKey) {
        throw new Error('Supabase URL and key required');
      }
      const supabaseStores = createSupabaseStores();
      initStores(supabaseStores);
      console.log('[backends] ✅ Supabase stores initialized');
      break;
      
    case 'sqlite':
      const sqlitePath = config.sqlitePath || './data/oneclaw.db';
      const sqliteStores = createSQLiteStores(sqlitePath);
      initStores(sqliteStores);
      console.log(`[backends] ✅ SQLite stores initialized: ${sqlitePath}`);
      break;
      
    case 'postgres':
      // TODO: Implement local Postgres stores
      throw new Error('Local Postgres not yet implemented');
  }
  
  // Initialize Cache
  switch (config.cache) {
    case 'memory':
      const memCache = createMemoryCache();
      initCache(memCache);
      console.log('[backends] ✅ Memory cache initialized');
      break;
      
    case 'upstash':
      if (!config.cacheUrl || !config.upstashToken) {
        throw new Error('Upstash URL and token required');
      }
      const upstashCache = createUpstashCache(config.cacheUrl, config.upstashToken);
      initCache(upstashCache);
      console.log('[backends] ✅ Upstash cache initialized');
      break;
      
    case 'redis':
    case 'valkey':
    case 'dragonfly':
      const redisCache = createRedisCache({ 
        url: config.cacheUrl || 'redis://localhost:6379' 
      });
      initCache(redisCache);
      console.log(`[backends] ✅ ${config.cache} cache initialized`);
      break;
  }
  
  // Initialize Durable Workflows
  if (config.durable === 'restate') {
    // TODO: Initialize Restate
    console.log('[backends] ⚠️  Restate not yet implemented');
  }
  
  console.log('[backends] ✅ All backends initialized');
}

// Load from environment
export function getBackendConfig(): BackendConfig {
  return {
    // Storage
    storage: (process.env.STORAGE_BACKEND as any) || 'supabase',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    sqlitePath: process.env.SQLITE_PATH,
    postgresUrl: process.env.POSTGRES_URL,
    
    // Cache
    cache: (process.env.CACHE_BACKEND as any) || 'memory',
    cacheUrl: process.env.CACHE_URL || process.env.UPSTASH_REDIS_REST_URL,
    upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    
    // Durable
    durable: (process.env.DURABLE_BACKEND as any) || 'none',
    restateUrl: process.env.RESTATE_URL,
  };
}
```

### Phase 4: Update API Server

```typescript
// apps/api/src/index.ts
import { initializeBackends, getBackendConfig } from './config/backends';

// Initialize pluggable backends
const config = getBackendConfig();
initializeBackends(config);

// Rest of server code...
```

### Phase 5: Environment Configuration

```bash
# .env.local (Production - OneClaw Cloud)
STORAGE_BACKEND=supabase
SUPABASE_URL=https://kaqatynbnaqdsfvfjlkt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

CACHE_BACKEND=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

DURABLE_BACKEND=none # or 'restate' for enrichment workflows

# .env.local (Local Development)
STORAGE_BACKEND=sqlite
SQLITE_PATH=./data/oneclaw.db

CACHE_BACKEND=memory
# OR
# CACHE_BACKEND=valkey
# CACHE_URL=redis://localhost:6379

DURABLE_BACKEND=none
```

---

## 🎯 Migration Path

### Week 1: Cache Layer (This Week)
- [ ] Create cache interface & registry
- [ ] Implement memory cache (dev)
- [ ] Implement Redis-compatible cache (Upstash, Valkey, Dragonfly)
- [ ] Update discovery workflow to use cache
- [ ] Update Discord bot to use cache for pagination

### Week 2: SQLite Stores
- [ ] Implement SQLite user store
- [ ] Implement SQLite identity store
- [ ] Implement SQLite wallet store
- [ ] Implement SQLite transaction store
- [ ] Test local development with SQLite

### Week 3: Configuration System
- [ ] Create backend config system
- [ ] Add environment-based initialization
- [ ] Document deployment configurations
- [ ] Test production→local migrations

### Week 4: Restate Integration (Optional)
- [ ] Implement Restate for enrichment workflow
- [ ] Add checkpointing
- [ ] Test long-running workflows
- [ ] Deploy Restate to production

---

## ✅ Success Criteria

### Production Readiness
- ✅ Upstash Redis for caching (managed, serverless)
- ✅ Supabase for storage (managed, Postgres)
- ✅ Optional Restate for durable workflows

### Self-Hosted Support
- ✅ SQLite for storage (zero infrastructure)
- ✅ Valkey/Dragonfly for cache (Docker)
- ✅ Optional local Restate (Docker)

### Developer Experience
- ✅ Single environment variable to switch backends
- ✅ Works offline (memory cache + SQLite)
- ✅ Fast local development
- ✅ Production-like testing

### Privacy & Control
- ✅ All data stays local if desired
- ✅ No vendor lock-in
- ✅ Open source backends (Valkey, SQLite)
- ✅ Full control over infrastructure

---

**This is the right way to build a production agent framework. You're already 60% there with your store interfaces!**
