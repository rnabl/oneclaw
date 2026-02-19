# Open Source Caching Options

## 🎯 TL;DR Recommendations

**Best Overall:** **Valkey** (Redis fork by Linux Foundation) ⭐
**Fastest:** **Dragonfly** (25x faster than Redis)
**Simplest:** **Redis** (original, still open source)
**In-Process:** **Node-cache** (no external service needed)

---

## 1. Valkey 🔑 (RECOMMENDED)

**What It Is:**
- Linux Foundation's fork of Redis 7.2
- Created after Redis changed to non-open-source license
- Backed by AWS, Google Cloud, Oracle, Ericsson

**Why It's Great:**
- ✅ **100% Redis compatible** - drop-in replacement
- ✅ **Truly open source** (BSD 3-Clause)
- ✅ **Community governed** - won't go proprietary
- ✅ **Active development** - AWS backing
- ✅ **No license concerns** - use anywhere
- ✅ **All Redis features** - pub/sub, streams, JSON, etc.

**Setup:**
```bash
# Docker
docker run -d --name valkey -p 6379:6379 valkey/valkey:latest

# Or install locally (Ubuntu/Debian)
sudo apt-get install valkey
```

**Code:**
```typescript
// Same as Redis! Just change connection
import { Redis } from 'ioredis';

const cache = new Redis({
  host: process.env.VALKEY_HOST || 'localhost',
  port: 6379,
});
```

**Cost:** $0 (self-hosted)
**Performance:** Same as Redis
**Recommendation:** ⭐⭐⭐⭐⭐ Best choice for open source

---

## 2. Dragonfly 🐉 (FASTEST)

**What It Is:**
- Modern Redis replacement built from scratch in C++
- Designed for multi-core CPUs (Redis is single-threaded)
- 25x faster than Redis on same hardware

**Why It's Great:**
- ✅ **Blazing fast** - 25x throughput of Redis
- ✅ **Redis compatible** - same API/protocol
- ✅ **Less memory** - 30% less RAM usage
- ✅ **Multi-threaded** - uses all CPU cores
- ✅ **Open source** (BSL 1.1, becomes Apache 2.0 after 4 years)

**Setup:**
```bash
# Docker
docker run -d --name dragonfly -p 6379:6379 \
  --ulimit memlock=-1 \
  docker.dragonflydb.io/dragonflydb/dragonfly

# Homebrew (Mac)
brew install dragonfly

# Or use their cloud (free tier available)
```

**Code:**
```typescript
// Same Redis API
import { Redis } from 'ioredis';

const cache = new Redis({
  host: process.env.DRAGONFLY_HOST || 'localhost',
  port: 6379,
});
```

**Benchmarks:**
- Redis: ~100k ops/sec (single core)
- Dragonfly: ~2.5M ops/sec (multi-core)

**Cost:** $0 (self-hosted)
**Performance:** 25x faster than Redis
**Recommendation:** ⭐⭐⭐⭐⭐ Best for high-performance needs

---

## 3. KeyDB ⚡

**What It Is:**
- Redis fork with multi-threading
- Actively developed since 2019
- Used by Snapchat, Cisco, others

**Why It's Great:**
- ✅ **Multi-threaded** - 5x faster than Redis
- ✅ **Redis compatible** - drop-in replacement
- ✅ **Active replication** - multi-master support
- ✅ **FLASH storage** - use SSD for cold data
- ✅ **Open source** (BSD 3-Clause)

**Setup:**
```bash
# Docker
docker run -d --name keydb -p 6379:6379 eqalpha/keydb

# Or build from source
git clone https://github.com/Snapchat/KeyDB.git
cd KeyDB
make
```

**Cost:** $0 (self-hosted)
**Performance:** 5x faster than Redis
**Recommendation:** ⭐⭐⭐⭐ Good alternative

---

## 4. Redis (Original) 🔴

**What It Is:**
- The original, but license changed in 2024
- Now "source available" not fully open source
- Still free for most use cases

