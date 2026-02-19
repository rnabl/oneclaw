# OneClaw Framework - Folder Structure

## 📁 Project Overview

```
oneclaw/
├── apps/                          # Deployable applications
│   ├── api/                       # Main API server (Node.js/TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point, backend initialization
│   │   │   ├── routes/           # HTTP endpoints
│   │   │   │   ├── health.ts
│   │   │   │   ├── stripe.ts     # Stripe webhooks
│   │   │   │   ├── oauth.ts      # Google OAuth
│   │   │   │   ├── gmail.ts      # Gmail API
│   │   │   │   ├── discord.ts    # Discord interactions
│   │   │   │   ├── nodes.ts      # Node control plane
│   │   │   │   └── nabl-workflow.ts  # Universal workflow API
│   │   │   ├── services/         # Business logic
│   │   │   │   ├── discord-bot.ts     # Discord WebSocket bot
│   │   │   │   ├── node-workflows.ts   # Node runtime integration
│   │   │   │   └── email-queue-processor.ts
│   │   │   ├── stores/           # Database implementations
│   │   │   │   └── supabase.ts   # Supabase store adapter
│   │   │   └── workflows/        # Workflow formatters
│   │   │       └── discovery.ts  # Discord embed formatting
│   │   └── package.json
│   │
│   └── web/                       # Web UI (future)
│       └── ...
│
├── packages/                      # Reusable libraries
│   │
│   ├── harness/                   # 🎯 CORE FRAMEWORK (Everything lives here!)
│   │   ├── src/
│   │   │   ├── index.ts          # Main exports
│   │   │   ├── stores/           # Persistent data layer (DB abstraction)
│   │   │   │   ├── index.ts      # Registry & initialization
│   │   │   │   ├── types.ts      # Store interfaces
│   │   │   │   ├── memory.ts     # In-memory implementation
│   │   │   │   └── sqlite.ts     # 🔨 TODO: SQLite implementation
│   │   │   ├── cache/            # 🔨 TODO: Temporary data layer (Redis abstraction)
│   │   │   │   ├── index.ts      # Registry & initialization
│   │   │   │   ├── memory.ts     # In-memory cache
│   │   │   │   ├── upstash.ts    # Upstash Redis
│   │   │   │   └── redis.ts      # Valkey/Dragonfly/Redis
│   │   │   ├── identity/         # Multi-provider user resolution
│   │   │   │   └── resolver.ts   # Discord, Telegram, Phone, etc.
│   │   │   ├── registry/         # Tool & workflow registry
│   │   │   │   ├── index.ts
│   │   │   │   └── schemas.ts    # Zod schemas for tools
│   │   │   ├── execution/        # Workflow orchestration
│   │   │   │   └── runner.ts     # Job execution, step tracking
│   │   │   ├── policy/           # Rate limits, quotas, permissions
│   │   │   │   └── engine.ts
│   │   │   ├── metering/         # Cost tracking per API call
│   │   │   │   └── tracker.ts
│   │   │   ├── artifacts/        # Logs, screenshots for replay
│   │   │   │   └── store.ts
│   │   │   ├── secrets/          # Encrypted credential storage
│   │   │   │   └── vault.ts
│   │   │   ├── billing/          # Wallet system
│   │   │   │   └── wallet.ts
│   │   │   ├── schemas/          # Zod schemas (source of truth)
│   │   │   │   ├── user.ts
│   │   │   │   ├── identity.ts
│   │   │   │   ├── wallet.ts
│   │   │   │   └── transaction.ts
│   │   │   ├── apify/            # Apify client
│   │   │   │   └── client.ts
│   │   │   ├── scanners/         # Website scanning
│   │   │   │   ├── index.ts
│   │   │   │   └── website-scanner.ts
│   │   │   └── workflows/        # Core workflows
│   │   │       ├── discovery.ts  # Business discovery (Apify)
│   │   │       ├── analysis.ts   # Business analysis
│   │   │       └── audit.ts      # Website audit
│   │   └── package.json
│   │
│   ├── node-runtime/             # Distributed node execution (ACTIVE)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── daemon.ts         # Background daemon
│   │   │   ├── executor.ts       # Workflow executor
│   │   │   └── api.ts            # Control plane API
│   │   └── package.json
│   │
│   ├── cli/                      # Command-line interface (ACTIVE)
│   │   └── src/
│   │       └── index.ts
│   │
│   ├── executors/                # Executor implementations (ACTIVE)
│   │   └── http/                 # HTTP executor
│   │
│   ├── core/                     # ⚠️ LEGACY - Basic types (to be migrated to harness)
│   ├── database/                 # ⚠️ LEGACY - Supabase utils (to be migrated to harness)
│   │
│   └── [UNUSED - Marked for deletion]
│       ├── bluebubbles/          # ❌ Not imported anywhere
│       ├── sendblue/             # ❌ Not imported anywhere
│       ├── workflows/            # ❌ Moved to harness/workflows/
│       ├── skills/               # ❌ Not imported anywhere
│       ├── clients/              # ❌ Not imported anywhere
│       ├── engine/               # ❌ Replaced by harness/execution/
│       ├── taxonomy/             # ❌ Not imported anywhere
│       ├── templates/            # ❌ Not imported anywhere
│       └── node-ui/              # ❌ Not imported anywhere
│
├── scripts/                      # Utility scripts
│   ├── add-wallet-funds.js
│   ├── test-discovery.ts
│   └── test-scanner.ts
│
├── .cursor/                      # Cursor IDE rules
│   └── rules/
│       ├── billing.mdc
│       ├── harness.mdc
│       ├── identity.mdc
│       └── ...
│
├── .taskmaster/                  # Task management
│   ├── config.json
│   ├── docs/
│   │   └── prd.md
│   └── tasks/
│       └── tasks.json
│
├── .env.local                    # Environment configuration
├── package.json                  # Root package
├── pnpm-workspace.yaml           # Monorepo config
├── turbo.json                    # Build pipeline
└── README.md
```

