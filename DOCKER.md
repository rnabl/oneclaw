# OneClaw - Docker Quick Start

## One-Command Setup ⚡

**Time: 5 minutes** (+ Docker build time)

```bash
# 1. Clone
git clone https://github.com/user/oneclaw.git
cd oneclaw

# 2. Configure
cp .env.example .env.local
nano .env.local  # Add your API keys

# 3. Run
docker-compose up
```

**That's it!** Open http://localhost:8787

---

## What You Get

- ✅ **Daemon** (Rust) - Port 8787 - Agent chat UI
- ✅ **Harness** (TypeScript) - Port 9000 - Tool execution
- ✅ **API** (TypeScript) - Port 3000 - OAuth proxy
- ✅ **8 Core Tools** - Code execution, files, database, Gmail

---

## Minimum Config

Add to `.env.local`:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Highly recommended (for Gmail)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Docker Commands

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all
docker-compose down

# Rebuild after code changes
docker-compose up --build

# Clean restart (removes volumes)
docker-compose down -v
docker-compose up --build
```

---

## What Gets Persisted

Docker volumes store:
- `daemon-workspace` - Agent OS files (SOUL.md, SKILLS.md, etc.)
- `daemon-data` - SQLite database
- `harness-data` - Tool artifacts
- `./logs` - Application logs (on host)

---

## Ports

| Service | Port | URL |
|---------|------|-----|
| Daemon | 8787 | http://localhost:8787 (Main UI) |
| Harness | 9000 | http://localhost:9000 (Tools API) |
| API | 3000 | http://localhost:3000 (OAuth) |

---

## Services Start Order

1. **Harness** starts first (tools available)
2. **API** waits for Harness health check
3. **Daemon** waits for Harness health check
4. All services ready in ~30-60 seconds

---

## Troubleshooting

### "Connection refused" errors
Services need 30-60s to start. Wait for health checks:

```bash
docker-compose logs -f
# Wait for: "✅ Synced SKILLS.md with X tools"
```

### Agent doesn't know about tools
SKILLS.md auto-syncs on daemon boot. Check:

```bash
docker exec -it oneclaw-daemon cat /root/.oneclaw/workspace/SKILLS.md
```

### Gmail not working
1. Check Google OAuth credentials in `.env.local`
2. Update redirect URI: http://localhost:3000/oauth/google/callback
3. Restart: `docker-compose restart`

---

## Development Mode

For local development without Docker:

```bash
# Terminal 1: Harness (port 9000)
pnpm --filter @oneclaw/harness dev

# Terminal 2: API (port 3000)
pnpm --filter @oneclaw/api dev

# Terminal 3: Daemon (default port 8787)
cd oneclaw-node && cargo run -- daemon

# Or custom port:
cd oneclaw-node && cargo run -- daemon --port 8888
```

---

## Production Deployment

See [DEPLOY.md](./DEPLOY.md) for VPS setup with:
- Nginx reverse proxy
- SSL certificates (Let's Encrypt)
- PM2 process management
- Automatic restarts

---

## Optional: Add More Tools

Add to `.env.local` and restart:

```env
# Supabase (cloud storage)
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...

# Business discovery
APIFY_API_TOKEN=apify_api_...

# AI search
PERPLEXITY_API_KEY=pplx-...
```

Then:
```bash
docker-compose restart
```

Tools auto-register on startup!

---

## Architecture

```
┌─────────────────────────────────────┐
│  Browser                            │
│  http://localhost:8787              │
└────────────┬────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│  Daemon (Rust) :8787                │
│  - Chat UI                          │
│  - Agent OS (MD files)              │
│  - Conversation memory              │
└────────────┬────────────────────────┘
             ↓ HTTP
┌─────────────────────────────────────┐
│  Harness (TypeScript) :9000         │
│  - Tool registry (24 tools)         │
│  - execute-code (Deno)              │
│  - Database, files, etc.            │
└────────────┬────────────────────────┘
             ↓ HTTP
┌─────────────────────────────────────┐
│  API (TypeScript) :3000             │
│  - Gmail OAuth proxy                │
│  - Stripe billing (optional)        │
└─────────────────────────────────────┘
```

---

## Time Comparison

| Method | Time | Complexity |
|--------|------|------------|
| **Docker** | 5 min setup + build | Easy ⭐⭐⭐⭐⭐ |
| **Manual** | 15 min | Medium ⭐⭐⭐ |
| **VPS** | 20 min | Hard ⭐ |

**Recommended: Docker for local dev, VPS for production**

---

## What's Next?

1. Open http://localhost:8787
2. Chat with your agent
3. Try: "Write a script to fetch GitHub stars for a repo"
4. Watch it use `execute-code` tool!

See [README.md](./README.md) for full documentation.