**Why It's Still Good:**
- ✅ **Mature & stable** - 15 years of development
- ✅ **Huge ecosystem** - tons of tools/libs
- ✅ **Well documented** - best docs of any cache
- ✅ **Free for use** - license mainly affects cloud providers
- ⚠️ **License changed** - RSALv2/SSPLv1 (not OSI approved)

**Setup:**
```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# Homebrew
brew install redis
```

**Cost:** $0 (self-hosted)
**Performance:** Industry standard baseline
**Recommendation:** ⭐⭐⭐⭐ Still good if you don't care about license

---

## 5. Node-cache 📦 (IN-PROCESS)

**What It Is:**
- In-memory cache inside your Node.js process
- No external service needed
- Simple key-value store

**Why It's Great:**
- ✅ **Zero infrastructure** - no Docker, no server
- ✅ **Instant setup** - `npm install node-cache`
- ✅ **Simple API** - easier than Redis
- ✅ **Good for dev** - no external dependencies
- ❌ **Lost on restart** - not durable
- ❌ **Not shared** - each server has own cache
- ❌ **Memory limited** - uses Node heap

**Setup:**
```bash
npm install node-cache
```

**Code:**
```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ 
  stdTTL: 3600, // 1 hour default
  checkperiod: 120 // cleanup every 2 minutes
});

// Simple API
cache.set('key', { data: 'value' });
const value = cache.get('key');
cache.del('key');
```

**Cost:** $0
**Performance:** Fastest (in-memory, no network)
**Recommendation:** ⭐⭐⭐ Good for dev/single-server

---

## 6. Memcached 🐘

**What It Is:**
- Original distributed cache (2003)
- Simpler than Redis (no persistence, pub/sub, etc.)
- Just key-value cache

**Why You Might Skip It:**
- ✅ **Simple & stable** - does one thing well
- ✅ **Low memory overhead** - very efficient
- ❌ **Less features** - no persistence, pub/sub, sorted sets
- ❌ **Redis is better** - more features, same performance

**Setup:**
```bash
# Docker
docker run -d --name memcached -p 11211:11211 memcached

# Use memjs client
npm install memjs
```

**Cost:** $0 (self-hosted)
**Performance:** Similar to Redis
**Recommendation:** ⭐⭐ Use Redis/Valkey instead

---

## 7. Garnet 💎 (Microsoft)

**What It Is:**
- Microsoft's Redis alternative in C#
- Built for Azure but open source
- Redis protocol compatible

**Why It's Interesting:**
- ✅ **Faster than Redis** - on some workloads
- ✅ **Redis compatible** - works with existing clients
- ✅ **Open source** (MIT)
- ✅ **Modern C#** - .NET 8
- ❌ **Very new** (2024) - less battle-tested

**Setup:**
```bash
# Docker
docker run -d --name garnet -p 6379:6379 \
  mcr.microsoft.com/garnet
```

**Cost:** $0 (self-hosted)
**Performance:** Similar to Redis+
**Recommendation:** ⭐⭐⭐ Promising but new

---

## 📊 Quick Comparison Table

| Option | Speed | Redis API | Open Source | Maturity | Recommendation |
|--------|-------|-----------|-------------|----------|----------------|
| **Valkey** | ⚡⚡⚡ | ✅ 100% | ✅ BSD | ⭐⭐⭐⭐ | **BEST** |
| **Dragonfly** | ⚡⚡⚡⚡⚡ | ✅ 100% | ⚠️ BSL | ⭐⭐⭐⭐ | Fastest |
| **KeyDB** | ⚡⚡⚡⚡ | ✅ 100% | ✅ BSD | ⭐⭐⭐⭐ | Solid |
| **Redis** | ⚡⚡⚡ | ✅ 100% | ⚠️ RSALv2 | ⭐⭐⭐⭐⭐ | Standard |
| **Node-cache** | ⚡⚡⚡⚡⚡ | ❌ Different | ✅ MIT | ⭐⭐⭐ | Simple |
| **Memcached** | ⚡⚡⚡ | ❌ Different | ✅ BSD | ⭐⭐⭐⭐⭐ | Basic |
| **Garnet** | ⚡⚡⚡⚡ | ✅ 100% | ✅ MIT | ⭐⭐ | New |