---

## 🎯 Key Directories Explained

### `apps/api/` - The API Server
**What:** Node.js server that runs everything
**Contains:**
- HTTP routes (webhooks, OAuth, Discord)
- Discord bot (WebSocket connection)
- Workflow orchestration
- Backend initialization

**Entry Point:** `apps/api/src/index.ts`

---

### `packages/harness/` - The Framework Core ⭐
**What:** Database-agnostic agent runtime
**Why:** Can run with any backend (Supabase, SQLite, in-memory)

**Key Components:**
- **`stores/`** - Database abstraction (users, wallets, transactions)
- **`cache/`** - Cache abstraction (Redis, Upstash, in-memory)
- **`identity/`** - Multi-channel user resolution
- **`registry/`** - Tool & workflow definitions
- **`execution/`** - Job orchestration, step tracking
- **`policy/`** - Rate limits, quotas
- **`metering/`** - Cost tracking
- **`secrets/`** - Encrypted credentials
- **`workflows/`** - Core workflows (discovery, analysis)

**This is the "engine" that makes OneClaw work.**

---

### `packages/node-runtime/` - Distributed Execution
**What:** Allows workflows to run on remote machines
**Use Case:** Heavy computation, browser automation, private data access

---

### `apps/api/src/stores/supabase.ts` - Production Backend
**What:** Implements harness store interfaces using Supabase
**Why:** Lives in `apps/api` not `harness` because it's deployment-specific

---

## 📊 Data Flow

```
User (Discord/Telegram/SMS)
    ↓
apps/api/src/services/discord-bot.ts
    ↓
packages/harness/src/execution/runner.ts  (orchestration)
    ↓
packages/harness/src/workflows/discovery.ts  (business logic)
    ↓
packages/harness/src/stores/  (persist results)
    ↓
apps/api/src/stores/supabase.ts  (actual database)
    ↓
Supabase (Postgres)
```

---

## 🔌 Pluggable Backends

### Storage (Stores)
```
packages/harness/src/stores/
├── types.ts              # Interfaces (what all implementations must do)
├── memory.ts             # In-memory (dev/testing)
└── sqlite.ts             # 🔨 TODO: SQLite (self-hosted)

apps/api/src/stores/
└── supabase.ts           # Supabase (production cloud)
```

### Cache
```
packages/harness/src/cache/
├── index.ts              # Interface (what all implementations must do)
├── memory.ts             # In-memory (dev/simple)
├── upstash.ts            # 🔨 TODO: Upstash (production cloud)
└── redis.ts              # 🔨 TODO: Valkey/Dragonfly (self-hosted)
```

---

## 🚀 Deployment Artifacts

### Production Build
```bash
pnpm build

# Creates:
apps/api/dist/            # Compiled API server
packages/harness/dist/    # Compiled framework
```

### What Gets Deployed
```
Node.js Runtime
├── apps/api/dist/index.js    # API server
└── packages/harness/dist/    # Framework library

+ Environment Variables
├── SUPABASE_URL
├── UPSTASH_REDIS_REST_URL
├── ANTHROPIC_API_KEY
└── DISCORD_BOT_TOKEN
```

---

## 🎯 Where Things Live

| What | Where | Why |
|------|-------|-----|
| **HTTP Routes** | `apps/api/src/routes/` | API endpoints |
| **Discord Bot** | `apps/api/src/services/discord-bot.ts` | WebSocket handling |
| **Core Workflows** | `packages/harness/src/workflows/` | Reusable, database-agnostic |
| **Store Interfaces** | `packages/harness/src/stores/types.ts` | Contract for persistence |
| **Supabase Implementation** | `apps/api/src/stores/supabase.ts` | Production backend |
| **Business Logic** | `packages/harness/src/` | Framework core |
| **Deployment Config** | `apps/api/src/index.ts` | Backend initialization |

---

## 💡 Key Insight

**Harness = Framework (portable)**
- No database imports
- Interfaces only
- Works with any backend

**Apps/API = Deployment (specific)**
- Imports Supabase
- Implements store interfaces
- Configures for production

This separation allows:
- ✅ Self-hosted with SQLite
- ✅ Cloud with Supabase
- ✅ Enterprise with custom DB
- ✅ Testing with in-memory

**One framework, any backend!**
