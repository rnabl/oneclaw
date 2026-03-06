# OneClaw Three-Pillar Architecture

## 🏗️ Architecture Overview

OneClaw has a **three-layer architecture** where each service runs independently:

```
┌──────────────────────────────────────────────────────────────┐
│                      API LAYER                                │
│                     (apps/api - Port 3000)                    │
│                                                               │
│  🌐 USER INTERFACE - Frontend & Integrations                 │
│  - User authentication (Google OAuth)                        │
│  - Frontend endpoints (Next.js/Web UI)                       │
│  - Workflow dispatch (calls Harness directly)                │
│  - Telegram/Discord/SMS integrations                         │
│  - Stripe billing                                            │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTP calls to Harness
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   HARNESS LAYER ⭐                            │
│              (packages/harness - Port 8787)                   │
│                                                               │
│  🔧 EXECUTION ENGINE - Where everything runs!                │
│  - Workflow execution engine                                 │
│  - Tool registry (80+ tools)                                 │
│  - Policy enforcement (rate limits, cost caps)               │
│  - Secret management (Vault)                                 │
│  - Metering & billing                                        │
│  - Artifact storage                                          │
│  - Checkpointing & recovery                                  │
│  - Scheduler (email sending, heartbeat, reply checker)       │
│  - Loads .env.production directly                            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      DAEMON LAYER                             │
│           (packages/node-runtime - Port 9000)                 │
│                                                               │
│  🤖 NODE RUNTIME - Future distributed execution              │
│  - Receipt tracking                                          │
│  - Executor registry (HTTP, Browser, etc.)                   │
│  - Local control API                                         │
│  - Config management                                         │
│  - (Currently mostly future infrastructure)                  │
└──────────────────────────────────────────────────────────────┘
```

**Key Point**: PM2 starts all three services **independently in parallel**. Each loads `.env.production` via PM2's `env_file` setting.

---

## 🤖 Pillar 1: Daemon (`packages/node-runtime`)

### Purpose
**Future-focused node runtime** for distributed execution (currently infrastructure placeholder)

### Responsibilities
- 📝 **Receipt Tracking**: Stores workflow execution receipts
- 🎭 **Executor Registry**: HTTP, Browser automation, etc.
- ⚙️ **Config Management**: Loads and manages node configuration
- 🌐 **Control API**: Local management interface
- 🔮 **Future**: Distributed execution across multiple nodes

### Key Files
- `packages/node-runtime/src/daemon/server.ts` - Daemon HTTP server
- `packages/node-runtime/src/daemon/index.ts` - Main entry point

### Environment
- **Port**: 9000
- **Process**: PM2 `daemon` process
- **Language**: Rust + TypeScript
- **Status**: Currently placeholder for future distributed features

---

## ⚙️ Pillar 2: Harness (`packages/harness`) - **⭐ THE ENGINE**

### Purpose
**The core execution engine** - This is where ALL your workflows run!

### Responsibilities
- 🔧 **Tool Registry**: 80+ registered tools (discover-businesses, check-ai-rankings, enrich-contact, etc.)
- 🏃 **Workflow Execution**: Runs multi-step workflows with checkpointing
- 🔒 **Secret Management**: Vault for API keys (encrypted at rest)
- 💰 **Metering**: Tracks costs per tool, per tenant
- 🛡️ **Policy Engine**: Enforces rate limits, cost caps, tier restrictions
- 📦 **Artifact Storage**: Saves intermediate results
- ⏰ **Scheduler**: Email sender, heartbeat monitor, reply checker
- 🗄️ **Database**: Supabase for persistent storage

### Key Files
- `packages/harness/src/server.ts` - Main HTTP server
- `packages/harness/src/api/routes.ts` - REST API endpoints
- `packages/harness/src/execution/runner.ts` - Workflow executor
- `packages/harness/src/registry/index.ts` - Tool registry
- `packages/harness/src/scheduler/` - Background jobs
- `packages/harness/src/workflows/` - Workflow definitions

### API Endpoints
```typescript
GET  /health                    - Health check
GET  /tools                     - List all tools
POST /tools/:id/execute         - Execute a tool directly
POST /jobs/execute              - Execute a workflow
GET  /jobs/:id                  - Get job status
GET  /scheduler/status          - Scheduler status
POST /scheduler/start           - Start scheduler
POST /scheduler/stop            - Stop scheduler
```

### Environment
- **Port**: 8787
- **URL**: http://localhost:8787 (internal)
- **Process**: PM2 `harness` process
- **Env File**: Loads `.env.production` directly (line 22 of server.ts)
- **⭐ THIS IS WHERE YOUR JOB DISCOVERY RUNS!**

### Workflows Registered
1. `discover-businesses` - Google Maps discovery
2. `discover-hiring-businesses` - Job posting discovery
3. `enrich-contact` - Email/contact enrichment
4. `audit-website` - Website scanning
5. `complete-sdr-discovery` - Full SDR pipeline
6. `check-ai-rankings` - AI search visibility check
7. ... and many more

---

## 📦 Pillar 3: API (`apps/api`)

### Purpose
User-facing web application and integration layer

### Responsibilities
- 🔐 **Authentication**: Google OAuth, session management
- 🌐 **Frontend**: Serves Next.js web UI
- 🔌 **Integrations**: Telegram, Discord, SMS, Stripe
- 🎯 **Workflow Dispatch**: Routes user requests directly to Harness API
- 📊 **User Dashboard**: Shows jobs, results, billing