---

## 🎯 Recommendation for OneClaw

### Development: Node-cache
**Why:** Zero infrastructure, instant setup
```typescript
// packages/harness/src/cache/node-cache.ts
import NodeCache from 'node-cache';

export const cache = new NodeCache({ 
  stdTTL: 3600,
  checkperiod: 120 
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  return cache.get<T>(key) ?? null;
}

export async function cacheSet<T>(key: string, value: T, ttl?: number): Promise<void> {
  cache.set(key, value, ttl ?? 3600);
}
```

### Production Self-Hosted: Valkey
**Why:** True open source, Redis compatible, backed by Linux Foundation

```bash
# docker-compose.yml
services:
  valkey:
    image: valkey/valkey:latest
    ports:
      - "6379:6379"
    volumes:
      - valkey-data:/data
    command: valkey-server --appendonly yes

volumes:
  valkey-data:
```

### High Performance: Dragonfly
**Why:** 25x faster, less memory, still Redis compatible

```bash
# docker-compose.yml
services:
  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    ports:
      - "6379:6379"
    volumes:
      - dragonfly-data:/data
    ulimits:
      memlock: -1

volumes:
  dragonfly-data:
```

---

## 💡 Implementation Strategy

### Phase 1: Start with Node-cache (TODAY)
```typescript
// Quick win, no infrastructure
import NodeCache from 'node-cache';

const discoveryCache = new NodeCache({ stdTTL: 3600 });

// Cache Apify results
const cacheKey = `discovery:${niche}:${location}`;
const cached = discoveryCache.get(cacheKey);
if (cached) return cached;

const results = await searchBusinesses(/*...*/);
discoveryCache.set(cacheKey, results);
```

**Benefits:**
- ✅ Works immediately (no Docker, no setup)
- ✅ Good for development
- ✅ Fast (in-memory, no network)
- ❌ Lost on restart (acceptable for cache)
- ❌ Not shared across servers (fine for single instance)

### Phase 2: Add Valkey for Production (THIS WEEK)
```typescript
// Environment-based cache selection
import { createCache } from './cache';

const cache = createCache({
  type: process.env.CACHE_TYPE || 'memory', // 'memory' | 'valkey' | 'dragonfly'
  url: process.env.CACHE_URL,
});

// Same API for all cache types
await cache.set('key', value, ttl);
const value = await cache.get('key');
```

**Benefits:**
- ✅ Persistent cache (survives restarts)
- ✅ Shared across multiple servers
- ✅ No vendor lock-in (true open source)
- ✅ Battle-tested Redis protocol

### Phase 3: Upgrade to Dragonfly (OPTIONAL)
If you need extreme performance:
- 25x throughput of Redis/Valkey
- 30% less memory
- Drop-in replacement (same code)

---

## 🚀 Quick Start Code

```typescript
// packages/harness/src/cache/index.ts
import NodeCache from 'node-cache';
import { Redis } from 'ioredis';

interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export function createCache(options: {
  type: 'memory' | 'valkey' | 'dragonfly' | 'redis';
  url?: string;
}): Cache {
  if (options.type === 'memory') {
    const nodeCache = new NodeCache({ stdTTL: 3600 });
    
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
    };
  }
  
  // Valkey, Dragonfly, Redis all use same protocol
  const redis = new Redis(options.url || 'redis://localhost:6379');
  
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
  };
}

// Usage
export const cache = createCache({
  type: (process.env.CACHE_TYPE || 'memory') as any,
  url: process.env.CACHE_URL,
});
```

---

## 📝 Summary

**Best Open Source Options:**
1. **Valkey** - True open source Redis fork (Linux Foundation) ⭐
2. **Dragonfly** - 25x faster, modern architecture
3. **Node-cache** - Zero infrastructure for dev/single-server

**My Recommendation:**
- Start with **Node-cache** (5 minutes to implement)
- Add **Valkey** when you need persistence/multi-server
- Upgrade to **Dragonfly** if you need extreme performance

**All are 100% free and open source!** 🎉
