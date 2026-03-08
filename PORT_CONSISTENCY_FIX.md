# Port Consistency Fix

## The Problem

OneClaw had **3 different "single sources of truth"** for port assignments, and they **disagreed** with each other:

| File | HARNESS | DAEMON | API |
|------|---------|--------|-----|
| `oneclaw-node/src/ports.rs` (Rust) | 9000 ✅ | 8787 ✅ | 3000 ✅ |
| `packages/harness/src/server.ts` (TS) | ~~8787~~ ❌ | ~~9000~~ ❌ | 3000 ✅ |
| `packages/shared/ports.ts` (TS) | ~~8787~~ ❌ | ~~9000~~ ❌ | 3000 ✅ |

### Why This Caused Port Conflicts

1. **Developer confusion** - Different devs referenced different files
2. **Deployment failures** - Scripts checked wrong ports
3. **Inconsistent docs** - README said one thing, code did another
4. **Startup race conditions** - Services tried to bind to each other's ports

---

## The Fix (Applied)

### ✅ 1. Established Rust as Authoritative

Since the Rust daemon is the **orchestrator** and starts first, `oneclaw-node/src/ports.rs` is now the authoritative source.

```rust
// oneclaw-node/src/ports.rs
pub const DAEMON_PORT: u16 = 8787;   // Daemon (Rust) on 8787
pub const HARNESS_PORT: u16 = 9000;  // Harness (TS) on 9000
pub const API_PORT: u16 = 3000;      // API (TS) on 3000
```

### ✅ 2. Updated TypeScript Files to Match

**`packages/harness/src/server.ts`:**
```typescript
const PORTS = {
  HARNESS: 9000,  // ✅ Now matches Rust
  DAEMON: 8787,   // ✅ Now matches Rust
  API: 3000,
} as const;
```

**`packages/shared/ports.ts`:**
```typescript
export const PORTS = {
  HARNESS: 9000,  // ✅ Now matches Rust
  DAEMON: 8787,   // ✅ Now matches Rust
  API: 3000,
} as const;
```

### ✅ 3. Updated All Deployment Scripts

- `ecosystem.config.js` - Updated port documentation
- `scripts/start-production.sh` - Fixed health check URLs (9000 for Harness)
- `docker-compose.yml` - Clarified port mappings in comments

---

## The Golden Rule Going Forward

### **If you need to change a port:**

1. **Change Rust first** - `oneclaw-node/src/ports.rs`
2. **Update TypeScript** - `packages/shared/ports.ts` and `packages/harness/src/server.ts`
3. **Update Docker** - `docker-compose.yml` port mappings
4. **Update PM2** - `ecosystem.config.js` comments
5. **Update README** - Port references in docs

### **Port Assignment Reference:**

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Daemon | 8787 | http://localhost:8787 | Main UI, Chat, Agent OS |
| Harness | 9000 | http://localhost:9000 | Tool execution engine |
| API | 3000 | http://localhost:3000 | OAuth proxy, webhooks |

---

## Why We Don't Use Environment Variables

The old `ports.ts` comment said:
> DO NOT use environment variables for ports.

**Why?**
1. **Service discovery requires known ports** - Daemon needs to find Harness before env vars are loaded
2. **Docker networking** - Containers reference each other by service name + port
3. **PM2 health checks** - Scripts need to know ports to verify startup
4. **Simplicity** - No need for dynamic ports in a 3-service architecture

**Exception:** The daemon accepts `--port` flag for testing, but defaults to 8787.

---

## Testing the Fix

### Local (Manual):

```bash
# Terminal 1 - Start Harness (should bind to 9000)
cd packages/harness
pnpm dev

# Terminal 2 - Start Daemon (should bind to 8787)
cd oneclaw-node
cargo run -- daemon

# Verify
curl http://localhost:9000/health  # Harness
curl http://localhost:8787/health  # Daemon
```

### Docker:

```bash
docker-compose up
# All 3 services should start without port conflicts
```

### Production (PM2):

```bash
./scripts/start-production.sh
# Should start in order: Harness → Daemon → API
# Should verify tools are loaded from correct port
```

---

## Impact Assessment

✅ **No breaking changes** - The ports were always *intended* to be 8787/9000, the code was just inconsistent

✅ **All deployment scripts updated** - Docker, PM2, bash scripts

✅ **Docs updated** - README, DOCKER.md, port comments

⚠️ **May require rebuild** - If you had cached builds with old ports:
```bash
cd packages/harness
pnpm build

cd oneclaw-node
cargo build --release
```

---

## Lessons Learned

1. **Never have multiple "single sources of truth"** - Especially for critical config like ports
2. **Cross-language projects need a canonical source** - We chose Rust (the orchestrator)
3. **Hardcode sparingly, but when you do, document it** - The ports ARE hardcoded, but now consistently
4. **Build-time validation would help** - Future: Script to verify Rust and TS ports match
5. **Port swaps are subtle bugs** - Easy to copy-paste and swap HARNESS/DAEMON

---

## Future Improvements

1. **Automated port consistency check** in CI:
   ```bash
   scripts/verify-port-consistency.sh
   ```

2. **Codegen** - Generate TypeScript ports from Rust:
   ```rust
   // build.rs generates packages/shared/ports.ts
   ```

3. **Runtime validation** - Daemon warns if Harness isn't on expected port

---

**Status:** ✅ FIXED (2026-03-08)
**Files Changed:** 3 core files + 2 scripts + 1 docker-compose
**Risk:** Low (restores intended behavior)