### Key Files
- `apps/api/src/index.ts` - Main Express/Hono server
- `apps/api/src/routes/oauth.ts` - OAuth authentication
- `apps/api/src/services/node-workflows.ts` - Dispatches workflows
- `apps/api/src/workflows/discovery.ts` - Workflow definitions

### Environment
- **Port**: 3000
- **URL**: https://oneclaw.chat
- **Process**: PM2 `api` process

---

## 🔄 Request Flow

### Example: User runs job posting discovery

```
1. User visits oneclaw.chat
   └─> API (Port 3000) authenticates via Google OAuth

2. User clicks "Find hiring businesses"
   └─> API POST /api/workflows/discover-hiring-businesses
   └─> API → Harness POST :8787/jobs/execute (DIRECTLY)
   
3. Harness executes workflow (THE ENGINE)
   └─> Validates input (Zod schema)
   └─> Checks policy (rate limits, cost caps)
   └─> Uses secrets from .env.production (loaded at boot)
   └─> Executes workflow: discover-hiring-businesses
   
4. Workflow runs (packages/harness/src/workflows/discover-hiring-businesses.ts)
   └─> Calls Notte API (job postings)
   └─> Groups by company
   └─> Extracts websites (multi-strategy)
   └─> Infers business type (LLM)
   └─> Calculates priority score
   └─> Stores in Supabase (crm.leads table)
   └─> Returns results to Harness
   
5. Harness returns to API
   └─> API returns to user
   └─> User sees results in dashboard
```

### Boot Process
```
PM2 starts all three processes in parallel:

1. harness (Port 8787)
   └─> Loads .env.production directly (server.ts line 22)
   └─> Registers workflows & tools
   └─> Starts scheduler
   └─> Ready to accept requests

2. daemon (Port 9000)
   └─> Loads config
   └─> Sets up executors
   └─> Receipt tracking ready

3. api (Port 3000)
   └─> Connects to database
   └─> Sets up OAuth
   └─> Serves web UI
   └─> Routes requests to Harness

All three load .env.production independently via PM2's env_file setting.
No strict boot order required - they're independent services.
```

---

## 🔑 Environment Variables Flow

### `.env.production` (Root)
```bash
# Loaded by PM2 for all three pillars
APIFY_API_TOKEN=apify_api_...
PERPLEXITY_API_KEY=pplx-...
SUPABASE_URL=https://...
ANTHROPIC_API_KEY=sk-ant-...
# ... etc
```

### How each pillar accesses env vars:
- **API**: Reads directly from `process.env` (PM2 loads .env.production)
- **Harness**: Reads from `process.env` (PM2 loads .env.production)
- **Daemon**: Loads config from file (not using .env yet)

---

## 📊 Scheduler (Running in Harness)

The **scheduler** is a background system running inside Harness that handles:

### 1. Email Sender (`email-sender.ts`)
- Sends queued emails from `crm.email_campaigns`
- Respects business hours (9 AM - 5 PM local time)
- Staggers sends (delay between emails)
- Uses Gmail OAuth for sending

### 2. Heartbeat Monitor (`heartbeat.ts`)
- Monitors scheduled workflows
- Executes recurring tasks
- Health checks

### 3. Reply Checker (`reply-checker.ts`)
- Polls Gmail for replies to sent campaigns
- Marks leads as "replied" in database
- Updates campaign metrics

### How to control:
```bash
# Check status
curl http://localhost:8787/scheduler/status

# Start scheduler
curl -X POST http://localhost:8787/scheduler/start

# Stop scheduler
curl -X POST http://localhost:8787/scheduler/stop
```

---

## 🎯 Why This Architecture?

### Separation of Concerns
- **Harness**: The engine - all workflow execution
- **API**: The interface - user-facing frontend
- **Daemon**: Future infrastructure - distributed execution

### Scalability
- Each pillar runs independently
- Harness can scale horizontally (multiple instances)
- API can be distributed globally (CDN)
- Daemon ready for future node federation

### Security
- All three load .env.production via PM2 (isolated per process)
- Harness has Vault for secret management
- API doesn't execute code directly - routes to Harness
- Policy engine enforces rate limits & cost caps

### Maintainability
- Clear boundaries between layers
- Easy to test each pillar in isolation
- Workflows are self-contained

---

## 🚀 Deployment (VPS)

### PM2 orchestrates all three pillars:
```bash
pm2 start ecosystem.config.js
pm2 list
  # Shows:
  # - harness (port 8787)
  # - daemon (port 9000)
  # - api (port 3000)

pm2 logs harness    # View harness logs
pm2 logs api        # View API logs
pm2 logs daemon     # View daemon logs

pm2 restart harness # Restart harness only
```

---

## 💡 For Your Job Discovery Pipeline

Your **job discovery → enrichment → campaigns → sending** flow uses:

1. **Discovery** (Harness)
   - Workflow: `discover-hiring-businesses`
   - Calls Notte API
   - Stores in Supabase

2. **Enrichment** (Harness)
   - Workflow: `enrich-contact`
   - Uses Apify (needs `APIFY_API_TOKEN` in .env.production)
   - Finds emails

3. **AI Rankings** (Harness)
   - Tool: `check-ai-rankings`
   - Uses Perplexity API
   - Finds competitors

4. **Campaign Generation** (Harness)
   - Script: `generate-job-posting-campaigns.ts`
   - Creates personalized emails
   - Stores in `crm.email_campaigns`

5. **Email Sending** (Harness Scheduler)
   - Background job: `email-sender.ts`
   - Auto-sends queued emails
   - Respects business hours

**Everything runs in Harness!** The API is just for user interaction.
